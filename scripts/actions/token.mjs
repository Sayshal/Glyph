import { batchDelete, batchUpdate } from '../batch.mjs';
import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveNumber, setResult } from '../run-context.mjs';
import { resolveActorReference, resolvePoint, resolveReference } from '../targeting.mjs';

registerNodeType('moveToken', {
  category: 'token',
  label: 'GLYPH.ACTIONS.moveToken.label',
  hint: 'GLYPH.ACTIONS.moveToken.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.moveToken.FIELDS.token.label', required: true },
    { name: 'destination', widget: 'point', label: 'GLYPH.ACTIONS.moveToken.FIELDS.destination.label', hint: 'GLYPH.ACTIONS.FIELDS.worldPoint.hint', required: true },
    { name: 'snap', widget: 'boolean', label: 'GLYPH.ACTIONS.moveToken.FIELDS.snap.label', hint: 'GLYPH.ACTIONS.moveToken.FIELDS.snap.hint' }
  ],
  validate(node) {
    if (typeof node.token !== 'object' || typeof node.destination !== 'object') {
      throw new Error('moveToken.token and moveToken.destination must be objects.');
    }
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    const destination = resolvePoint(node.destination, context);
    if (!token || !destination) return;
    await token.move(node.snap ? token.getSnappedPosition(destination) : destination);
  }
});

/**
 * The rotation to write, adding a relative node's value to the document's own facing.
 * @param {object} node The `rotateToken` node.
 * @param {Document} document The resolved document.
 * @param {number} rotation The resolved rotation value.
 * @returns {number} The rotation, left for Foundry's AngleField to normalize.
 */
function rotationFor(node, document, rotation) {
  return node.relative ? (document.rotation ?? 0) + rotation : rotation;
}

/**
 * The update payload and options for one rotation. A duration reaches core's own animation for Tokens and glyph's `registerRotationAnimation` hook for every other placeable, which both need the pre-update facing.
 * @param {object} node The `rotateToken` node.
 * @param {Document} document The resolved document.
 * @param {number} rotation The resolved rotation value.
 * @returns {{changes: object, options: object|undefined}} The update payload, and the update options when the turn is timed.
 */
function rotationUpdate(node, document, rotation) {
  const changes = { rotation: rotationFor(node, document, rotation) };
  if (node.force && document.lockRotation) changes.lockRotation = false;
  const options = node.duration ? { animation: { duration: node.duration }, [MODULE.ID]: { rotateFrom: document.rotation ?? 0 } } : undefined;
  return { changes, options };
}

