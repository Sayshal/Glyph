import { getAbilityChoices } from '../ability-test-adapters.mjs';
import { getDamageTypeChoices } from '../hurt-heal-adapters.mjs';
import { getNodeType, listNodeTypes } from '../nodes/registry.mjs';
import { getSkillChoices } from '../skill-test-adapters.mjs';
import { listResolvers } from '../targeting.mjs';
import { renderCombobox } from './combobox.mjs';
import { collectLandingTags } from './program-tree-ops.mjs';

/**
 * Build the grouped node-type option list shared by every "add node" combobox.
 * @returns {{label: string, options: {value: string, label: string, description?: string}[]}[]} Combobox groups.
 */
function nodeTypeGroups() {
  const byCategory = new Map();
  for (const { type, definition } of listNodeTypes()) {
    const category = definition.category ?? 'other';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push({ value: type, label: _loc(definition.label ?? type), description: definition.hint ? _loc(definition.hint) : undefined });
  }
  return [...byCategory.entries()].map(([category, options]) => ({ label: _loc(`GLYPH.CATEGORIES.${category}`), options }));
}

/**
 * Turn a plain `{value: locKey}` choices map into the array shape `{{selectOptions}}` expects.
 * @param {Record<string, string>} choices A field's `choices` map.
 * @returns {{value: string, label: string}[]} The normalized, localized choice list.
 */
function normalizeChoices(choices) {
  return Object.entries(choices).map(([value, label]) => ({ value, label: _loc(label) }));
}

/**
 * Build the plain-data view model for one field's widget.
 * @param {object} field A field descriptor from a node type's `fields` metadata.
 * @param {*} value The field's current value.
 * @param {string} path The dotted path to this field's owning node.
 * @param {{handlerNames: string[], landingTags: Set<string>}} ui Shared build-time context.
 * @param {object} node The owning node instance, for widgets that read a sibling field.
 * @returns {object} The widget view model.
 */
