const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  downloadVideo: (payload) => ipcRenderer.invoke('download-video', payload),
  onDownloadLog: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('download-log', listener)
    return () => ipcRenderer.removeListener('download-log', listener)
  }
})