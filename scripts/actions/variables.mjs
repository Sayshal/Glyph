import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/**
 * Convert a `*`/`?` glob pattern to a `RegExp` anchored to the full string.
 * @param {string} pattern The glob pattern.
 * @returns {RegExp} The equivalent regular expression.
 */
function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

registerNodeType('setVariable', {
  category: 'variables',
  label: 'GLYPH.ACTIONS.setVariable.label',
  hint: 'GLYPH.ACTIONS.setVariable.hint',
  fields: [
    { name: 'name', widget: 'text', label: 'GLYPH.ACTIONS.setVariable.FIELDS.name.label', hint: 'GLYPH.ACTIONS.setVariable.FIELDS.name.hint', required: true },
    { name: 'value', widget: 'json', label: 'GLYPH.ACTIONS.setVariable.FIELDS.value.label', hint: 'GLYPH.ACTIONS.setVariable.FIELDS.value.hint' },
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.setVariable.FIELDS.target.label', hint: 'GLYPH.ACTIONS.setVariable.FIELDS.target.hint' }
  ],
  validate(node) {
    if (typeof node.name !== 'string' || !node.name) throw new Error('setVariable.name must be a non-empty string.');
  },
  async execute(node, context) {
    const isSelf = !node.target;
    const behavior = isSelf ? context.info.behavior : resolveReference(node.target, context);
    if (!isSelf && !(behavior instanceof RegionBehavior)) return;

    if (!/[*?]/.test(node.name)) {
      if (isSelf) context.variables[node.name] = node.value;
      if (!behavior) return;
      const stored = [...(behavior.getFlag(MODULE.ID, 'variables') ?? [])];
      const index = stored.findIndex((entry) => entry.name === node.name);
      const record = { name: node.name, value: node.value };
      if (index === -1) stored.push(record);
      else stored[index] = record;
      await behavior.setFlag(MODULE.ID, 'variables', stored);
      return;
    }

    const clearing = node.value === null || node.value === undefined || node.value === '';
    const pattern = globToRegExp(node.name);
    if (isSelf) {
      for (const name of Object.keys(context.variables).filter((n) => pattern.test(n))) {
        if (clearing) delete context.variables[name];
        else context.variables[name] = node.value;
      }
    }
    if (!behavior) return;
    const existing = behavior.getFlag(MODULE.ID, 'variables') ?? [];
    const stored = existing.filter((entry) => !(clearing && pattern.test(entry.name))).map((entry) => (pattern.test(entry.name) ? { name: entry.name, value: node.value } : entry));
    await behavior.setFlag(MODULE.ID, 'variables', stored);
  }
});
