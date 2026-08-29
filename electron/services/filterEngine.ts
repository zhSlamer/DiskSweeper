import path from 'node:path'
import { promises as fsp } from 'node:fs'
import type { DirAgg, FileRow, FilterConditions, FilterPage, FilterQuery, SortKey } from '../../shared/types'
import { categoryOfExt, TEMP_EXTS } from '../../shared/constants'
import { requireScan, type ScanState } from './scanner'

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp('^' + escaped + '$', 'i')
}

function matchName(rec: { n: string }, c: FilterConditions): boolean {
  const pattern = (c.namePattern ?? '').trim()
  if (!pattern) return true
  if (c.nameMode === 'regex') {
    try {
      return new RegExp(pattern, 'i').test(rec.n)
    } catch {
      return true
    }
  }
  if (c.nameMode === 'wildcard') return wildcardToRegExp(pattern).test(rec.n)
  return rec.n.toLowerCase().includes(pattern.toLowerCase())
}

function isTempLike(name: string, ext: string): boolean {
  if (TEMP_EXTS.includes(ext)) return true
  const lower = name.toLowerCase()
  if (lower.startsWith('~$')) return true
  if (lower.endsWith('.tmp') || lower.endsWith('.temp')) return true
  if (/\.crdownload$/.test(lower) || /\.part$/.test(lower)) return true
  if (lower.includes('.tmp.') || lower.includes('-tmp.') || lower.includes('_tmp.')) return true
  return false
}

function matchFile(f: FileRow, c: FilterConditions, now: number): boolean {
  if (c.emptyOnly && f.s !== 0) return false
  if (c.tempLike && !isTempLike(f.n, f.ext)) return false
  if (c.dotHidden && !(f.f & 1)) return false
  if (c.onlyReadOnly && !(f.f & 2)) return false
  if (c.onlySymlink && !(f.f & 8)) return false
  if (c.sizeMin !== undefined && f.s < c.sizeMin) return false
  if (c.sizeMax !== undefined && f.s > c.sizeMax) return false
  if (c.exts && c.exts.length > 0) {
    const has = c.exts.includes(f.ext)
    if (c.extExclude ? has : !has) return false
  }
  if (c.categories && c.categories.length > 0) {
    if (!c.categories.includes(categoryOfExt(f.ext))) return false
  }
  if (c.dateDays !== undefined && c.dateDays > 0) {
    const field = c.dateField ?? 'mt'
    const ts = f[field]
    const diffDays = (now - ts) / 86400000
    if (c.dateOp === 'newer' ? diffDays > c.dateDays : diffDays < c.dateDays) return false
  }
  if (!matchName(f, c)) return false
  return true
}

function matchEmptyDir(agg: DirAgg, st: ScanState, c: FilterConditions): boolean {
  if (agg.files !== 0 || agg.dirs !== 0) return false
  if (!matchName({ n: agg.name }, c)) return false
  if (c.sizeMin !== undefined || c.sizeMax !== undefined) return false
  if (c.dateDays !== undefined && c.dateDays > 0) {
    const ts = agg.mt || st.startedAt
    const diffDays = (Date.now() - ts) / 86400000
    if (c.dateOp === 'newer' ? diffDays > c.dateDays : diffDays < c.dateDays) return false
  }
  return true
}

function compare(a: FileRow, b: FileRow, key: SortKey): number {
  switch (key) {
    case 'size':
      return a.s - b.s
    case 'mtime':
      return a.mt - b.mt
    case 'ext':
      return a.ext.localeCompare(b.ext)
    case 'path':
      return a.p.localeCompare(b.p)
    default:
      return a.n.localeCompare(b.n, 'zh', { numeric: true })
  }
}

export function runFilter(q: FilterQuery): FilterPage {
  const st = requireScan(q.scanId)
  const c = q.conditions
  const now = Date.now()
  const emptyDirs = c.emptyDirs === true

  let rows: FileRow[]
  if (emptyDirs) {
    rows = []
    for (const agg of st.dirs.values()) {
      if (agg.p === st.root) continue
      if (matchEmptyDir(agg, st, c)) {
        rows.push({
          id: -1 - rows.length,
          p: agg.p,
          n: agg.name,
          ext: '',
          s: 0,
          sd: 0,
          mt: agg.mt,
          ct: 0,
          at: 0,
          f: 0,
          dir: 1
        })
      }
    }
  } else {
    rows = st.files.filter((f) => matchFile(f, c, now))
  }

  const totalBytes = rows.reduce((acc, r) => acc + r.s, 0)
  const dir = q.sort.order === 'asc' ? 1 : -1
  rows.sort((a, b) => compare(a, b, q.sort.key) * dir)

  const pageSize = Math.max(10, Math.min(q.pageSize, 1000))
  const page = Math.max(0, q.page)
  const start = page * pageSize
  return {
    total: rows.length,
    totalBytes,
    rows: rows.slice(start, start + pageSize)
  }
}

export interface ExportArgs {
  scanId: number
  conditions: FilterConditions
  limit?: number
}

/** 导出筛选结果（渲染进程先写临时文件再让用户保存，这里直接返回文本） */
export function exportRows(args: ExportArgs, format: 'csv' | 'json'): { text: string; count: number } {
  const st = requireScan(args.scanId)
  const now = Date.now()
  const c = args.conditions
  const emptyDirs = c.emptyDirs === true
  let rows: FileRow[]
  if (emptyDirs) {
    rows = []
    for (const agg of st.dirs.values()) {
      if (agg.p === st.root) continue
      if (matchEmptyDir(agg, st, c)) {
        rows.push({
          id: -1 - rows.length,
          p: agg.p,
          n: agg.name,
          ext: '',
          s: 0,
          sd: 0,
          mt: agg.mt,
          ct: 0,
          at: 0,
          f: 0,
          dir: 1
        })
      }
    }
  } else {
    rows = st.files.filter((f) => matchFile(f, c, now))
  }
  rows.sort((a, b) => b.s - a.s)
  const limit = Math.min(args.limit ?? 50000, rows.length)
  rows = rows.slice(0, limit)

  if (format === 'json') {
    const data = rows.map((r) => ({
      path: r.p,
      name: r.n,
      sizeBytes: r.s,
      mtime: new Date(r.mt).toISOString(),
      type: r.dir ? 'dir' : 'file'
    }))
    return { text: JSON.stringify(data, null, 2), count: rows.length }
  }
  const esc = (s: string): string => '"' + s.replace(/"/g, '""') + '"'
  const lines = ['路径,名称,大小字节,类型,修改时间']
  for (const r of rows) {
    lines.push(
      [esc(r.p), esc(r.n), String(r.s), r.dir ? '文件夹' : '文件', esc(new Date(r.mt).toLocaleString())].join(',')
    )
  }
  return { text: '\ufeff' + lines.join('\r\n'), count: rows.length }
}

/** 把文本写到用户指定位置（主进程 dialog 已确定路径后调用） */
export async function writeExportFile(target: string, text: string): Promise<void> {
  await fsp.writeFile(path.resolve(target), text, 'utf8')
}
