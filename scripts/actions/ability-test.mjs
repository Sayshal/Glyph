import { getAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { resolveRollPrompter } from '../audience.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent, sendRenderIntent } from '../queries.mjs';
import { resolveActorReference } from '../targeting.mjs';

registerRenderIntent('abilityTestRoll', async ({ actorUuid, testType, ability, dc }) => {
  const actor = await fromUuid(actorUuid);
  const adapter = getAbilityTestAdapter();
  if (!actor || !adapter) return null;
  return adapter(actor, testType, ability, dc, true);
});

registerNodeType('abilityTest', {
  category: 'token',
  label: 'GLYPH.ACTIONS.abilityTest.label',
  hint: 'GLYPH.ACTIONS.abilityTest.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.actor.label', required: true },
    {
      name: 'testType',
      widget: 'select',
      label: 'GLYPH.ACTIONS.abilityTest.FIELDS.testType.label',
      required: true,
      choices: { save: 'GLYPH.ABILITY_TEST_TYPE.save', check: 'GLYPH.ABILITY_TEST_TYPE.check' }
    },
    { name: 'ability', widget: 'systemAbility', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.ability.label', hint: 'GLYPH.ACTIONS.abilityTest.FIELDS.ability.hint', required: true },
    { name: 'dc', widget: 'number', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.dc.label', required: true },
    { name: 'prompt', widget: 'boolean', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.prompt.label', hint: 'GLYPH.ACTIONS.abilityTest.FIELDS.prompt.hint' }
  ],
  validate(node) {
    if (typeof node.actor !== 'object') throw new Error('abilityTest.actor must be a reference object.');
    if (!['save', 'check'].includes(node.testType)) throw new Error('abilityTest.testType must be "save" or "check".');
    if (typeof node.ability !== 'string' || !node.ability) throw new Error('abilityTest.ability must be a non-empty string.');
    if (typeof node.dc !== 'number') throw new Error('abilityTest.dc must be a number.');
  },
  async execute(node, context) {
    const adapter = getAbilityTestAdapter();
    if (!adapter) throw new Error(`No ability-test adapter is registered for system "${game.system.id}".`);
    const actor = resolveActorReference(node.actor, context);
    if (!actor) return;
    const result = node.prompt ? await promptRoll(actor, node) : await adapter(actor, node.testType, node.ability, node.dc, false);
    if (result === null) ATLAS.log(2, `Glyph: "${actor.name}" answered no ${node.testType}; {{previous}} is null rather than a failure.`);
    context.previous = result;
  }
});

/**
 * Ask the actor's owning client to roll, opening the system's own dialog there.
 * @param {Actor} actor The actor to roll for.
 * @param {object} node The abilityTest node being executed.
 * @returns {Promise<boolean|null>} Whether the roll met the DC, or null when nobody answered.
 */
async function promptRoll(actor, node) {
  const user = resolveRollPrompter(actor);
  if (!user) {
    ATLAS.log(2, `Glyph: nobody is connected to roll a ${node.testType} for "${actor.name}".`);
    return null;
  }
  return sendRenderIntent(user, 'abilityTestRoll', { actorUuid: actor.uuid, testType: node.testType, ability: node.ability, dc: node.dc });
}
