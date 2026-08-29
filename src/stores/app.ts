import { create } from 'zustand'
import type { AppSettings, ScanProgress, ScanSummary } from '../../shared/types'
import { api } from '../api'

export type PageKey =
  | 'dashboard'
  | 'analyzer'
  | 'filter'
  | 'duplicates'
  | 'junk'
  | 'history'
  | 'settings'

interface AppState {
  page: PageKey
  setPage: (p: PageKey) => void

  scanId: number | null
  scanRoot: string
  summary: ScanSummary | null
  running: boolean
  progress: ScanProgress | null
  beginScan: (root: string) => Promise<void>
  cancel: () => Promise<void>
  onProgress: (p: ScanProgress) => void
  onDone: (s: ScanSummary) => void
  clearScan: () => void

  settings: AppSettings | null
  loadSettings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>

  /** 仪表盘请求分析某个磁盘/目录（跨页面传递，避免挂载时序丢事件） */
  pendingAnalyze: { root: string; ts: number } | null
  requestAnalyze: (root: string) => void
  consumeAnalyze: () => void
}

export const useApp = create<AppState>((set, get) => ({
  page: 'dashboard',
  setPage: (p) => set({ page: p }),

  scanId: null,
  scanRoot: '',
  summary: null,
  running: false,
  progress: null,

  beginScan: async (root) => {
    if (get().running) return
    set({ running: true, progress: null, summary: null, scanRoot: root, scanId: null })
    try {
      await api.startScan(root)
    } catch (e) {
      set({ running: false })
      throw e
    }
  },
  cancel: async () => {
    await api.cancelScan()
  },
  onProgress: (p) => set({ progress: p }),
  onDone: (s) =>
    set({
      running: false,
      progress: null,
      summary: s,
      scanId: s.cancelled ? null : s.scanId
    }),
  clearScan: () => set({ scanId: null, summary: null, progress: null, scanRoot: '', running: false }),

  settings: null,
  loadSettings: async () => {
    const s = await api.getSettings()
    set({ settings: s })
  },
  updateSettings: async (patch) => {
    const s = await api.setSettings(patch)
    set({ settings: s })
  },

  pendingAnalyze: null,
  requestAnalyze: (root) => set({ pendingAnalyze: { root, ts: Date.now() } }),
  consumeAnalyze: () => set({ pendingAnalyze: null })
}))
