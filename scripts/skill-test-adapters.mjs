/** @type {Map<string, (actor: Actor, skill: string, dc: number, prompt: boolean) => Promise<boolean|null>>} */
const ADAPTERS = new Map();

/** @type {Map<string, Record<string, string>>} Per-system skill key -> localized label, for the Skill field's dropdown. */
const SKILL_CHOICES = new Map();

/**
 * Register a system's skill-test adapter.
 * @param {string} systemId The game system id.
 * @param {(actor: Actor, skill: string, dc: number, prompt: boolean) => Promise<boolean|null>} roll Roll a skill check, opening the system dialog when `prompt` is set.
 * @param {Record<string, string>} [skills] That system's skill key -> localized label, for a dropdown instead of free text.
 */
export function registerSkillTestAdapter(systemId, roll, skills) {
  ADAPTERS.set(systemId, roll);
  if (skills) SKILL_CHOICES.set(systemId, skills);
}

/**
 * The active game system's skill-test adapter, if one is registered.
 * @returns {((actor: Actor, skill: string, dc: number, prompt: boolean) => Promise<boolean|null>)|undefined}
 */
export function getSkillTestAdapter() {
  return ADAPTERS.get(game.system.id);
}

/**
 * The active game system's skill key -> localized label choices, if registered.
 * @returns {Record<string, string>|null}
 */
export function getSkillChoices() {
  return SKILL_CHOICES.get(game.system.id) ?? null;
}
