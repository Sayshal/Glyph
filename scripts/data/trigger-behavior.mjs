import { MODULE } from '../constants.mjs';
import { checkGates, recordFailure } from '../gates.mjs';
import { runNode } from '../nodes/executor.mjs';
import { ProgramField } from '../nodes/program-field.mjs';
import '../nodes/types.mjs';
import { registerRenderIntent, sendRenderIntent } from '../render-intent.mjs';
import { createRunContext } from '../run-context.mjs';
import { normalizeRunSource } from '../run-source.mjs';
import { createReferenceField } from './reference-field.mjs';

registerRenderIntent('triggerFailed', ({ region, error }) => ui.notifications.error('GLYPH.NOTIFICATIONS.TriggerFailed', { format: { region, error } }));

/** @type {Set<string>} Behavior UUIDs with a run currently in flight, so a `wait` node holding one open can't overlap with a second trigger on the same behavior. */
const activeRuns = new Set();

/** The RegionBehaviorType glyph registers as `glyph.trigger`. */
export class TriggerRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  /** @type {string[]} Event names outside `CONST.REGION_EVENTS`, dispatched by scripts/pseudo-events.mjs. */
  static PSEUDO_EVENTS = [
    'hoverIn',
    'hoverOut',
    'click',
    'rightclick',
    'dblclick',
    'worldTimeChanged',
    'darknessChanged',
    'doorOpened',
    'doorClosed',
    'doorLocked',
    'doorUnlocked',
    'doorRevealed',
    'seasonChange',
    'weatherChange',
    'dayChange',
    'moonPhaseChange',
    'restDayChange',
    'calendarEvent',
    'characterCreated'
  ];

  /** @inheritDoc */
  static LOCALIZATION_PREFIXES = ['BEHAVIOR.TYPES.trigger', 'BEHAVIOR.TYPES.base'];

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      events: this._createEventsField(),
      pseudoEvents: new fields.SetField(
        new fields.StringField({
          required: true,
          choices: Object.fromEntries(this.PSEUDO_EVENTS.map((e) => [e, `BEHAVIOR.TYPES.trigger.PSEUDO_EVENTS.${e}.label`]))
        })
      ),
      restriction: new fields.StringField({
        required: true,
        initial: 'all',
        choices: {
          all: 'BEHAVIOR.TYPES.trigger.RESTRICTION.all.label',
          player: 'BEHAVIOR.TYPES.trigger.RESTRICTION.player.label',
          gm: 'BEHAVIOR.TYPES.trigger.RESTRICTION.gm.label'
        }
      }),
      chance: new fields.NumberField({ required: true, nullable: false, initial: 100, min: 0, max: 100 }),
      minRequired: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
      cooldown: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      pertoken: new fields.BooleanField({ initial: false }),
      vision: new fields.BooleanField({ initial: false }),
      allowPaused: new fields.BooleanField({ initial: false }),
      linkedTile: createReferenceField({ required: false, nullable: true, initial: null }),
      handlers: new ProgramField({ required: true, initial: {} })
    };
  }

  /** @inheritDoc */
  static migrateData(source) {
    return super.migrateData(source);
  }

  /** @inheritDoc */
  async _handleRegionEvent(event) {
    await this.run(event);
  }

  /**
   * Run this behavior's handler for `event`, gating first.
   * @param {object} event A core RegionEvent or a pseudo-event.
   * @returns {Promise<void>}
   */
  async run(event) {
    const source = normalizeRunSource(event);
    const handler = this.handlers[source.event.name];
    if (!handler) {
      ATLAS.log(2, `Glyph: "${source.event.name}" fired on Region "${source.region.name}" with no handler configured.`);
      return;
    }
    if (!(await checkGates(this.parent, source.event))) return;
    if (Hooks.call(MODULE.HOOKS.PRE_TRIGGER, this.parent, source.event) === false) return;
    const uuid = this.parent.uuid;
    if (activeRuns.has(uuid)) {
      ATLAS.log(3, `Glyph: "${source.event.name}" on Region "${source.region.name}" skipped - a run is already in progress.`);
      return;
    }
    activeRuns.add(uuid);
    try {
      await runNode(handler, createRunContext(source, this.parent));
    } catch (error) {
      ATLAS.log(1, `Glyph: Trigger "${source.event.name}" on Region "${source.region.name}" failed.`, error);
      await recordFailure(this.parent, source.event, error);
      await sendRenderIntent(source.event.user, 'triggerFailed', { region: source.region.name, error: error.message });
      return;
    } finally {
      activeRuns.delete(uuid);
    }
    Hooks.callAll(MODULE.HOOKS.TRIGGER, this.parent, source.event);
  }
}

/** Register `TriggerRegionBehaviorType` into CONFIG.RegionBehavior. */
export function registerTriggerBehavior() {
  CONFIG.RegionBehavior.dataModels[MODULE.BEHAVIOR_TYPE] = TriggerRegionBehaviorType;
  CONFIG.RegionBehavior.typeLabels[MODULE.BEHAVIOR_TYPE] = `TYPES.RegionBehavior.${MODULE.BEHAVIOR_TYPE}`;
  CONFIG.RegionBehavior.typeIcons[MODULE.BEHAVIOR_TYPE] = MODULE.ICON;
}
