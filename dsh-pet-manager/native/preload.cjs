const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mini', {
  onState(fn) { const listener = (_event, state) => fn(state); ipcRenderer.on('mini:state', listener); return () => ipcRenderer.removeListener('mini:state', listener); },
  action(action) { if (['chat', 'voice', 'notifications'].includes(action)) ipcRenderer.send('mini:action', action); },
});
