/** @type {Map<string, (actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>>} */
const ADAPTERS = new Map();

/** @type {Map<string, Record<string, string>>} Per-system ability key -> localized label, for the Ability field's dropdown. */
const ABILITY_CHOICES = new Map();

/**
 * Register a system's ability-test adapter.
 * @param {string} systemId The game system id.
 * @param {(actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>} roll Roll a save/check.
 * @param {Record<string, string>} [abilities] That system's ability key -> localized label, for a dropdown instead of free text.
 */
export function registerAbilityTestAdapter(systemId, roll, abilities) {
  ADAPTERS.set(systemId, roll);
  if (abilities) ABILITY_CHOICES.set(systemId, abilities);
}

/**
 * The active game system's ability-test adapter, if one is registered.
 * @returns {((actor: Actor, type: string, ability: string, dc: number) => Promise<boolean|null>)|undefined}
 */
export function getAbilityTestAdapter() {
  return ADAPTERS.get(game.system.id);
}

/**
 * The active game system's ability key -> localized label choices, if registered.
 * @returns {Record<string, string>|null}
 */
export function getAbilityChoices() {
  return ABILITY_CHOICES.get(game.system.id) ?? null;
}
