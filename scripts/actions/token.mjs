import { registerNodeType } from '../nodes/registry.mjs';
import { resolveActorReference, resolveReference } from '../targeting.mjs';

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
    if (!token) return;
    await token.move(node.snap ? token.getSnappedPosition(node.destination) : node.destination);
  }
});

registerNodeType('rotateToken', {
  category: 'token',
  label: 'GLYPH.ACTIONS.rotateToken.label',
  hint: 'GLYPH.ACTIONS.rotateToken.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.token.label', required: true },
    { name: 'rotation', widget: 'number', min: 0, max: 360, label: 'GLYPH.ACTIONS.rotateToken.FIELDS.rotation.label', required: true },
    { name: 'force', widget: 'boolean', label: 'GLYPH.ACTIONS.rotateToken.FIELDS.force.label' }
  ],
  validate(node) {
    if (typeof node.token !== 'object' || typeof node.rotation !== 'number') {
      throw new Error('rotateToken.token must be a reference and .rotation a number.');
    }
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (!token) return;
    const updates = { rotation: node.rotation };
    if (node.force && token.lockRotation) updates.lockRotation = false;
    await token.update(updates);
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

registerNodeType('alter', {
  category: 'token',
  label: 'GLYPH.ACTIONS.alter.label',
  hint: 'GLYPH.ACTIONS.alter.hint',
  fields: [
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.alter.FIELDS.target.label', required: true },
    { name: 'path', widget: 'text', label: 'GLYPH.ACTIONS.alter.FIELDS.path.label', hint: 'GLYPH.ACTIONS.alter.FIELDS.path.hint', required: true },
    { name: 'value', widget: 'json', label: 'GLYPH.ACTIONS.alter.FIELDS.value.label', hint: 'GLYPH.ACTIONS.alter.FIELDS.value.hint' }
  ],
  validate(node) {
    if (typeof node.path !== 'string' || !node.path) throw new Error('alter.path must be a non-empty string.');
  },
  async execute(node, context) {
    const document = resolveReference(node.target, context);
    if (!document) throw new Error(`alter: target reference did not resolve.`);
    await document.update({ [node.path]: node.value });
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
  }
});

registerNodeType('stopTokenMovement', {
  category: 'token',
  label: 'GLYPH.ACTIONS.stopTokenMovement.label',
  hint: 'GLYPH.ACTIONS.stopTokenMovement.hint',
  fields: [{ name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.stopTokenMovement.FIELDS.token.label', required: true }],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('stopTokenMovement.token must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (token) await token.stopMovement();
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
  }
});

registerNodeType('toggleCondition', {
  category: 'token',
  label: 'GLYPH.ACTIONS.toggleCondition.label',
  hint: 'GLYPH.ACTIONS.toggleCondition.hint',
  fields: [
    { name: 'actor', widget: 'reference', documentType: 'Actor', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.actor.label', required: true },
    { name: 'statusId', widget: 'statusEffect', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.statusId.label' },
    { name: 'active', widget: 'boolean', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.active.label' },
    { name: 'clearAll', widget: 'boolean', label: 'GLYPH.ACTIONS.toggleCondition.FIELDS.clearAll.label', hint: 'GLYPH.ACTIONS.toggleCondition.FIELDS.clearAll.hint' }
  ],
  validate(node) {
    if (!node.clearAll && (typeof node.statusId !== 'string' || !node.statusId)) throw new Error('toggleCondition.statusId must be a non-empty string unless clearAll is set.');
  },
  async execute(node, context) {
    const actor = resolveActorReference(node.actor, context);
    if (!actor) return;
    if (node.clearAll) {
      const ids = actor.effects.filter((e) => e.statuses.size > 0).map((e) => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      return;
    }
    await actor.toggleStatusEffect(node.statusId, { active: node.active });
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
    context.previous = results;
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
