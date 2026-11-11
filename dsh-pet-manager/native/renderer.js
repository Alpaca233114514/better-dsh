const pet = document.getElementById('pet'), status = document.getElementById('status'), notices = document.getElementById('notices');
for (const id of ['chat', 'voice', 'notifications']) document.getElementById(id).addEventListener('click', () => {
  if (id === 'notifications') notices.hidden = !notices.hidden;
  window.mini.action(id);
});
window.mini.onState(state => {
  document.body.dataset.dark = state.dark;
  pet.hidden = !state.svg;
  pet.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.svg)}`;
  pet.alt = state.name; pet.width = state.size; pet.height = state.size;
  pet.className = `pm-pet pm-${state.status}`; pet.dataset.animated = state.animated;
  status.textContent = state.text;
  const list = document.getElementById('notice-list'); list.replaceChildren();
  for (const text of state.notices.length ? state.notices : ['暂时没有新通知']) { const p = document.createElement('p'); p.textContent = text; list.append(p); }
});
