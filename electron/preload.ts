import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sonicflow', {
  getConnectionUrl: () => ipcRenderer.invoke('sonicflow:connection-url') as Promise<string>,
})