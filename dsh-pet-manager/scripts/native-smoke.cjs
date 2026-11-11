const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('../native/main.cjs');
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 50; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoading()) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const { builtins } = await import('../src/pets.mjs');
    process.emit('message', { svg: builtins[0].svg, name: '云朵', enabled: true, animated: true, size: 112, status: 'running', dark: true, text: '正在工作', notices: ['会话已停止运行，请查看结果'] });
    await new Promise(r => setTimeout(r, 300));
    assert.equal(win.isAlwaysOnTop(), true); assert.equal(win.isVisible(), true);
    assert.equal(win.webContents.getLastWebPreferences().nodeIntegration, false);
    assert.equal(win.webContents.getLastWebPreferences().contextIsolation, true);
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".pm-mini-keys button").length'), 3);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("pet").naturalWidth > 0'), true);
    await win.webContents.executeJavaScript('document.getElementById("notifications").click()');
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("notices").hidden'), false);
    await fs.writeFile(path.resolve(__dirname, '../../.cache/pet-manager-preview/native-mini.png'), (await win.webContents.capturePage()).toPNG());
    process.emit('message', { enabled: false, svg: '', name: '', size: 112, animated: false, status: 'idle', dark: false, text: '', notices: [] });
    assert.equal(win.isVisible(), false);
    console.log('Native smoke passed: transparent always-on-top window, isolated preload, SVG render, three keys, notifications, hide');
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
