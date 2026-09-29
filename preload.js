const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  getPreferences: () => ipcRenderer.invoke('pet:get-preferences'),
  onPreferences: (callback) => ipcRenderer.on('pet:preferences', (_event, value) => callback(value)),
  onAction: (callback) => ipcRenderer.on('pet:action', (_event, value) => callback(value)),
  pointerIsOpaque: (opaque) => ipcRenderer.send('pet:pointer-opaque', Boolean(opaque)),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  greet: () => ipcRenderer.send('pet:greet')
});
