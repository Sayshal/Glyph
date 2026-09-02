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
    { name: 'chatCard', widget: 'boolean', label: 'GLYPH.ACTIONS.hurtHeal.FIELDS.chatCard.label', hint: 'GLYPH.ACTIONS.hurtHeal.FIELDS.chatCard.hint' }
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
    await adapter(actor, interpolate(node.value, context), node.damageType || null, node.chatCard === true);
  }
});
