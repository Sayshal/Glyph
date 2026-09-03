import { MODULE } from '../constants.mjs';
import { checkGates, recordFailure } from '../gates.mjs';
import { runNode } from '../nodes/executor.mjs';
import { ProgramField } from '../nodes/program-field.mjs';
import '../nodes/types.mjs';
import { registerRenderIntent, sendRenderIntent } from '../queries.mjs';
import { createRunContext } from '../run-context.mjs';

registerRenderIntent('triggerFailed', ({ region, error }) => ui.notifications.error('GLYPH.NOTIFICATIONS.TriggerFailed', { format: { region, error } }));

/**
 * Glyph's canonical run source.
 * @typedef {object} RunSource
 * @property {RegionDocument} region The Region the trigger fired on.
 * @property {Scene} scene The Scene containing that Region.
 * @property {object} event The triggering event.
 * @property {string} event.name The `CONST.REGION_EVENTS` name.
 * @property {object} event.data Event-specific payload.
 * @property {User} event.user The User that triggered the event.
 */

/**
 * Normalize a core RegionEvent into a RunSource.
 * @param {object} regionEvent A core RegionEvent.
 * @returns {RunSource} The normalized run source.
 */
function normalizeRunSource({ name, data, region, user }) {
  return { region, scene: region.parent, event: { name, data, user } };
}

/** @type {Map<string, Promise>} Per-behavior promise chain tail, so overlapping triggers on the same behavior queue and run in order (rather than one silently dropping) - keeps a `wait` node from overlapping a second trigger too. */
const runQueues = new Map();

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
      linkedTile: new fields.SchemaField(
        {
          kind: new fields.StringField({ required: true, blank: false, choices: ['uuid', 'tag', 'context'] }),
          value: new fields.StringField({ required: true, blank: false }),
          scope: new fields.StringField({ required: false, blank: true })
        },
        { required: false, nullable: true, initial: null }
      ),
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
   * @returns {Promise<import('../run-context.mjs').RunContext|null>} The finished run's context, or null if it didn't run.
   */
  async run(event) {
    const source = normalizeRunSource(event);
    const handler = this.handlers[source.event.name];
    if (!handler) {
      ATLAS.log(2, `Glyph: "${source.event.name}" fired on Region "${source.region.name}" with no handler configured.`);
      return null;
    }
    const uuid = this.parent.uuid;
    const tail = (runQueues.get(uuid) ?? Promise.resolve()).then(() => this.#runQueued(source, handler)).catch(() => null);
    runQueues.set(uuid, tail);
    const result = await tail;
    if (runQueues.get(uuid) === tail) runQueues.delete(uuid);
    return result;
  }

  /**
   * Gate and execute one already-queued trigger.
   * @param {RunSource} source The normalized run source.
   * @param {object} handler The handler tree to run.
   * @returns {Promise<import('../run-context.mjs').RunContext|null>} The finished run's context, or null if it didn't run.
   */
  async #runQueued(source, handler) {
    if (!(await checkGates(this.parent, source.event))) return null;
    if (Hooks.call(MODULE.HOOKS.PRE_TRIGGER, this.parent, source.event) === false) return null;
    const context = createRunContext(source, this.parent);
    try {
      await runNode(handler, context);
    } catch (error) {
      ATLAS.log(1, `Glyph: Trigger "${source.event.name}" on Region "${source.region.name}" failed.`, error);
      await recordFailure(this.parent, source.event, error);
      await sendRenderIntent(source.event.user, 'triggerFailed', { region: source.region.name, error: error.message });
      return null;
    }
    Hooks.callAll(MODULE.HOOKS.TRIGGER, this.parent, source.event);
    return context;
  }
}

/** Register `TriggerRegionBehaviorType` into CONFIG.RegionBehavior. */
export function registerTriggerBehavior() {
  CONFIG.RegionBehavior.dataModels[MODULE.BEHAVIOR_TYPE] = TriggerRegionBehaviorType;
  CONFIG.RegionBehavior.typeLabels[MODULE.BEHAVIOR_TYPE] = `TYPES.RegionBehavior.${MODULE.BEHAVIOR_TYPE}`;
  CONFIG.RegionBehavior.typeIcons[MODULE.BEHAVIOR_TYPE] = MODULE.ICON;
}
