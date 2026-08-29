import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke(channel: string, payload?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, payload)
  },
  on(channel: string, cb: (data: unknown) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, data: unknown): void => cb(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
