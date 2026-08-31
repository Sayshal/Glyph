import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';

/** Minstrel */
export function registerMinstrelActions() {
  if (!isModuleActive('minstrel')) return;
  registerNodeType('minstrelMood', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.minstrelMood.label',
    hint: 'GLYPH.ACTIONS.minstrelMood.hint',
    fields: [
      { name: 'moodId', widget: 'text', label: 'GLYPH.ACTIONS.minstrelMood.FIELDS.moodId.label' },
      {
        name: 'mode',
        widget: 'select',
        label: 'GLYPH.ACTIONS.minstrelMood.FIELDS.mode.label',
        required: true,
        choices: { apply: 'GLYPH.MOOD_MODE.apply', stop: 'GLYPH.MOOD_MODE.stop' }
      }
    ],
    async execute(node) {
      if (node.mode === 'stop') await MINSTREL.moods.stop(node.moodId || undefined);
      else if (node.moodId) await MINSTREL.moods.apply(node.moodId);
    }
  });

  registerNodeType('minstrelSoundboard', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.minstrelSoundboard.label',
    hint: 'GLYPH.ACTIONS.minstrelSoundboard.hint',
    fields: [{ name: 'padId', widget: 'text', label: 'GLYPH.ACTIONS.minstrelSoundboard.FIELDS.padId.label', required: true }],
    validate(node) {
      if (typeof node.padId !== 'string' || !node.padId) throw new Error('minstrelSoundboard.padId must be a non-empty string.');
    },
    async execute(node) {
      await MINSTREL.soundboard.play(node.padId);
    }
  });

  registerNodeType('minstrelDuck', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.minstrelDuck.label',
    hint: 'GLYPH.ACTIONS.minstrelDuck.hint',
    fields: [
      { name: 'channel', widget: 'text', label: 'GLYPH.ACTIONS.minstrelDuck.FIELDS.channel.label', hint: 'GLYPH.ACTIONS.minstrelDuck.FIELDS.channel.hint' },
      { name: 'factor', widget: 'number', min: 0, max: 1, step: 0.05, label: 'GLYPH.ACTIONS.minstrelDuck.FIELDS.factor.label' },
      { name: 'holdMs', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.minstrelDuck.FIELDS.holdMs.label' }
    ],
    execute(node) {
      MINSTREL.duck(node.channel || undefined, node.factor || undefined, node.holdMs || undefined);
    }
  });
}
