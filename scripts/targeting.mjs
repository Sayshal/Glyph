import { isModuleActive } from './capability.mjs';
import { resolvePath } from './run-context.mjs';

const resolvers = new Map();

/** @type {object} Tagger lookup options, so a comma-joined tag value reads as "any of these". */
const TAG_OPTIONS = { matchAny: true };

/**
 * Register a source descriptor.
 * @param {string} id The sentinel id.
 * @param {{label: string, producedType: string, resolve: (context: object) => object[]}} descriptor
 */
export function registerResolver(id, descriptor) {
  resolvers.set(id, descriptor);
}

/**
 * List every registered resolver id and label, for UI pickers.
 * @returns {{id: string, label: string}[]}
 */
export function listResolvers() {
  return [...resolvers.entries()].map(([id, { label }]) => ({ id, label }));
}

/**
 * Resolve a named collection, caching the result on the run context for the rest of the run.
 * @param {string} id The sentinel id.
 * @param {object} context The active run context.
 * @returns {object[]} The resolved collection.
 */
export function resolveCollection(id, context) {
  if (id.startsWith('var:')) {
    const value = context.variables[id.slice(4)];
    return Array.isArray(value) ? value : [];
  }
  if (context.collections.has(id)) return context.collections.get(id);
  const result = id.startsWith('tag:') ? resolveTaggedCollection(id.slice(4)) : (resolvers.get(id)?.resolve(context) ?? []);
  context.collections.set(id, result);
  return result;
}

/**
 * Every placeable carrying a given Tagger tag.
 * @param {string} tag The tag to look up.
 * @returns {object[]} Matching placeables' documents.
 */
function resolveTaggedCollection(tag) {
  return isModuleActive('tagger') ? Tagger.getByTag(tag, TAG_OPTIONS) : [];
}

/**
 * Resolve a glyph reference (`{kind, value, scope}`).
 * @param {{kind: string, value: string, scope?: string}} ref The reference to resolve.
 * @param {object} context The active run context.
 * @returns {*} The resolved value, or null if it can't be resolved.
 */
export function resolveReference(ref, context) {
  if (!ref) return null;
  if (ref.kind === 'uuid') {
    const relative = ref.scope ? fromUuidSync(ref.scope) : undefined;
    return fromUuidSync(ref.value, relative ? { relative } : undefined);
  }
  if (ref.kind === 'tag') return isModuleActive('tagger') ? (Tagger.getByTag(ref.value, TAG_OPTIONS)[0] ?? null) : null;
  if (ref.kind === 'collection') return resolveCollection(ref.value, context)[0] ?? null;
  if (ref.kind === 'context') return resolvePath(context, ref.value);
  if (ref.kind === 'triggerToken') return context.info.event.data?.token ?? null;
  if (ref.kind === 'triggerActor') return context.info.event.data?.token?.actor ?? null;
  if (ref.kind === 'linkedTile') return resolveReference(context.info.behavior?.system?.linkedTile, context);
  return null;
}

/**
 * The point a resolved value stands for: a literal point, or a placeable's centre.
 * @param {*} resolved A resolved document, placeable, or point.
 * @returns {{x: number, y: number}|null} The point, or null.
 */
function pointOf(resolved) {
  if (!resolved) return null;
  const center = (resolved.object ?? resolved).center;
  if (center && typeof center.x === 'number') return { x: center.x, y: center.y };
  return typeof resolved.x === 'number' && typeof resolved.y === 'number' ? { x: resolved.x, y: resolved.y } : null;
}

/**
 * Resolve a point field: a literal point, or a reference to derive one from.
 * @param {*} value The stored point field value.
 * @param {object} context The active run context.
 * @returns {{x: number, y: number, elevation?: number}|null} The point, or null.
 */
export function resolvePoint(value, context) {
  if (!value) return null;
  if (!value.kind) return typeof value.x === 'number' && typeof value.y === 'number' ? value : null;
  return pointOf(resolveReference(value, context));
}

