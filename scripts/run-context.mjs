import { MODULE } from './constants.mjs';

/**
 * A single trigger run's state, split ways so a control signal can never be read as data.
 * @typedef {object} RunContext
 * @property {object} info Immutable facts about this run.
 * @property {Map<string, unknown[]>} collections Typed collections, keyed by document type.
 * @property {object} control Mutable control-flow signals.
 * @property {object} variables Lookup built from the persisted `{name, value}[]` array.
 * @property {*} previous Whatever the most recent producing action set it to, readable as `{{previous}}`.
 */

/**
 * Build a fresh run context from a normalized run source.
 * @param {import('./data/trigger-behavior.mjs').RunSource} source The normalized run source.
 * @param {RegionBehavior} behavior The triggering behavior document.
 * @returns {RunContext} The new run context.
 */
export function createRunContext(source, behavior) {
  return {
    info: Object.freeze({
      id: foundry.utils.randomID(),
      region: source.region,
      scene: source.scene,
      event: source.event,
      behavior,
      isAuthority: ATLAS.isPrimaryGM,
      triggerCount: behavior?.getFlag(MODULE.ID, 'triggerCount') ?? 0
    }),
    collections: new Map(),
    control: { stopped: false, goto: null, pause: false },
    variables: Object.fromEntries((behavior?.getFlag(MODULE.ID, 'variables') ?? []).map((entry) => [entry.name, entry.value])),
    previous: null
  };
}

/**
 * Resolve a `{{path}}` expression path against a run context, with `info`'s contents exposed at the top level (e.g. `event.name`, not `info.event.name`) and the triggering event's own payload exposed at the top level too (e.g. `token.name`, not `event.data.token.name`).
 * @param {RunContext} context The active run context.
 * @param {string} path A dotted path.
 * @returns {*} The resolved value.
 */
export function resolvePath(context, path) {
  return foundry.utils.getProperty({ ...context.info, ...context.info.event?.data, ...context }, path);
}

/**
 * Interpolate every `{{path}}` placeholder in a string with its resolved run-context value.
 * @param {string} text The template string.
 * @param {RunContext} context The active run context.
 * @returns {string} The interpolated string.
 */
export function interpolate(text, context) {
  if (typeof text !== 'string' || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, path) => {
    const value = resolvePath(context, path);
    return value === undefined || value === null ? '' : String(value);
  });
}
