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
