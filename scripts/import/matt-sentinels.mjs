/** @type {Record<string, string>} MATT built-in sentinels that match one of glyph's own registered resolvers by name. */
const RESOLVER_SENTINELS = {
  within: 'within',
  players: 'players',
  'players:active': 'players:active',
  users: 'users',
  'users:active': 'users:active',
  controlled: 'controlled',
  scene: 'activeScene'
};

/** @type {Record<string, string>} A MATT ctrl `defaultType` -> the document name a bare id belongs to. */
const DEFAULT_TYPE_DOCUMENTS = {
  actors: 'Actor',
  items: 'Item',
  journal: 'JournalEntry',
  macro: 'Macro',
  macros: 'Macro',
  playlists: 'Playlist',
  rolltables: 'RollTable',
  scene: 'Scene',
  scenes: 'Scene',
  tables: 'RollTable'
};

/** @type {RegExp} A document UUID, world or compendium, with any number of embedded segments. */
const UUID = /^(?:Compendium\.[\w-]+\.[\w-]+\.[A-Za-z]+|[A-Za-z]+)\.[a-zA-Z0-9]{16,}(?:\.[A-Za-z]+\.[a-zA-Z0-9]{16,})*$/;

/** @type {RegExp} A bare document id, resolved against a ctrl's own `defaultType`. */
const BARE_ID = /^[a-zA-Z0-9]{16}$/;

/**
 * Pull the sentinel id out of a MATT entity/location value, minus the `#` suffix MATT strips.
 * @param {*} entry The raw MATT `entity`/`location` value.
 * @returns {string|undefined} The sentinel id.
 */
export function idOf(entry) {
  const id = typeof entry === 'string' ? entry : (entry?.id ?? entry?.uuid);
  return typeof id === 'string' && !id.startsWith('tagger') ? id.split('#')[0] : id;
}

/**
 * Convert a MATT entity/location value into a glyph reference.
 * @param {*} entry The raw MATT `entity`/`location` value.
 * @param {string} [defaultType] The ctrl's `defaultType`, which MATT falls back to for a bare id.
 * @returns {{kind: string, value: string}|null} A glyph reference, or null if unconvertible.
 */
export function referenceFromSentinel(entry, defaultType) {
  const id = idOf(entry);
  if (!id) return null;
  if (id === 'token') return { kind: 'triggerToken', value: '' };
  if (id === 'tile') return { kind: 'linkedTile', value: '' };
  if (id === 'previous' || id === 'current') return { kind: 'context', value: 'previous' };
  if (id === 'origin') return { kind: 'context', value: 'movement.destination' };
  if (id.startsWith('tagger')) return { kind: 'tag', value: id.slice(7) };
  if (id === 'controlled' && defaultType === 'playlists') return { kind: 'collection', value: 'playing' };
  if (RESOLVER_SENTINELS[id]) return { kind: 'collection', value: RESOLVER_SENTINELS[id] };
  if (UUID.test(id)) return { kind: 'uuid', value: id };
  const document = DEFAULT_TYPE_DOCUMENTS[defaultType];
  if (document && BARE_ID.test(id)) return { kind: 'uuid', value: `${document}.${id}` };
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
