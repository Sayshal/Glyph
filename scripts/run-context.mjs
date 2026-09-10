import { MODULE } from './constants.mjs';

/**
 * A single trigger run's state, split ways so a control signal can never be read as data.
 * @typedef {object} RunContext
 * @property {object} info Immutable facts about this run.
 * @property {Map<string, unknown[]>} collections Typed collections, keyed by document type.
 * @property {object} control Mutable control-flow signals.
 * @property {object} variables Lookup built from the persisted `{name, value}[]` array.
 * @property {*} previous Whatever the most recent producing action set it to, readable as `{{previous}}`.
 * @property {object} results Every producing action's result so far, merged, readable as `{{results.<name>}}`.
 */

/** @type {Map<string, RunContext>} The live run context per behavior UUID, so one trigger can stop another's chain. */
export const activeRuns = new Map();

/**
 * Build a fresh run context from a normalized run source.
 * @param {object} source The normalized run source.
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
    control: { stopped: false, skip: false, goto: null, pause: false },
    variables: Object.fromEntries((behavior?.getFlag(MODULE.ID, 'variables') ?? []).map((entry) => [entry.name, entry.value])),
    previous: null,
    results: {}
  };
}

/**
 * Record a producing action's result: the single `{{previous}}` slot, plus a merge into the cumulative `{{results}}` bag.
 * @param {RunContext} context The active run context.
 * @param {*} value The action's result.
 * @param {string} [bucket] The `results` key to file `value` under, for a result that isn't a plain object of named values.
 */
export function setResult(context, value, bucket) {
  context.previous = value;
  if (bucket) context.results[bucket] = value;
  else if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(context.results, value);
}

/**
 * Resolve a `{{path}}` expression path against a run context, with `info`'s contents exposed at the top level (e.g. `event.name`, not `info.event.name`) and the triggering event's own payload exposed at the top level too (e.g. `token.name`, not `event.data.token.name`). `[0]` index segments read as plain steps.
 * @param {RunContext} context The active run context.
 * @param {string} path A dotted path.
 * @returns {*} The resolved value.
 */
export function resolvePath(context, path) {
  const normalized = path.replace(/\.?\[(\d+)\]/g, '.$1').replace(/^\./, '');
  return foundry.utils.getProperty({ ...context.info, ...context.info.event?.data, ...context }, normalized);
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

/**
 * Resolve a numeric text field: `{{path}}` placeholders first, then a dice formula.
 * @param {string} text The template or formula.
 * @param {RunContext} context The active run context.
 * @returns {Promise<number|null>} The number, or null when the field is empty.
 */
export async function resolveNumber(text, context) {
  const resolved = String(interpolate(text, context) ?? '').trim();
  if (!resolved) return null;
  if (Number.isFinite(Number(resolved))) return Number(resolved);
  const roll = await new Roll(resolved).evaluate();
  return roll.total;
}
