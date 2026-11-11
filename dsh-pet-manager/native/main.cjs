const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
let win, latest, ready = false;
app.setName('DSH Mini');
app.whenReady().then(() => {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ width: 320, height: 410, x: area.x + area.width - 340, y: area.y + area.height - 430,
    transparent: true, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('did-finish-load', () => { ready = true; if (latest) update(latest); process.send?.({ ready: true }); });
  ipcMain.on('mini:action', (event, action) => {
    if (event.sender !== win.webContents || !['chat', 'voice', 'notifications'].includes(action)) return;
    process.send?.({ action });
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
function update(state) {
  latest = state; if (!ready || win.isDestroyed()) return;
  win.webContents.send('mini:state', state);
  if (state.enabled) win.showInactive(); else win.hide();
}
process.on('message', update);
process.on('disconnect', () => app.quit());
app.on('window-all-closed', () => app.quit());
