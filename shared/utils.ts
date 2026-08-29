import { categoryOfExt } from './constants'

export function formatBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return v.toFixed(v >= 100 ? 0 : digits) + ' ' + units[i]
}

function pad(x: number): string {
  return x < 10 ? '0' + x : String(x)
}

export function formatTime(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  )
}

export function formatDate(ts: number): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

export function extOfName(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase()
}

export function extLabel(ext: string): string {
  return ext ? '.' + ext : '(无扩展名)'
}

export { categoryOfExt }

/** 标志位 → 中文标签列表 */
export function flagLabels(f: number, dotHidden: boolean): string[] {
  const out: string[] = []
  if (dotHidden) out.push('隐藏(点开头)')
  if (f & 2) out.push('只读')
  if (f & 4) out.push('系统')
  if (f & 8) out.push('符号链接')
  return out
}

const collator = new Intl.Collator('zh', { numeric: true })
export function compareName(a: string, b: string): number {
  return collator.compare(a, b)
}
