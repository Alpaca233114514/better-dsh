/* 有 Ultra 时仅强调 Ultra，否则强调 Max。 Prefer Ultra for effects, otherwise Max. */
(function (root) {
  const idOf = level => String(typeof level === 'string' ? level : level?.id ?? '').toLowerCase();
  function effectTarget(levels) {
    return levels.some(level => idOf(level) === 'ultra') ? 'ultra' : 'max';
  }
  function isEmphasized(level, levels) {
    return idOf(level) === effectTarget(levels);
  }
  const api = { effectTarget, isEmphasized };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReasoningEffectPolicy = api;
})(globalThis);
