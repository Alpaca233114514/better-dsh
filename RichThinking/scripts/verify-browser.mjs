import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { nativeFixture, upstream } from './native-fixture.mjs'

// Reuse an installed Playwright; it is verification tooling, not a plugin dependency.
const { chromium } = await import(process.env.RICH_THINKING_PLAYWRIGHT
  ? pathToFileURL(process.env.RICH_THINKING_PLAYWRIGHT).href : 'playwright')
const out = await nativeFixture(true)
const tokens = await readFile(join(upstream, 'packages/client/ui-theme/src/styles/design-platform.css'), 'utf8')
const html = `<!doctype html><html><meta charset="utf-8"><title>DSH Rich Thinking · Native component verification</title>
<link rel="stylesheet" href="/fixture.css"><style>${tokens}
body{margin:0;padding:52px;font:14px system-ui;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
main{max-width:760px;margin:auto}h1{font-size:18px;font-weight:500;margin:0 0 32px}pre{font:inherit;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}
p{line-height:1.7}.user{margin-bottom:24px}.answer{margin-top:20px}</style>
<body><main><h1>DSH Rich Thinking</h1><p class="user">请保留原生推理内容与展开交互。</p><div id="native"></div>
<p class="answer">原生 ReasoningRow 组件验证页</p></main><div id="overlay"></div><script src="/fixture.js"></script></body></html>`
const server = createServer(async (request, response) => {
  const path = request.url === '/fixture.js' ? 'fixture.js' : request.url === '/fixture.css' ? 'fixture.css' : null
  response.setHeader('Content-Type', path?.endsWith('.js') ? 'text/javascript' : path?.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
  response.end(path ? await readFile(join(out, path)) : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const checks = [], errors = []
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.RICH_THINKING_CHROMIUM ? { executablePath: process.env.RICH_THINKING_CHROMIUM } : {}) })
  const page = await browser.newPage({ viewport: { width: 1100, height: 520 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const label = page.locator('[data-rich-thinking-word]')
  await label.waitFor()
  const before = await label.boundingBox(), first = await label.textContent()
  await page.waitForFunction(first => document.querySelector('[data-rich-thinking-word]')?.textContent !== first, first)
  const after = await label.boundingBox()
  assert.equal(after.width, before.width)
  assert.equal(after.height, before.height)
  checks.push('Chinese-only rotation, stable label width and row height')
  await page.screenshot({ path: join(out, 'light.png') })
  const disclosure = page.locator('[data-disclosure-row]')
  await disclosure.focus()
  await page.keyboard.press('Enter')
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
  const content = page.locator('[data-slot="conversation.chat.reasoning.body"]')
  assert.match(await content.textContent(), /原生推理内容/)
  await page.evaluate(() => window.fixture.setFrame({ text: '**新的流式内容**\n\n正文由原生 Slot 接收。' }))
  await page.waitForFunction(() => document.querySelector('[data-slot="conversation.chat.reasoning.body"]')?.textContent.includes('新的流式内容'))
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
  checks.push('Native Enter disclosure and streaming body retain open state')
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  const nativeColor = await disclosure.evaluate(element => getComputedStyle(element).color)
  assert.equal(await label.evaluate(element => getComputedStyle(element).color), nativeColor)
  await page.screenshot({ path: join(out, 'dark-expanded.png') })
  checks.push('Dark tokens and font inheritance match the native disclosure')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('[data-rich-thinking-label]')?.getAttribute('data-motion') === 'off')
  assert.equal(await label.evaluate(element => getComputedStyle(element).animationName), 'none')
  await page.evaluate(() => window.fixture.settings({ animation: false }))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(await label.evaluate(element => getComputedStyle(element).animationName), 'none')
  checks.push('Reduced motion and explicit animation disable')
  await page.setViewportSize({ width: 360, height: 640 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: join(out, 'narrow.png') })
  checks.push('Narrow viewport without horizontal overflow')
  await page.evaluate(() => window.fixture.setFrame({ running: false }))
  await label.waitFor({ state: 'detached' })
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
  await page.keyboard.press('Space')
  assert.equal(await disclosure.getAttribute('aria-expanded'), 'false')
  checks.push('Completion restores native header and Space disclosure')
  await page.evaluate(() => window.fixture.setFrame({ running: true }))
  await label.waitFor()
  await page.evaluate(() => window.fixture.settings({ enabled: false }))
  await label.waitFor({ state: 'detached' })
  await page.evaluate(() => window.fixture.settings({ enabled: true }))
  await label.waitFor()
  await page.evaluate(() => window.fixture.stop())
  await label.waitFor({ state: 'detached' })
  assert.equal(await page.locator('[data-rich-thinking-style]').count(), 0)
  checks.push('Enable, disable and unload restore native UI')
  assert.deepEqual(errors, [])
  await writeFile(join(out, 'results.json'), JSON.stringify({ checks, errors,
    scope: 'Real DSH alpha.2 ReasoningRow/DisclosureRow/TextShimmer and tokens in Chromium; fixture body Slot, not a live DSH/model session.' }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, checks, artifacts: out }, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
