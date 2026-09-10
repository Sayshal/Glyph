import { getHurtHealAdapter } from '../hurt-heal-adapters.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { interpolate } from '../run-context.mjs';
import { resolveActorReference } from '../targeting.mjs';

registerNodeType('hurtHeal', {
  category: 'token',
  label: 'GLYPH.ACTIONS.hurtHeal.label',
  hint: 'GLYPH.ACTIONS.hurtHeal.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.actor.label', required: true },
    { name: 'value', widget: 'formula', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.value.label', hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.value.hint', required: true },
    { name: 'damageType', widget: 'systemDamageType', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.damageType.label', hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.damageType.hint' },
    { name: 'chatCard', widget: 'boolean', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.chatCard.label', hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.chatCard.hint' },
    {
      name: 'rollMode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.rollMode.label',
      hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.rollMode.hint',
      choices: {
        publicroll: 'GLYPH.ROLL_MODE.publicroll',
        gmroll: 'GLYPH.ROLL_MODE.gmroll',
        blindroll: 'GLYPH.ROLL_MODE.blindroll',
        selfroll: 'GLYPH.ROLL_MODE.selfroll'
      }
    }
  ],
  validate(node) {
    if (typeof node.actor !== 'object') throw new Error('hurtHeal.actor must be a reference object.');
    if (typeof node.value !== 'string' || !node.value) throw new Error('hurtHeal.value must be a non-empty formula string.');
  },
  async execute(node, context) {
    const adapter = getHurtHealAdapter();
    if (!adapter) throw new Error(`No hurt/heal adapter is registered for system "${game.system.id}".`);
    const actor = resolveActorReference(node.actor, context);
    if (!actor) return;
    await adapter(actor, interpolate(node.value, context), { damageType: node.damageType || null, postCard: node.chatCard === true, rollMode: node.rollMode || null });
  },
  async batchExecute(pairs) {
    await Promise.all(pairs.map(({ node, context }) => this.execute(node, context)));
  }
});
