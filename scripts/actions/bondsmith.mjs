import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** Bondsmith */
export function registerBondsmithActions() {
  if (!isModuleActive('bondsmith')) return;
  registerNodeType('bondsmithReputation', {
    category: 'token',
    label: 'GLYPH.ACTIONS.bondsmithReputation.label',
    hint: 'GLYPH.ACTIONS.bondsmithReputation.hint',
    fields: [
      { name: 'id', widget: 'text', label: 'GLYPH.ACTIONS.bondsmithReputation.FIELDS.id.label', hint: 'GLYPH.ACTIONS.bondsmithReputation.FIELDS.id.hint', required: true },
      {
        name: 'entityType',
        widget: 'select',
        label: 'GLYPH.ACTIONS.bondsmithReputation.FIELDS.entityType.label',
        required: true,
        choices: { actor: 'GLYPH.BONDSMITH_ENTITY.actor', faction: 'GLYPH.BONDSMITH_ENTITY.faction' }
      },
      { name: 'value', widget: 'number', label: 'GLYPH.ACTIONS.bondsmithReputation.FIELDS.value.label', hint: 'GLYPH.ACTIONS.bondsmithReputation.FIELDS.value.hint', required: true }
    ],
    validate(node) {
      if (typeof node.id !== 'string' || !node.id) throw new Error('bondsmithReputation.id must be a non-empty string.');
      if (typeof node.value !== 'number') throw new Error('bondsmithReputation.value must be a number.');
    },
    async execute(node) {
      await BONDSMITH.api.reputation.set(node.id, node.entityType, node.value);
    }
  });

  registerNodeType('bondsmithTrackActor', {
    category: 'token',
    label: 'GLYPH.ACTIONS.bondsmithTrackActor.label',
    hint: 'GLYPH.ACTIONS.bondsmithTrackActor.hint',
    fields: [{ name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.bondsmithTrackActor.FIELDS.actor.label', required: true }],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('bondsmithTrackActor.actor must be a reference object.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (actor) await BONDSMITH.api.actors.addTracked(actor.uuid);
    }
  });

  registerNodeType('bondsmithSetRelation', {
    category: 'token',
    label: 'GLYPH.ACTIONS.bondsmithSetRelation.label',
    hint: 'GLYPH.ACTIONS.bondsmithSetRelation.hint',
    fields: [
      { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.bondsmithSetRelation.FIELDS.actor.label', required: true },
      { name: 'factionId', widget: 'text', label: 'GLYPH.ACTIONS.bondsmithSetRelation.FIELDS.factionId.label', hint: 'GLYPH.ACTIONS.bondsmithSetRelation.FIELDS.factionId.hint', required: true },
      { name: 'value', widget: 'number', label: 'GLYPH.ACTIONS.bondsmithSetRelation.FIELDS.value.label', hint: 'GLYPH.ACTIONS.bondsmithSetRelation.FIELDS.value.hint', required: true }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('bondsmithSetRelation.actor must be a reference object.');
      if (typeof node.factionId !== 'string' || !node.factionId) throw new Error('bondsmithSetRelation.factionId must be a non-empty string.');
      if (typeof node.value !== 'number') throw new Error('bondsmithSetRelation.value must be a number.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (actor) await BONDSMITH.api.relations.setActorToFaction(actor.uuid, node.factionId, node.value);
    }
  });

  registerNodeType('bondsmithFactionMember', {
    category: 'token',
    label: 'GLYPH.ACTIONS.bondsmithFactionMember.label',
    hint: 'GLYPH.ACTIONS.bondsmithFactionMember.hint',
    fields: [
      { name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.bondsmithFactionMember.FIELDS.actor.label', required: true },
      { name: 'factionId', widget: 'text', label: 'GLYPH.ACTIONS.bondsmithFactionMember.FIELDS.factionId.label', hint: 'GLYPH.ACTIONS.bondsmithFactionMember.FIELDS.factionId.hint', required: true },
      {
        name: 'mode',
        widget: 'select',
        label: 'GLYPH.ACTIONS.bondsmithFactionMember.FIELDS.mode.label',
        required: true,
        choices: { join: 'GLYPH.FACTION_MEMBER_MODE.join', leave: 'GLYPH.FACTION_MEMBER_MODE.leave' }
      }
    ],
    validate(node) {
      if (typeof node.actor !== 'object') throw new Error('bondsmithFactionMember.actor must be a reference object.');
      if (typeof node.factionId !== 'string' || !node.factionId) throw new Error('bondsmithFactionMember.factionId must be a non-empty string.');
    },
    async execute(node, context) {
      const actor = resolveReference(node.actor, context);
      if (!actor) return;
      if (node.mode === 'leave') await BONDSMITH.api.factions.removeMember(node.factionId, actor.uuid);
      else await BONDSMITH.api.factions.addMember(node.factionId, actor.uuid);
    }
  });
}
