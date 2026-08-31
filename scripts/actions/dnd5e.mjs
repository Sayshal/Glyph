import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** dnd5e-only */
export function registerDnd5eActions() {
  if (game.system.id !== 'dnd5e') return;

  /** `Actor5e#rollSavingThrow`/`#rollAbilityCheck` */
  registerAbilityTestAdapter('dnd5e', async (actor, type, ability, dc) => {
    const method = type === 'check' ? 'rollAbilityCheck' : 'rollSavingThrow';
    const rolls = await actor[method]({ ability, target: dc }, { configure: false }, {});
    const roll = rolls?.[0];
    return roll ? roll.total >= dc : null;
  });

  registerNodeType('dnd5eAttack', {
    category: 'token',
    label: 'GLYPH.ACTIONS.dnd5eAttack.label',
    hint: 'GLYPH.ACTIONS.dnd5eAttack.hint',
    fields: [
      { name: 'item', widget: 'reference', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.item.label', required: true },
      { name: 'chatCard', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.chatCard.label' },
      { name: 'fastForward', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.fastForward.label', hint: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.fastForward.hint' },
      { name: 'rollDamage', widget: 'boolean', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.rollDamage.label' },
      { name: 'rollMode', widget: 'rollMode', label: 'GLYPH.ACTIONS.dnd5eAttack.FIELDS.rollMode.label' }
    ],
    validate(node) {
      if (typeof node.item !== 'object') throw new Error('dnd5eAttack.item must be a reference object.');
    },
    async execute(node, context) {
      const item = resolveReference(node.item, context);
      const activity = item?.system.activities?.getByType?.('attack')?.[0];
      if (!activity) return;
      const message = { create: node.chatCard !== false };
      if (node.rollMode) message.rollMode = node.rollMode;
      await activity.use({}, { configure: node.fastForward === false }, message);
      if (node.rollDamage) await activity.rollDamage({ event: context.info.event }, {}, message);
    }
  });

  /** `Actor5e#applyDamage(damages)` */
  registerNodeType('hurtHeal', {
    category: 'token',
    label: 'GLYPH.ACTIONS.hurtHeal.label',
    hint: 'GLYPH.ACTIONS.hurtHeal.hint',
    fields: [
      { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.actor.label', required: true },
      { name: 'value', widget: 'number', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.value.label', hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.value.hint', required: true }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('hurtHeal.actor must be a reference object.');
      if (typeof node.value !== 'number') throw new Error('hurtHeal.value must be a number.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (actor) await actor.applyDamage(node.value);
    }
  });
}