function buildWidget(field, value, path, ui, node) {
  const base = { path, fieldName: field.name, widgetName: field.widget, numeric: !!field.numeric };
  switch (field.widget) {
    case 'textarea':
      return { ...base, kind: 'textarea', value: value ?? '' };
    case 'number':
      return {
        ...base,
        kind: 'number',
        value: value ?? 0,
        hasMin: field.min !== undefined,
        min: field.min,
        hasMax: field.max !== undefined,
        max: field.max,
        hasStep: field.step !== undefined,
        step: field.step
      };
    case 'formula':
      return { ...base, kind: 'formula', value: value ?? '' };
    case 'boolean':
      return { ...base, kind: 'boolean', value: !!value };
    case 'select':
      return { ...base, kind: 'select', choices: normalizeChoices(field.choices), selected: [String(value)] };
    case 'systemAbility':
    case 'systemSkill': {
      const choices = field.widget === 'systemAbility' ? getAbilityChoices() : getSkillChoices();
      if (!choices) return { ...base, kind: 'text', value: value ?? '' };
      return { ...base, kind: 'select', choices: normalizeChoices(choices), selected: [String(value)] };
    }
    case 'systemDamageType': {
      const choices = getDamageTypeChoices();
      if (!choices) return { ...base, kind: 'text', value: value ?? '' };
      return { ...base, kind: 'select', choices: [{ value: '', label: _loc('GLYPH.DAMAGE_TYPE.none') }, ...normalizeChoices(choices)], selected: [value || ''] };
    }
    case 'multiSelect':
      return { ...base, kind: 'select', multiple: true, choices: normalizeChoices(field.choices), selected: (value ?? []).map(String) };
    case 'json':
      return { ...base, kind: 'json', value: typeof value === 'string' ? value : JSON.stringify(value ?? '') };
    case 'uuid':
      return { ...base, kind: 'uuid', value: value ?? '', documentType: field.documentType ?? '' };
    case 'journalAnchor': {
      const entry = node.uuid ? fromUuidSync(node.uuid) : null;
      const pages = entry instanceof JournalEntry ? entry.pages.filter((p) => p.type === 'text').sort((a, b) => a.sort - b.sort) : [];
      const choices = [{ value: '', label: _loc('GLYPH.ACTIONS.openJournal.FIELDS.anchor.none') }];
      for (const page of pages) {
        choices.push({ value: page.id, label: _loc('GLYPH.ACTIONS.openJournal.FIELDS.anchor.pageTop'), group: page.name });
        for (const heading of Object.values(page.toc).sort((a, b) => a.order - b.order)) {
          choices.push({ value: `${page.id}#${heading.slug}`, label: `${'  '.repeat(heading.level - 1)}${heading.text}`, group: page.name });
        }
      }
      return { ...base, kind: 'select', choices, selected: [value || ''] };
    }
    case 'file':
      return { ...base, kind: 'file', value: value ?? '', filePickerType: field.filePickerType ?? 'image' };
    case 'statusEffect':
      return { ...base, kind: 'select', choices: CONFIG.statusEffects.map((s) => ({ value: s.id, label: _loc(s.name) })), selected: [value] };
    case 'fxmasterEffect': {
      const choices = Object.entries(CONFIG.fxmaster?.particleEffects ?? {}).map(([key, effect]) => ({
        value: key,
        label: _loc(effect.label),
        group: _loc(`FXMASTER.ParticleEffectsGroup${effect.group.titleCase()}`)
      }));
      return { ...base, kind: 'select', choices, selected: [value] };
    }
    case 'rollMode':
      return { ...base, kind: 'select', choices: Object.entries(CONFIG.ChatMessage.modes).map(([k, m]) => ({ value: k, label: _loc(m.label) })), selected: [value] };
    case 'resolverSelect':
      return { ...base, kind: 'select', choices: listResolvers().map((r) => ({ value: r.id, label: r.label })), selected: [value] };
    case 'tagRef':
      return { ...base, kind: 'tagRef', value: value ?? '', listId: `glyph-landings-${path.replace(/\./g, '-')}`, tags: [...ui.landingTags] };
    case 'handlerRef':
      return { ...base, kind: 'select', choices: ui.handlerNames.map((n) => ({ value: n, label: n })), selected: [value] };
    case 'point': {
      const p = value && typeof value === 'object' ? value : {};
      return { ...base, kind: 'point', x: p.x ?? 0, y: p.y ?? 0, elevation: p.elevation ?? 0 };
    }
    case 'reference': {
      const ref = value && typeof value === 'object' ? value : { kind: 'uuid', value: '' };
      return { ...base, kind: 'reference', documentType: field.documentType ?? '', refKind: ref.kind, refValuePath: `${path}.value`, refValue: ref.value ?? '' };
    }
    case 'expression':
      return { ...base, kind: 'expression', value: value ?? '' };
    case 'custom':
      return { ...base, kind: 'custom', html: field.render(value, path, ui) };
    case 'text':
    default:
      return { ...base, kind: 'text', value: value ?? '' };
  }
}

/**
 * Build the view model for one node's field descriptors.
 * @param {object} definition The node type's registered definition.
 * @param {object} node The node instance.
 * @param {string} path The dotted path to this node.
 * @param {object} ui Shared build-time context.
 * @returns {object[]} The fields' view models.
 */
function buildFields(definition, node, path, ui) {
  return (definition.fields ?? []).map((field) => {
    const value = node[field.name];
    const hint = field.widget === 'reference' ? _loc(`GLYPH.REFERENCE_KIND_HINT.${value && typeof value === 'object' ? value.kind : 'uuid'}`) : field.hint ? _loc(field.hint) : null;
    return { label: _loc(field.label), required: !!field.required, hint, widget: buildWidget(field, value, `${path ? `${path}.` : ''}${field.name}`, ui, node) };
  });
}

