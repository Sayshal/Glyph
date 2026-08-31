import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** Token Light Condition */
export function registerTokenLightConditionActions() {
  if (!isModuleActive('tokenlightcondition')) return;
  registerNodeType('recalculateTokenLight', {
    category: 'token',
    label: 'GLYPH.ACTIONS.recalculateTokenLight.label',
    hint: 'GLYPH.ACTIONS.recalculateTokenLight.hint',
    fields: [{ name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.recalculateTokenLight.FIELDS.token.label', required: true }],
    validate(node) {
      if (typeof node.token !== 'object') throw new Error('recalculateTokenLight.token must be a reference object.');
    },
    async execute(node, context) {
      const token = resolveReference(node.token, context);
      if (token) await TLC.api.recalculate(token.object ?? token);
    }
  });
}
