import type { FileCategory, FilterConditions } from './types'

export const KB = 1024
export const MB = 1024 * 1024
export const GB = 1024 * 1024 * 1024

/** 分类 → 扩展名集合 */
export const CATEGORY_EXTS: Record<FileCategory, string[]> = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'rm', 'rmvb', 'ts', '3gp'],
  audio: ['mp3', 'flac', 'ape', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'mid', 'aiff'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic', 'heif', 'tiff', 'tif', 'ico', 'raw', 'cr2', 'nef', 'arw', 'psd', 'ai'],
  doc: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'md', 'csv', 'rtf', 'odt', 'wps', 'et', 'dps', 'epub', 'mobi'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'iso', 'cab', 'jar'],
  installer: ['exe', 'msi', 'msix', 'appx', 'apk', 'dmg', 'pkg'],
  code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'html', 'css', 'scss', 'vue', 'json', 'xml', 'yml', 'yaml', 'sql', 'sh', 'bat', 'ps1'],
  log: ['log', 'out', 'err', 'stacktrace'],
  other: []
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  video: '视频',
  audio: '音频',
  image: '图片',
  doc: '文档',
  archive: '压缩包',
  installer: '安装包',
  code: '代码',
  log: '日志',
  other: '其他'
}

export const CATEGORY_COLORS: Record<FileCategory, string> = {
  video: '#ff7a45',
  audio: '#9254de',
  image: '#36cfc9',
  doc: '#597ef7',
  archive: '#faad14',
  installer: '#eb2f96',
  code: '#73d13d',
  log: '#8c8c8c',
  other: '#595959'
}

/** 临时/残留文件的扩展名 */
export const TEMP_EXTS = ['tmp', 'temp', 'bak', 'old', 'part', 'partial', 'crdownload', 'download', 'wbk', 'asd', '~']

const EXT_TO_CATEGORY: Record<string, FileCategory> = (() => {
  const m: Record<string, FileCategory> = {}
  for (const key of Object.keys(CATEGORY_EXTS) as FileCategory[]) {
    for (const e of CATEGORY_EXTS[key]) m[e] = key
  }
  return m
})()

export function categoryOfExt(ext: string): FileCategory {
  return EXT_TO_CATEGORY[ext] ?? 'other'
}

/** 一键预设 */
export interface Preset {
  key: string
  label: string
  conditions: FilterConditions
}

export const PRESETS: Preset[] = [
  { key: 'large100', label: '大文件 >100MB', conditions: { sizeMin: 100 * MB } },
  { key: 'large1g', label: '大文件 >1GB', conditions: { sizeMin: GB } },
  { key: 'old1y', label: '1年未访问', conditions: { dateField: 'at', dateOp: 'older', dateDays: 365 } },
  { key: 'old2y', label: '2年未修改', conditions: { dateField: 'mt', dateOp: 'older', dateDays: 730 } },
  { key: 'empty', label: '空文件', conditions: { emptyOnly: true } },
  { key: 'temp', label: '临时/残留文件', conditions: { tempLike: true } },
  { key: 'video', label: '视频', conditions: { categories: ['video'] } },
  { key: 'audio', label: '音频', conditions: { categories: ['audio'] } },
  { key: 'image', label: '图片', conditions: { categories: ['image'] } },
  { key: 'archive', label: '压缩包', conditions: { categories: ['archive'] } },
  { key: 'installer', label: '安装包', conditions: { categories: ['installer'] } },
  { key: 'doc', label: '文档', conditions: { categories: ['doc'] } },
  { key: 'log', label: '日志', conditions: { categories: ['log'] } },
  { key: 'code', label: '代码', conditions: { categories: ['code'] } },
  { key: 'emptyDirs', label: '空文件夹', conditions: { emptyDirs: true } }
]

/** 系统关键目录（永久删除/粉碎需二次确认）。注意：渲染进程无 process，需做兜底 */
export function protectedPrefixes(): string[] {
  const sd =
    typeof process !== 'undefined' && process.env && process.env.SystemDrive
      ? process.env.SystemDrive
      : 'C:'
  return [
    sd + '\\windows',
    sd + '\\program files',
    sd + '\\program files (x86)',
    sd + '\\programdata',
    sd + '\\users\\all users',
    sd + '\\users\\default'
  ]
}

export function isProtectedPath(p: string): boolean {
  const lower = p.toLowerCase().replace(/\//g, '\\')
  if (/^[a-z]:\\?$/.test(lower)) return true // 整个盘根
  return protectedPrefixes().some(
    (x) => lower === x || lower.startsWith(x + '\\')
  )
}

/** 默认扫描排除的目录名（可在设置中修改） */
export const DEFAULT_EXCLUDES = [
  '$RECYCLE.BIN',
  'System Volume Information',
  'Windows.old',
  'node_modules/.cache'
]