registerNodeType('rotateToken', {
  category: 'token',
  label: 'GLYPH.ACTIONS.rotateToken.label',
  hint: 'GLYPH.ACTIONS.rotateToken.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.token.label', required: true },
    { name: 'rotation', widget: 'number', min: -360, max: 360, label: 'GLYPH.ACTIONS.rotateToken.FIELDS.rotation.label', required: true },
    { name: 'rotationFormula', widget: 'formula', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.rotationFormula.label', hint: 'GLYPH.ACTIONS.rotateToken.FIELDS.rotationFormula.hint' },
    { name: 'relative', widget: 'boolean', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.relative.label', hint: 'GLYPH.ACTIONS.rotateToken.FIELDS.relative.hint' },
    { name: 'duration', widget: 'number', min: 0, step: 100, label: 'GLYPH.ACTIONS.rotateToken.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.rotateToken.FIELDS.duration.hint' },
    { name: 'force', widget: 'boolean', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.force.label' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('rotateToken.token must be a reference.');
    if (!node.rotationFormula && typeof node.rotation !== 'number') throw new Error('rotateToken.rotation must be a number, unless .rotationFormula is set.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (!token) return;
    const rotation = (await resolveNumber(node.rotationFormula, context)) ?? node.rotation;
    const { changes, options } = rotationUpdate(node, token, rotation);
    await token.update(changes, options);
  },
  async batchExecute(pairs) {
    await batchUpdate(
      await Promise.all(
        pairs.map(async ({ node, context }) => {
          const token = resolveReference(node.token, context);
          if (!token) return { doc: token, changes: {} };
          const rotation = (await resolveNumber(node.rotationFormula, context)) ?? node.rotation;
          return { doc: token, ...rotationUpdate(node, token, rotation) };
        })
      )
    );
  }
});

registerNodeType('createToken', {
  category: 'token',
  label: 'GLYPH.ACTIONS.createToken.label',
  hint: 'GLYPH.ACTIONS.createToken.hint',
  fields: [
    { name: 'actorUuid', widget: 'uuid', documentType: 'Actor', label: 'GLYPH.ACTIONS.createToken.FIELDS.actorUuid.label', required: true },
    {
      name: 'placement',
      widget: 'select',
      label: 'GLYPH.ACTIONS.createToken.FIELDS.placement.label',
      choices: { random: 'GLYPH.PLACEMENT.random', center: 'GLYPH.PLACEMENT.center', relative: 'GLYPH.PLACEMENT.relative' }
    },
    { name: 'snap', widget: 'boolean', label: 'GLYPH.ACTIONS.createToken.FIELDS.snap.label' }
  ],
  validate(node) {
    if (typeof node.actorUuid !== 'string' || !node.actorUuid) throw new Error('createToken.actorUuid must be a non-empty string.');
  },
  async execute(node, context) {
    const actor = await fromUuid(node.actorUuid);
    const region = context.info.region;
    if (!actor || !region) return;
    const tokenDoc = await actor.getTokenDocument({}, { parent: region.parent });
    await region.spawnTokens([tokenDoc], { placement: node.placement ?? 'random', snap: node.snap ?? true });
  }
});

/**
 * The value to write, resolving Add/Remove against the property's own current value - entries for a list, arithmetic for a number.
 * @param {object} node The `alter` node.
 * @param {Document} document The resolved document.
 * @param {*} value The resolved value.
 * @returns {*} The value to write.
 */
function alterValue(node, document, value) {
  const mode = node.mode ?? 'set';
  if (mode === 'set') return value;
  const current = foundry.utils.getProperty(document, node.path);
  if (current instanceof Set || Array.isArray(current)) {
    const entries = Array.isArray(value) ? value : [value];
    const kept = [...current].filter((entry) => !entries.includes(entry));
    return mode === 'remove' ? kept : [...kept, ...entries];
  }
  const delta = Number(value) || 0;
  return (Number(current) || 0) + (mode === 'remove' ? -delta : delta);
}

registerNodeType('alter', {
  category: 'token',
  label: 'GLYPH.ACTIONS.alter.label',
  hint: 'GLYPH.ACTIONS.alter.hint',
  fields: [
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.alter.FIELDS.target.label', required: true },
    { name: 'path', widget: 'text', label: 'GLYPH.ACTIONS.alter.FIELDS.path.label', hint: 'GLYPH.ACTIONS.alter.FIELDS.path.hint', required: true },
    { name: 'value', widget: 'json', label: 'GLYPH.ACTIONS.alter.FIELDS.value.label', hint: 'GLYPH.ACTIONS.alter.FIELDS.value.hint' },
    { name: 'valueFormula', widget: 'formula', label: 'GLYPH.ACTIONS.alter.FIELDS.valueFormula.label', hint: 'GLYPH.ACTIONS.alter.FIELDS.valueFormula.hint' },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.alter.FIELDS.mode.label',
      hint: 'GLYPH.ACTIONS.alter.FIELDS.mode.hint',
      choices: { set: 'GLYPH.ALTER_MODE.set', add: 'GLYPH.ALTER_MODE.add', remove: 'GLYPH.ALTER_MODE.remove' }
    }
  ],
  validate(node) {
    if (typeof node.path !== 'string' || !node.path) throw new Error('alter.path must be a non-empty string.');
    if (node.mode && node.mode !== 'set' && node.value === undefined && !node.valueFormula) throw new Error('alter.value is required when the mode is Add or Remove.');
  },
  async execute(node, context) {
    const document = resolveReference(node.target, context);
    if (!document) throw new Error(`alter: target reference did not resolve.`);
    const value = (await resolveNumber(node.valueFormula, context)) ?? node.value;
    await document.update({ [node.path]: alterValue(node, document, value) });
  },
  async batchExecute(pairs) {
    await batchUpdate(
      await Promise.all(
        pairs.map(async ({ node, context }) => {
          const doc = resolveReference(node.target, context);
          const value = (await resolveNumber(node.valueFormula, context)) ?? node.value;
          return { doc, changes: doc ? { [node.path]: alterValue(node, doc, value) } : {} };
        })
      )
    );
  }
});

registerNodeType('deleteEntity', {
  category: 'token',
  label: 'GLYPH.ACTIONS.deleteEntity.label',
  hint: 'GLYPH.ACTIONS.deleteEntity.hint',
  fields: [{ name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.deleteEntity.FIELDS.target.label', required: true }],
  validate(node) {
    if (typeof node.target !== 'object') throw new Error('deleteEntity.target must be a reference object.');
  },
  async execute(node, context) {
    const document = resolveReference(node.target, context);
    if (document) await document.delete();
  },
  async batchExecute(pairs) {
    await batchDelete(pairs.map(({ node, context }) => resolveReference(node.target, context)));
  }
});

/**
 * A stopped token's position stepped a third of a grid space toward `destination`, then snapped.
 * @param {TokenDocument} token The token that just stopped.
 * @param {Point} destination The destination it was moving toward.
 * @returns {Point}
 */
function snappedShortOf(token, destination) {
  const from = { x: token.x, y: token.y };
  const stepped = from.x === destination.x && from.y === destination.y ? from : foundry.canvas.geometry.Ray.towardsPoint(from, destination, canvas.grid.size / 3).B;
  return token.getSnappedPosition(stepped);
}

registerNodeType('stopTokenMovement', {
  category: 'token',
  label: 'GLYPH.ACTIONS.stopTokenMovement.label',
  hint: 'GLYPH.ACTIONS.stopTokenMovement.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.stopTokenMovement.FIELDS.token.label', required: true },
    { name: 'snap', widget: 'boolean', label: 'GLYPH.ACTIONS.stopTokenMovement.FIELDS.snap.label', hint: 'GLYPH.ACTIONS.stopTokenMovement.FIELDS.snap.hint' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('stopTokenMovement.token must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (!token) return;
    const destination = node.snap ? token.movement.destination : null;
    await token.stopMovement();
    if (destination) await token.update(snappedShortOf(token, destination));
  }
});

registerNodeType('addItem', {
  category: 'token',
  label: 'GLYPH.ACTIONS.addItem.label',
  hint: 'GLYPH.ACTIONS.addItem.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.addItem.FIELDS.actor.label', required: true },
    { name: 'itemUuid', widget: 'uuid', documentType: 'Item', label: 'GLYPH.ACTIONS.addItem.FIELDS.itemUuid.label', required: true }
  ],
  validate(node) {
    if (typeof node.itemUuid !== 'string' || !node.itemUuid) throw new Error('addItem.itemUuid must be a non-empty string.');
  },
  async execute(node, context) {
    const actor = resolveActorReference(node.actor, context);
    const item = await fromUuid(node.itemUuid);
    if (actor && item) await actor.createEmbeddedDocuments('Item', [item.toObject()]);
  },
  async batchExecute(pairs) {
    await Promise.all(pairs.map(({ node, context }) => this.execute(node, context)));
  }
});

registerNodeType('removeItem', {
  category: 'token',
  label: 'GLYPH.ACTIONS.removeItem.label',
  hint: 'GLYPH.ACTIONS.removeItem.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.removeItem.FIELDS.actor.label', required: true },
    { name: 'itemName', widget: 'text', label: 'GLYPH.ACTIONS.removeItem.FIELDS.itemName.label', hint: 'GLYPH.ACTIONS.removeItem.FIELDS.itemName.hint', required: true }
  ],
  validate(node) {
    if (typeof node.itemName !== 'string' || !node.itemName) throw new Error('removeItem.itemName must be a non-empty string.');
  },
  async execute(node, context) {
    const actor = resolveActorReference(node.actor, context);
    const item = actor?.items.find((i) => i.name === node.itemName);
    if (item) await item.delete();
  },
  async batchExecute(pairs) {
    await Promise.all(pairs.map(({ node, context }) => this.execute(node, context)));
  }
});

