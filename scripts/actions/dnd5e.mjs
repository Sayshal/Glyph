import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerHurtHealAdapter, toMessageMode } from '../hurt-heal-adapters.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerSkillTestAdapter } from '../skill-test-adapters.mjs';
import { resolveActorReference, resolveReference } from '../targeting.mjs';

/**
 * Whether an attack roll beat the target's AC. A target with no readable AC counts as a hit; a cancelled roll does not.
 * @param {Roll[]|null} rolls The attack rolls.
 * @param {Token|null} targetToken The targeted token.
 * @returns {boolean} True when damage should follow.
 */
function attackHits(rolls, targetToken) {
  if (!rolls?.length) return false;
  const ac = targetToken?.actor?.system?.attributes?.ac?.value;
  if (typeof ac !== 'number') return true;
  return rolls.some((roll) => roll.isCritical || roll.total >= ac);
}

/** dnd5e-only */
export function registerDnd5eActions() {
  if (game.system.id !== 'dnd5e') return;

  /** `Actor5e#rollSavingThrow`/`#rollAbilityCheck` */
  registerAbilityTestAdapter(
    'dnd5e',
    async (actor, type, ability, dc, prompt) => {
      const method = type === 'check' ? 'rollAbilityCheck' : 'rollSavingThrow';
      const rolls = await actor[method]({ ability, target: dc }, { configure: !!prompt }, {});
      const roll = rolls?.[0];
      return roll ? roll.total >= dc : null;
    },
    Object.fromEntries(Object.entries(CONFIG.DND5E.abilities).map(([key, { label }]) => [key, label]))
  );

  /** `Actor5e#rollSkill` */
  registerSkillTestAdapter(
    'dnd5e',
    async (actor, skill, dc, prompt) => {
      const rolls = await actor.rollSkill({ skill, target: dc }, { configure: !!prompt }, {});
      const roll = rolls?.[0];
      return roll ? roll.total >= dc : null;
    },
    Object.fromEntries(Object.entries(CONFIG.DND5E.skills).map(([key, { label }]) => [key, label]))
  );

  registerNodeType('dnd5eAttack', {
    category: 'token',
    label: 'GLYPH.ACTIONS.dnd5eAttack.label',
    hint: 'GLYPH.ACTIONS.dnd5eAttack.hint',
    fields: [
      { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.actor.label', required: true },
      { name: 'itemId', widget: 'text', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.itemId.label', hint: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.itemId.hint', required: true },
      { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.target.label', hint: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.target.hint' },
      { name: 'chatCard', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.chatCard.label' },
      { name: 'cardOnly', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.cardOnly.label', hint: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.cardOnly.hint' },
      { name: 'fastForward', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.fastForward.label', hint: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.fastForward.hint' },
      { name: 'rollDamage', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.rollDamage.label' },
      { name: 'rollMode', widget: 'rollMode', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.rollMode.label' }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('dnd5eAttack.actor must be a reference object.');
      if (typeof node.itemId !== 'string' || !node.itemId) throw new Error('dnd5eAttack.itemId must be a non-empty string.');
    },
    async execute(node, context) {
      const actor = resolveActorReference(node.actor, context);
      const item = actor?.items.get(node.itemId);
      if (!item) return;
      const target = node.target ? resolveReference(node.target, context) : null;
      const targetToken = target instanceof TokenDocument ? target.object : target instanceof Token ? target : null;
      targetToken?.setTarget(true, { releaseOthers: true });
      const message = { create: node.chatCard !== false };
      if (node.rollMode) message.rollMode = node.rollMode;
      const dialog = { configure: node.fastForward === false };
      const activity = item.system.activities?.getByType?.('attack')?.[0];
      if (!activity) {
        await item.use({}, dialog, message);
        return;
      }
      const results = await activity.use({ subsequentActions: false }, dialog, message);
      if (!results || node.cardOnly) return;
      const rolls = await activity.rollAttack({ event: context.info.event }, {}, { data: { system: { origin: results.message?.id } } });
      if (node.rollDamage && attackHits(rolls, targetToken)) await activity.rollDamage({ event: context.info.event }, {}, message);
    }
  });

  /** `Actor5e#applyDamage(damages)` */
  registerHurtHealAdapter(
    'dnd5e',
    async (actor, formula, { damageType, postCard, rollMode }) => {
      const heal = /^\s*-/.test(String(formula));
      const type = heal ? 'healing' : damageType;
      const rolled = heal ? String(formula).replace(/^\s*-/, '') : formula;
      const roll = type ? new CONFIG.Dice.DamageRoll(rolled, actor.getRollData(), { type }) : new Roll(rolled, actor.getRollData());
      await roll.evaluate();
      if (postCard) {
        const typeLabel = CONFIG.DND5E.damageTypes[type]?.label ?? CONFIG.DND5E.healingTypes[type]?.label;
        await roll.toMessage({ flavor: typeLabel ? _loc(typeLabel) : undefined, speaker: ChatMessage.getSpeaker({ actor }) }, { messageMode: toMessageMode(rollMode) });
      }
      const damages = type ? [{ value: roll.total, type }] : roll.total;
      await actor.applyDamage(damages);
    },
    Object.fromEntries(Object.entries({ ...CONFIG.DND5E.damageTypes, ...CONFIG.DND5E.healingTypes }).map(([key, { label }]) => [key, label]))
  );
}
