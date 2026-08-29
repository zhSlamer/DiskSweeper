/** 前后端共享类型定义 */

export interface FileRec {
  id: number       // 在扁平数组中的下标
  p: string        // 完整路径
  n: string        // 文件名
  ext: string      // 小写扩展名（不含点，无扩展名为 ''）
  s: number        // 大小（字节）
  sd: number       // 磁盘占用（近似，含压缩/稀疏感知）
  mt: number       // 修改时间 ms
  ct: number       // 创建时间 ms
  at: number       // 访问时间 ms
  f: number        // 标志位：1 隐藏(.开头) 2 只读 4 系统 8 符号链接
}

/** 表格行（文件或"空文件夹"等目录行） */
export interface FileRow extends FileRec {
  dir?: 1
}

export interface DirAgg {
  p: string
  name: string
  parent: string
  mt: number
  selfFiles: number
  selfBytes: number
  files: number   // 含子孙文件数
  dirs: number    // 直接子目录数
  bytes: number   // 含子孙总大小
}

export interface TreeChild {
  path: string
  name: string
  bytes: number
  files: number
  dirs: number
  mt: number
}

export interface TreeMapNode {
  name: string
  path: string
  value: number
  files?: number
  children?: TreeMapNode[]
}

export interface ExtStat {
  ext: string
  count: number
  bytes: number
}

export interface DriveInfo {
  letter: string      // "C:"
  label: string
  type: 'fixed' | 'removable' | 'network' | 'other'
  fileSystem: string
  total: number
  free: number
}

export interface ScanSummary {
  scanId: number
  root: string
  files: number
  dirs: number
  bytes: number
  errors: number
  links: number
  elapsedMs: number
  startedAt: number
  cancelled: boolean
}

export interface ScanProgress {
  scanId: number
  files: number
  bytes: number
  dirs: number
  errors: number
  elapsedMs: number
  current: string
}

export type FileCategory =
  | 'video' | 'audio' | 'image' | 'doc' | 'archive'
  | 'installer' | 'code' | 'log' | 'other'

export type SortKey = 'name' | 'size' | 'mtime' | 'path' | 'ext'

export interface FilterConditions {
  sizeMin?: number
  sizeMax?: number
  exts?: string[]          // 小写、不含点
  extExclude?: boolean     // true = 排除这些扩展名
  categories?: FileCategory[]
  dateField?: 'mt' | 'ct' | 'at'
  dateOp?: 'older' | 'newer'
  dateDays?: number
  nameMode?: 'contains' | 'wildcard' | 'regex'
  namePattern?: string
  onlyReadOnly?: boolean
  onlySymlink?: boolean
  dotHidden?: boolean      // 仅名称以 . 开头
  emptyOnly?: boolean      // 仅 0 字节文件
  tempLike?: boolean       // 临时/残留文件
  emptyDirs?: boolean      // 仅空文件夹（目录行）
}

export interface FilterQuery {
  scanId: number
  conditions: FilterConditions
  sort: { key: SortKey; order: 'asc' | 'desc' }
  page: number   // 0 起
  pageSize: number
}

export interface FilterPage {
  total: number
  totalBytes: number
  rows: FileRow[]
}

export interface DupItem {
  id: number
  p: string
  n: string
  s: number
  mt: number
}

export interface DupGroup {
  hash: string
  size: number
  waste: number
  items: DupItem[]
}

export interface DupProgress {
  stage: 'size' | 'partial' | 'full' | 'done'
  checked: number
  total: number
  groups: number
}

export interface DupDone {
  groups: DupGroup[]
  wastedBytes: number
  scanned: number
  elapsedMs: number
  cancelled: boolean
  error?: string
}

export type JunkSafety = 'safe' | 'caution'

export interface JunkCategory {
  id: string
  name: string
  desc: string
  paths: string[]
  special?: 'recyclebin'
  safety: JunkSafety
  exists: boolean
  note?: string
}

export interface JunkEstimate {
  id: string
  bytes: number
  files: number
  errors: number
}

export interface JunkCleanResult {
  id: string
  freed: number
  errors: number
}

export type DeleteMode = 'recycle' | 'permanent' | 'shred'

export interface OpResult {
  ok: number
  fail: number
  bytes: number
  failPaths: string[]
}

export interface QuarantineItem {
  id: string
  orig: string
  stored: string
  t: number
  size: number
}

export interface HistoryEntry {
  t: number
  action: string
  count: number
  bytes: number
  mode?: string
  ok: number
  fail: number
  detail?: string[]
}

export interface AppSettings {
  defaultDeleteMode: DeleteMode
  excludes: string[]
  confirmProtected: boolean
}
