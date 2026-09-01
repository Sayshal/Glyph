import { sendToAudience } from '../audience.mjs';
import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../render-intent.mjs';
import { resolveReference } from '../targeting.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

registerRenderIntent('openSpellBookForActor', async ({ uuid }) => {
  const actor = await fromUuid(uuid);
  if (actor) await SPELLBOOK.api.openSpellBookForActor(actor);
});

/** Spell Book */
export function registerSpellBookActions() {
  if (!isModuleActive('spell-book')) return;
  registerNodeType('learnSpellFromScroll', {
    category: 'token',
    label: 'GLYPH.ACTIONS.learnSpellFromScroll.label',
    hint: 'GLYPH.ACTIONS.learnSpellFromScroll.hint',
    fields: [
      { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.learnSpellFromScroll.FIELDS.actor.label', required: true },
      { name: 'classId', widget: 'text', label: 'GLYPH.ACTIONS.learnSpellFromScroll.FIELDS.classId.label', hint: 'GLYPH.ACTIONS.learnSpellFromScroll.FIELDS.classId.hint', required: true },
      { name: 'scroll', widget: 'reference', label: 'GLYPH.ACTIONS.learnSpellFromScroll.FIELDS.scroll.label', required: true }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('learnSpellFromScroll.actor must be a reference object.');
      if (typeof node.classId !== 'string' || !node.classId) throw new Error('learnSpellFromScroll.classId must be a non-empty string.');
      if (typeof node.scroll !== 'object') throw new Error('learnSpellFromScroll.scroll must be a reference object.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      const scroll = resolveReference(node.scroll, context);
      if (actor && scroll) await SPELLBOOK.api.learnFromScroll(actor, node.classId, scroll);
    }
  });

  registerNodeType('openSpellBookForActor', {
    category: 'token',
    label: 'GLYPH.ACTIONS.openSpellBookForActor.label',
    hint: 'GLYPH.ACTIONS.openSpellBookForActor.hint',
    fields: [{ name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.openSpellBookForActor.FIELDS.actor.label', required: true }, AUDIENCE_FIELD],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('openSpellBookForActor.actor must be a reference object.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (!actor) return;
      await sendToAudience(node.audience, context, 'openSpellBookForActor', { uuid: actor.uuid });
    }
  });
}
