import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** Tenacity */
export function registerTenacityActions() {
  if (!isModuleActive('tenacity')) return;
  registerNodeType('tenacityMote', {
    category: 'token',
    label: 'GLYPH.ACTIONS.tenacityMote.label',
    hint: 'GLYPH.ACTIONS.tenacityMote.hint',
    fields: [
      { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.tenacityMote.FIELDS.actor.label', required: true },
      {
        name: 'mode',
        widget: 'select',
        label: 'GLYPH.ACTIONS.tenacityMote.FIELDS.mode.label',
        required: true,
        choices: { grant: 'GLYPH.MOTE_MODE.grant', spend: 'GLYPH.MOTE_MODE.spend' }
      },
      { name: 'amount', widget: 'number', label: 'GLYPH.ACTIONS.tenacityMote.FIELDS.amount.label', min: 1, required: true }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('tenacityMote.actor must be a reference object.');
      if (!Number.isInteger(node.amount) || node.amount < 1) throw new Error('tenacityMote.amount must be a positive integer.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (!actor) return;
      const amount = node.amount;
      if (node.mode === 'spend') await TENACITY.spend(actor, { amount, reason: 'glyph' });
      else await TENACITY.grant(actor, { amount, reason: 'glyph' });
    }
  });
}
