/** Translate MATT's entity/location sentinel values into a glyph `{kind, value, scope}` reference. */

/** @type {Record<string, string>} MATT built-in sentinels that match one of glyph's own registered resolvers by name. */
const RESOLVER_SENTINELS = { within: 'within', players: 'players', users: 'users', scene: 'scene' };

/**
 * Pull the sentinel id out of a MATT entity/location value.
 * @param {*} entry The raw MATT `entity`/`location` value.
 * @returns {string|undefined} The sentinel id.
 */
function idOf(entry) {
  return typeof entry === 'string' ? entry : entry?.id;
}

/**
 * Convert a MATT entity/location value into a glyph reference.
 * @param {*} entry The raw MATT `entity`/`location` value.
 * @returns {{kind: string, value: string}|null} A glyph reference, or null if unconvertible.
 */
export function referenceFromSentinel(entry) {
  const id = idOf(entry);
  if (!id) return null;
  if (id === 'token') return { kind: 'context', value: 'event.data.token' };
  if (id === 'previous' || id === 'current') return { kind: 'context', value: 'previous' };
  if (id.startsWith('tagger')) return { kind: 'tag', value: id.slice(7) };
  if (RESOLVER_SENTINELS[id]) return { kind: 'context', value: `collections.${RESOLVER_SENTINELS[id]}.0` };
  if (/^[A-Za-z]+\.[a-zA-Z0-9]{16,}(\.[A-Za-z]+\.[a-zA-Z0-9]{16,})*$/.test(id)) return { kind: 'uuid', value: id };
  return null;
}

/**
 * Convert a MATT location value into a glyph point.
 * @param {*} location The raw MATT `location` value.
 * @returns {{x: number, y: number}|null} A point object, or null.
 */
export function pointFromLocation(location) {
  if (location && !location.id && typeof location.x === 'number' && typeof location.y === 'number') return { x: location.x, y: location.y };
  return null;
}
