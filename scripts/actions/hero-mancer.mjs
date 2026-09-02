import { sendToAudience } from '../audience.mjs';
import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../queries.mjs';
import { resolveReference } from '../targeting.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

registerRenderIntent('openLevelUp', async ({ uuid }) => {
  const actor = await fromUuid(uuid);
  if (actor) await HEROMANCER.api.openLevelUp(actor);
});

/** Hero Mancer */
export function registerHeroMancerActions() {
  if (!isModuleActive('hero-mancer')) return;
  registerNodeType('openLevelUp', {
    category: 'token',
    label: 'GLYPH.ACTIONS.openLevelUp.label',
    hint: 'GLYPH.ACTIONS.openLevelUp.hint',
    fields: [{ name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.openLevelUp.FIELDS.actor.label', required: true }, AUDIENCE_FIELD],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('openLevelUp.actor must be a reference object.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (!actor) return;
      await sendToAudience(node.audience, context, 'openLevelUp', { uuid: actor.uuid });
    }
  });
}
