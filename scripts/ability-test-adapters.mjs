/** @type {Map<string, (actor: Actor, type: string, ability: string, dc: number, prompt: boolean) => Promise<boolean|null>>} */
const ADAPTERS = new Map();

/** @type {Map<string, {save?: Record<string, string>, check?: Record<string, string>}>} Per-system, per-test-type ability key -> localized label, for the Ability field's dropdown. */
const ABILITY_CHOICES = new Map();

/**
 * Register a system's ability-test adapter.
 * @param {string} systemId The game system id.
 * @param {(actor: Actor, type: string, ability: string, dc: number, prompt: boolean) => Promise<boolean|null>} roll Roll a save/check, opening the system dialog when `prompt` is set.
 * @param {Record<string, string>|{save?: Record<string, string>, check?: Record<string, string>}} [abilities] One ability key -> label map shared by both test types, or `{ save, check }` maps per type; a missing type is not offered.
 */
export function registerAbilityTestAdapter(systemId, roll, abilities) {
  ADAPTERS.set(systemId, roll);
  if (!abilities) return;
  const byType = 'save' in abilities || 'check' in abilities;
  ABILITY_CHOICES.set(systemId, byType ? abilities : { save: abilities, check: abilities });
}

/**
 * The active game system's ability-test adapter, if one is registered.
 * @returns {((actor: Actor, type: string, ability: string, dc: number, prompt: boolean) => Promise<boolean|null>)|undefined}
 */
export function getAbilityTestAdapter() {
  return ADAPTERS.get(game.system.id);
}

/**
 * The active game system's ability key -> localized label choices for one test type, if registered.
 * @param {string} testType The test type, `save` or `check`.
 * @returns {Record<string, string>|null}
 */
export function getAbilityChoices(testType) {
  return ABILITY_CHOICES.get(game.system.id)?.[testType] ?? null;
}

/**
 * The test types the active game system offers, or null when it registered no choices (every type is offered).
 * @returns {string[]|null}
 */
export function getAbilityTestTypes() {
  const choices = ABILITY_CHOICES.get(game.system.id);
  if (!choices) return null;
  return Object.keys(choices).filter((type) => choices[type]);
}
