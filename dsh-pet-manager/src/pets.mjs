export const states = ['idle', 'running', 'waiting', 'completed', 'failed'];
export const defaults = { enabled: true, animated: true, size: 112, selected: 'alpaca', library: '[]', desktop: false };
export function makeSvg({ kind = 'alpaca', color = '#8b9eff', accessory = 'scarf' } = {}) {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('请选择有效颜色');
  if (!['alpaca', 'cat', 'robot', 'drop'].includes(kind)) throw new Error('未知宠物类型');
  if (!['scarf', 'glasses', 'none'].includes(accessory)) throw new Error('未知配饰');
  const shape = kind === 'robot'
    ? `<rect x="27" y="30" width="74" height="68" rx="23" fill="${color}"/><path d="M64 30V18"/><circle cx="64" cy="16" r="5" fill="#ffe299"/><rect x="37" y="44" width="54" height="36" rx="13" fill="#27334e"/>`
    : kind === 'drop' ? `<path d="M64 16C55 36 25 54 25 78a39 34 0 0 0 78 0C103 54 73 36 64 16Z" fill="${color}"/><ellipse cx="46" cy="52" rx="7" ry="12" fill="#fff" opacity=".5"/>`
    : `<path d="${kind === 'cat' ? 'M30 52 28 20 50 34Q64 28 78 34L100 20 98 54' : 'M40 42 37 16Q42 8 50 17L55 37M74 37 79 17Q87 8 92 16L88 44'}" fill="${color}"/><rect x="29" y="36" width="70" height="63" rx="29" fill="${color}"/><ellipse cx="64" cy="78" rx="23" ry="18" fill="#fff" opacity=".76"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" stroke="#27334e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="64" cy="117" rx="33" ry="5" fill="#27334e" opacity=".12" stroke="none"/><g id="body"><path d="M44 93v17q0 8 9 5l5-17m12 0 5 17q9 3 9-5V93" fill="${color}"/>${shape}<g id="eyes" fill="${kind === 'robot' ? '#adf6ea' : '#27334e'}" stroke="none"><ellipse cx="49" cy="62" rx="3.5" ry="5"/><ellipse cx="79" cy="62" rx="3.5" ry="5"/></g><path d="m59 77 5 4 5-4"/><g fill="#ffb7c3" stroke="none" opacity=".7"><ellipse cx="39" cy="74" rx="7" ry="4"/><ellipse cx="89" cy="74" rx="7" ry="4"/></g>${accessory === 'glasses' ? '<g fill="none"><rect x="37" y="54" width="23" height="18" rx="7"/><rect x="68" y="54" width="23" height="18" rx="7"/><path d="M60 60h8"/></g>' : accessory === 'scarf' ? '<path d="M35 91q29 13 58 0l-2 12q-28 10-54-1Z" fill="#ffe299"/><path d="m77 102 4 13 11-4-6-12" fill="#ffe299"/>' : ''}</g></svg>`;
}
export const builtins = [
  { id: 'alpaca', name: '云朵', description: '带着一条暖围巾，陪你慢慢把事情做好。', kind: 'alpaca', color: '#a6b6ff', accessory: 'scarf' },
  { id: 'robot', name: '小终端', description: '安静待命的代码伙伴。', kind: 'robot', color: '#84b5ff', accessory: 'none' },
  { id: 'cat', name: '奶油', description: '好奇一点，放松一点。', kind: 'cat', color: '#f2c993', accessory: 'glasses' },
  { id: 'drop', name: '滴答', description: '一滴清凉的灵感。', kind: 'drop', color: '#8ddbdc', accessory: 'none' },
].map(pet => ({ ...pet, svg: makeSvg(pet), builtin: true }));
export function config(value) {
  const c = { ...defaults, ...value };
  return { ...c, size: Math.min(180, Math.max(72, Number(c.size) || 112)) };
}
export function readLibrary(text) {
  const rows = JSON.parse(text || '[]');
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('宠物库最多支持 50 只宠物');
  const ids = new Set(builtins.map(p => p.id));
  return rows.map(p => {
    if (!p || typeof p.id !== 'string' || !/^custom-[\w-]{1,80}$/.test(p.id) || ids.has(p.id)) throw new Error('宠物 ID 无效或重复');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 48 || typeof p.svg !== 'string' || p.svg.length > 100000) throw new Error('宠物名称或 SVG 无效');
    return { id: p.id, name: p.name.trim(), description: String(p.description || '').slice(0, 300), svg: p.svg, builtin: false, archived: p.archived === true };
  });
}
export function svgUrl(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
// 只允许静态矢量图元；animation lives in our renderer, never in imported SVG.
export function sanitizeSvg(source, Parser = globalThis.DOMParser) {
  if (typeof source !== 'string' || source.length > 100000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG 过大或包含不支持的文档声明');
  const doc = new Parser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('请输入有效 SVG');
  const tags = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title', 'desc']);
  const attrs = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'x1', 'y1', 'x2', 'y2', 'fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity', 'opacity', 'transform', 'id']);
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (!tags.has(node.localName) || node.namespaceURI !== root.namespaceURI) throw new Error(`不支持 SVG 元素：${node.localName}`);
    for (const a of [...node.attributes]) {
      if (!attrs.has(a.name) || /url\s*\(|javascript:|data:|https?:|[<>]/i.test(a.value) && a.name !== 'xmlns') throw new Error(`不支持 SVG 属性：${a.name}`);
      if (a.name === 'xmlns' && a.value !== 'http://www.w3.org/2000/svg') throw new Error('SVG 命名空间无效');
    }
  }
  if (!/^\s*-?[\d.]+[ ,]+-?[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+\s*$/.test(root.getAttribute('viewBox') || '')) throw new Error('SVG 需要有效 viewBox');
  root.setAttribute('width', '128'); root.setAttribute('height', '128');
  return root.outerHTML;
}
