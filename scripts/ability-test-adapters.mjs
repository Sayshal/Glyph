/** Per-system ability-test adapters, keyed by `game.system.id`. */

/** @type {Map<string, (actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>>} */
const ADAPTERS = new Map();

/**
 * Register a system's ability-test adapter.
 * @param {string} systemId The game system id.
 * @param {(actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>} roll Roll a save/check.
 */
export function registerAbilityTestAdapter(systemId, roll) {
  ADAPTERS.set(systemId, roll);
}

/**
 * The active game system's ability-test adapter, if one is registered.
 * @returns {((actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>)|undefined}
 */
export function getAbilityTestAdapter() {
  return ADAPTERS.get(game.system.id);
}
