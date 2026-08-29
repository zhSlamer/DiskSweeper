import { Worker } from 'node:worker_threads'
import path from 'node:path'
import os from 'node:os'
import type { DupDone, DupGroup, DupItem, DupProgress } from '../../shared/types'
import { collectFiles } from './scanner'
import { getSettings } from './settings'

interface DupState {
  cancelled: boolean
  running: boolean
}

let current: DupState | null = null

type Events = {
  progress: (p: DupProgress) => void
  done: (d: DupDone) => void
}
let events: Events = { progress: () => {}, done: () => {} }

export function initDupCallbacks(e: Events): void {
  events = e
}

export function cancelDup(): boolean {
  if (current && current.running) {
    current.cancelled = true
    return true
  }
  return false
}

interface HashResult {
  path: string
  hash: string
  error: string | null
}

function hashWithPool(files: string[], mode: 'partial' | 'full', onEach: () => void): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const result = new Map<string, string>()
    const n = Math.max(1, Math.min(os.cpus().length, 8))
    const workers: Worker[] = []
    let next = 0
    let finished = 0
    const spawn = (): Worker => {
      const w = new Worker(path.join(__dirname, 'hashWorker.js'))
      workers.push(w)
      w.on('message', (m: HashResult) => {
        if (m.error === null && m.hash) result.set(m.path, m.hash)
        onEach()
        feed(w)
      })
      w.on('error', () => {
        onEach()
        feed(w)
      })
      return w
    }
    const feed = (w: Worker): void => {
      if (current?.cancelled) {
        for (const x of workers) x.terminate().catch(() => {})
        resolve(result)
        return
      }
      if (next < files.length) {
        w.postMessage({ job: 'hash', path: files[next++], mode })
      } else {
        finished++
        if (finished >= workers.length) {
          for (const x of workers) x.terminate().catch(() => {})
          resolve(result)
        }
      }
    }
    for (let i = 0; i < Math.min(n, Math.max(files.length, 1)); i++) {
      const w = spawn()
      feed(w)
    }
    if (files.length === 0) resolve(result)
  })
}

export async function startDupScan(rootRaw: string, minSize = 1): Promise<void> {
  if (current && current.running) throw new Error('查重正在进行中')
  const state: DupState = { cancelled: false, running: true }
  current = state
  const startedAt = Date.now()

  try {
    const all = await collectFiles(rootRaw)
    if (state.cancelled) throw new Error('cancelled')
    // 阶段1：按大小分组
    events.progress({ stage: 'size', checked: all.length, total: all.length, groups: 0 })
    const bySize = new Map<number, string[]>()
    for (const f of all) {
      if (f.s < minSize) continue
      const arr = bySize.get(f.s)
      if (arr) arr.push(f.p)
      else bySize.set(f.s, [f.p])
    }
    let candidates = [...bySize.values()].filter((a) => a.length > 1)
    if (state.cancelled) throw new Error('cancelled')

    // 阶段2：头 64KB 部分哈希
    const flat1 = candidates.flat()
    const total1 = flat1.length
    let done1 = 0
    const partialMap = await hashWithPool(flat1, 'partial', () => {
      done1++
      if (done1 % 50 === 0 || done1 === total1) {
        events.progress({ stage: 'partial', checked: done1, total: total1, groups: 0 })
      }
    })
    if (state.cancelled) throw new Error('cancelled')
    const byPartial = new Map<string, string[]>()
    for (const [p, h] of partialMap) {
      const arr = byPartial.get(h)
      if (arr) arr.push(p)
      else byPartial.set(h, [p])
    }
    candidates = [...byPartial.values()].filter((a) => a.length > 1)

    // 阶段3：全量 SHA-256
    const flat2 = candidates.flat()
    const total2 = flat2.length
    let done2 = 0
    const fullMap = await hashWithPool(flat2, 'full', () => {
      done2++
      if (done2 % 20 === 0 || done2 === total2) {
        events.progress({ stage: 'full', checked: done2, total: total2, groups: 0 })
      }
    })
    if (state.cancelled) throw new Error('cancelled')

    // 分组（同哈希且同大小才算重复）
    const sizeOf = new Map<string, number>()
    const nameOf = new Map<string, string>()
    const mtOf = new Map<string, number>()
    for (const f of all) {
      sizeOf.set(f.p, f.s)
      nameOf.set(f.p, f.n)
      mtOf.set(f.p, f.mt)
    }
    const byFull = new Map<string, string[]>()
    for (const [p, h] of fullMap) {
      const arr = byFull.get(h)
      if (arr) arr.push(p)
      else byFull.set(h, [p])
    }

    const groups: DupGroup[] = []
    let wasted = 0
    let scanned = 0
    for (const [h, paths] of byFull) {
      if (paths.length < 2) continue
      const size = sizeOf.get(paths[0]) ?? 0
      const items: DupItem[] = paths
        .map((p, i) => ({ id: i, p, n: nameOf.get(p) ?? path.basename(p), s: size, mt: mtOf.get(p) ?? 0 }))
        .sort((a, b) => a.mt - b.mt)
      groups.push({ hash: h, size, waste: size * (paths.length - 1), items })
      wasted += size * (paths.length - 1)
      scanned += paths.length
    }
    groups.sort((a, b) => b.waste - a.waste)
    events.done({
      groups,
      wastedBytes: wasted,
      scanned,
      elapsedMs: Date.now() - startedAt,
      cancelled: false
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    events.done({
      groups: [],
      wastedBytes: 0,
      scanned: 0,
      elapsedMs: Date.now() - startedAt,
      cancelled: msg === 'cancelled',
      error: msg === 'cancelled' ? undefined : msg
    })
  } finally {
    state.running = false
  }
}

/** 智能勾选：返回每组建议删除的路径列表（保留策略在渲染端应用，这里提供数据即可） */
export function keepPriorityPaths(items: DupItem[], keep: 'newest' | 'oldest' | 'firstPath', firstPathPrefix?: string): string[] {
  if (items.length === 0) return []
  let keepIdx = 0
  if (keep === 'newest') {
    for (let i = 1; i < items.length; i++) if (items[i].mt > items[keepIdx].mt) keepIdx = i
  } else if (keep === 'oldest') {
    for (let i = 1; i < items.length; i++) if (items[i].mt < items[keepIdx].mt) keepIdx = i
  } else if (keep === 'firstPath' && firstPathPrefix) {
    const lower = firstPathPrefix.toLowerCase()
    const idx = items.findIndex((it) => it.p.toLowerCase().startsWith(lower))
    if (idx >= 0) keepIdx = idx
  }
  return items.filter((_, i) => i !== keepIdx).map((it) => it.p)
}

export function settingsSnapshotForDup(): string[] {
  return getSettings().excludes
}
