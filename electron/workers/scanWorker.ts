import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { parentPort } from 'node:worker_threads'

/** 扫描 worker：接收目录展开任务，返回文件记录元组批次与子目录列表 */
// entries 元组: [名称, 大小, 磁盘占用, 修改ms, 创建ms, 访问ms, 标志]
type Entry = [string, number, number, number, number, number, number]

let excludeNames = new Set<string>()
let excludePrefixes: string[] = []
const CHUNK = 6000

function normEntry(raw: string): { isName: boolean; v: string } {
  const v = raw.trim().toLowerCase().replace(/\//g, '\\')
  return { isName: !v.includes('\\') && !v.includes(':'), v }
}

function isExcluded(name: string, fullPath: string): boolean {
  if (excludeNames.has(name.toLowerCase())) return true
  const lower = fullPath.toLowerCase()
  for (const p of excludePrefixes) {
    if (lower === p || lower.startsWith(p + '\\')) return true
  }
  return false
}

async function expand(dir: string): Promise<void> {
  const port = parentPort!
  let dirents
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    port.postMessage({ t: 'done', dir, subdirs: [], err: 1, selfBytes: 0, dirMt: 0 })
    return
  }
  let dirMt = 0
  try {
    const st = await fsp.stat(dir)
    dirMt = st.mtimeMs
  } catch {
    /* ignore */
  }
  const entries: Entry[] = []
  const subdirs: string[] = []
  let errCount = 0
  let selfBytes = 0
  for (const d of dirents) {
    const name = d.name
    if (d.isDirectory()) {
      if (isExcluded(name, path.join(dir, name))) continue
      subdirs.push(name)
      continue
    }
    const full = path.join(dir, name)
    try {
      if (d.isSymbolicLink()) {
        const st = await fsp.lstat(full)
        entries.push([name, st.size, (st.blocks || 0) * 512 || st.size, st.mtimeMs, st.ctimeMs, st.atimeMs, 8])
        selfBytes += st.size
      } else {
        const st = await fsp.stat(full)
        const ro = (st.mode & 0o200) === 0 ? 2 : 0
        const hidden = name.startsWith('.') ? 1 : 0
        entries.push([
          name,
          st.size,
          (st.blocks || 0) * 512 || st.size,
          st.mtimeMs,
          st.ctimeMs,
          st.atimeMs,
          ro | hidden
        ])
        selfBytes += st.size
      }
    } catch {
      errCount++
    }
    if (entries.length >= CHUNK) {
      port.postMessage({ t: 'batch', dir, entries: entries.splice(0, entries.length) })
    }
  }
  if (entries.length > 0) port.postMessage({ t: 'batch', dir, entries })
  port.postMessage({ t: 'done', dir, subdirs, err: errCount, selfBytes, dirMt })
}

parentPort!.on('message', (m: { job: string; dir?: string; excludes?: string[] }) => {
  if (m.job === 'init') {
    excludeNames = new Set()
    excludePrefixes = []
    for (const raw of m.excludes ?? []) {
      const { isName, v } = normEntry(raw)
      if (!v) continue
      if (isName) excludeNames.add(v)
      else excludePrefixes.push(v)
    }
    parentPort!.postMessage({ t: 'ready' })
    return
  }
  if (m.job === 'expand' && m.dir) {
    expand(m.dir)
      .catch(() => parentPort!.postMessage({ t: 'done', dir: m.dir!, subdirs: [], err: 1, selfBytes: 0, dirMt: 0 }))
      .finally(() => parentPort!.postMessage({ t: 'ready' }))
  }
})
