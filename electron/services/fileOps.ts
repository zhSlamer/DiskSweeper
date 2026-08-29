import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { app, shell } from 'electron'
import type { DeleteMode, HistoryEntry, OpResult, QuarantineItem } from '../../shared/types'
import { appendHistory } from './history'

const SHRED_PASSES = 2

function recycleBinPath(): string {
  return path.join(app.getPath('userData'), 'quarantine')
}

function runPowerShell(script: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      }
    )
  })
}

/** 通过 Shell.Application 批量移入回收站（单个 PowerShell 会话处理全部路径） */
async function recycleViaShell(paths: string[]): Promise<{ ok: number; fail: number }> {
  let ok = 0
  let fail = 0
  const BATCH = 200
  for (let start = 0; start < paths.length; start += BATCH) {
    const batch = paths.slice(start, start + BATCH)
    // 每个路径一条语句：存在则请求删除并输出 Y，否则输出 N（每行一个标记字符）
    const lines = batch.map((p) => {
      const escaped = p.replace(/'/g, "''")
      return (
        `$item = $sh.Namespace(0).ParseName('${escaped}'); ` +
        `if ($item) { $item.InvokeVerb('delete'); 'Y' } else { 'N' }`
      )
    })
    const script =
      "$sh = New-Object -ComObject 'Shell.Application'; " +
      "$ErrorActionPreference='SilentlyContinue'; " +
      lines.join('\n')
    try {
      const out = await runPowerShell(script, Math.max(60000, batch.length * 2000))
      // InvokeVerb 是异步触发的，Y 只代表"文件存在且已请求删除"
      ok += (out.match(/^Y$/gm) ?? []).length
      fail += (out.match(/^N$/gm) ?? []).length
      // 输出行数不足时（脚本被截断等），按批次大小与已计数差额补 fail
      const counted = (out.match(/^[YN]$/gm) ?? []).length
      if (counted < batch.length) fail += batch.length - counted
    } catch {
      fail += batch.length
    }
  }
  return { ok, fail }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p)
    return true
  } catch {
    return false
  }
}

async function removeEntry(p: string): Promise<void> {
  const st = await fsp.lstat(p).catch(() => null)
  if (!st) return
  if (st.isDirectory()) await fsp.rm(p, { recursive: true, force: true, maxRetries: 2 })
  else await fsp.unlink(p)
}

async function shredFile(p: string, isDir: boolean): Promise<void> {
  if (isDir) {
    // 目录：先递归粉碎内部文件再删目录
    const entries = await fsp.readdir(p, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      await shredFile(path.join(p, e.name), e.isDirectory())
    }
    await removeEntry(p)
    return
  }
  const st = await fsp.stat(p).catch(() => null)
  if (!st) return
  const fh = await fsp.open(p, 'r+')
  try {
    const size = st.size
    const chunk = Buffer.alloc(1024 * 1024)
    for (let pass = 0; pass < SHRED_PASSES; pass++) {
      let pos = 0
      while (pos < size) {
        const len = Math.min(chunk.length, size - pos)
        const data = pass % 2 === 0 ? Buffer.alloc(len, 0x00) : cryptoRandom(len)
        await fh.write(data, 0, len, pos)
        pos += len
      }
      await fh.sync()
    }
  } finally {
    await fh.close()
  }
  await removeEntry(p)
}

function cryptoRandom(len: number): Buffer {
  const buf = Buffer.alloc(len)
  // 避免直接依赖 crypto 增加导入：用简单伪随机即可达到覆写目的
  let seed = Date.now() ^ (len << 8)
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    buf[i] = (seed >>> 16) & 0xff
  }
  return buf
}

export async function deletePaths(paths: string[], mode: DeleteMode): Promise<OpResult> {
  const res: OpResult = { ok: 0, fail: 0, bytes: 0, failPaths: [] }
  if (paths.length === 0) return res

  if (mode === 'recycle') {
    const r = await recycleViaShell(paths)
    res.ok = r.ok
    res.fail = r.fail
    return res
  }

  for (const p of paths) {
    try {
      const st = await fsp.lstat(p)
      if (mode === 'shred') {
        await shredFile(p, st.isDirectory())
      } else {
        await removeEntry(p)
      }
      res.ok++
      if (!st.isDirectory()) res.bytes += st.size
    } catch {
      res.fail++
      res.failPaths.push(p)
    }
  }
  return res
}