/**
 * Resolve a `toggleCondition` node's mode, honouring the legacy `clearAll`/`active` booleans.
 * @param {object} node A `toggleCondition` node.
 * @returns {string} One of "add", "remove", "toggle", "clear".
 */
function conditionMode(node) {
  if (node.mode) return node.mode;
  if (node.clearAll) return 'clear';
  return node.active === undefined ? 'toggle' : node.active ? 'add' : 'remove';
}

registerNodeType('toggleCondition', {
  category: 'token',
  label: 'GLYPH.ACTIONS.toggleCondition.label',
  hint: 'GLYPH.ACTIONS.toggleCondition.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.actor.label', required: true },
    { name: 'statusId', widget: 'statusEffect', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.statusId.label' },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.mode.label',
      hint: 'GLYPH.ACTIONS.toggleCondition.FIELDS.mode.hint',
      choices: {
        add: 'GLYPH.CONDITION_MODE.add',
        remove: 'GLYPH.CONDITION_MODE.remove',
        toggle: 'GLYPH.CONDITION_MODE.toggle',
        clear: 'GLYPH.CONDITION_MODE.clear'
      }
    }
  ],
  validate(node) {
    if (conditionMode(node) !== 'clear' && (typeof node.statusId !== 'string' || !node.statusId)) {
      throw new Error('toggleCondition.statusId must be a non-empty string unless the mode is "clear".');
    }
  },
  async execute(node, context) {
    const actor = resolveActorReference(node.actor, context);
    if (!actor) return;
    const mode = conditionMode(node);
    if (mode === 'clear') {
      const ids = actor.effects.filter((e) => e.statuses.size > 0).map((e) => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      return;
    }
    await actor.toggleStatusEffect(node.statusId, { active: mode === 'toggle' ? undefined : mode === 'add' });
  },
  async batchExecute(pairs) {
    await Promise.all(pairs.map(({ node, context }) => this.execute(node, context)));
  }
});

