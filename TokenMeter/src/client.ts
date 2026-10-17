import React from 'react'
import { contribution } from './remote.ts'
import { createMeterClient } from './generated-client.js'

export const inject = ['timer', 'slots', 'remote']
export async function apply(ctx) {
  await ctx.remote.$mount(contribution)
  ctx.inject(['remote.tokenMeterDashboard'], scope => {
    const host = { call: async name => {
      const method = name === 'meter:reset' ? 'reset' : 'state'
      const result = await scope.remote.tokenMeterDashboard[method]()
      if (!result.ok) throw new Error(result.error?.message || 'Token 计量服务暂不可用')
      return result.value
    } }
    const styles = { insert(css) {
      scope.effect(() => {
        const element = document.createElement('style'); element.textContent = css
        document.head.append(element)
        return () => element.remove()
      })
    } }
    createMeterClient(React, host, styles).apply(scope)
  })
}
