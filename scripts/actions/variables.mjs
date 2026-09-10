import { batchUpdate } from '../batch.mjs';
import { MODULE } from '../constants.mjs';
import { globToRegExp } from '../nodes/expression.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveCollection, resolveReference } from '../targeting.mjs';
import { toTriggerBehavior } from '../tile-link.mjs';

/**
 * Whether a `setVariable` node removes its variables rather than assigning them. A blank string assigns `""`.
 * @param {object} node The `setVariable` node.
 * @returns {boolean} True when the node clears.
 */
function isClearing(node) {
  return node.value === null || node.value === undefined;
}

/**
 * Apply a `setVariable` node's change to an in-memory `{name, value}[]` list (the persisted-flag shape).
 * @param {object} node The `setVariable` node.
 * @param {{name: string, value: *}[]} stored The current stored variables.
 * @returns {{name: string, value: *}[]} The updated list.
 */
function applyStoredVariable(node, stored) {
  const clearing = isClearing(node);
  if (!/[*?]/.test(node.name)) {
    const next = stored.filter((entry) => entry.name !== node.name);
    if (!clearing) next.push({ name: node.name, value: node.value });
    return next;
  }
  const pattern = globToRegExp(node.name);
  return stored.filter((entry) => !(clearing && pattern.test(entry.name))).map((entry) => (pattern.test(entry.name) ? { name: entry.name, value: node.value } : entry));
}

/**
 * Apply a `setVariable` node's change directly to the run's in-memory `context.variables`.
 * @param {object} node The `setVariable` node.
 * @param {object} variables `context.variables`.
 */
function applyContextVariable(node, variables) {
  const clearing = isClearing(node);
  if (!/[*?]/.test(node.name)) {
    if (clearing) delete variables[node.name];
    else variables[node.name] = node.value;
    return;
  }
  const pattern = globToRegExp(node.name);
  for (const name of Object.keys(variables).filter((n) => pattern.test(n))) {
    if (clearing) delete variables[name];
    else variables[name] = node.value;
  }
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
    const behavior = isSelf ? context.info.behavior : toTriggerBehavior(resolveReference(node.target, context));
    if (isSelf) applyContextVariable(node, context.variables);
    if (!behavior) return;
    const stored = applyStoredVariable(node, behavior.getFlag(MODULE.ID, 'variables') ?? []);
    await behavior.setFlag(MODULE.ID, 'variables', stored);
  },
  async batchExecute(pairs) {
    const groups = new Map();
    for (const { node, context } of pairs) {
      const isSelf = !node.target;
      const behavior = isSelf ? context.info.behavior : toTriggerBehavior(resolveReference(node.target, context));
      if (isSelf) applyContextVariable(node, context.variables);
      if (!behavior) continue;
      if (!groups.has(behavior)) groups.set(behavior, []);
      groups.get(behavior).push(node);
    }
    await batchUpdate(
      [...groups.entries()].map(([behavior, nodes]) => {
        let stored = behavior.getFlag(MODULE.ID, 'variables') ?? [];
        for (const node of nodes) stored = applyStoredVariable(node, stored);
        return { doc: behavior, changes: { [`flags.${MODULE.ID}.variables`]: stored } };
      })
    );
  }
});

/**
 * Rewrite a resolved item list to the users who own each item, deduplicated.
 * @param {object[]} items Resolved documents/placeables.
 * @returns {User[]} The owning users.
 */
function ownersOf(items) {
  const userIds = new Set();
  for (const item of items) {
    const ownership = item?.ownership;
    if (!ownership) continue;
    if (ownership.default === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      for (const user of game.users) userIds.add(user.id);
      continue;
    }
    for (const [userId, level] of Object.entries(ownership)) {
      if (userId !== 'default' && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) userIds.add(userId);
    }
  }
  return [...userIds].map((id) => game.users.get(id)).filter(Boolean);
}

/**
 * Merge a freshly resolved item list into an existing one, per `setCurrent`'s add/remove/replace modes.
 * @param {object[]} existing The variable's current array value.
 * @param {object[]} items The freshly resolved items.
 * @param {string} mode One of "add"/"remove"/"replace".
 * @returns {object[]} The merged array.
 */
function mergeCurrent(existing, items, mode) {
  if (mode === 'replace') return items.filter((item, index) => items.findIndex((i) => i.id === item.id) === index);
  if (mode === 'remove') return existing.filter((entry) => !items.some((item) => item.id === entry.id));
  const next = [...existing];
  for (const item of items) if (!next.some((entry) => entry.id === item.id)) next.push(item);
  return next;
}

registerNodeType('setCurrent', {
  category: 'variables',
  label: 'GLYPH.ACTIONS.setCurrent.label',
  hint: 'GLYPH.ACTIONS.setCurrent.hint',
  fields: [
    { name: 'name', widget: 'text', label: 'GLYPH.ACTIONS.setCurrent.FIELDS.name.label', hint: 'GLYPH.ACTIONS.setCurrent.FIELDS.name.hint', required: true },
    { name: 'source', widget: 'resolverSelect', label: 'GLYPH.ACTIONS.setCurrent.FIELDS.source.label', hint: 'GLYPH.ACTIONS.setCurrent.FIELDS.source.hint' },
    {
      name: 'action',
      widget: 'select',
      label: 'GLYPH.ACTIONS.setCurrent.FIELDS.action.label',
      choices: { add: 'GLYPH.CURRENT_ACTION.add', remove: 'GLYPH.CURRENT_ACTION.remove', replace: 'GLYPH.CURRENT_ACTION.replace', clear: 'GLYPH.CURRENT_ACTION.clear' }
    },
    { name: 'owners', widget: 'boolean', label: 'GLYPH.ACTIONS.setCurrent.FIELDS.owners.label', hint: 'GLYPH.ACTIONS.setCurrent.FIELDS.owners.hint' }
  ],
  validate(node) {
    if (typeof node.name !== 'string' || !node.name) throw new Error('setCurrent.name must be a non-empty string.');
    if (node.action !== 'clear' && (typeof node.source !== 'string' || !node.source)) throw new Error('setCurrent.source must be a non-empty string unless action is "clear".');
  },
  async execute(node, context) {
    const mode = node.action || 'add';
    if (mode === 'clear') {
      delete context.variables[node.name];
      return;
    }
    let items = resolveCollection(node.source, context);
    if (node.owners) items = ownersOf(items);
    const existing = Array.isArray(context.variables[node.name]) ? context.variables[node.name] : [];
    context.variables[node.name] = mergeCurrent(existing, items, mode);
  }
});
