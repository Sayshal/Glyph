import { resolveRollPrompter } from '../audience.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent, sendRenderIntent } from '../queries.mjs';
import { getSkillTestAdapter } from '../skill-test-adapters.mjs';
import { resolveActorReference } from '../targeting.mjs';

registerRenderIntent('skillTestRoll', async ({ actorUuid, skill, dc }) => {
  const actor = await fromUuid(actorUuid);
  const adapter = getSkillTestAdapter();
  if (!actor || !adapter) return null;
  return adapter(actor, skill, dc, true);
});

registerNodeType('skillTest', {
  category: 'token',
  label: 'GLYPH.ACTIONS.skillTest.label',
  hint: 'GLYPH.ACTIONS.skillTest.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.skillTest.FIELDS.actor.label', required: true },
    { name: 'skill', widget: 'systemSkill', label: 'GLYPH.ACTIONS.skillTest.FIELDS.skill.label', hint: 'GLYPH.ACTIONS.skillTest.FIELDS.skill.hint', required: true },
    { name: 'dc', widget: 'number', label: 'GLYPH.ACTIONS.skillTest.FIELDS.dc.label', required: true },
    { name: 'prompt', widget: 'boolean', label: 'GLYPH.ACTIONS.skillTest.FIELDS.prompt.label', hint: 'GLYPH.ACTIONS.skillTest.FIELDS.prompt.hint' }
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
    const result = node.prompt ? await promptRoll(actor, node) : await adapter(actor, node.skill, node.dc, false);
    if (result === null) ATLAS.log(2, `Glyph: "${actor.name}" answered no skill check; {{previous}} is null rather than a failure.`);
    context.previous = result;
  }
});

/**
 * Ask the actor's owning client to roll, opening the system's own dialog there.
 * @param {Actor} actor The actor to roll for.
 * @param {object} node The skillTest node being executed.
 * @returns {Promise<boolean|null>} Whether the roll met the DC, or null when nobody answered.
 */
async function promptRoll(actor, node) {
  const user = resolveRollPrompter(actor);
  if (!user) {
    ATLAS.log(2, `Glyph: nobody is connected to roll a skill check for "${actor.name}".`);
    return null;
  }
  return sendRenderIntent(user, 'skillTestRoll', { actorUuid: actor.uuid, skill: node.skill, dc: node.dc });
}