/**
 * Unwrap an already-resolved value to its Actor - a Token document (or placeable) is a reasonable stand-in.
 * @param {*} resolved A resolved document or placeable.
 * @returns {Actor|null} The actor, or null.
 */
export function toActor(resolved) {
  if (resolved instanceof Actor) return resolved;
  return resolved?.actor ?? null;
}

/**
 * Resolve a reference that must produce an Actor, unwrapping a resolved Token.
 * @param {{kind: string, value: string, scope?: string}} ref The reference to resolve.
 * @param {object} context The active run context.
 * @returns {Actor|null} The resolved actor, or null.
 */
export function resolveActorReference(ref, context) {
  return toActor(resolveReference(ref, context));
}

registerResolver('region', { label: 'This Region', producedType: 'Region', resolve: (context) => [context.info.region] });
registerResolver('scene', { label: 'This Scene', producedType: 'Scene', resolve: (context) => [context.info.scene] });
registerResolver('activeScene', { label: 'The Active Scene', producedType: 'Scene', resolve: () => (game.scenes.active ? [game.scenes.active] : []) });
registerResolver('within', { label: 'Tokens Within This Region', producedType: 'Token', resolve: (context) => [...context.info.region.tokens] });
registerResolver('players', {
  label: 'Player-Owned Tokens',
  producedType: 'Token',
  resolve: (context) => context.info.scene.tokens.filter((t) => game.users.some((u) => !u.isGM && t.actor?.testUserPermission(u, 'OWNER')))
});
registerResolver('users', { label: 'Users', producedType: 'User', resolve: () => [...game.users] });
registerResolver('users:active', { label: 'Active Users', producedType: 'User', resolve: () => game.users.filter((u) => u.active) });
registerResolver('players:active', {
  label: 'Tokens Owned By An Active Player',
  producedType: 'Token',
  resolve: (context) => context.info.scene.tokens.filter((t) => game.users.some((u) => !u.isGM && u.active && t.actor?.testUserPermission(u, 'OWNER')))
});
registerResolver('controlled', { label: 'Controlled Tokens', producedType: 'Token', resolve: () => canvas.tokens?.controlled.map((t) => t.document) ?? [] });
registerResolver('notes', { label: 'Notes On This Scene', producedType: 'Note', resolve: (context) => [...context.info.scene.notes] });
registerResolver('regions', { label: 'Regions On This Scene', producedType: 'Region', resolve: (context) => [...context.info.scene.regions] });
registerResolver('sounds', { label: 'Ambient Sounds On This Scene', producedType: 'AmbientSound', resolve: (context) => [...context.info.scene.sounds] });
registerResolver('drawings', { label: 'Drawings On This Scene', producedType: 'Drawing', resolve: (context) => [...context.info.scene.drawings] });
registerResolver('tiles', { label: 'Tiles On This Scene', producedType: 'Tile', resolve: (context) => [...context.info.scene.tiles] });
registerResolver('walls', { label: 'Walls On This Scene', producedType: 'Wall', resolve: (context) => [...context.info.scene.walls] });
registerResolver('actors', { label: 'Actors', producedType: 'Actor', resolve: () => [...game.actors] });
registerResolver('items', { label: 'Items', producedType: 'Item', resolve: () => [...game.items] });
registerResolver('journal', { label: 'Journal Entries', producedType: 'JournalEntry', resolve: () => [...game.journal] });
registerResolver('macros', { label: 'Macros', producedType: 'Macro', resolve: () => [...game.macros] });
registerResolver('previous', {
  label: 'Result Of The Previous Action',
  producedType: 'Document',
  resolve: (context) => (Array.isArray(context.previous) ? context.previous : context.previous == null ? [] : [context.previous])
});
registerResolver('playing', {
  label: 'Currently Playing Sounds',
  producedType: 'PlaylistSound',
  resolve: () => game.playlists.contents.flatMap((p) => p.sounds.filter((s) => s.playing || s.pausedTime != null))
});
