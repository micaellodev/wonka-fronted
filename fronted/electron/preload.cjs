const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  printSilent: (html) => ipcRenderer.invoke('print:silent', html),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  getPrintConfig: () => ipcRenderer.invoke('printer:get-config'),
  setPrintConfig: (cfg) => ipcRenderer.invoke('printer:set-config', cfg),
  printTest: () => ipcRenderer.invoke('print:test'),
  printDiagnostic: () => ipcRenderer.invoke('print:diagnostic'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateStatus: (cb) => {
    const h = (_e, s) => cb(s)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  installUpdate: () => ipcRenderer.send('update:install'),
})
