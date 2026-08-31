import { query, registerQuery } from './queries.mjs';

const handlers = new Map();

/**
 * Register a render-intent handler, run on the receiving client.
 * @param {string} name The intent name.
 * @param {(data: object) => Promise<*>|*} handler What to do when this intent is received.
 */
export function registerRenderIntent(name, handler) {
  handlers.set(name, handler);
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
  if (user.isSelf) return handlers.get(name)?.(data);
  return query(user, `render.${name}`, data);
}
