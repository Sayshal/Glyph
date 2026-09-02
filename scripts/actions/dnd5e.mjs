import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerHurtHealAdapter } from '../hurt-heal-adapters.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerSkillTestAdapter } from '../skill-test-adapters.mjs';
import { resolveActorReference } from '../targeting.mjs';

/** dnd5e-only */
export function registerDnd5eActions() {
  if (game.system.id !== 'dnd5e') return;

  /** `Actor5e#rollSavingThrow`/`#rollAbilityCheck` */
  registerAbilityTestAdapter(
    'dnd5e',
    async (actor, type, ability, dc) => {
      const method = type === 'check' ? 'rollAbilityCheck' : 'rollSavingThrow';
      const rolls = await actor[method]({ ability, target: dc }, { configure: false }, {});
      const roll = rolls?.[0];
      return roll ? roll.total >= dc : null;
    },
    Object.fromEntries(Object.entries(CONFIG.DND5E.abilities).map(([key, { label }]) => [key, label]))
  );

  /** `Actor5e#rollSkill` */
  registerSkillTestAdapter(
    'dnd5e',
    async (actor, skill, dc) => {
      const rolls = await actor.rollSkill({ skill, target: dc }, { configure: false }, {});
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
      { name: 'chatCard', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.chatCard.label' },
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
      const activity = item?.system.activities?.getByType?.('attack')?.[0];
      if (!activity) return;
      const message = { create: node.chatCard !== false };
      if (node.rollMode) message.rollMode = node.rollMode;
      await activity.use({}, { configure: node.fastForward === false }, message);
      if (node.rollDamage) await activity.rollDamage({ event: context.info.event }, {}, message);
    }
  });

  /** `Actor5e#applyDamage(damages)` */
  registerHurtHealAdapter(
    'dnd5e',
    async (actor, formula, damageType, postCard) => {
      const roll = damageType ? new CONFIG.Dice.DamageRoll(formula, actor.getRollData(), { type: damageType }) : new Roll(formula);
      await roll.evaluate();
      if (postCard) {
        const typeLabel = CONFIG.DND5E.damageTypes[damageType]?.label ?? CONFIG.DND5E.healingTypes[damageType]?.label;
        await roll.toMessage({ flavor: typeLabel ? _loc(typeLabel) : undefined, speaker: ChatMessage.getSpeaker({ actor }) });
      }
      const damages = damageType ? [{ value: roll.total, type: damageType }] : roll.total;
      await actor.applyDamage(damages);
    },
    Object.fromEntries(Object.entries({ ...CONFIG.DND5E.damageTypes, ...CONFIG.DND5E.healingTypes }).map(([key, { label }]) => [key, label]))
  );
}
