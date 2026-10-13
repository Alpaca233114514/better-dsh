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
<p class="answer">原生 RunningStatus 与推理折叠行验证页</p></main><div id="overlay"></div><script src="/fixture.js"></script></body></html>`
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
  assert.equal(after.height, before.height)
  checks.push('Chinese-only bottom status rotation and stable row height')
  await page.screenshot({ path: join(out, 'light.png') })
  const nativeTitle = page.locator('[data-rich-thinking-title]')
  const nativeText = page.locator('[data-rich-thinking-native]')
  assert.equal(await nativeText.isVisible(), false)
  assert.equal(await page.locator('[data-shimmer] [data-rich-thinking-host]').count(), 0)
  assert.equal(await nativeTitle.isVisible(), false)
  assert.equal(await page.locator('[data-chat-running] > span > [data-shimmer] > [aria-hidden="true"]').isVisible(), false)
  const suffix = page.locator('[data-rich-thinking-elapsed]')
  assert.equal(await suffix.textContent(), (await nativeTitle.textContent()).slice('深度求索中'.length))
  const previousTime = await suffix.textContent()
  await page.waitForFunction(previous => document.querySelector('[data-rich-thinking-elapsed]')?.textContent !== previous, previousTime)
  const visibleStatus = () => page.locator('[data-chat-running] > span').last().innerText()
  assert.doesNotMatch(await visibleStatus(), /深度求索中/)
  assert.equal((await visibleStatus()).match(/用时/g)?.length, 1)
  // An extra unmarked native copy must also stay hidden, regardless of its CSS.
  await page.evaluate(() => {
    const copy = document.createElement('span')
    copy.dataset.regressionCopy = ''
    copy.textContent = '深度求索中，用时 16秒 ···'
    copy.style.setProperty('display', 'inline', 'important')
    document.querySelector('[data-rich-thinking-native]').firstElementChild.append(copy)
  })
  assert.equal(await page.locator('[data-regression-copy]').isVisible(), false)
  assert.doesNotMatch(await visibleStatus(), /深度求索中/)
  assert.equal((await visibleStatus()).match(/用时/g)?.length, 1)
  await page.screenshot({ path: join(out, 'duplicate-regression.png') })
  await page.evaluate(() => document.querySelector('[data-regression-copy]').remove())
  checks.push('Built client via DSH loader: only one visible status and duration, including extra native copies')
  assert.equal(await page.locator('[data-disclosure-row] [data-rich-thinking-host]').count(), 0)
  assert.equal(await page.locator('[data-chat-running] svg').count(), 1)
  checks.push('Old status hidden; native duration keeps ticking; whale retained; disclosure untouched')
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
  const nativeColor = await page.locator('[data-chat-running]').evaluate(element => getComputedStyle(element).color)
  assert.equal(await label.evaluate(element => getComputedStyle(element).color), nativeColor)
  await page.screenshot({ path: join(out, 'dark-expanded.png') })
  checks.push('Dark tokens and font inheritance match native running status')
  // Observe actual intermediate frames, not just the final word after an animation.
  await page.evaluate(() => window.fixture.settings({ animation: false,
    chineseVerbs: ['甲乙丙丁戊'], vocabularyMode: 'replace', intervalMs: 5000 }))
  await page.waitForFunction(() => document.querySelector('[data-rich-thinking-word]')?.textContent === '甲乙丙丁戊')
  const frames = await page.evaluate(async () => {
    const word = document.querySelector('[data-rich-thinking-word]')
    const seen = []
    const observer = new MutationObserver(() => seen.push(word.textContent))
    observer.observe(word, { childList: true, characterData: true, subtree: true })
    window.fixture.settings({ animation: true, chineseVerbs: ['一二三四五'] })
    await new Promise(resolve => setTimeout(resolve, 350))
    observer.disconnect()
    return seen
  })
  const expected = ['甲乙丙丁戊', '一乙丙丁戊', '一二丙丁戊', '一二三丁戊', '一二三四戊', '一二三四五']
  assert.ok(frames.some(text => expected.slice(1, -1).includes(text)), JSON.stringify(frames))
  assert.ok(frames.every(text => expected.includes(text)), JSON.stringify(frames))
  assert.deepEqual(frames.map(text => expected.indexOf(text)), frames.map(text => expected.indexOf(text)).sort((a, b) => a - b))
  assert.equal(await label.textContent(), '一二三四五')
  assert.equal(await suffix.textContent(), (await nativeTitle.textContent()).slice('深度求索中'.length))
  checks.push('Fast left-to-right replacement verified from intermediate character frames; native time preserved')
  const transitions = await page.evaluate(async () => {
    const failures = [], samples = []
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    for (const words of [['灵感搅拌中', '琢磨中'], ['想', '正在串起所有线索中'], ['飞快思考中', '求索中', '慢慢梳理中']]) {
      window.fixture.settings({ animation: false, chineseVerbs: [words[0]] })
      await wait(40)
      for (const next of words.slice(1)) {
        window.fixture.settings({ animation: true, chineseVerbs: [next] })
        const deadline = performance.now() + (words.length > 2 && next !== words.at(-1) ? 60 : 330)
        while (performance.now() < deadline) {
          await new Promise(requestAnimationFrame)
          const row = document.querySelector('[data-chat-running]')
          const word = row.querySelector('[data-rich-thinking-word]')
          const native = row.querySelector('[data-rich-thinking-native]')
          const content = row.lastElementChild.innerText
          const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT)
          let textNodes = 0
          while (walker.nextNode()) if (walker.currentNode.textContent) textNodes++
          if (textNodes !== 1 || row.querySelectorAll('[data-rich-thinking-host]').length !== 1
            || getComputedStyle(native).display !== 'none' || /深度求索中/.test(content)
            || (content.match(/用时/g) || []).length !== 1) failures.push(content)
          samples.push(word.textContent)
        }
      }
      if (document.querySelector('[data-rich-thinking-word]').textContent !== words.at(-1)) failures.push('stale final word')
    }
    return { failures, frames: samples.length }
  })
  assert.deepEqual(transitions.failures, [])
  assert.ok(transitions.frames > 10)
  checks.push(`Unequal-length and interrupted word changes: ${transitions.frames} frames with one text node and one visible duration`)
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
  assert.equal(await page.locator('[data-chat-running] [data-shimmer]').isVisible(), true)
  assert.match(await visibleStatus(), /深度求索中/)
  assert.equal((await visibleStatus()).match(/用时/g)?.length, 1)
  await page.evaluate(() => window.fixture.settings({ enabled: true }))
  await label.waitFor()
  await page.evaluate(() => window.fixture.stop())
  await label.waitFor({ state: 'detached' })
  assert.equal(await page.locator('[data-rich-thinking-style]').count(), 0)
  assert.equal(await page.locator('[data-chat-running] [data-shimmer]').isVisible(), true)
  checks.push('Enable, disable and unload restore native UI')
  assert.deepEqual(errors, [])
  await writeFile(join(out, 'results.json'), JSON.stringify({ checks, errors,
    scope: 'Real DSH RunningStatus/RunningWhaleTail/ReasoningRow/DisclosureRow/TextShimmer and tokens in Chromium; fixture body Slot, not a live DSH/model session.' }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, checks, artifacts: out }, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
