import { isModuleActive } from './capability.mjs';
import { resolvePath } from './run-context.mjs';

const resolvers = new Map();

/**
 * Register a source descriptor.
 * @param {string} id The sentinel id.
 * @param {{label: string, producedType: string, resolve: (context: import('./run-context.mjs').RunContext) => object[]}} descriptor
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
 * @param {import('./run-context.mjs').RunContext} context The active run context.
 * @returns {object[]} The resolved collection.
 */
export function resolveCollection(id, context) {
  if (context.collections.has(id)) return context.collections.get(id);
  const result = resolvers.get(id)?.resolve(context) ?? [];
  context.collections.set(id, result);
  return result;
}

/**
 * Resolve a glyph reference (`{kind, value, scope}`, see scripts/data/reference-field.mjs).
 * @param {{kind: string, value: string, scope?: string}} ref The reference to resolve.
 * @param {import('./run-context.mjs').RunContext} context The active run context.
 * @returns {*} The resolved value, or null if it can't be resolved.
 */
export function resolveReference(ref, context) {
  if (!ref) return null;
  if (ref.kind === 'uuid') {
    const relative = ref.scope ? fromUuidSync(ref.scope) : undefined;
    return fromUuidSync(ref.value, relative ? { relative } : undefined);
  }
  if (ref.kind === 'tag') return isModuleActive('tagger') ? (Tagger.getByTag(ref.value)[0] ?? null) : null;
  if (ref.kind === 'context') return resolvePath(context, ref.value);
  if (ref.kind === 'triggerToken') return context.info.event.data?.token ?? null;
  if (ref.kind === 'triggerActor') return context.info.event.data?.token?.actor ?? null;
  return null;
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
 * Resolve a reference that must produce an Actor, unwrapping a resolved Token - see {@link toActor}.
 * @param {{kind: string, value: string, scope?: string}} ref The reference to resolve.
 * @param {import('./run-context.mjs').RunContext} context The active run context.
 * @returns {Actor|null} The resolved actor, or null.
 */
export function resolveActorReference(ref, context) {
  return toActor(resolveReference(ref, context));
}

registerResolver('region', { label: 'This Region', producedType: 'Region', resolve: (context) => [context.info.region] });
registerResolver('scene', { label: 'This Scene', producedType: 'Scene', resolve: (context) => [context.info.scene] });
registerResolver('within', { label: 'Tokens Within This Region', producedType: 'Token', resolve: (context) => [...context.info.region.tokens] });
registerResolver('players', {
  label: 'Player-Owned Tokens',
  producedType: 'Token',
  resolve: (context) => context.info.scene.tokens.filter((t) => game.users.some((u) => !u.isGM && t.actor?.testUserPermission(u, 'OWNER')))
});
registerResolver('users', { label: 'Users', producedType: 'User', resolve: () => [...game.users] });
registerResolver('users:active', { label: 'Active Users', producedType: 'User', resolve: () => game.users.filter((u) => u.active) });
registerResolver('notes', { label: 'Notes On This Scene', producedType: 'Note', resolve: (context) => [...context.info.scene.notes] });
registerResolver('regions', { label: 'Regions On This Scene', producedType: 'Region', resolve: (context) => [...context.info.scene.regions] });
registerResolver('sounds', { label: 'Ambient Sounds On This Scene', producedType: 'AmbientSound', resolve: (context) => [...context.info.scene.sounds] });
