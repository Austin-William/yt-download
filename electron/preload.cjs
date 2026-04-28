const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  downloadVideo: (payload) => ipcRenderer.invoke('download-video', payload),
  getVideoInfo: (payload) => ipcRenderer.invoke('get-video-info', payload),
  onDownloadPhase: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('download-phase', listener)
    return () => ipcRenderer.removeListener('download-phase', listener)
  },
  onDownloadProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  },
  onDownloadLog: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('download-log', listener)
    return () => ipcRenderer.removeListener('download-log', listener)
  }
})