import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { interpolate } from '../run-context.mjs';

/** Calendaria */
export function registerCalendariaActions() {
  if (!isModuleActive('calendaria')) return;
  registerNodeType('advanceTime', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.advanceTime.label',
    hint: 'GLYPH.ACTIONS.advanceTime.hint',
    fields: [{ name: 'seconds', widget: 'number', label: 'GLYPH.ACTIONS.advanceTime.FIELDS.seconds.label', required: true }],
    validate(node) {
      if (typeof node.seconds !== 'number') throw new Error('advanceTime.seconds must be a number.');
    },
    async execute(node) {
      await CALENDARIA.api.advanceTime(node.seconds);
    }
  });

  registerNodeType('createCalendarNote', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.createCalendarNote.label',
    hint: 'GLYPH.ACTIONS.createCalendarNote.hint',
    fields: [
      { name: 'name', widget: 'text', label: 'GLYPH.ACTIONS.createCalendarNote.FIELDS.name.label', required: true },
      { name: 'content', widget: 'textarea', label: 'GLYPH.ACTIONS.createCalendarNote.FIELDS.content.label' }
    ],
    validate(node) {
      if (typeof node.name !== 'string' || !node.name) throw new Error('createCalendarNote.name must be a non-empty string.');
    },
    async execute(node, context) {
      await CALENDARIA.api.createNote({
        name: interpolate(node.name, context),
        content: interpolate(node.content ?? '', context),
        startDate: CALENDARIA.api.getCurrentDateTime()
      });
    }
  });
}
