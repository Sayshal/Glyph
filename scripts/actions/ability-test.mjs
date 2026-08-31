import { getAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/**
 * A TokenDocument (or Actor) reference to the Actor it represents.
 * @param {*} ref A resolved reference.
 * @returns {Actor|null}
 */
function toActor(ref) {
  if (ref instanceof Actor) return ref;
  return ref?.actor ?? null;
}

registerNodeType('abilityTest', {
  category: 'token',
  label: 'GLYPH.ACTIONS.abilityTest.label',
  hint: 'GLYPH.ACTIONS.abilityTest.hint',
  fields: [
    { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.actor.label', required: true },
    {
      name: 'type',
      widget: 'select',
      label: 'GLYPH.ACTIONS.abilityTest.FIELDS.type.label',
      required: true,
      choices: { save: 'GLYPH.ABILITY_TEST_TYPE.save', check: 'GLYPH.ABILITY_TEST_TYPE.check' }
    },
    { name: 'ability', widget: 'text', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.ability.label', hint: 'GLYPH.ACTIONS.abilityTest.FIELDS.ability.hint', required: true },
    { name: 'dc', widget: 'number', label: 'GLYPH.ACTIONS.abilityTest.FIELDS.dc.label', required: true }
  ],
  validate(node) {
    if (typeof node.actor !== 'object') throw new Error('abilityTest.actor must be a reference object.');
    if (!['save', 'check'].includes(node.type)) throw new Error('abilityTest.type must be "save" or "check".');
    if (typeof node.ability !== 'string' || !node.ability) throw new Error('abilityTest.ability must be a non-empty string.');
    if (typeof node.dc !== 'number') throw new Error('abilityTest.dc must be a number.');
  },
  async execute(node, context) {
    const adapter = getAbilityTestAdapter();
    if (!adapter) throw new Error(`No ability-test adapter is registered for system "${game.system.id}".`);
    const actor = toActor(resolveReference(node.actor, context));
    if (!actor) return;
    context.previous = await adapter(actor, node.type, node.ability, node.dc);
  }
});
