/** IPC 通道名集中定义（主进程与渲染进程共用） */
export const CH = {
  drivesList: 'drives:list',
  dialogOpenDir: 'dialog:openDir',
  dialogSaveFile: 'dialog:saveFile',

  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanProgress: 'scan:progress',
  scanDone: 'scan:done',

  treeChildren: 'analysis:treeChildren',
  filesInDir: 'analysis:filesInDir',
  topFiles: 'analysis:topFiles',
  extStats: 'analysis:extStats',
  treemap: 'analysis:treemap',

  filterQuery: 'filter:query',
  filterExport: 'filter:export',

  dupStart: 'dup:start',
  dupCancel: 'dup:cancel',
  dupProgress: 'dup:progress',
  dupDone: 'dup:done',

  junkList: 'junk:list',
  junkEstimate: 'junk:estimate',
  junkEstimateProgress: 'junk:estimate-progress',
  junkClean: 'junk:clean',
  junkCleaned: 'junk:cleaned',

  opsDelete: 'ops:delete',
  opsMove: 'ops:move',
  opsQuarantine: 'ops:quarantine',
  opsRestore: 'ops:restore',
  opsReveal: 'ops:reveal',
  opsOpen: 'ops:open',
  opsClipboard: 'ops:clipboard',
  opsChanged: 'ops:changed',

  historyList: 'history:list',
  historyQuarantine: 'history:quarantine',
  historyClear: 'history:clear',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  appInfo: 'app:info'
} as const
