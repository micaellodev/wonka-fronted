const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  printSilent: (html) => ipcRenderer.send('print:silent', html),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateStatus: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  },
  installUpdate: () => ipcRenderer.send('update:install'),
})
