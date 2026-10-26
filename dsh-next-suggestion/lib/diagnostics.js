// Opt-in diagnostics, stored in the user's DSH directory.

import { appendFileSync, closeSync, constants, existsSync, fchmodSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export function createDiagnostics({
  home = process.env.DSH_HOME || join(homedir(), '.dsh'),
  flag = join(home, 'next-suggestion-debug'),
  log = join(home, 'logs', 'next-suggestion.log'),
} = {}) {
  return function debug(event, detail) {
    let fd
    try {
      if (process.env.DSH_NEXT_SUGGESTION_ALWAYS_LOG !== '1' && !existsSync(flag)) return
      mkdirSync(dirname(log), { recursive: true, mode: 0o700 })
      fd = openSync(log, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
      fchmodSync(fd, 0o600)
      appendFileSync(fd, `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}\n`)
    } catch {
      // Diagnostics must never break a request, including when a log path is a symlink.
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }
}