/**
 * Build the view model for one slot (a named child-node array): its child rows plus an add-node control.
 * @param {object} slot A slot descriptor from a node type's `slots` metadata.
 * @param {object} node The owning node instance.
 * @param {string} path The dotted path to the owning node.
 * @param {object} ui Shared build-time context.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {object} The slot's view model.
 */
function buildSlot(slot, node, path, ui, expanded) {
  const slotPath = `${path ? `${path}.` : ''}${slot.name}`;
  const children = node[slot.name];
  const label = _loc(slot.label);
  if (slot.optional && !Array.isArray(children)) return { slotPath, label, isEmpty: true };
  const addNodeComboboxHtml = renderCombobox({
    id: `glyph-add-${slotPath.replace(/\./g, '-')}`,
    name: 'addNode',
    placeholder: _loc('GLYPH.TREE.addNode'),
    searchLabel: _loc('GLYPH.TREE.filterActions'),
    noResultsText: _loc('GLYPH.TREE.noResults'),
    groups: nodeTypeGroups(),
    data: { 'add-node-slot': slotPath }
  });
  return {
    slotPath,
    label,
    isEmpty: false,
    optional: !!slot.optional,
    removeLabel: _loc('GLYPH.TREE.removeSlot'),
    rows: (children ?? []).map((child, i) => buildNode(child, `${slotPath}.${i}`, ui, expanded)),
    addNodeComboboxHtml
  };
}

/**
 * Recursively build the view model for one program node and its descendants.
 * @param {object} node The node to build.
 * @param {string} path The dotted path to this node (empty string for the handler root).
 * @param {object} ui Shared build-time context.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {object} The node's view model.
 */
export function buildNode(node, path, ui, expanded) {
  const definition = getNodeType(node.type);
  const isRoot = path === '';
  if (!definition) return { unknown: true, path, isRoot, typeLabel: _loc('GLYPH.TREE.unknownType', { type: node.type }), deleteLabel: _loc('GLYPH.TREE.delete') };
  const isEnabled = node.enabled !== false;
  const isOpen = isRoot || expanded.has(path);
  const showBody = ((definition.fields?.length ?? 0) > 0 || (definition.slots?.length ?? 0) > 0) && isOpen;
  return {
    unknown: false,
    path,
    type: node.type,
    isRoot,
    isEnabled,
    showToggle: (definition.fields?.length > 0 || definition.slots?.length > 0) && !isRoot,
    toggleLabel: _loc(isOpen ? 'GLYPH.TREE.collapse' : 'GLYPH.TREE.expand'),
    toggleIcon: isOpen ? 'fa-caret-down' : 'fa-caret-right',
    structural: !!definition.structural,
    icon: definition.structural ? 'fa-diagram-project' : 'fa-bolt',
    label: _loc(definition.label ?? node.type),
    enableLabel: _loc(isEnabled ? 'GLYPH.TREE.disable' : 'GLYPH.TREE.enable'),
    enableIcon: isEnabled ? 'fa-toggle-on' : 'fa-toggle-off',
    moveUpLabel: _loc('GLYPH.TREE.moveUp'),
    moveDownLabel: _loc('GLYPH.TREE.moveDown'),
    deleteLabel: _loc('GLYPH.TREE.delete'),
    showBody,
    fields: showBody ? buildFields(definition, node, path, ui) : [],
    slots: showBody ? (definition.slots ?? []).map((slot) => buildSlot(slot, node, path, ui, expanded)) : []
  };
}

/**
 * Build the plain-data view model for a full handler tree.
 * @param {object} root The handler's root node.
 * @param {RegionBehavior} behavior The owning behavior, for handler-name/landing-tag context.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {object} The tree's view model.
 */
export function buildTree(root, behavior, expanded) {
  const ui = { handlerNames: Object.keys(behavior.system.handlers ?? {}), landingTags: collectLandingTags(root) };
  return buildNode(root, '', ui, expanded);
}
