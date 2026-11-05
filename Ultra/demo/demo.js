const $ = id => document.getElementById(id);
const names = { low: '低', medium: '中', high: '高', max: 'Max', ultra: 'Ultra' };
const agents = [
  { name: '接口检查', task: '梳理会话与错误处理', icon: '01', effort: 'max' },
  { name: '界面检查', task: '检查登录交互与状态反馈', icon: '02', effort: 'max' },
  { name: '验证设计', task: '整理边界条件与回归用例', icon: '03', effort: 'max' },
];
let available = true, level = 'ultra', running = false, dragging = false, committed = level;
let timers = [], effectTimer;
const panel = $('panel'), slider = $('slider');
const levels = () => [...UltraPolicy.EFFORTS, ...(available ? ['ultra'] : [])];
const current = () => UltraPolicy.selection(level, available);

function effect(animate) {
  const emphasized = ReasoningEffectPolicy.isEmphasized(level, levels());
  panel.toggleAttribute('data-max', emphasized);
  $('trigger-effort').toggleAttribute('data-max', emphasized);
  const old = panel.querySelector('.rs-max-field');
  clearTimeout(effectTimer);
  if (!emphasized && old) {
    old.removeAttribute('data-reveal'); old.setAttribute('data-exit', '');
    effectTimer = setTimeout(() => old.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
  } else if (emphasized) {
    if (old && !old.hasAttribute('data-exit')) return;
    old?.remove();
    const field = document.createElement('span'); field.className = 'rs-max-field'; field.style.setProperty('--max-v', '1');
    if (animate) field.setAttribute('data-reveal', '');
    const glow = document.createElement('span'); glow.className = 'rs-max-glow'; field.append(glow);
    for (let i = 0; i < 20; i++) {
      const spark = document.createElement('i'); spark.className = 'rs-spark';
      Object.assign(spark.style, { left: `${12 + i * 37 % 83}%`, top: `${19 + i * 29 % 64}%` });
      spark.style.setProperty('--delay', `${-i * .31}s`); spark.style.setProperty('--duration', `${2.1 + i % 4 * .3}s`); spark.style.setProperty('--size', i % 4 === 0 ? '3.4px' : '2.2px'); field.append(spark);
    }
    $('ticks').before(field);
  }
}

function renderAgents() {
  $('agent-list').replaceChildren(...agents.map((agent, i) => {
    const row = document.createElement('div'); row.className = 'agent-row'; row.dataset.agent = i;
    row.innerHTML = `<span class="agent-icon">${agent.icon}</span><div class="agent-copy"><div class="agent-name">${agent.name}</div><p class="agent-task">${agent.task}</p></div><span class="agent-status">待命</span>`;
    const select = document.createElement('select'); select.className = 'effort-select'; select.setAttribute('aria-label', `${agent.name}思考强度`);
    for (const effort of UltraPolicy.EFFORTS) { const option = document.createElement('option'); option.value = effort; option.textContent = names[effort]; select.append(option); }
    select.value = agent.effort; select.disabled = running;
    select.addEventListener('change', () => { agent.effort = UltraPolicy.childOptions(select.value).reasoningEffort; });
    row.append(select); return row;
  }));
}

function render(animate = true) {
  const list = levels(), index = list.indexOf(level), ultra = current().proactiveDelegation;
  $('level').textContent = names[level]; $('trigger-effort').textContent = names[level];
  slider.style.setProperty('--v', index / (list.length - 1));
  slider.setAttribute('aria-valuemax', list.length - 1); slider.setAttribute('aria-valuenow', index); slider.setAttribute('aria-valuetext', names[level]);
  slider.setAttribute('aria-disabled', running); slider.tabIndex = running ? -1 : 0;
  $('ticks').replaceChildren(...list.map((_, i) => { const tick = document.createElement('i'); if (i <= index) tick.className = 'on'; return tick; }));
  $('parent-effort').textContent = names[current().reasoningEffort]; $('mode-badge').textContent = names[level];
  $('intro').textContent = ultra ? '我会先梳理主流程，同时把接口检查、界面检查和验证设计交给子代理，最后统一核对结果。' : '我会先梳理登录流程，再依次检查接口、界面和验证方案。你也可以明确要求我使用子代理。';
  $('team-title').textContent = ultra ? '准备并行探索' : '主代理推进任务';
  $('team-count').textContent = ultra ? '3 个子代理' : '子代理待命';
  $('agent-list').hidden = !ultra;
  $('restore').hidden = !ultra;
  $('available').disabled = running; $('reset').disabled = running; $('restore').disabled = running;
  effect(animate); placePanel();
}

function placePanel() {
  if (panel.hidden) return;
  const r = $('trigger').getBoundingClientRect();
  panel.style.left = `${Math.max(10, Math.min(innerWidth - panel.offsetWidth - 10, r.left + r.width / 2 - panel.offsetWidth / 2))}px`;
  panel.style.top = `${Math.max(10, r.top - panel.offsetHeight - 12)}px`;
}
function openPanel(open) {
  panel.hidden = !open; $('trigger').setAttribute('aria-expanded', open);
  if (open) { panel.querySelector('.rs-max-field')?.removeAttribute('data-reveal'); placePanel(); }
}
function choose(id) { if (running) return; level = id; committed = id; $('run-state').textContent = '待开始'; $('result').textContent = ''; render(); }
function pointerLevel(event) {
  const rect = slider.getBoundingClientRect(), thumb = 28;
  const at = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - thumb / 2) / (rect.width - thumb))) * (levels().length - 1));
  return levels()[at];
}
slider.addEventListener('pointerdown', e => { if (running || e.button !== 0) return; e.preventDefault(); committed = level; dragging = true; slider.setPointerCapture(e.pointerId); slider.dataset.dragging = ''; level = pointerLevel(e); render(); });
slider.addEventListener('pointermove', e => { if (!dragging) return; const next = pointerLevel(e); if (next !== level) { level = next; render(); } });
slider.addEventListener('pointerup', e => { if (!dragging) return; dragging = false; delete slider.dataset.dragging; choose(pointerLevel(e)); });
function cancelDrag() { if (!dragging) return; dragging = false; delete slider.dataset.dragging; level = committed; render(); }
slider.addEventListener('pointercancel', cancelDrag); slider.addEventListener('lostpointercapture', cancelDrag);
slider.addEventListener('keydown', e => {
  if (running) return;
  const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1 };
  const list = levels(), at = list.indexOf(level);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : e.key in steps ? Math.max(0, Math.min(list.length - 1, at + steps[e.key])) : null;
  if (next !== null) { e.preventDefault(); choose(list[next]); }
});
$('trigger').addEventListener('click', () => openPanel(panel.hidden));
$('reset').addEventListener('click', () => choose('max'));
$('available').addEventListener('change', e => { available = e.target.checked; choose(level === 'ultra' && !available ? 'max' : level); });
$('restore').addEventListener('click', () => { agents.forEach(a => a.effort = 'max'); renderAgents(); });
$('theme').addEventListener('click', () => { const dark = document.body.toggleAttribute('data-ds-dark-theme'); $('theme').setAttribute('aria-label', dark ? '切换浅色主题' : '切换深色主题'); });
document.addEventListener('pointerdown', e => { if (!panel.contains(e.target) && !$('trigger').contains(e.target)) openPanel(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { cancelDrag(); openPanel(false); $('trigger').focus(); } });
window.addEventListener('resize', placePanel); window.addEventListener('scroll', placePanel, true);

function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
function agentState(index, state, text) { const row = document.querySelector(`[data-agent="${index}"]`); row.dataset.state = state; row.querySelector('.agent-status').textContent = text; }
function finish(cancelled = false) {
  timers.forEach(clearTimeout); timers = []; running = false; render();
  $('run').innerHTML = '再次演示 <span>↑</span>';
  $('run-state').textContent = cancelled ? '已停止' : '演示完成';
  $('team-title').textContent = cancelled ? '演示已停止' : '演示结果已汇总';
  $('result').textContent = cancelled ? '演示已停止。' : '演示完成，主代理已汇总各分支结果。';
  document.querySelectorAll('.effort-select').forEach(el => el.disabled = false);
  if (cancelled) agents.forEach((_, i) => agentState(i, 'stopped', '已停止'));
}
$('run').addEventListener('click', () => {
  if (running) { finish(true); return; }
  openPanel(false); running = true; renderAgents(); render(false);
  $('run').textContent = '停止演示'; $('run-state').textContent = '模拟运行中';
  const ultra = current().proactiveDelegation;
  $('team-title').textContent = ultra ? '子代理正在并行探索' : '主代理正在检查';
  $('result').textContent = ultra ? '主代理继续梳理流程，等待各分支返回模拟结果…' : '主代理依次检查接口、界面与验证方案…';
  if (ultra) {
    agents.forEach((_, i) => { later(200 + i * 180, () => agentState(i, 'running', '检查中')); later(2600 + i * 850, () => agentState(i, 'done', '已返回')); });
    later(4700, () => { $('team-title').textContent = '主代理正在核对结果'; $('result').textContent = '三个分支已返回，正在合并发现与验证计划…'; });
    later(6000, () => finish());
  } else later(3400, () => finish());
});
renderAgents(); render(false);
