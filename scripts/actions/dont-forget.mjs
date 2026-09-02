import { sendToAudience } from '../audience.mjs';
import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../queries.mjs';
import { interpolate } from '../run-context.mjs';
import { AUDIENCE_FIELD, INTERPOLATED_TEXT_HINT } from './messaging.mjs';

registerRenderIntent('createReminder', ({ label, ref }) => DONTFORGET.api.createReminder(game.user.id, { label, source: 'glyph', ref }));

/** Don't Forget */
export function registerDontForgetActions() {
  if (!isModuleActive('dont-forget')) return;
  registerNodeType('createReminder', {
    category: 'messaging',
    label: 'GLYPH.ACTIONS.createReminder.label',
    hint: 'GLYPH.ACTIONS.createReminder.hint',
    fields: [{ name: 'text', widget: 'text', label: 'GLYPH.ACTIONS.createReminder.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true }, AUDIENCE_FIELD],
    validate(node) {
      if (typeof node.text !== 'string' || !node.text) throw new Error('createReminder.text must be a non-empty string.');
    },
    async execute(node, context) {
      await sendToAudience(node.audience, context, 'createReminder', { label: interpolate(node.text, context), ref: context.info.behavior?.uuid });
    }
  });
}
