const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../../.cache/pet-manager-preview');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1360, height: 1080, webPreferences: { contextIsolation: true } });
  const failures = [];
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') failures.push(details.message); });
  try {
    await win.loadURL('http://127.0.0.1:4326');
    const run = text => win.webContents.executeJavaScript(text);
    for (let i = 0; i < 30 && !await run('!!document.querySelector(".pm-settings")'); i++) await new Promise(r => setTimeout(r, 100));
    const capture = async name => fs.writeFile(path.join(out, name), (await win.webContents.capturePage()).toPNG());
    assert.equal(await run('document.querySelectorAll(".pm-pet-card").length'), 5);
    await capture('settings-light.png');
    await run('document.body.classList.add("dark")'); await capture('settings-dark.png');
    await run('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("创建伙伴")).click()');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await run('!!document.querySelector("form[aria-label=创建宠物]")'), true);
    await capture('creator-dark.png');
    await run('document.querySelector(".pm-creator").requestSubmit()');
    await new Promise(r => setTimeout(r, 150));
    assert.equal(await run('document.querySelectorAll(".pm-pet-card").length'), 6);
    assert.equal(await run('document.querySelectorAll(".pm-pet-card[data-selected=true]").length'), 1);
    await run('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("移入归档")).click()');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await run('document.querySelectorAll(".pm-pet-card").length'), 5);
    await run('[...document.querySelectorAll("button")].find(b=>b.textContent==="恢复").click()');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(await run('document.querySelectorAll(".pm-pet-card").length'), 6);
    win.setSize(500, 1000); await new Promise(r => setTimeout(r, 100));
    assert.equal(await run('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await capture('settings-narrow.png');
    assert.deepEqual(failures, []);
    console.log('UI smoke passed: gallery, create/save/select, archive/restore, light/dark and narrow layout');
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
