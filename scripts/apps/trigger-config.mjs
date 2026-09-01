import { MODULE } from '../constants.mjs';
import { runNode } from '../nodes/executor.mjs';
import { getNodeType } from '../nodes/registry.mjs';
import { createRunContext } from '../run-context.mjs';
import { applyTemplate, listTemplates, saveTemplate } from '../templates.mjs';
import { Combobox } from './combobox.mjs';
import { esc, renderTree } from './program-tree-builder.mjs';
import { deleteAtPath, getAtPath, moveAtPath, scaffoldNode } from './program-tree-ops.mjs';

const { DocumentSheetV2 } = foundry.applications.api;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** The authoring sheet for `glyph.trigger` RegionBehaviors, replacing the generic RegionBehaviorConfig. */
export class TriggerBehaviorConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @type {string|null} The event/pseudoEvent (or "manual") whose handler tree the Program tab shows. */
  #selectedHandler = null;

  /** @type {Set<string>} Node paths currently expanded in the Program tab tree. */
  #expanded = new Set();

  /**
   * @type {Map<string, object>} Per-handler tree edits that failed schema validation on save (e.g.
   * a freshly-added node with an empty required field) - kept here instead of being silently
   * dropped, so the invalid node stays visible and editable until it becomes valid. Cleared for a
   * handler once its tree saves successfully, or a template is applied over it.
   */
  #pendingTrees = new Map();

  constructor(options) {
    super(options);
    this.options.window.icon = MODULE.ICON;
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ['glyph', 'trigger-config'],
    viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    position: { width: 640, height: 'auto' },
    window: { contentClasses: ['standard-form'], resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  /** @inheritDoc */
  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    general: { template: `modules/${MODULE.ID}/templates/tabs/general.hbs`, scrollable: [''] },
    program: { template: `modules/${MODULE.ID}/templates/tabs/program.hbs`, scrollable: [''] },
    variables: { template: `modules/${MODULE.ID}/templates/tabs/variables.hbs`, scrollable: [''] },
    history: { template: `modules/${MODULE.ID}/templates/tabs/history.hbs`, scrollable: [''] },
    footer: { template: 'templates/generic/form-footer.hbs' }
  };

  /** @inheritDoc */
  static TABS = {
    sheet: {
      tabs: [
        { id: 'general', icon: 'fa-solid fa-sliders' },
        { id: 'program', icon: 'fa-solid fa-diagram-project' },
        { id: 'variables', icon: 'fa-solid fa-brackets-curly' },
        { id: 'history', icon: 'fa-solid fa-clock-rotate-left' }
      ],
      initial: 'general',
      labelPrefix: 'GLYPH.TABS'
    }
  };

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.fields = this._getGeneralFields();
    context.hint = 'BEHAVIOR.TYPES.trigger.hint';
    context.linkedTileHtml = this._renderLinkedTileWidget();
    context.templateHtml = await this._renderTemplateWidget();
    context.buttons = [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'BEHAVIOR.ACTIONS.update' }];
    this._prepareProgramContext(context);
    this._prepareVariablesContext(context);
    this._prepareHistoryContext(context);
    return context;
  }

  /**
   * Populate the Variables tab's persisted key/value list.
   * @param {object} context The render context, mutated in place.
   */
  _prepareVariablesContext(context) {
    const variables = this.document.getFlag(MODULE.ID, 'variables') ?? [];
    context.variableEntries = variables.map((entry, index) => ({ index, name: entry.name, valueLabel: JSON.stringify(entry.value) }));
  }

  /**
   * Populate the History tab's fire log, most recent first.
   * @param {object} context The render context, mutated in place.
   */
  _prepareHistoryContext(context) {
    const history = this.document.getFlag(MODULE.ID, 'history') ?? [];
    context.historyEntries = history
      .map((entry, index) => ({
        index,
        name: entry.name,
        error: entry.error ?? null,
        timeLabel: foundry.utils.timeSince(new Date(entry.time))
      }))
      .reverse();
  }

  /**
   * Render the linkedTile document picker as a raw HTML fragment for the General tab.
   * @returns {string} The widget's HTML.
   */
  _renderLinkedTileWidget() {
    const value = this.document.system.linkedTile?.value ?? '';
    return `<div class="form-group">
      <label>${_loc('BEHAVIOR.TYPES.trigger.FIELDS.linkedTile.label')}</label>
      <div class="form-fields">
        <document-tags class="glyph-linked-tile" type="Tile" single value="${value}"></document-tags>
      </div>
      <p class="hint">${_loc('BEHAVIOR.TYPES.trigger.FIELDS.linkedTile.hint')}</p>
    </div>`;
  }

  /**
   * Render the save/apply-template controls as a raw HTML fragment for the General tab.
   * @returns {Promise<string>} The widget's HTML.
   */
  async _renderTemplateWidget() {
    const templates = await listTemplates();
    const groups = Object.groupBy(templates, (t) => t.category);
    const options = Object.entries(groups)
      .map(
        ([category, entries]) =>
          `<optgroup label="${esc(_loc(`GLYPH.TEMPLATES.CATEGORIES.${category}`))}">${entries.map((t) => `<option value="${esc(t.uuid)}">${esc(t.name)}</option>`).join('')}</optgroup>`
      )
      .join('');
    return `<div class="form-group">
      <label>${_loc('GLYPH.TEMPLATES.label')}</label>
      <div class="form-fields">
        <select class="glyph-template-select" ${templates.length ? '' : 'disabled'}>${options || `<option value="">${_loc('GLYPH.TEMPLATES.none')}</option>`}</select>
        <button type="button" data-line-action="apply-template" ${templates.length ? '' : 'disabled'}>${_loc('GLYPH.TEMPLATES.apply')}</button>
        <button type="button" data-line-action="save-template">${_loc('GLYPH.TEMPLATES.save')}</button>
      </div>
      <p class="hint">${_loc('GLYPH.TEMPLATES.hint')}</p>
    </div>`;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Populate the Program tab's handler picker and rendered tree.
   * @param {object} context The render context, mutated in place.
   */
  _prepareProgramContext(context) {
    const system = this.document.system;
    const handlerNames = [...new Set([...system.events, ...system.pseudoEvents, 'manual'])];
    if (!this.#selectedHandler || !handlerNames.includes(this.#selectedHandler)) this.#selectedHandler = handlerNames[0] ?? null;
    context.handlerNames = handlerNames;
    context.selectedHandler = this.#selectedHandler;
    const tree = this.#pendingTrees.get(this.#selectedHandler) ?? system.handlers[this.#selectedHandler] ?? { type: 'sequence', children: [] };
    context.programHtml = this.#selectedHandler ? renderTree(tree, this.document, this.#expanded) : '';
  }

  /** @inheritDoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener('click', this.#onTreeClick.bind(this));
    this.element.addEventListener('change', this.#onTreeChange.bind(this), { capture: true });
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    Combobox.attachAll(this.element, { onChange: (nodeType, opt) => this.#onAddNode(nodeType, opt) });
  }

  /**
   * Add a node of `nodeType` to whichever slot its add-node combobox belongs to.
   * @param {string} nodeType The selected node type.
   * @param {HTMLElement} opt The selected option element, for recovering the owning slot.
   */
  #onAddNode(nodeType, opt) {
    if (!nodeType) return;
    const slotPath = opt.closest('[data-combobox]')?.dataset.addNodeSlot;
    if (slotPath === undefined) return;
    this.#mutateHandler((tree) => {
      const list = getAtPath(tree, slotPath);
      list.push(scaffoldNode(nodeType));
      this.#expanded.add(`${slotPath}.${list.length - 1}`);
    });
  }

  /**
   * Handle a click anywhere in the Program tab: handler-tree structural actions.
   * @param {PointerEvent} event The click event.
   */
  async #onTreeClick(event) {
    const action = event.target.closest('[data-line-action]');
    if (!action) return;
    event.preventDefault();
    const { lineAction, path, slotPath, index } = action.dataset;
    if (lineAction === 'toggle-node') {
      if (this.#expanded.has(path)) this.#expanded.delete(path);
      else this.#expanded.add(path);
      return this.render({ parts: ['program'] });
    }
    if (lineAction === 'add-slot') return this.#mutateHandler((tree) => foundry.utils.setProperty(tree, slotPath, []));
    if (lineAction === 'remove-slot') return this.#mutateHandler((tree) => deleteAtPath(tree, slotPath));
    if (lineAction === 'delete-node') return this.#mutateHandler((tree) => deleteAtPath(tree, path));
    if (lineAction === 'move-up') return this.#mutateHandler((tree) => moveAtPath(tree, path, -1));
    if (lineAction === 'move-down') return this.#mutateHandler((tree) => moveAtPath(tree, path, 1));
    if (lineAction === 'toggle-enabled') {
      return this.#mutateHandler((tree) => {
        const node = getAtPath(tree, path);
        node.enabled = node.enabled === false;
      });
    }
    if (lineAction === 'dry-run') return this.#runDryRun();
    if (lineAction === 'delete-history') {
      const history = this.document.getFlag(MODULE.ID, 'history') ?? [];
      history.splice(Number(index), 1);
      return this.document.setFlag(MODULE.ID, 'history', history);
    }
    if (lineAction === 'delete-variable') {
      const variables = this.document.getFlag(MODULE.ID, 'variables') ?? [];
      variables.splice(Number(index), 1);
      return this.document.setFlag(MODULE.ID, 'variables', variables);
    }
    if (lineAction === 'add-variable') return this.#addVariable();
    if (lineAction === 'save-template') return this.#saveTemplate();
    if (lineAction === 'apply-template') {
      const uuid = this.element.querySelector('.glyph-template-select')?.value;
      if (!uuid) return;
      await applyTemplate(this.document, uuid);
      this.#pendingTrees.clear();
      return this.render({ parts: ['general', 'program'] });
    }
  }

  /** Add or overwrite a persistent variable from the Variables tab's input row, upserting by name. */
  async #addVariable() {
    const nameInput = this.element.querySelector('.glyph-variable-name');
    const valueInput = this.element.querySelector('.glyph-variable-value');
    const name = nameInput.value.trim();
    if (!name) return;
    let value;
    try {
      value = valueInput.value === '' ? '' : JSON.parse(valueInput.value);
    } catch {
      value = valueInput.value;
    }
    const variables = [...(this.document.getFlag(MODULE.ID, 'variables') ?? [])];
    const index = variables.findIndex((entry) => entry.name === name);
    const record = { name, value };
    if (index === -1) variables.push(record);
    else variables[index] = record;
    await this.document.setFlag(MODULE.ID, 'variables', variables);
    nameInput.value = '';
    valueInput.value = '';
  }

  /** Prompt for a name and save this behavior's configuration as a reusable template. */
  async #saveTemplate() {
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: _loc('GLYPH.TEMPLATES.save') },
      content: `<div class="form-group">
        <label>${_loc('GLYPH.TEMPLATES.nameLabel')}</label>
        <div class="form-fields"><input type="text" name="name" required></div>
      </div>`
    });
    if (!result?.name) return;
    await saveTemplate(this.document, result.name);
    this.render({ parts: ['general'] });
  }

  /** Run the selected handler's tree with every real action skipped, to preview its shape without touching game state. */
  async #runDryRun() {
    const handler = this.#selectedHandler;
    if (!handler) return;
    const behavior = this.document;
    const root = behavior.system.handlers[handler] ?? { type: 'sequence', children: [] };
    const source = { region: behavior.parent, scene: behavior.parent?.parent ?? null, event: { name: handler, data: {}, user: game.user } };
    const context = createRunContext(source, behavior);
    context.dryRun = true;
    context.trace = [];
    let error = null;
    try {
      await runNode(root, context);
    } catch (err) {
      error = err;
    }
    this.#showDryRunResults(context.trace, error);
  }

  /**
   * Show a dry run's trace: every node visited, in order, with its outcome.
   * @param {{type: string, ms?: number, error?: string}[]} trace Trace entries from the dry run.
   * @param {Error|null} error The error that halted the run, if any.
   */
  #showDryRunResults(trace, error) {
    const rows = trace.map((entry) => {
      const label = esc(_loc(getNodeType(entry.type)?.label ?? entry.type));
      if (entry.error) return `<li class="glyph-dry-run-error">${label}: ${esc(entry.error)}</li>`;
      const status = entry.ms !== undefined ? `${entry.ms}ms` : _loc('GLYPH.TREE.dryRunSkipped');
      return `<li>${label} — ${status}</li>`;
    });
    const content = `<ul class="glyph-dry-run-results">${rows.join('') || `<li>${_loc('GLYPH.TREE.dryRunEmpty')}</li>`}</ul>
      ${error ? `<p class="glyph-dry-run-error">${esc(error.message)}</p>` : ''}
      <p class="hint">${_loc('GLYPH.TREE.dryRunHint')}</p>`;
    foundry.applications.api.DialogV2.prompt({ window: { title: _loc('GLYPH.TREE.dryRun') }, content });
  }

  /**
   * Handle a field value commit anywhere in the Program tab.
   * @param {Event} event The change event.
   */
  async #onTreeChange(event) {
    const target = event.target;
    if (target.matches('.glyph-handler-select')) {
      event.stopPropagation();
      this.#selectedHandler = target.value;
      return this.render({ parts: ['program'] });
    }
    if (target.matches('.glyph-linked-tile')) {
      event.stopPropagation();
      const uuid = target.value || null;
      return this.document.update({ 'system.linkedTile': uuid ? { kind: 'uuid', value: uuid } : null });
    }
    if (target.matches('.glyph-ref-kind')) this.#syncReferenceKind(target);
    const { path, widget, numeric } = target.dataset;
    if (!path) return;
    event.stopPropagation();
    let value;
    if (target.tagName === 'SELECT' && target.multiple) value = [...target.selectedOptions].map((o) => o.value);
    else if (target.type === 'checkbox') value = target.checked;
    else value = target.value;
    if (widget === 'json') {
      try {
        value = value === '' ? '' : JSON.parse(value);
      } catch {
        /* keep the raw string when it isn't valid JSON */
      }
    } else if (numeric && Array.isArray(value)) value = value.map(Number);
    else if (target.type === 'number') value = Number(value);
    await this.#mutateHandler((tree) => {
      if (path.endsWith('.kind') || path.endsWith('.value')) {
        const parentPath = path.slice(0, path.lastIndexOf('.'));
        if (typeof foundry.utils.getProperty(tree, parentPath) !== 'object') foundry.utils.setProperty(tree, parentPath, { kind: 'uuid', value: '' });
      }
      foundry.utils.setProperty(tree, path, value);
    });
  }

  /**
   * Refresh a reference field's hint and value input the instant its kind changes.
   * @param {HTMLSelectElement} select The `.glyph-ref-kind` select that just changed.
   */
  #syncReferenceKind(select) {
    const wrap = select.closest('.glyph-reference');
    if (!wrap) return;
    const kind = select.value;
    const basePath = select.dataset.path.replace(/\.kind$/, '');
    const hint = select.closest('.glyph-node-field')?.querySelector('.hint');
    if (hint) hint.textContent = _loc(`GLYPH.REFERENCE_KIND_HINT.${kind}`);
    const replacement =
      kind === 'context'
        ? `<input type="text" data-path="${basePath}.value" data-field="value" value="" placeholder="variables.myVar">`
        : kind === 'uuid'
          ? `<document-tags data-path="${basePath}.value" data-field="value" type="${wrap.dataset.documentType ?? ''}" single value=""></document-tags>`
          : '';
    const valueField = wrap.querySelector('[data-field="value"]');
    if (valueField) valueField.outerHTML = replacement;
    else if (replacement) select.insertAdjacentHTML('afterend', replacement);
  }

  /**
   * Apply a mutation to the currently-selected handler's tree and force-replace it on the document.
   * @param {(tree: object) => void} mutator Mutates a cloned copy of the handler's tree in place.
   */
  async #mutateHandler(mutator) {
    const handler = this.#selectedHandler;
    if (!handler) return;
    const base = this.#pendingTrees.get(handler) ?? this.document.system.handlers[handler] ?? { type: 'sequence', children: [] };
    const tree = foundry.utils.deepClone(base);
    mutator(tree);
    if (!this.#isValidTree(handler, tree)) {
      this.#pendingTrees.set(handler, tree);
      return this.render({ parts: ['program'] });
    }
    try {
      await this.document.update({ [`system.handlers.${handler}`]: foundry.data.operators.ForcedReplacement.create(tree) });
      this.#pendingTrees.delete(handler);
    } catch {
      this.#pendingTrees.set(handler, tree);
      this.render({ parts: ['program'] });
    }
  }

  /**
   * Whether replacing `handler`'s tree with `tree` would pass this behavior type's own schema validation.
   * @param {string} handler The handler key being replaced.
   * @param {object} tree The candidate tree.
   * @returns {boolean} Whether the candidate is valid.
   */
  #isValidTree(handler, tree) {
    const current = this.document.system.toObject();
    const candidate = { ...current, handlers: { ...current.handlers, [handler]: tree } };
    try {
      new CONFIG.RegionBehavior.dataModels[this.document.type](candidate, { strict: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pair a `glyph.trigger` schema field with its explicit label/hint.
   * @param {foundry.data.fields.DataField} field The schema field.
   * @param {string} [prefix] The localization prefix.
   * @returns {{field: foundry.data.fields.DataField, label: string, hint: string}}
   */
  _labelField(field, prefix = 'BEHAVIOR.TYPES.trigger.FIELDS') {
    return { field, label: _loc(`${prefix}.${field.name}.label`), hint: _loc(`${prefix}.${field.name}.hint`) };
  }

  /**
   * Build the General tab's fieldset structure for `templates/generic/form-fields.hbs`.
   * @returns {object[]} Fieldset descriptors.
   */
  _getGeneralFields() {
    const doc = this.document;
    const source = doc._source;
    const behaviorFields = doc.schema.fields;
    const { events, handlers: _handlers, linkedTile: _linkedTile, ...configFields } = CONFIG.RegionBehavior.dataModels[doc.type].schema.fields;
    return [
      {
        fieldset: true,
        legend: 'BEHAVIOR.SECTIONS.identity',
        fields: [{ field: behaviorFields.name, value: source.name }]
      },
      {
        fieldset: true,
        legend: 'BEHAVIOR.SECTIONS.status',
        fields: [{ field: behaviorFields.disabled, value: source.disabled }]
      },
      {
        fieldset: true,
        legend: 'BEHAVIOR.TYPES.base.SECTIONS.events',
        fields: [{ ...this._labelField(events, 'BEHAVIOR.TYPES.base.FIELDS'), value: source.system.events }]
      },
      {
        fieldset: true,
        legend: CONFIG.RegionBehavior.typeLabels[doc.type],
        fields: Object.values(configFields).map((field) => ({ ...this._labelField(field), value: foundry.utils.getProperty(source, `system.${field.name}`) }))
      }
    ];
  }
}

/** Register `TriggerBehaviorConfig` as the sheet for `glyph.trigger` behaviors. */
export function registerTriggerSheet() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(RegionBehavior, MODULE.ID, TriggerBehaviorConfig, {
    types: [MODULE.BEHAVIOR_TYPE],
    makeDefault: true,
    label: 'BEHAVIOR.TYPES.trigger.label'
  });
}
