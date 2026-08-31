import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** @type {object} Shared add/remove/toggle choices for alterTag's state field. */
const STATE_FIELD = {
  name: 'state',
  widget: 'select',
  label: 'GLYPH.ACTIONS.FIELDS.state.label',
  choices: { add: 'GLYPH.STATE.add', remove: 'GLYPH.STATE.remove', toggle: 'GLYPH.STATE.toggle' }
};

/** Register the integration actions, gated on those modules being active. */
export function registerIntegrationActions() {
  registerTaggerActions();
  registerFxmasterActions();
}

/** Tagger */
function registerTaggerActions() {
  if (!isModuleActive('tagger')) return;
  registerNodeType('alterTag', {
    category: 'tagger',
    label: 'GLYPH.ACTIONS.alterTag.label',
    hint: 'GLYPH.ACTIONS.alterTag.hint',
    fields: [
      { name: 'entity', widget: 'reference', label: 'GLYPH.ACTIONS.alterTag.FIELDS.entity.label', required: true },
      { name: 'tag', widget: 'text', label: 'GLYPH.ACTIONS.alterTag.FIELDS.tag.label', required: true },
      STATE_FIELD
    ],
    validate(node) {
      if (typeof node.entity !== 'object') throw new Error('alterTag.entity must be a reference object.');
      if (typeof node.tag !== 'string' || !node.tag) throw new Error('alterTag.tag must be a non-empty string.');
    },
    async execute(node, context) {
      const entity = resolveReference(node.entity, context);
      if (!entity) return;
      const state = node.state ?? 'add';
      if (state === 'remove') await Tagger.removeTags(entity, node.tag);
      else if (state === 'toggle') await Tagger.toggleTags(entity, node.tag);
      else await Tagger.addTags(entity, node.tag);
    }
  });
}

/** FXMaster */
function registerFxmasterActions() {
  if (!isModuleActive('fxmaster')) return;
  registerNodeType('weatherEffect', {
    category: 'fxmaster',
    label: 'GLYPH.ACTIONS.weatherEffect.label',
    hint: 'GLYPH.ACTIONS.weatherEffect.hint',
    fields: [
      { name: 'effect', widget: 'fxmasterEffect', label: 'GLYPH.ACTIONS.weatherEffect.FIELDS.effect.label', required: true },
      { name: 'options', widget: 'json', label: 'GLYPH.ACTIONS.weatherEffect.FIELDS.options.label', hint: 'GLYPH.ACTIONS.weatherEffect.FIELDS.options.hint' }
    ],
    validate(node) {
      if (typeof node.effect !== 'string' || !node.effect) throw new Error('weatherEffect.effect must be a non-empty string.');
    },
    async execute(node) {
      const options = Object.fromEntries(Object.entries(node.options ?? {}).map(([key, value]) => [key, { value }]));
      await game.modules.get('fxmaster').api?.effects.play({ particles: [{ type: node.effect, options }] });
    }
  });

  registerNodeType('clearWeatherEffects', {
    category: 'fxmaster',
    label: 'GLYPH.ACTIONS.clearWeatherEffects.label',
    hint: 'GLYPH.ACTIONS.clearWeatherEffects.hint',
    async execute(_node, context) {
      await game.modules.get('fxmaster').api?.stopSceneEffects({ scene: context.info.scene });
    }
  });
}
