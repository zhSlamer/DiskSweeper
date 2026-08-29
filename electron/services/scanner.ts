import path from 'node:path'
import os from 'node:os'
import { promises as fsp } from 'node:fs'
import { Worker } from 'node:worker_threads'
import type {
  DirAgg,
  ExtStat,
  FileRec,
  FileRow,
  ScanProgress,
  ScanSummary,
  TreeMapNode,
  TreeChild
} from '../../shared/types'
import { extOfName } from '../../shared/utils'
import { getSettings } from './settings'

interface ScanState {
  id: number
  root: string
  status: 'running' | 'done' | 'cancelled' | 'error'
  files: FileRec[]
  dirs: Map<string, DirAgg>
  children: Map<string, TreeChild[]> | null
  extStats: Map<string, { count: number; bytes: number }>
  bytes: number
  errors: number
  links: number
  startedAt: number
  elapsedMs: number
  workers: Worker[]
  idle: Map<Worker, boolean>
  queue: string[]
  pending: number
  cancelled: boolean
  lastPath: string
  pendingSelf: Map<string, { files: number; bytes: number }>
  topCache: FileRec[] | null
  timer: ReturnType<typeof setInterval> | null
  inFlight: Map<Worker, string>
  respawns: number
}

export type { ScanState }

let current: ScanState | null = null
let nextId = 1

type ScannerEvents = {
  progress: (p: ScanProgress) => void
  done: (s: ScanSummary) => void
}
let events: ScannerEvents = { progress: () => {}, done: () => {} }

export function initScannerCallbacks(e: ScannerEvents): void {
  events = e
}

function newAgg(p: string, mt: number, root: string): DirAgg {
  const name = p === root ? (p.replace(/[\\/]+$/, '') || p) : path.basename(p)
  const parent = p === root ? '' : path.dirname(p)
  return { p, name, parent, mt, selfFiles: 0, selfBytes: 0, files: 0, dirs: 0, bytes: 0 }
}

function makeSummary(st: ScanState, cancelled: boolean): ScanSummary {
  return {
    scanId: st.id,
    root: st.root,
    files: st.files.length,
    dirs: st.dirs.size,
    bytes: st.bytes,
    errors: st.errors,
    links: st.links,
    elapsedMs: st.elapsedMs,
    startedAt: st.startedAt,
    cancelled
  }
}

function sendProgress(st: ScanState): void {
  if (!st || st.status !== 'running') return
  events.progress({
    scanId: st.id,
    files: st.files.length,
    bytes: st.bytes,
    dirs: st.dirs.size,
    errors: st.errors,
    elapsedMs: Date.now() - st.startedAt,
    current: st.lastPath
  })
}

function pump(st: ScanState): void {
  if (st.status !== 'running') return
  while (st.queue.length > 0) {
    let free: Worker | null = null
    for (const [w, isIdle] of st.idle) {
      if (isIdle) {
        free = w
        break
      }
    }
    if (!free) break
    const dir = st.queue.shift()!
    st.idle.set(free, false)
    st.inFlight.set(free, dir)
    free.postMessage({ job: 'expand', dir })
  }
}

function finish(st: ScanState, cancelled: boolean): void {
  if (st.timer) {
    clearInterval(st.timer)
    st.timer = null
  }
  st.status = cancelled ? 'cancelled' : 'done'
  st.elapsedMs = Date.now() - st.startedAt
  st.pendingSelf.clear()
  for (const w of st.workers) {
    void w.terminate().catch(() => {})
  }
  // 构建父子索引
  const children = new Map<string, TreeChild[]>()
  for (const agg of st.dirs.values()) {
    if (agg.p === st.root) continue
    let arr = children.get(agg.parent)
    if (!arr) {
      arr = []
      children.set(agg.parent, arr)
    }
    arr.push({ path: agg.p, name: agg.name, bytes: agg.bytes, files: agg.files, dirs: agg.dirs, mt: agg.mt })
  }
  for (const arr of children.values()) arr.sort((a, b) => b.bytes - a.bytes)
  st.children = children
  events.done(makeSummary(st, cancelled))
}

