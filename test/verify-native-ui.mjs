import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { nativeFixture, upstream } from '../RichThinking/scripts/native-fixture.mjs'

const { chromium } = await import(process.env.RICH_THINKING_PLAYWRIGHT
  ? pathToFileURL(process.env.RICH_THINKING_PLAYWRIGHT).href : 'playwright')
const out = await nativeFixture(true, await readFile(new URL('./ui-browser-entry.tsx', import.meta.url), 'utf8'))
const tokens = (await Promise.all(['base.css', 'design-platform.css', 'gradient-shadow-text.css', 'focus.css', 'scrollbar.css']
  .map(name => readFile(join(upstream, 'packages/client/ui-theme/src/styles', name), 'utf8')))).join('\n')
const panelCss = await readFile(new URL('../DeepSeekSecurity/src/panel.css', import.meta.url), 'utf8')
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>DSH native UI verification</title>
<link rel="stylesheet" href="/fixture.css"><style>${tokens}\n${panelCss}
body{margin:0;padding:24px;box-sizing:border-box;font:14px var(--dsw-font-family);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);
--dsh-composer-side-clearance:8px;--dsh-composer-dock-inset:4px;--dsh-composer-card-max-width:760px}
main{max-width:760px;margin:auto;min-width:0}h1,h2{font-size:16px;font-weight:500}#security{margin:24px 0}
#settings{max-width:560px}pre{white-space:pre-wrap;font:inherit}*,*:before,*:after{box-sizing:border-box}</style>
<body><main><h1>DSH · 原生组件组合验证</h1><div id="native"></div><div id="security"></div>
<h2>Rich Thinking 设置</h2><div id="settings"></div></main><div id="overlay"></div><script src="/fixture.js"></script></body></html>`
const server = createServer(async (req, res) => {
  const path = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null
  res.setHeader('Content-Type', path?.endsWith('.js') ? 'text/javascript' : path ? 'text/css' : 'text/html; charset=utf-8')
  res.end(path ? await readFile(join(out, path)) : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const checks = [], errors = []
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.RICH_THINKING_CHROMIUM ? { executablePath: process.env.RICH_THINKING_CHROMIUM } : {}) })
  const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.locator('[data-rich-thinking-word]').waitFor()
  const panel = page.locator('.dss-panel'), header = panel.locator('[data-disclosure-row]')
  assert.equal(await panel.count(), 0)
  await page.evaluate(() => window.ui.phase('threat_model'))
  await panel.waitFor()
  assert.equal(await panel.getByRole('img', { name: '进行中', exact: true }).count(), 1)
  assert.equal(await panel.getByRole('img', { name: '待处理', exact: true }).count(), 2)
  await header.focus(); await page.keyboard.press('Enter')
  assert.equal(await header.getAttribute('aria-expanded'), 'false')
  assert.equal(await panel.locator('li').count(), 0)
  await page.keyboard.press('Space')
  assert.equal(await header.getAttribute('aria-expanded'), 'true')
  checks.push('Idle hidden; native Enter/Space disclosure; accessible phase markers')
  await page.evaluate(() => window.ui.phase('reporting'))
  await page.waitForFunction(() => document.querySelectorAll('.dss-glyph[aria-label="已完成"]').length === 2)
  checks.push('Host stage updates preserve disclosure state')
  const field = page.getByLabel('中文词库（每行一条）')
  const colors = []
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'), theme)
    colors.push(await field.evaluate(el => getComputedStyle(el).backgroundColor))
    assert.notEqual(colors.at(-1), 'rgba(0, 0, 0, 0)')
    assert.equal(await panel.locator('li').first().evaluate(el => getComputedStyle(el).fontSize), '13px')
    await page.screenshot({ path: join(out, `unified-${theme}.png`), fullPage: true })
  }
  assert.notEqual(colors[0], colors[1])
  await field.focus()
  assert.notEqual(await field.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
  checks.push('Light/dark tokens, secondary typography, field focus ring')
  await page.setViewportSize({ width: 360, height: 1000 })
  await page.evaluate(() => { document.body.style.setProperty('--dsh-content-font-size-secondary', '17px'); document.body.style.setProperty('--dsh-content-font-delta', '4px') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const panelBox = await panel.boundingBox(), stopBox = await panel.getByRole('button', { name: '停止', exact: true }).boundingBox()
  assert.ok(stopBox.x >= panelBox.x && stopBox.x + stopBox.width <= panelBox.x + panelBox.width)
  assert.equal(await panel.locator('.dss-stop').evaluate(el => {
    const text = document.createRange(); text.selectNodeContents(el); return text.getClientRects().length
  }), 1, 'Stop text must not wrap on narrow screens')
  assert.equal(await panel.locator('li').first().evaluate(el => getComputedStyle(el).fontSize), '17px')
  await page.screenshot({ path: join(out, 'unified-narrow-large-font.png'), fullPage: true })
  checks.push('360px viewport, enlarged font, stop action within panel')
  await page.evaluate(() => window.ui.readFailure(true))
  await panel.getByRole('alert').waitFor()
  assert.match(await panel.getByRole('alert').textContent(), /连接已断开/)
  await page.evaluate(() => { window.ui.readFailure(false); window.ui.cancelFailure(true) })
  const stop = panel.getByRole('button', { name: '停止', exact: true })
  await stop.click()
  assert.equal(await stop.isDisabled(), true)
  await stop.evaluate(el => el.click())
  assert.equal(await page.evaluate(() => window.ui.stats().cancelCount), 1)
  await page.evaluate(() => window.ui.resolveCancel())
  await page.waitForFunction(() => document.querySelector('.dss-error')?.textContent.includes('停止失败'))
  await page.waitForTimeout(1100)
  assert.match(await panel.getByRole('alert').textContent(), /停止失败/)
  await page.evaluate(() => window.ui.cancelFailure(false))
  await stop.click(); await page.evaluate(() => window.ui.resolveCancel())
  await panel.waitFor({ state: 'detached' })
  checks.push('Read error recovery; duplicate Stop blocked; cancel failure retained; retry succeeds')
  for (const status of ['completed', 'failed', 'cancelled', 'interrupted']) {
    await page.evaluate(() => window.ui.phase('discovery')); await panel.waitFor()
    await page.evaluate(status => window.ui.finish(status), status); await panel.waitFor({ state: 'detached' })
  }
  await page.evaluate(() => { window.ui.phase('discovery'); window.ui.session('chat-b') }); await panel.waitFor()
  await page.evaluate(() => window.ui.session('chat-a')); await panel.waitFor()
  checks.push('All terminal states hide panel; session away/back retains workspace task')
  const save = page.getByRole('button', { name: '保存设置', exact: true })
  await field.fill('用户词库\n继续思考中')
  await page.getByLabel('轮播语言').selectOption('en')
  await page.getByLabel('切换间隔（秒）').fill('3')
  await save.click()
  await page.getByText('已保存，立即生效。', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.ui.stats().saveCount), 1)
  await page.evaluate(() => window.ui.saveFailure(true))
  await field.fill('未保存的编辑'); await save.click()
  await page.getByText('未保存。配置可能已在别处修改，请重新载入后再试。', { exact: true }).waitFor()
  assert.equal(await field.inputValue(), '未保存的编辑')
  await page.getByRole('button', { name: '重新载入', exact: true }).click()
  assert.equal(await field.inputValue(), '用户词库\n继续思考中')
  await field.fill('离开时丢弃')
  await page.evaluate(() => window.ui.leaveSettings()); await field.waitFor({ state: 'detached' })
  await page.evaluate(() => window.ui.returnSettings()); await field.waitFor()
  assert.equal(await field.inputValue(), '用户词库\n继续思考中')
  await page.evaluate(() => window.ui.writable(false))
  assert.equal(await field.isDisabled(), true)
  assert.equal(await save.isDisabled(), true)
  checks.push('Settings save, rejected edits, reload, leave/return, read-only')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('[data-rich-thinking-label]')?.dataset.motion === 'off')
  assert.equal(await page.locator('[data-rich-thinking-word]').evaluate(el => getComputedStyle(el).animationName), 'none')
  await page.evaluate(() => { window.ui.stop(); window.fixture.stop() })
  await panel.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.ui.stats().subscribers), 0)
  assert.equal(await page.locator('[data-rich-thinking-host]').count(), 0)
  checks.push('Reduced motion and teardown remove UI and listeners')
  assert.deepEqual(errors, [])
  const result = { passed: checks.length, checks, errors, upstream,
    scope: 'Local headless Chromium; real plugin UI and DSH primitives/tokens; scripted RPC/config, not a live desktop/model session.' }
  await writeFile(join(out, 'unified-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ ...result, artifacts: out }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ completedChecks: checks, browserErrors: errors }, null, 2))
  throw error
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
