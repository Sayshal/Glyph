import { registerNodeType } from '../nodes/registry.mjs';
import { getSkillTestAdapter } from '../skill-test-adapters.mjs';
import { resolveActorReference } from '../targeting.mjs';

registerNodeType('skillTest', {
  category: 'token',
  label: 'GLYPH.ACTIONS.skillTest.label',
  hint: 'GLYPH.ACTIONS.skillTest.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.skillTest.FIELDS.actor.label', required: true },
    { name: 'skill', widget: 'systemSkill', label: 'GLYPH.ACTIONS.skillTest.FIELDS.skill.label', hint: 'GLYPH.ACTIONS.skillTest.FIELDS.skill.hint', required: true },
    { name: 'dc', widget: 'number', label: 'GLYPH.ACTIONS.skillTest.FIELDS.dc.label', required: true }
  ],
  validate(node) {
    if (typeof node.actor !== 'object') throw new Error('skillTest.actor must be a reference object.');
    if (typeof node.skill !== 'string' || !node.skill) throw new Error('skillTest.skill must be a non-empty string.');
    if (typeof node.dc !== 'number') throw new Error('skillTest.dc must be a number.');
  },
  async execute(node, context) {
    const adapter = getSkillTestAdapter();
    if (!adapter) throw new Error(`No skill-test adapter is registered for system "${game.system.id}".`);
    const actor = resolveActorReference(node.actor, context);
    if (!actor) return;
    context.previous = await adapter(actor, node.skill, node.dc);
  }
});