function onWorkerMessage(st: ScanState, w: Worker, m: { t: string; [k: string]: unknown }): void {
  if (!current || current !== st || st.status !== 'running') {
    if (m.t === 'ready') st.idle.set(w, true)
    return
  }
  if (m.t === 'ready') {
    st.idle.set(w, true)
    st.inFlight.delete(w)
    pump(st)
    return
  }
  if (m.t === 'batch') {
    const dir = m.dir as string
    const entries = m.entries as Array<[string, number, number, number, number, number, number]>
    let batchBytes = 0
    let links = 0
    for (const e of entries) {
      const [n, s, sd, mt, ct, at, f] = e
      st.files.push({ id: st.files.length, p: path.join(dir, n), n, ext: extOfName(n), s, sd, mt, ct, at, f })
      batchBytes += s
      if (f & 8) links++
      const extKey = extOfName(n)
      let es = st.extStats.get(extKey)
      if (!es) {
        es = { count: 0, bytes: 0 }
        st.extStats.set(extKey, es)
      }
      es.count++
      es.bytes += s
    }
    st.bytes += batchBytes
    st.links += links
    st.lastPath = dir
    let pe = st.pendingSelf.get(dir)
    if (!pe) {
      pe = { files: 0, bytes: 0 }
      st.pendingSelf.set(dir, pe)
    }
    pe.files += entries.length
    pe.bytes += batchBytes
    return
  }
  if (m.t === 'done') {
    const dir = m.dir as string
    const subdirs = m.subdirs as string[]
    const selfBytes = m.selfBytes as number
    const dirMt = m.dirMt as number
    const err = (m.err as number) || 0
    st.errors += err

    let agg = st.dirs.get(dir)
    if (!agg) {
      agg = newAgg(dir, dirMt, st.root)
      st.dirs.set(dir, agg)
    }
    if (dirMt) agg.mt = dirMt
    const pe = st.pendingSelf.get(dir) ?? { files: 0, bytes: 0 }
    agg.selfFiles += pe.files
    agg.selfBytes += pe.bytes
    // 沿父链向上累计
    let cur: DirAgg | undefined = agg
    while (cur) {
      cur.bytes += pe.bytes
      cur.files += pe.files
      cur = st.dirs.get(cur.parent) || (cur.parent === '' ? undefined : undefined)
    }
    for (const name of subdirs) {
      const childPath = path.join(dir, name)
      if (!st.dirs.has(childPath)) {
        st.dirs.set(childPath, newAgg(childPath, 0, st.root))
      }
      agg.dirs++
      st.queue.push(childPath)
      st.pending++
    }
    st.pending--
    if (st.pending <= 0) {
      finish(st, false)
      return
    }
    pump(st)
  }
}

function attachWorker(st: ScanState): Worker {
  const w = new Worker(path.join(__dirname, 'scanWorker.js'))
  st.workers.push(w)
  st.idle.set(w, true)
  w.on('message', (m) => onWorkerMessage(st, w, m))
  w.on('error', () => {
    if (current === st && st.status === 'running') {
      st.errors++
      // 途中崩溃的目录放回队列，避免 pending 永不归零
      const dir = st.inFlight.get(w)
      st.inFlight.delete(w)
      st.workers = st.workers.filter((x) => x !== w)
      st.idle.delete(w)
      if (dir) st.queue.unshift(dir)
      if (st.queue.length > 0 || st.pending > 0) {
        if (st.respawns < 8) {
          st.respawns++
          const nw = attachWorker(st)
          nw.postMessage({ job: 'init', excludes: getSettings().excludes })
        }
      } else if (st.pending <= 0) {
        finish(st, false)
      }
      pump(st)
    }
  })
  return w
}

export async function startScan(rootRaw: string): Promise<number> {
  if (current && current.status === 'running') throw new Error('已有扫描正在进行，请先取消')
  const root = path.resolve(rootRaw)
  const st = await fsp.stat(root).catch(() => null)
  if (!st || !st.isDirectory()) throw new Error('目录不存在或不可访问: ' + root)

  const state: ScanState = {
    id: nextId++,
    root,
    status: 'running',
    files: [],
    dirs: new Map([[root, newAgg(root, Date.now(), root)]]),
    children: null,
    extStats: new Map(),
    bytes: 0,
    errors: 0,
    links: 0,
    startedAt: Date.now(),
    elapsedMs: 0,
    workers: [],
    idle: new Map(),
    queue: [root],
    pending: 1,
    cancelled: false,
    lastPath: root,
    pendingSelf: new Map(),
    topCache: null,
    timer: null,
    inFlight: new Map(),
    respawns: 0
  }
  current = state
  const n = Math.max(2, Math.min(os.cpus().length, 8))
  const excludes = getSettings().excludes
  for (let i = 0; i < n; i++) {
    const w = attachWorker(state)
    w.postMessage({ job: 'init', excludes })
  }
  state.timer = setInterval(() => sendProgress(state), 200)
  return state.id
}

