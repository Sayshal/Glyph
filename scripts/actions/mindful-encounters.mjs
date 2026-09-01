import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';

/** Mindful Encounters */
export function registerMindfulEncountersActions() {
  if (!isModuleActive('mindful-encounters')) return;
  registerNodeType('setDungeonTurnActive', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.setDungeonTurnActive.label',
    hint: 'GLYPH.ACTIONS.setDungeonTurnActive.hint',
    fields: [
      { name: 'active', widget: 'boolean', label: 'GLYPH.ACTIONS.setDungeonTurnActive.FIELDS.active.label' },
      { name: 'overland', widget: 'boolean', label: 'GLYPH.ACTIONS.setDungeonTurnActive.FIELDS.overland.label', hint: 'GLYPH.ACTIONS.setDungeonTurnActive.FIELDS.overland.hint' }
    ],
    async execute(node, context) {
      const scene = context.info.scene;
      if (!scene) return;
      await game.modules.get('mindful-encounters').api.setActive(!!node.active, scene);
      await game.modules.get('mindful-encounters').api.setOverland(!!node.overland, scene);
    }
  });

  registerNodeType('setPartyBudget', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.setPartyBudget.label',
    hint: 'GLYPH.ACTIONS.setPartyBudget.hint',
    fields: [{ name: 'value', widget: 'number', label: 'GLYPH.ACTIONS.setPartyBudget.FIELDS.value.label', required: true }],
    validate(node) {
      if (typeof node.value !== 'number') throw new Error('setPartyBudget.value must be a number.');
    },
    async execute(node, context) {
      const scene = context.info.scene;
      if (scene) await game.modules.get('mindful-encounters').api.setPartyBudget(node.value, scene);
    }
  });

  registerNodeType('forceDungeonTurn', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.forceDungeonTurn.label',
    hint: 'GLYPH.ACTIONS.forceDungeonTurn.hint',
    async execute(_node, context) {
      const scene = context.info.scene;
      if (scene) await game.modules.get('mindful-encounters').api.forceAdvance(scene);
    }
  });
}
