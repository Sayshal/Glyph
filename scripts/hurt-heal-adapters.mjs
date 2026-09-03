/** @type {Map<string, (actor: Actor, formula: string, damageType: string|null, postCard: boolean) => Promise<void>>} */
const ADAPTERS = new Map();

/** @type {Map<string, Record<string, string>>} Per-system damage type key -> localized label, for the Damage Type field's dropdown. */
const DAMAGE_TYPE_CHOICES = new Map();

/**
 * Register a system's hurt/heal adapter.
 * @param {string} systemId The game system id.
 * @param {(actor: Actor, formula: string, damageType: string|null, postCard: boolean) => Promise<void>} apply Roll and apply the damage/healing.
 * @param {Record<string, string>} [damageTypes] That system's damage type key -> localized label, for a dropdown instead of free text.
 */
export function registerHurtHealAdapter(systemId, apply, damageTypes) {
  ADAPTERS.set(systemId, apply);
  if (damageTypes) DAMAGE_TYPE_CHOICES.set(systemId, damageTypes);
}

/**
 * The active game system's hurt/heal adapter, if one is registered.
 * @returns {((actor: Actor, formula: string, damageType: string|null, postCard: boolean) => Promise<void>)|undefined}
 */
export function getHurtHealAdapter() {
  return ADAPTERS.get(game.system.id);
}

/**
 * The active game system's damage type key -> localized label choices, if registered.
 * @returns {Record<string, string>|null}
 */
export function getDamageTypeChoices() {
  return DAMAGE_TYPE_CHOICES.get(game.system.id) ?? null;
}
