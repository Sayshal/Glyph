import { MODULE } from './constants.mjs';

/**
 * Register a glyph query handler.
 * @param {string} name Query name, namespaced as `${MODULE.ID}.${name}`.
 * @param {(data: object, meta: object) => Promise<*>} handler The query handler.
 */
export function registerQuery(name, handler) {
  CONFIG.queries[`${MODULE.ID}.${name}`] = handler;
}

/**
 * Query a single user and await their response.
 * @param {User} user The user to query.
 * @param {string} name Query name, namespaced as `${MODULE.ID}.${name}`.
 * @param {object} [data] Query payload.
 * @param {object} [options] Passed through to `User#query`.
 * @returns {Promise<*>} The query result.
 */
export function query(user, name, data = {}, options = {}) {
  return user.query(`${MODULE.ID}.${name}`, data, options);
}

/** @type {Map<string, (data: object) => Promise<*>|*>} Registered render-intent handlers, by name. */
const renderIntentHandlers = new Map();

/**
 * Register a render-intent handler, run on the receiving client.
 * @param {string} name The intent name.
 * @param {(data: object) => Promise<*>|*} handler What to do when this intent is received.
 */
export function registerRenderIntent(name, handler) {
  renderIntentHandlers.set(name, handler);
  registerQuery(`render.${name}`, handler);
}

/**
 * Send a render intent to one user's client and await it running there.
 * @param {User} user The user whose client should render this.
 * @param {string} name The intent name.
 * @param {object} [data] The intent payload.
 * @returns {Promise<*>} The handler's result.
 */
export function sendRenderIntent(user, name, data = {}) {
  if (user.isSelf) return renderIntentHandlers.get(name)?.(data);
  return query(user, `render.${name}`, data);
}
