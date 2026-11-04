const $ = id => document.getElementById(id);
// 演示档位，不代表服务商能力声明。 Demo fixtures, not provider capability claims.
const models = {
  astra: { name: 'GPT-6 Astra', levels: ['关', '低', '中', '高', '超高', '极高'], defaultIndex: 2 },
  sparse: { name: '自定义推理模型', levels: ['低', '中', '高'], defaultIndex: 1 },
  plain: { name: '普通对话模型', levels: [], defaultIndex: 0 },
};
const STEP_KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1 };
const slider = $('slider'), panel = $('panel'), trigger = $('trigger');
let modelId = 'astra';
let index = models[modelId].defaultIndex;
let drag = null;
let settleId = 0;
let settleTimer;
let feedbackTimer;

const levels = () => models[modelId].levels;
const max = () => Math.max(0, levels().length - 1);
const shown = () => drag === null ? index : drag;
const clamp = value => Math.min(max(), Math.max(0, value));

function setLevelText(text) {
  const current = $('level');
  if (current.textContent === text) return;
  const next = current.cloneNode(false);
  next.textContent = text;
  current.replaceWith(next);
}

function render() {
  const model = models[modelId];
  const list = model.levels;
  const supported = list.length > 0;
  const at = supported ? clamp(Math.round(shown())) : 0;
  const label = supported ? list[at] : '无推理档位';
  $('model-name').textContent = model.name;
  $('trigger-model').textContent = model.name;
  $('trigger-effort').textContent = supported ? label : '';
  setLevelText(label);
  $('reset').disabled = !supported;
  slider.hidden = !supported;
  slider.setAttribute('aria-valuemax', String(max()));
  slider.setAttribute('aria-valuenow', String(at));
  slider.setAttribute('aria-valuetext', label);
  slider.setAttribute('aria-disabled', supported ? 'false' : 'true');
  slider.tabIndex = supported ? 0 : -1;
  slider.style.setProperty('--v', max() ? Math.min(1, Math.max(0, shown() / max())) : 0);
  const ticks = $('ticks');
  if (ticks.childElementCount !== list.length) {
    ticks.replaceChildren(...list.map(() => document.createElement('i')));
  }
  Array.from(ticks.children).forEach((tick, i) => { tick.className = i <= at ? 'on' : ''; });
  document.querySelectorAll('[data-model]').forEach(button => {
    const current = button.dataset.model === modelId;
    button.setAttribute('aria-current', String(current));
    button.setAttribute('aria-pressed', String(current));
  });
}

function settle() {
  const id = ++settleId;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (id !== settleId || 'dragging' in slider.dataset) return;
    drag = null;
    render();
  }, 430);
}

function positionOf(event) {
  if (max() === 0) return 0;
  const rect = slider.getBoundingClientRect();
  const thumb = parseFloat(getComputedStyle(slider).getPropertyValue('--rs-thumb')) || 34;
  const usable = Math.max(1, rect.width - thumb);
  return Math.min(max(), Math.max(0, (event.clientX - rect.left - thumb / 2) / usable * max()));
}

function placePanel() {
  if (panel.hidden) return;
  const rect = trigger.getBoundingClientRect();
  const width = panel.offsetWidth;
  const centered = rect.left + rect.width / 2 - width / 2;
  panel.style.left = `${Math.max(8, Math.min(centered, innerWidth - width - 8))}px`;
  panel.style.top = `${Math.max(8, rect.top - panel.offsetHeight - 10)}px`;
  panel.classList.add('rs-placed');
}

function setOpen(next) {
  if (next) {
    panel.hidden = false;
    placePanel();
    trigger.setAttribute('aria-expanded', 'true');
    panel.classList.remove('rs-in');
    void panel.offsetWidth;
    panel.classList.add('rs-in');
  } else {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    $('models').hidden = true;
    $('model-toggle').setAttribute('aria-expanded', 'false');
  }
}

trigger.addEventListener('click', () => setOpen(panel.hidden));

slider.addEventListener('pointerdown', event => {
  if (event.button !== 0 || max() === 0) return;
  event.preventDefault();
  settleId++;
  slider.setPointerCapture(event.pointerId);
  slider.dataset.dragging = '';
  drag = positionOf(event);
  render();
});
slider.addEventListener('pointermove', event => {
  if (!('dragging' in slider.dataset)) return;
  drag = positionOf(event);
  render();
});
slider.addEventListener('pointerup', event => {
  if (!('dragging' in slider.dataset)) return;
  delete slider.dataset.dragging;
  const next = Math.round(positionOf(event));
  drag = next;
  index = next;
  render();
  settle();
});
slider.addEventListener('pointercancel', () => {
  if (!('dragging' in slider.dataset)) return;
  delete slider.dataset.dragging;
  drag = null;
  render();
});
slider.addEventListener('lostpointercapture', () => {
  if (!('dragging' in slider.dataset)) return;
  delete slider.dataset.dragging;
  drag = null;
  render();
});
slider.addEventListener('keydown', event => {
  if (max() === 0) return;
  const step = STEP_KEYS[event.key];
  let next = null;
  if (step !== undefined) next = clamp(Math.round(shown()) + step);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = max();
  if (next === null) return;
  event.preventDefault();
  drag = next;
  index = next;
  render();
  settle();
});

$('reset').addEventListener('click', () => {
  const model = models[modelId];
  if (!model.levels.length) return;
  drag = null;
  index = model.defaultIndex;
  render();
  $('feedback').textContent = `已重置为默认 · ${model.levels[index]}`;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => $('feedback').textContent = '', 2500);
});

$('model-toggle').addEventListener('click', () => {
  $('models').hidden = !$('models').hidden;
  $('model-toggle').setAttribute('aria-expanded', String(!$('models').hidden));
});

document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => {
  modelId = button.dataset.model;
  index = models[modelId].defaultIndex;
  drag = null;
  $('models').hidden = true;
  $('model-toggle').setAttribute('aria-expanded', 'false');
  $('feedback').textContent = '';
  render();
  $('model-toggle').focus();
}));

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.anchor')) setOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || panel.hidden) return;
  if (!$('models').hidden) {
    $('models').hidden = true;
    $('model-toggle').setAttribute('aria-expanded', 'false');
    $('model-toggle').focus();
  } else {
    setOpen(false);
    trigger.focus();
  }
});

$('theme').addEventListener('click', () => {
  const dark = document.body.toggleAttribute('data-ds-dark-theme');
  $('theme').setAttribute('aria-label', dark ? '切换为浅色主题' : '切换为深色主题');
});

new ResizeObserver(placePanel).observe(panel);
window.addEventListener('resize', placePanel);
window.addEventListener('scroll', placePanel, true);
render();
placePanel();
