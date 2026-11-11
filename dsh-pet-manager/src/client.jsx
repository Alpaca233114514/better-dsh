import React from 'react';
import { contribution } from './remote.ts';
import { createManager } from './manager.mjs';
import { Settings, Mini } from './ui.jsx';
import css from './style.css';
export const inject = ['slots', 'sessions', 'conversation', 'layout', 'remote'];
export async function apply(ctx) {
  const disposeRemote = await ctx.remote.$mount(contribution);
  ctx.effect(() => disposeRemote);
  ctx.inject(['configForms'], scope => mountUi(scope, scope.configForms.get('dsh-pet-manager')));
  ctx.inject(['settingsScope', 'connection'], scope => {
    if (scope.get('configForms')) return;
    const source = scope.settingsScope.bind({ namespace: 'dsh-pet-manager' });
    const form = {
      getSnapshot: () => source.getSnapshot(), subscribe: fn => source.subscribe(fn),
      async mutate(ops, expectedRevision) {
        const response = await scope.remote.settings.mutate({ ns: 'dsh-pet-manager', ops, expectedRevision });
        const result = response.result ?? response;
        await source.load();
        return result.ok;
      },
    };
    mountUi(scope, form);
  });
}
function mountUi(ctx, form) {
  const manager = createManager(ctx, form);
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    let stopped = false;
    const tick = async () => { await manager.syncDesktop(); if (!stopped) timeout = setTimeout(tick, 1000); };
    let timeout = setTimeout(tick, 0);
    return () => { stopped = true; clearTimeout(timeout); manager.dispose(); style.remove(); };
  });
  ctx.inject(['remote.petManager'], scope => {
    manager.setNative({ run: req => scope.remote.petManager.run(req) });
    scope.effect(() => () => manager.setNative(null));
  });
  ctx.inject(['remote.speech'], scope => {
    const service = { transcribe: (request, signal) => scope.remote.speech.transcribe(request, signal) };
    const stream = scope.remote.$stream({ name: 'Pet voice readiness', open: signal => scope.remote.speech.follow(signal), ended: () => new Error('语音连接已断开'), carrierFailed: () => manager.setSpeech(null, null) });
    let disposed = false;
    const reading = (async () => { try { for await (const item of stream) { if (!disposed) manager.setSpeech(service, item.value); item.accept(); } } catch { manager.setSpeech(null, null); } })();
    scope.effect(() => async () => { disposed = true; manager.setSpeech(null, null); manager.cancelVoice(); await stream.dispose(); await reading; });
  });
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-pet-manager', order: 26, label: '迷你界面和伙伴' },
    ({ close }) => <Settings manager={{ ...manager, chat: () => { close(); manager.chat(); }, voice: () => { close(); manager.voice(); }, design: description => { manager.design(description); close(); } }}/>));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-pet-manager', order: 25 }, () => <Mini manager={manager}/>));
}
