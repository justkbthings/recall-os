const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('recallBackup', {
  save: (data) => ipcRenderer.invoke('recall:save-backup', data),
})
