import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { interpolate } from '../run-context.mjs';
import { INTERPOLATED_TEXT_HINT } from './messaging.mjs';

/** @type {string[]} The components `setDateTime` may override. */
const COMPONENT_FIELDS = ['year', 'month', 'day', 'hour', 'minute'];

/** @type {string} */
const KEEP_CURRENT_HINT = 'GLYPH.ACTIONS.setDateTime.keepCurrent';

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

  registerNodeType('setDateTime', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.setDateTime.label',
    hint: 'GLYPH.ACTIONS.setDateTime.hint',
    fields: [
      { name: 'year', widget: 'number', label: 'GLYPH.ACTIONS.setDateTime.FIELDS.year.label', hint: KEEP_CURRENT_HINT },
      { name: 'month', widget: 'number', min: 1, label: 'GLYPH.ACTIONS.setDateTime.FIELDS.month.label', hint: KEEP_CURRENT_HINT },
      { name: 'day', widget: 'number', min: 1, label: 'GLYPH.ACTIONS.setDateTime.FIELDS.day.label', hint: KEEP_CURRENT_HINT },
      { name: 'hour', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.setDateTime.FIELDS.hour.label', hint: KEEP_CURRENT_HINT },
      { name: 'minute', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.setDateTime.FIELDS.minute.label', hint: KEEP_CURRENT_HINT },
      { name: 'cinematic', widget: 'boolean', label: 'GLYPH.ACTIONS.setDateTime.FIELDS.cinematic.label' }
    ],
    validate(node) {
      const given = COMPONENT_FIELDS.filter((name) => node[name] !== undefined && node[name] !== null);
      if (!given.length) throw new Error('setDateTime needs at least one date or time component.');
      if (given.some((name) => typeof node[name] !== 'number')) throw new Error('setDateTime components must be numbers.');
    },
    async execute(node) {
      const components = { ...CALENDARIA.api.getCurrentDateTime() };
      for (const name of COMPONENT_FIELDS) if (typeof node[name] === 'number') components[name] = node[name];
      await CALENDARIA.api.setDateTime(components, { cinematic: !!node.cinematic });
    }
  });

  registerNodeType('createCalendarNote', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.createCalendarNote.label',
    hint: 'GLYPH.ACTIONS.createCalendarNote.hint',
    fields: [
      { name: 'name', widget: 'text', label: 'GLYPH.ACTIONS.createCalendarNote.FIELDS.name.label', hint: INTERPOLATED_TEXT_HINT, required: true },
      { name: 'content', widget: 'textarea', label: 'GLYPH.ACTIONS.createCalendarNote.FIELDS.content.label', hint: INTERPOLATED_TEXT_HINT }
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