export async function movePaths(paths: string[], destDir: string): Promise<OpResult> {
  const res: OpResult = { ok: 0, fail: 0, bytes: 0, failPaths: [] }
  await fsp.mkdir(destDir, { recursive: true }).catch(() => {})
  for (const p of paths) {
    const base = path.basename(p)
    let target = path.join(destDir, base)
    try {
      // 同名冲突：追加序号
      let i = 1
      while (await exists(target)) {
        const ext = path.extname(base)
        const stem = base.slice(0, base.length - ext.length)
        target = path.join(destDir, `${stem} (${i})${ext}`)
        i++
      }
      await fsp.rename(p, target)
      res.ok++
    } catch {
      try {
        await fsp.cp(p, target, { recursive: true })
        await removeEntry(p)
        res.ok++
      } catch {
        res.fail++
        res.failPaths.push(p)
      }
    }
  }
  return res
}

/** 移入应用隔离区（可恢复） */
export async function quarantinePaths(paths: string[]): Promise<OpResult & { stored: QuarantineItem[] }> {
  const res: OpResult & { stored: QuarantineItem[] } = { ok: 0, fail: 0, bytes: 0, failPaths: [], stored: [] }
  const qDir = recycleBinPath()
  await fsp.mkdir(qDir, { recursive: true }).catch(() => {})
  const batch = Date.now().toString(36)
  let i = 0
  for (const p of paths) {
    const id = `${batch}-${i++}`
    const target = path.join(qDir, id)
    try {
      const st = await fsp.lstat(p)
      await fsp.rename(p, target).catch(async () => {
        await fsp.cp(p, target, { recursive: true })
        await removeEntry(p)
      })
      res.ok++
      if (!st.isDirectory()) res.bytes += st.size
      await fsp.writeFile(target + '.meta', JSON.stringify({ orig: p, t: Date.now() }), 'utf8').catch(() => {})
      res.stored.push({ id, orig: p, stored: target, t: Date.now(), size: st.isDirectory() ? 0 : st.size })
    } catch {
      res.fail++
      res.failPaths.push(p)
    }
  }
  return res
}

export async function listQuarantine(): Promise<QuarantineItem[]> {
  const qDir = recycleBinPath()
  const entries = await fsp.readdir(qDir, { withFileTypes: true }).catch(() => [])
  const out: QuarantineItem[] = []
  for (const e of entries) {
    if (e.name.endsWith('.meta')) continue
    const stored = path.join(qDir, e.name)
    const st = await fsp.lstat(stored).catch(() => null)
    if (!st) continue
    // 原路径记录在同名 .json 旁文件
    const metaPath = stored + '.meta'
    let orig = ''
    try {
      orig = JSON.parse(await fsp.readFile(metaPath, 'utf8')).orig ?? ''
    } catch {
      orig = ''
    }
    out.push({ id: e.name, orig, stored, t: st.mtimeMs, size: st.isDirectory() ? 0 : st.size })
  }
  return out.sort((a, b) => b.t - a.t)
}

export async function restoreQuarantine(id: string): Promise<boolean> {
  const qDir = recycleBinPath()
  const stored = path.join(qDir, id)
  if (!(await exists(stored))) return false
  let orig = ''
  try {
    orig = JSON.parse(await fsp.readFile(stored + '.meta', 'utf8')).orig ?? ''
  } catch {
    orig = ''
  }
  if (!orig) return false
  await fsp.mkdir(path.dirname(orig), { recursive: true }).catch(() => {})
  try {
    await fsp.rename(stored, orig)
  } catch {
    await fsp.cp(stored, orig, { recursive: true })
    await removeEntry(stored)
  }
  await fsp.rm(stored + '.meta', { force: true })
  return true
}

export async function purgeQuarantine(): Promise<void> {
  await fsp.rm(recycleBinPath(), { recursive: true, force: true })
}

export async function revealInExplorer(p: string): Promise<void> {
  await shell.showItemInFolder(p)
}

export async function openPath(p: string): Promise<void> {
  await shell.openPath(p)
}

/** 记录操作到历史（失败不影响主流程） */
export async function logOp(action: string, paths: string[], mode: DeleteMode | undefined, res: OpResult, detail?: string[]): Promise<void> {
  const entry: HistoryEntry = {
    t: Date.now(),
    action,
    count: res.ok,
    bytes: res.bytes,
    mode,
    ok: res.ok,
    fail: res.fail,
    detail: detail ?? res.failPaths.slice(0, 20)
  }
  await appendHistory(entry)
}
