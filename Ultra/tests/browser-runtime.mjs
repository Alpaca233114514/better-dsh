import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire('C:/Users/Logan/Documents/GitHub/Papyrus_Desktop/package.json');
const { chromium } = require('playwright');

export async function verifyNativeUi(url, sessionId) {
  const output = new URL('../verification/', import.meta.url); await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Logan/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
  const errors = [], consoleMessages = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMessages.push(m.text().replace(/([?&]token=)[^\s&]+/g, '$1[redacted]')); });
    await page.goto(url); await page.waitForTimeout(2000);
    const notice = page.getByRole('button', { name: '继续', exact: true });
    if (await notice.count()) await notice.click();
    await page.getByText('未分组', { exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByText('Ultra integration', { exact: true }).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: fileURLToPath(new URL('native-initial.png', output)) });
    await page.getByRole('button', { name: '推理滑条', exact: true }).click({ timeout: 3000 });
    await page.waitForTimeout(400);
    const slider = page.getByRole('slider', { name: '推理强度', exact: true });
    assert.equal(await slider.getAttribute('aria-valuetext'), 'Ultra');
    assert.equal(await page.locator('.du-team').count(), 0);
    assert.equal(await page.locator('.rs-spark').count(), 20);
    assert.equal(Math.round((await page.locator('.rs-panel').boundingBox()).width), 280);
    await page.screenshot({ path: fileURLToPath(new URL('native-ultra-light.png', output)) });
    await slider.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.rs-trigger-level')?.textContent === 'Max');
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.rs-max-field').count(), 0);
    assert.equal(await page.locator('.du-team').count(), 0);
    await slider.press('End');
    await page.waitForFunction(() => document.querySelector('.rs-trigger-level')?.textContent === 'Ultra');
    await page.reload(); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '推理滑条', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=slider]')?.getAttribute('aria-valuetext') === 'Ultra');
    assert.equal(await page.locator('.mode-description,.composer-note').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(consoleMessages, []);
    await page.screenshot({ path: fileURLToPath(new URL('native-ultra-final.png', output)) });
    await writeFile(new URL('browser.json', output), JSON.stringify({ status: 'passed', sessionId, checks: ['cold session Ultra restore', 'native slider selects max and ultra', 'exclusive effects', '280px original popover', 'no custom agent activity panel', 'reload persistence', 'no additional explanatory text'], errors, consoleMessages }, null, 2));
  } finally { await browser.close(); }
}
