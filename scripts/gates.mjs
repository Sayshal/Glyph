import { MODULE } from './constants.mjs';

/**
 * Whether a trigger event should proceed, applying every per-behavior config gate.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {RunSource['event']} event A normalized run source's event.
 * @returns {Promise<boolean>} Whether the trigger should proceed.
 */
export async function checkGates(behavior, event) {
  const system = behavior.system;
  if (!userRestrictionAllows(system.userRestriction, event.user)) return false;
  if (!tokenRestrictionAllows(system.tokenRestriction, event.data?.token)) return false;
  if (system.vision && !hasVision(event)) return false;
  if (!ATLAS.isPrimaryGM) return false;
  if (game.paused && !system.allowPaused) return false;
  if (!(await recordAttempt(behavior, system.minRequired))) return false;
  if (system.cooldown > 0 && !cooldownElapsed(behavior, system.cooldown)) return false;
  if (system.pertoken && alreadyTriggeredToken(behavior, event)) return false;
  if (system.chance < 100 && Math.random() * 100 >= system.chance) return false;
  await recordSuccess(behavior, event);
  return true;
}

/**
 * Whether `restriction` permits the triggering user.
 * @param {string} restriction One of "all", "player", "gm".
 * @param {User} user The triggering user.
 * @returns {boolean}
 */
function userRestrictionAllows(restriction, user) {
  if (restriction === 'gm') return user.isGM;
  if (restriction === 'player') return !user.isGM;
  return true;
}

/**
 * Whether `restriction` permits the event's token, by its actor's player ownership.
 * @param {string} restriction One of "all", "player", "gm".
 * @param {TokenDocument|undefined} token The token that fired the event, if any.
 * @returns {boolean}
 */
function tokenRestrictionAllows(restriction, token) {
  if (restriction !== 'gm' && restriction !== 'player') return true;
  if (!token) return true;
  const playerOwned = !!token.actor?.hasPlayerOwner;
  return restriction === 'gm' ? !playerOwned : playerOwned;
}

/**
 * Whether the event's token (if any) is currently visible to the executing client.
 * @param {object} event The event being considered.
 * @returns {boolean}
 */
function hasVision(event) {
  const token = event.data?.token?.object;
  if (!token || !canvas.ready) return true;
  return canvas.visibility.testVisibility(token.center, { object: token });
}

/**
 * Increment the attempt counter and report whether `minRequired` has been reached.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {number} minRequired The configured minimum attempt count.
 * @returns {Promise<boolean>} Whether the attempt count meets `minRequired`.
 */
async function recordAttempt(behavior, minRequired) {
  const count = (behavior.getFlag(MODULE.ID, 'triggerCount') ?? 0) + 1;
  await behavior.setFlag(MODULE.ID, 'triggerCount', count);
  return count >= minRequired;
}

/**
 * Whether at least `cooldown` in-game seconds have passed since the last successful fire.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {number} cooldown The configured cooldown, in seconds.
 * @returns {boolean}
 */
function cooldownElapsed(behavior, cooldown) {
  const last = behavior.getFlag(MODULE.ID, 'lastTriggered') ?? 0;
  return game.time.worldTime - last >= cooldown;
}

/**
 * Whether `event`'s token already appears in the behavior's fire history.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {object} event The event being considered.
 * @returns {boolean}
 */
function alreadyTriggeredToken(behavior, event) {
  const tokenId = event.data?.token?.id;
  if (!tokenId) return false;
  const history = behavior.getFlag(MODULE.ID, 'history') ?? [];
  return history.some((entry) => entry.tokenId === tokenId);
}

/** @type {number} Maximum retained history entries per behavior. */
const HISTORY_CAP = 500;

/**
 * Record a successful fire: reset the cooldown clock and append (capped) history.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {object} event The event that fired.
 * @returns {Promise<void>}
 */
async function recordSuccess(behavior, event) {
  const history = behavior.getFlag(MODULE.ID, 'history') ?? [];
  const tokenId = event.data?.token?.id ?? null;
  history.push({ tokenId, userId: event.user?.id ?? null, name: event.name, time: Date.now() });
  await behavior.update({
    [`flags.${MODULE.ID}.lastTriggered`]: game.time.worldTime,
    [`flags.${MODULE.ID}.history`]: history.slice(-HISTORY_CAP)
  });
}

/**
 * Append a capped history entry noting a run's failure.
 * @param {RegionBehavior} behavior The trigger behavior document.
 * @param {RunSource['event']} event The event that failed.
 * @param {Error} error The thrown error.
 * @returns {Promise<void>}
 */
export async function recordFailure(behavior, event, error) {
  const history = behavior.getFlag(MODULE.ID, 'history') ?? [];
  const tokenId = event.data?.token?.id ?? null;
  history.push({ tokenId, userId: event.user?.id ?? null, name: event.name, time: Date.now(), error: error.message });
  await behavior.setFlag(MODULE.ID, 'history', history.slice(-HISTORY_CAP));
}

/** @type {Set<string>} Token ids whose triggers are suppressed while a teleport is in flight. */
const suppressedTokens = new Set();

/**
 * Await `fn` with every trigger for `ids` suppressed for its duration.
 * @param {string[]} ids The token ids to suppress. An empty array suppresses nothing.
 * @param {() => Promise<*>} fn The operation to await.
 * @returns {Promise<*>} `fn`'s resolved value.
 */
export async function withTriggersSuppressed(ids, fn) {
  for (const id of ids) suppressedTokens.add(id);
  try {
    return await fn();
  } finally {
    for (const id of ids) suppressedTokens.delete(id);
  }
}

/**
 * Whether `event`'s token is mid-teleport with its triggers suppressed.
 * @param {RunSource['event']} event A normalized run source's event.
 * @returns {boolean}
 */
export function isSuppressed(event) {
  const tokenId = event.data?.token?.id;
  return !!tokenId && suppressedTokens.has(tokenId);
}
