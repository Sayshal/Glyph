import { getAbilityChoices } from '../ability-test-adapters.mjs';
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
 * Escape a value for safe interpolation into an HTML attribute or text node.
 * @param {*} value The value to escape.
 * @returns {string} The escaped string.
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Render one field widget as an HTML fragment.
 * @param {object} field A field descriptor from a node type's `fields` metadata.
 * @param {*} value The field's current value.
 * @param {string} path The dotted path to this field's owning node.
 * @param {{handlerNames: string[], landingTags: Set<string>}} ui Shared render-time context.
 * @param {object} node The owning node instance, for widgets that read a sibling field.
 * @returns {string} The widget's HTML.
 */
function renderWidget(field, value, path, ui, node) {
  const attrs = `data-path="${path}" data-field="${field.name}" data-widget="${field.widget}"${field.numeric ? ' data-numeric="true"' : ''}`;
  switch (field.widget) {
    case 'textarea':
      return `<textarea ${attrs} rows="3">${esc(value)}</textarea>`;
    case 'number':
      return `<input type="number" ${attrs} value="${value ?? 0}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}${field.step !== undefined ? ` step="${field.step}"` : ''}>`;
    case 'boolean':
      return `<input type="checkbox" ${attrs} ${value ? 'checked' : ''}>`;
    case 'select':
      return `<select ${attrs}>${Object.entries(field.choices)
        .map(([v, l]) => `<option value="${v}" ${String(value) === v ? 'selected' : ''}>${_loc(l)}</option>`)
        .join('')}</select>`;
    case 'systemAbility':
    case 'systemSkill': {
      const choices = field.widget === 'systemAbility' ? getAbilityChoices() : getSkillChoices();
      if (!choices) return `<input type="text" ${attrs} value="${esc(value)}">`;
      return `<select ${attrs}>${Object.entries(choices)
        .map(([v, l]) => `<option value="${v}" ${String(value) === v ? 'selected' : ''}>${_loc(l)}</option>`)
        .join('')}</select>`;
    }
    case 'multiSelect': {
      const selected = new Set((value ?? []).map(String));
      return `<select ${attrs} multiple>${Object.entries(field.choices)
        .map(([v, l]) => `<option value="${v}" ${selected.has(v) ? 'selected' : ''}>${_loc(l)}</option>`)
        .join('')}</select>`;
    }
    case 'json':
      return `<input type="text" ${attrs} value="${esc(typeof value === 'string' ? value : JSON.stringify(value ?? ''))}">`;
    case 'uuid':
      return `<document-tags ${attrs} type="${field.documentType ?? ''}" single value="${esc(value)}"></document-tags>`;
    case 'journalAnchor': {
      const entry = node.uuid ? fromUuidSync(node.uuid) : null;
      const pages = entry instanceof JournalEntry ? entry.pages.filter((p) => p.type === 'text').sort((a, b) => a.sort - b.sort) : [];
      const optgroups = pages
        .map((page) => {
          const headings = Object.values(page.toc).sort((a, b) => a.order - b.order);
          const pageOption = `<option value="${esc(page.id)}" ${value === page.id ? 'selected' : ''}>${_loc('GLYPH.ACTIONS.openJournal.FIELDS.anchor.pageTop')}</option>`;
          const headingOptions = headings
            .map((h) => `<option value="${esc(`${page.id}#${h.slug}`)}" ${value === `${page.id}#${h.slug}` ? 'selected' : ''}>${'  '.repeat(h.level - 1)}${esc(h.text)}</option>`)
            .join('');
          return `<optgroup label="${esc(page.name)}">${pageOption}${headingOptions}</optgroup>`;
        })
        .join('');
      return `<select ${attrs}>
        <option value="" ${!value ? 'selected' : ''}>${_loc('GLYPH.ACTIONS.openJournal.FIELDS.anchor.none')}</option>
        ${optgroups}
      </select>`;
    }
    case 'file': {
      const input = new foundry.data.fields.FilePathField({ categories: [(field.filePickerType ?? 'image').toUpperCase()] }).toInput({ value: value ?? '' });
      input.removeAttribute('name');
      input.dataset.path = path;
      input.dataset.field = field.name;
      return input.outerHTML;
    }
    case 'statusEffect':
      return `<select ${attrs}>${CONFIG.statusEffects.map((s) => `<option value="${s.id}" ${value === s.id ? 'selected' : ''}>${_loc(s.name)}</option>`).join('')}</select>`;
    case 'fxmasterEffect': {
      const groups = new Map();
      for (const [key, effect] of Object.entries(CONFIG.fxmaster?.particleEffects ?? {})) {
        if (!groups.has(effect.group)) groups.set(effect.group, []);
        groups.get(effect.group).push({ key, label: effect.label });
      }
      const optgroups = [...groups.entries()]
        .map(
          ([group, effects]) =>
            `<optgroup label="${esc(_loc(`FXMASTER.ParticleEffectsGroup${group.titleCase()}`))}">${effects
              .map((e) => `<option value="${e.key}" ${value === e.key ? 'selected' : ''}>${esc(_loc(e.label))}</option>`)
              .join('')}</optgroup>`
        )
        .join('');
      return `<select ${attrs}>${optgroups}</select>`;
    }
    case 'rollMode':
      return `<select ${attrs}>${Object.entries(CONFIG.ChatMessage.modes)
        .map(([k, m]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${_loc(m.label)}</option>`)
        .join('')}</select>`;
    case 'resolverSelect':
      return `<select ${attrs}>${listResolvers()
        .map((r) => `<option value="${r.id}" ${value === r.id ? 'selected' : ''}>${r.label}</option>`)
        .join('')}</select>`;
    case 'tagRef': {
      const listId = `glyph-landings-${path.replace(/\./g, '-')}`;
      return `<input type="text" list="${listId}" ${attrs} value="${esc(value)}"><datalist id="${listId}">${[...ui.landingTags].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>`;
    }
    case 'handlerRef':
      return `<select ${attrs}>${ui.handlerNames.map((n) => `<option value="${n}" ${value === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    case 'point': {
      const p = value && typeof value === 'object' ? value : {};
      return `<div class="glyph-point">
        <label>${_loc('GLYPH.POINT.x')} <input type="number" data-path="${path}.x" data-field="x" value="${p.x ?? 0}"></label>
        <label>${_loc('GLYPH.POINT.y')} <input type="number" data-path="${path}.y" data-field="y" value="${p.y ?? 0}"></label>
        <label>${_loc('GLYPH.POINT.elevation')} <input type="number" data-path="${path}.elevation" data-field="elevation" value="${p.elevation ?? 0}"></label>
      </div>`;
    }
    case 'reference': {
      const ref = value && typeof value === 'object' ? value : { kind: 'uuid', value: '' };
      const kindSelect = `<select data-path="${path}.kind" data-field="kind" class="glyph-ref-kind">
        <option value="uuid" ${ref.kind === 'uuid' ? 'selected' : ''}>${_loc('GLYPH.REFERENCE_KIND.uuid')}</option>
        <option value="triggerToken" ${ref.kind === 'triggerToken' ? 'selected' : ''}>${_loc('GLYPH.REFERENCE_KIND.triggerToken')}</option>
        <option value="triggerActor" ${ref.kind === 'triggerActor' ? 'selected' : ''}>${_loc('GLYPH.REFERENCE_KIND.triggerActor')}</option>
        <option value="context" ${ref.kind === 'context' ? 'selected' : ''}>${_loc('GLYPH.REFERENCE_KIND.context')}</option>
      </select>`;
      const valueInput =
        ref.kind === 'context'
          ? `<input type="text" data-path="${path}.value" data-field="value" value="${esc(ref.value)}" placeholder="variables.myVar">`
          : ref.kind === 'uuid'
            ? `<document-tags data-path="${path}.value" data-field="value" type="${field.documentType ?? ''}" single value="${esc(ref.value)}"></document-tags>`
            : '';
      return `<div class="glyph-reference" data-document-type="${field.documentType ?? ''}">${kindSelect}${valueInput}</div>`;
    }
    case 'expression':
      return `<input type="text" ${attrs} value="${esc(value)}" placeholder='{{event.data.token.name}} == "Goblin"'>`;
    case 'custom':
      return field.render(value, path, ui);
    case 'text':
    default:
      return `<input type="text" ${attrs} value="${esc(value)}">`;
  }
}

/**
 * Render one node's field descriptors as labeled form-groups.
 * @param {object} definition The node type's registered definition.
 * @param {object} node The node instance.
 * @param {string} path The dotted path to this node.
 * @param {object} ui Shared render-time context, see {@link renderWidget}.
 * @returns {string} The fields' HTML.
 */
function renderFields(definition, node, path, ui) {
  return (definition.fields ?? [])
    .map((field) => {
      const value = node[field.name];
      const hint = field.widget === 'reference' ? _loc(`GLYPH.REFERENCE_KIND_HINT.${value && typeof value === 'object' ? value.kind : 'uuid'}`) : field.hint ? _loc(field.hint) : null;
      return `
    <div class="form-group glyph-node-field">
      <label>${_loc(field.label)}${field.required ? ' *' : ''}</label>
      <div class="form-fields">${renderWidget(field, value, `${path ? `${path}.` : ''}${field.name}`, ui, node)}</div>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
    </div>`;
    })
    .join('');
}

/**
 * Render one slot (a named child-node array) as a list of child rows plus an add-node control.
 * @param {object} slot A slot descriptor from a node type's `slots` metadata.
 * @param {object} node The owning node instance.
 * @param {string} path The dotted path to the owning node.
 * @param {object} ui Shared render-time context, see {@link renderWidget}.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {string} The slot's HTML.
 */
function renderSlot(slot, node, path, ui, expanded) {
  const slotPath = `${path ? `${path}.` : ''}${slot.name}`;
  const children = node[slot.name];
  if (slot.optional && !Array.isArray(children)) {
    return `<div class="glyph-slot glyph-slot-empty" data-slot-path="${slotPath}">
      <button type="button" class="glyph-add-slot" data-line-action="add-slot" data-slot-path="${slotPath}">
        <i class="fa-solid fa-plus"></i> ${_loc(slot.label)}
      </button>
    </div>`;
  }
  const rows = (children ?? []).map((child, i) => renderNode(child, `${slotPath}.${i}`, ui, expanded)).join('');
  const removeButton = slot.optional
    ? `<button type="button" class="glyph-remove-slot" data-line-action="remove-slot" data-slot-path="${slotPath}" aria-label="${_loc('GLYPH.TREE.removeSlot')}" data-tooltip><i class="fa-solid fa-xmark"></i></button>`
    : '';
  const addNodeCombobox = renderCombobox({
    id: `glyph-add-${slotPath.replace(/\./g, '-')}`,
    name: 'addNode',
    placeholder: _loc('GLYPH.TREE.addNode'),
    searchLabel: _loc('GLYPH.TREE.filterActions'),
    noResultsText: _loc('GLYPH.TREE.noResults'),
    groups: nodeTypeGroups(),
    data: { 'add-node-slot': slotPath }
  });
  return `<div class="glyph-slot" data-slot-path="${slotPath}">
    <div class="glyph-slot-header"><span>${_loc(slot.label)}</span>${removeButton}</div>
    <div class="glyph-slot-rows">${rows}</div>
    <div class="glyph-add-node-bar">${addNodeCombobox}</div>
  </div>`;
}

/**
 * Recursively render one program node and its descendants as an HTML fragment.
 * @param {object} node The node to render.
 * @param {string} path The dotted path to this node (empty string for the handler root).
 * @param {object} ui Shared render-time context, see {@link renderWidget}.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {string} The node's HTML.
 */
export function renderNode(node, path, ui, expanded) {
  const definition = getNodeType(node.type);
  if (!definition) {
    const deleteButton = path
      ? `<button type="button" data-line-action="delete-node" data-path="${path}" aria-label="${_loc('GLYPH.TREE.delete')}" data-tooltip><i class="fa-solid fa-trash"></i></button>`
      : '';
    return `<div class="glyph-node-row glyph-node-error" data-node-path="${path}"><span>${_loc('GLYPH.TREE.unknownType', { type: node.type })}</span>${deleteButton}</div>`;
  }
  const isRoot = path === '';
  const isEnabled = node.enabled !== false;
  const isOpen = isRoot || expanded.has(path);
  const controls = isRoot
    ? ''
    : `<div class="glyph-node-controls">
        <button type="button" data-line-action="toggle-enabled" data-path="${path}" aria-label="${_loc(isEnabled ? 'GLYPH.TREE.disable' : 'GLYPH.TREE.enable')}" data-tooltip><i class="fa-solid ${isEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
        <button type="button" data-line-action="move-up" data-path="${path}" aria-label="${_loc('GLYPH.TREE.moveUp')}" data-tooltip><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" data-line-action="move-down" data-path="${path}" aria-label="${_loc('GLYPH.TREE.moveDown')}" data-tooltip><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" data-line-action="delete-node" data-path="${path}" aria-label="${_loc('GLYPH.TREE.delete')}" data-tooltip><i class="fa-solid fa-trash"></i></button>
      </div>`;
  const hasBody = (definition.fields?.length ?? 0) > 0 || (definition.slots?.length ?? 0) > 0;
  const toggle =
    hasBody && !isRoot
      ? `<button type="button" class="glyph-node-toggle" data-line-action="toggle-node" data-path="${path}" aria-label="${_loc(isOpen ? 'GLYPH.TREE.collapse' : 'GLYPH.TREE.expand')}" data-tooltip><i class="fa-solid fa-caret-${isOpen ? 'down' : 'right'}"></i></button>`
      : '<span class="glyph-node-toggle-spacer"></span>';
  const body =
    hasBody && isOpen
      ? `<div class="glyph-node-body">${renderFields(definition, node, path, ui)}${(definition.slots ?? []).map((slot) => renderSlot(slot, node, path, ui, expanded)).join('')}</div>`
      : '';
  return `<div class="glyph-node-row${definition.structural ? ' glyph-node-structural' : ''}${isEnabled ? '' : ' glyph-node-disabled'}" data-node-path="${path}" data-node-type="${node.type}">
    <div class="glyph-node-header">
      ${toggle}
      <i class="glyph-node-icon fa-solid ${definition.structural ? 'fa-diagram-project' : 'fa-bolt'}"></i>
      <span class="glyph-node-label">${_loc(definition.label ?? node.type)}</span>
      ${controls}
    </div>
    ${body}
  </div>`;
}

/**
 * Render a full handler tree, ready to drop into the Program tab.
 * @param {object} root The handler's root node.
 * @param {RegionBehavior} behavior The owning behavior, for handler-name/landing-tag context.
 * @param {Set<string>} expanded Node paths currently expanded.
 * @returns {string} The tree's HTML.
 */
export function renderTree(root, behavior, expanded) {
  const ui = {
    handlerNames: Object.keys(behavior.system.handlers ?? {}),
    landingTags: collectLandingTags(root)
  };
  return renderNode(root, '', ui, expanded);
}
