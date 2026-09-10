/**
 * Translate MATT's Handlebars text fields into glyph run-context paths.
 */

/** @type {Record<string, string>} MATT Handlebars context roots with an equivalent glyph run-context path. */
const ROOT_MAP = {
  variable: 'variables',
  token: 'token',
  actor: 'token.actor',
  user: 'event.user',
  scene: 'scene',
  entity: 'item',
  method: 'event.name'
};

/** @type {Set<string>} Roots `resolvePath` exposes (run-context.mjs:60-62). */
const GLYPH_ROOTS = new Set(['token', 'scene', 'event', 'region', 'behavior', 'variables', 'previous', 'results', 'item', 'triggerCount', 'isAuthority', 'id']);

/**
 * Translate one MATT Handlebars path into a glyph run-context path.
 * @param {string} path The raw path inside a `{{...}}` placeholder.
 * @returns {string|null} The glyph path, or null if the root has no equivalent.
 */
function translatePath(path) {
  const trimmed = path.trim();
  if (/[\s#/]/.test(trimmed)) return null;
  const [root, ...rest] = trimmed.split('.');
  if (root === 'value') return rest.length ? ['results', ...rest].join('.') : 'previous';
  const mapped = ROOT_MAP[root];
  return mapped ? [mapped, ...rest].join('.') : null;
}

/**
 * Whether a converted node still holds a `{{...}}` placeholder naming a root glyph can't resolve.
 * @param {*} node The converted glyph node.
 * @returns {boolean}
 */
export function hasUnresolvedTemplate(node) {
  for (const [, body] of JSON.stringify(node ?? null).matchAll(/\{\{(.*?)\}\}/gs)) {
    const path = body.trim();
    if (!path || /[\s#/]/.test(path) || !GLYPH_ROOTS.has(path.split('.')[0])) return true;
  }
  return false;
}

/**
 * Rewrite every MATT `{{...}}` placeholder in a string as its glyph equivalent.
 * @param {*} text The MATT field value.
 * @returns {string|null} The rewritten text, unchanged text if it holds no placeholder, or null if any placeholder has no glyph equivalent.
 */
export function translateMattTemplate(text) {
  if (typeof text !== 'string' || !text.includes('{{')) return typeof text === 'string' ? text : null;
  const translated = [...text.matchAll(/\{\{(.*?)\}\}/gs)].map(([, path]) => translatePath(path));
  if (translated.some((path) => path === null)) return null;
  let i = 0;
  return text.replace(/\{\{.*?\}\}/gs, () => `{{${translated[i++]}}}`);
}