registerNodeType('rollTable', {
  category: 'token',
  label: 'GLYPH.ACTIONS.rollTable.label',
  hint: 'GLYPH.ACTIONS.rollTable.hint',
  fields: [
    { name: 'tableUuid', widget: 'uuid', documentType: 'RollTable', label: 'GLYPH.ACTIONS.rollTable.FIELDS.tableUuid.label', required: true },
    { name: 'displayChat', widget: 'boolean', label: 'GLYPH.ACTIONS.rollTable.FIELDS.displayChat.label' },
    { name: 'resultVariable', widget: 'text', label: 'GLYPH.ACTIONS.rollTable.FIELDS.resultVariable.label', hint: 'GLYPH.ACTIONS.rollTable.FIELDS.resultVariable.hint' }
  ],
  validate(node) {
    if (typeof node.tableUuid !== 'string' || !node.tableUuid) throw new Error('rollTable.tableUuid must be a non-empty string.');
  },
  async execute(node, context) {
    const table = await fromUuid(node.tableUuid);
    if (!(table instanceof RollTable)) return;
    const { results } = await table.draw({ displayChat: node.displayChat ?? true });
    setResult(context, results, 'results');
    if (node.resultVariable) context.variables[node.resultVariable] = results;
  }
});

registerNodeType('targetTokens', {
  category: 'token',
  label: 'GLYPH.ACTIONS.targetTokens.label',
  hint: 'GLYPH.ACTIONS.targetTokens.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.targetTokens.FIELDS.token.label', required: true },
    { name: 'targeted', widget: 'boolean', label: 'GLYPH.ACTIONS.targetTokens.FIELDS.targeted.label' },
    { name: 'releaseOthers', widget: 'boolean', label: 'GLYPH.ACTIONS.targetTokens.FIELDS.releaseOthers.label' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('targetTokens.token must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (!token?.rendered) return;
    token.object.setTarget(node.targeted ?? true, { releaseOthers: node.releaseOthers ?? false });
  }
});