export function cancelScan(): boolean {
  const st = current
  if (!st || st.status !== 'running') return false
  st.cancelled = true
  finish(st, true)
  return true
}

export function getScan(scanId: number): ScanState | null {
  if (current && current.id === scanId && current.status !== 'running') return current
  return null
}

export function requireScan(scanId: number): ScanState {
  const st = getScan(scanId)
  if (!st) throw new Error('没有可用的扫描结果，请先完成扫描')
  return st
}

export function scanRoot(): string {
  return current?.root ?? ''
}

/* ---------- 分析查询 ---------- */

export function treeChildren(scanId: number, dir: string): TreeChild[] {
  const st = getScan(scanId)
  if (!st || !st.children) return []
  return st.children.get(path.resolve(dir)) ?? []
}

export function dirInfo(
  scanId: number,
  dir: string
): { path: string; bytes: number; files: number; dirs: number; mt: number } | null {
  const st = getScan(scanId)
  if (!st) return null
  const agg = st.dirs.get(path.resolve(dir))
  if (!agg) return null
  return { path: agg.p, bytes: agg.bytes, files: agg.files, dirs: agg.dirs, mt: agg.mt }
}

export function filesInDir(scanId: number, dir: string, limit = 300): FileRow[] {
  const st = getScan(scanId)
  if (!st) return []
  const d = path.resolve(dir)
  const prefix = d.endsWith(path.sep) ? d : d + path.sep
  const rows = st.files.filter((f) => f.p.startsWith(prefix))
  rows.sort((a, b) => b.s - a.s)
  return rows.slice(0, Math.max(1, limit))
}

export function topFiles(scanId: number, limit = 200): FileRow[] {
  const st = getScan(scanId)
  if (!st) return []
  if (!st.topCache) {
    st.topCache = [...st.files].sort((a, b) => b.s - a.s)
  }
  return st.topCache.slice(0, Math.max(1, limit))
}

export function extStatsTop(scanId: number, limit = 30): ExtStat[] {
  const st = getScan(scanId)
  if (!st) return []
  return [...st.extStats.entries()]
    .map(([ext, v]) => ({ ext, count: v.count, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, Math.max(1, limit))
}

export function treemap(scanId: number, base: string, depth = 2): TreeMapNode[] {
  const st = getScan(scanId)
  if (!st || !st.children) return []
  const budget = { count: 0 }
  return buildLevel(st, path.resolve(base), Math.max(1, Math.min(depth, 4)), budget)
}

function buildLevel(st: ScanState, dir: string, depth: number, budget: { count: number }): TreeMapNode[] {
  const children = st.children?.get(dir) ?? []
  const TOP = 40
  const nodes: TreeMapNode[] = []
  let used = 0
  let restBytes = 0
  let restFiles = 0
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (i < TOP && budget.count < 320) {
      used++
      budget.count++
      nodes.push({
        name: c.name,
        path: c.path,
        value: c.bytes,
        files: c.files,
        children: depth > 1 ? buildLevel(st, c.path, depth - 1, budget) : undefined
      })
    } else {
      restBytes += c.bytes
      restFiles += c.files
    }
  }
  if (children.length > used && restBytes > 0) {
    nodes.push({ name: `其余 ${children.length - used} 项`, path: '', value: restBytes, files: restFiles })
  }
  return nodes.sort((a, b) => b.value - a.value)
}

/** 供重复文件查找使用：直接遍历收集（不经过扫描状态） */
export async function collectFiles(rootRaw: string): Promise<FileRec[]> {
  const root = path.resolve(rootRaw)
  const st = await fsp.stat(root).catch(() => null)
  if (!st || !st.isDirectory()) throw new Error('目录不存在或不可访问: ' + root)
  const settings = getSettings()
  const exNames = new Set(
    settings.excludes
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !s.includes('\\') && !s.includes(':') && !s.includes('/'))
  )
  const out: FileRec[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let dirents
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name)
      if (d.isDirectory()) {
        if (!exNames.has(d.name.toLowerCase())) stack.push(full)
        continue
      }
      if (d.isSymbolicLink()) continue
      try {
        const fst = await fsp.stat(full)
        out.push({
          id: out.length,
          p: full,
          n: d.name,
          ext: extOfName(d.name),
          s: fst.size,
          sd: (fst.blocks || 0) * 512 || fst.size,
          mt: fst.mtimeMs,
          ct: fst.ctimeMs,
          at: fst.atimeMs,
          f: (fst.mode & 0o200) === 0 ? 2 : 0
        })
      } catch {
        /* 无权限等，跳过 */
      }
    }
  }
  return out
}
