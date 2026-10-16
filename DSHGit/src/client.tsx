import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRemote } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitPanel, Icon } from './panel.tsx'
import styles from './panel.css'

export function GitLauncher({ sessionId, remote }: { sessionId: string; remote: GitRemote }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  return <><button ref={trigger} type="button" className="dg-launcher" title="打开 DSHGit" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} accessKey="g"><Icon name="branch"/><span>DSHGit</span></button>
    {createPortal(<dialog ref={dialog} className="dg-dialog" aria-label="DSHGit Git 面板" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}>
      {open && <GitPanel key={sessionId} sessionId={sessionId} remote={remote} onClose={close}/>}
    </dialog>, document.body)}
  </>
}
export const inject = ['slots', 'remote']
export async function apply(ctx: Context) {
  await ctx.remote.$mount(contribution)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove() })
  ctx.inject(['remote.dshgit'], scope => {
    function Entry({ sessionId }: PropsRuntime<'conversation.session.header.utilities'>) {
      return <GitLauncher key={sessionId} sessionId={sessionId} remote={scope.remote.dshgit}/>
    }
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'dshgit', order: 10,
    }, Entry))
  })
}
