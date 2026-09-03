import { sendRenderIntent } from './queries.mjs';

/**
 * Resolve an audience keyword to the users a player-facing render action should reach.
 * @param {string} audience One of "triggeringUser" (default), "everyone", "players", "gm".
 * @param {import('./run-context.mjs').RunContext} context The active run context.
 * @returns {User[]} The users to target.
 */
export function resolveAudience(audience, context) {
  switch (audience) {
    case 'everyone':
      return game.users.filter((u) => u.active);
    case 'players':
      return game.users.filter((u) => u.active && !u.isGM);
    case 'gm':
      return [game.users.activeGM].filter(Boolean);
    case 'triggeringUser':
    default:
      return [context.info.event.user ?? game.user];
  }
}

/**
 * Send a render intent to every user in an audience.
 * @param {string} audience One of "triggeringUser" (default), "everyone", "players", "gm".
 * @param {import('./run-context.mjs').RunContext} context The active run context.
 * @param {string} name The intent name, as registered via `registerRenderIntent`.
 * @param {object} [data] The intent payload.
 * @returns {Promise<void>}
 */
export async function sendToAudience(audience, context, name, data = {}) {
  await Promise.all(resolveAudience(audience, context).map((user) => sendRenderIntent(user, name, data)));
}
