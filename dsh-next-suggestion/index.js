// Host half: assembles the predictor, registers the prefix route, exposes
// the nextSuggestion service for typert (CLI) clients, and enforces the
// connection fence before anything else.

import { Config } from './lib/config-schema.js'
import { createPredictionCache } from './lib/cache.js'
import { createDiagnostics } from './lib/diagnostics.js'
import { json, readJsonBody } from './lib/http.js'
import { createPredictor } from './lib/prediction.js'
import { findSettingsDescriptor, normalizeEdit, resolveConfig } from './lib/settings.js'

const name = 'dsh-next-suggestion'
const inject = ['sessions']

const ROUTE_PREFIX = '/next-suggestion/api'

let loggedSettingsEntry = false

function apply(ctx, config) {
  const debug = createDiagnostics()
  const readConfig = () => resolveConfig(config)
  const cache = createPredictionCache({
    ttlMs: readConfig().cacheTtlMs,
    maxEntries: readConfig().cacheMaxEntries,
  })
  const predictor = createPredictor({ ctx, debug, cache, readConfig })

  const settingsService = () => ctx.get('settings')

  function settingsDescriptor() {
    const service = settingsService()
    return service?.writable ? findSettingsDescriptor(service.describe(), 'next-suggestion') : undefined
  }

  function logSettingsEntryOnce() {
    if (loggedSettingsEntry) return
    loggedSettingsEntry = true
    const descriptor = settingsDescriptor()
    debug('settings-entry', {
      editable: descriptor !== undefined,
      ns: descriptor?.ns,
    })
  }

  function configPayload() {
    const descriptor = settingsDescriptor()
    const values = descriptor && typeof descriptor.value === 'object'
      ? { ...readConfig(), ...descriptor.value }
      : { ...readConfig() }
    return {
      values,
      editable: descriptor !== undefined,
      fallbackPollMs: values.fallbackPollMs,
    }
  }

  // Shared by the HTTP route and the nextSuggestion service (typert half).
  // Returns { text } on success or { code, message? } for known failures.
  async function predictFor(sessionId, force = false) {
    if (typeof sessionId !== 'string' || sessionId === '') return { code: 'missing-session' }
    const session = ctx.sessions.get(sessionId)
    if (!session) return { code: 'unknown-session' }
    try {
      const text = await predictor.predict(session, force === true)
      debug('predict', { sessionId, text })
      return { text }
    } catch (error) {
      return {
        code: 'predict-failed',
        message: String(error?.message ?? error),
      }
    }
  }

  // Shared by the HTTP route and the nextSuggestion service (typert half).
  // Returns the new config snapshot on success or { code } for known failures.
  async function editConfig(field, value) {
    const edit = normalizeEdit(field, value)
    if (!edit.ok) {
      debug('config-rejected', { field, reason: edit.reason })
      return { code: edit.reason }
    }
    const service = settingsService()
    const descriptor = settingsDescriptor()
    if (!service || !descriptor) return { code: 'not-editable' }
    try {
      await service.update(descriptor.ns, { [field]: edit.value }, descriptor.revision)
      debug('config-updated', { ns: descriptor.ns, field, value: edit.value })
      return configPayload()
    } catch (error) {
      if (error?.name === 'SettingsConflictError') return { code: 'conflict' }
      debug('config-failed', { field, message: String(error?.message ?? error) })
      return { code: 'update-failed' }
    }
  }

  // The typed service consumed by typert (CLI/TUI) invocations declared in
  // lib/typert.host.js; mirrors what the HTTP routes expose to the web half.
  ctx.provide('nextSuggestion', {
    getConfig: () => configPayload(),
    predict: (sessionId, force) => predictFor(sessionId, force),
    updateConfig: (field, value) => editConfig(field, value),
  })

  const CONFIG_ERROR_STATUS = {
    'unknown-field': 400,
    'invalid-value': 400,
    'out-of-range': 400,
    'not-editable': 501,
    conflict: 409,
    'update-failed': 500,
  }

  async function handleConfigPost(req, res) {
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      json(res, 400, { error: 'bad-body' })
      return
    }
    const field = typeof body?.field === 'string' ? body.field : ''
    const result = await editConfig(field, body?.value)
    if (result.code) {
      json(res, CONFIG_ERROR_STATUS[result.code] ?? 400, { error: result.code })
      return
    }
    json(res, 200, { ok: true, values: result.values })
  }

  async function handlePredict(req, res) {
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      json(res, 400, { error: 'bad-body' })
      return
    }
    const result = await predictFor(body?.sessionId, body?.force === true)
    if (result.code === 'missing-session' || result.code === 'unknown-session') {
      json(res, result.code === 'missing-session' ? 400 : 404, { error: result.code })
      return
    }
    if (result.code) {
      json(res, 500, { error: result.code, message: result.message ?? '' })
      return
    }
    json(res, 200, { text: result.text })
  }

  async function handle(req, res) {
    // The fence runs before anything is parsed: the prefix route inherits
    // the Connection service admission checks instead of adding its own.
    const rejection = ctx.get('connection').requestRejection(req)
    if (rejection !== undefined) {
      debug('request', { method: req.method, url: req.url, rejection })
      json(res, rejection, { error: 'forbidden' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (url.pathname === `${ROUTE_PREFIX}/note`) {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readJsonBody(req)
        debug('note', body)
      } catch {
        json(res, 400, { error: 'bad-body' })
        return
      }
      json(res, 200, { ok: true })
      return
    }
    if (url.pathname === `${ROUTE_PREFIX}/config`) {
      if (req.method !== 'GET' && req.method !== 'POST') {
        json(res, 405, { error: 'method-not-allowed' })
        return
      }
      if (req.method === 'GET') {
        logSettingsEntryOnce()
        json(res, 200, configPayload())
        return
      }
      logSettingsEntryOnce()
      await handleConfigPost(req, res)
      return
    }
    if (url.pathname === `${ROUTE_PREFIX}/predict`) {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method-not-allowed' })
        return
      }
      await handlePredict(req, res)
      return
    }
    json(res, 404, { error: 'not-found' })
  }

  ctx.inject(['webServer', 'connection'], web => web.effect(() => web.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      void handle(req, res).catch(error => {
        debug('request-failed', { message: String(error.message) })
        json(res, 500, { error: 'request-failed' })
      })
    },
  })))
}

export { Config, name, inject, apply }
