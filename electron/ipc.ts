import { BrowserWindow, clipboard, dialog, ipcMain, app } from 'electron'
import { CH } from '../shared/ipc-channels'
import { isProtectedPath } from '../shared/constants'
import type {
  DeleteMode,
  FilterQuery,
  OpResult
} from '../shared/types'
import * as scanner from './services/scanner'
import * as filterEngine from './services/filterEngine'
import * as dup from './services/duplicates'
import * as junk from './services/junk'
import * as ops from './services/fileOps'
import * as drives from './services/drives'
import * as history from './services/history'
import * as settingsSvc from './services/settings'

function send(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function registerIpc(): void {
  scanner.initScannerCallbacks({
    progress: (p) => send(CH.scanProgress, p),
    done: (s) => send(CH.scanDone, s)
  })
  dup.initDupCallbacks({
    progress: (p) => send(CH.dupProgress, p),
    done: (d) => send(CH.dupDone, d)
  })

  /* 应用与对话框 */
  ipcMain.handle(CH.appInfo, () => ({
    platform: process.platform,
    version: app.getVersion()
  }))

  ipcMain.handle(CH.dialogOpenDir, async (_e, defaultPath?: string) => {
    const win = BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, {
      title: '选择要分析的文件夹',
      defaultPath,
      properties: ['openDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(CH.dialogSaveFile, async (_e, args: { defaultName: string; filters: { name: string; ext: string[] }[] }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const r = await dialog.showSaveDialog(win, {
      title: '导出到…',
      defaultPath: args.defaultName,
      filters: args.filters.map((f) => ({ name: f.name, extensions: f.ext }))
    })
    return r.canceled ? null : r.filePath
  })

  /* 磁盘 */
  ipcMain.handle(CH.drivesList, () => drives.listDrives())

  /* 扫描 */
  ipcMain.handle(CH.scanStart, (_e, root: string) => scanner.startScan(root))
  ipcMain.handle(CH.scanCancel, () => scanner.cancelScan())

  /* 空间分析 */
  ipcMain.handle(CH.treeChildren, (_e, a: { scanId: number; dir: string }) =>
    scanner.treeChildren(a.scanId, a.dir)
  )
  ipcMain.handle(CH.filesInDir, (_e, a: { scanId: number; dir: string; limit?: number }) =>
    scanner.filesInDir(a.scanId, a.dir, a.limit)
  )
  ipcMain.handle(CH.topFiles, (_e, a: { scanId: number; limit?: number }) => scanner.topFiles(a.scanId, a.limit))
  ipcMain.handle(CH.extStats, (_e, a: { scanId: number; limit?: number }) => scanner.extStatsTop(a.scanId, a.limit))
  ipcMain.handle(CH.treemap, (_e, a: { scanId: number; base: string; depth?: number }) =>
    scanner.treemap(a.scanId, a.base, a.depth)
  )

  /* 筛选 */
  ipcMain.handle(CH.filterQuery, (_e, q: FilterQuery) => filterEngine.runFilter(q))
  ipcMain.handle(
    CH.filterExport,
    async (_e, args: { query: FilterQuery; format: 'csv' | 'json' }) => {
      const ext = args.format === 'csv' ? 'csv' : 'json'
      const target = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0], {
        title: '导出筛选结果',
        defaultPath: `筛选结果-${Date.now()}.${ext}`,
        filters:
          args.format === 'csv'
            ? [{ name: 'CSV', extensions: ['csv'] }]
            : [{ name: 'JSON', extensions: ['json'] }]
      })
      if (target.canceled || !target.filePath) return { ok: false, count: 0 }
      const { text, count } = filterEngine.exportRows(
        { scanId: args.query.scanId, conditions: args.query.conditions },
        args.format
      )
      await filterEngine.writeExportFile(target.filePath, text)
      return { ok: true, count, path: target.filePath }
    }
  )

  /* 重复文件 */
  ipcMain.handle(CH.dupStart, (_e, a: { root: string; minSize?: number }) => dup.startDupScan(a.root, a.minSize))
  ipcMain.handle(CH.dupCancel, () => dup.cancelDup())

  /* 垃圾清理 */
  ipcMain.handle(CH.junkList, () => junk.listJunkCategories())
  ipcMain.handle(CH.junkEstimate, (_e, id: string) => junk.estimateJunk(id))
  ipcMain.handle(CH.junkClean, (_e, id: string) => junk.cleanJunk(id))

  /* 文件操作 */
  ipcMain.handle(
    CH.opsDelete,
    async (_e, args: { paths: string[]; mode: DeleteMode; force?: boolean }): Promise<OpResult> => {
      const { paths, mode, force } = args
      if ((mode === 'permanent' || mode === 'shred') && !force) {
        const hitProtected = paths.some((p) => isProtectedPath(p))
        if (hitProtected) {
          throw new Error('包含系统关键路径，需要在确认对话框中勾选"我已知晓风险"后重试')
        }
      }
      const res = await ops.deletePaths(paths, mode)
      await ops.logOp(
        mode === 'recycle' ? '删除(回收站)' : mode === 'shred' ? '粉碎删除' : '永久删除',
        paths,
        mode,
        res
      )
      send(CH.opsChanged, null)
      return res
    }
  )
  ipcMain.handle(CH.opsMove, async (_e, args: { paths: string[]; dest: string }): Promise<OpResult> => {
    const res = await ops.movePaths(args.paths, args.dest)
    await ops.logOp('移动', args.paths, undefined, res)
    send(CH.opsChanged, null)
    return res
  })
  ipcMain.handle(CH.opsQuarantine, async (_e, args: { paths: string[] }): Promise<OpResult> => {
    const res = await ops.quarantinePaths(args.paths)
    await ops.logOp('隔离', args.paths, undefined, res)
    send(CH.opsChanged, null)
    return res
  })
  ipcMain.handle(CH.opsRestore, async (_e, id: string) => {
    const ok = await ops.restoreQuarantine(id)
    if (ok) send(CH.opsChanged, null)
    return ok
  })
  ipcMain.handle(CH.opsReveal, (_e, p: string) => ops.revealInExplorer(p))
  ipcMain.handle(CH.opsOpen, (_e, p: string) => ops.openPath(p))
  ipcMain.handle(CH.opsClipboard, (_e, p: string) => {
    clipboard.writeText(p)
    return true
  })

  /* 历史与隔离区 */
  ipcMain.handle(CH.historyList, () => history.listHistory())
  ipcMain.handle(CH.historyQuarantine, () => ops.listQuarantine())
  ipcMain.handle(CH.historyClear, () => history.clearHistory())

  /* 设置 */
  ipcMain.handle(CH.settingsGet, () => settingsSvc.getSettings())
  ipcMain.handle(CH.settingsSet, (_e, patch) => settingsSvc.saveSettings(patch))
}
