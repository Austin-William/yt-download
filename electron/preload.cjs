const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  downloadVideo: (payload) => ipcRenderer.invoke('download-video', payload)
})
