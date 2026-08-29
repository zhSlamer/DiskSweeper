import { CH } from '../shared/ipc-channels'
import type {
  AppSettings,
  DeleteMode,
  DriveInfo,
  DupDone,
  DupProgress,
  DupGroup,
  ExtStat,
  FileRow,
  FilterPage,
  FilterQuery,
  HistoryEntry,
  JunkCategory,
  JunkCleanResult,
  JunkEstimate,
  OpResult,
  QuarantineItem,
  ScanProgress,
  ScanSummary,
  TreeMapNode,
  TreeChild
} from '../shared/types'

function inv<T>(ch: string, payload?: unknown): Promise<T> {
  return window.api.invoke(ch, payload) as Promise<T>
}

export const api = {
  appInfo: () => inv<{ platform: string; version: string }>(CH.appInfo),

  openDirDialog: (defaultPath?: string) => inv<string | null>(CH.dialogOpenDir, defaultPath),
  saveFileDialog: (defaultName: string, filters: { name: string; ext: string[] }[]) =>
    inv<string | null>(CH.dialogSaveFile, { defaultName, filters }),

  listDrives: () => inv<DriveInfo[]>(CH.drivesList),

  startScan: (root: string) => inv<number>(CH.scanStart, root),
  cancelScan: () => inv<boolean>(CH.scanCancel),
  onScanProgress: (cb: (p: ScanProgress) => void) => window.api.on(CH.scanProgress, (d) => cb(d as ScanProgress)),
  onScanDone: (cb: (s: ScanSummary) => void) => window.api.on(CH.scanDone, (d) => cb(d as ScanSummary)),

  treeChildren: (scanId: number, dir: string) => inv<TreeChild[]>(CH.treeChildren, { scanId, dir }),
  filesInDir: (scanId: number, dir: string, limit?: number) => inv<FileRow[]>(CH.filesInDir, { scanId, dir, limit }),
  topFiles: (scanId: number, limit?: number) => inv<FileRow[]>(CH.topFiles, { scanId, limit }),
  extStats: (scanId: number, limit?: number) => inv<ExtStat[]>(CH.extStats, { scanId, limit }),
  treemap: (scanId: number, base: string, depth?: number) => inv<TreeMapNode[]>(CH.treemap, { scanId, base, depth }),

  filterQuery: (q: FilterQuery) => inv<FilterPage>(CH.filterQuery, q),
  filterExport: (query: FilterQuery, format: 'csv' | 'json') =>
    inv<{ ok: boolean; count: number; total?: number; path?: string }>(CH.filterExport, { query, format }),

  dupStart: (root: string, minSize?: number) => inv<void>(CH.dupStart, { root, minSize }),
  dupCancel: () => inv<boolean>(CH.dupCancel),
  onDupProgress: (cb: (p: DupProgress) => void) => window.api.on(CH.dupProgress, (d) => cb(d as DupProgress)),
  onDupDone: (cb: (d: DupDone) => void) => window.api.on(CH.dupDone, (d) => cb(d as DupDone)),

  junkList: () => inv<JunkCategory[]>(CH.junkList),
  junkEstimate: (id: string) => inv<JunkEstimate>(CH.junkEstimate, id),
  junkClean: (id: string) => inv<JunkCleanResult>(CH.junkClean, id),

  delete: (paths: string[], mode: DeleteMode, force?: boolean) =>
    inv<OpResult>(CH.opsDelete, { paths, mode, force }),
  move: (paths: string[], dest: string) => inv<OpResult>(CH.opsMove, { paths, dest }),
  quarantine: (paths: string[]) => inv<OpResult>(CH.opsQuarantine, { paths }),
  restore: (id: string) => inv<boolean>(CH.opsRestore, id),
  reveal: (p: string) => inv<boolean>(CH.opsReveal, p),
  open: (p: string) => inv<void>(CH.opsOpen, p),
  copyPath: (p: string) => inv<void>(CH.opsClipboard, p),
  onOpsChanged: (cb: () => void) => window.api.on(CH.opsChanged, () => cb()),

  history: () => inv<HistoryEntry[]>(CH.historyList),
  quarantineList: () => inv<QuarantineItem[]>(CH.historyQuarantine),
  clearHistory: () => inv<void>(CH.historyClear),

  getSettings: () => inv<AppSettings>(CH.settingsGet),
  setSettings: (patch: Partial<AppSettings>) => inv<AppSettings>(CH.settingsSet, patch)
}

export type { DupGroup, FileRow, FilterPage, ScanProgress, ScanSummary, TreeMapNode, TreeChild }
