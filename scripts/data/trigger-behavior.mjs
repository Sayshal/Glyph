import { MODULE } from '../constants.mjs';
import { checkGates, isSuppressed, recordFailure } from '../gates.mjs';
import { runNode } from '../nodes/executor.mjs';
import { ProgramField, hasLanding } from '../nodes/program-field.mjs';
import '../nodes/types.mjs';
import { registerRenderIntent, sendRenderIntent } from '../queries.mjs';
import { activeRuns, createRunContext } from '../run-context.mjs';

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

/** @type {number} How many times one run may jump between handlers before it is treated as a loop. */
const MAX_GOTO_HOPS = 32;

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
    'dblrightclick',
    'tokenRotated',
    'tokenCreated',
    'combatStart',
    'combatEnd',
    'combatRound',
    'combatTurnStart',
    'combatTurnEnd',
    'canvasReady',
    'worldTimeChanged',
    'darknessChanged',
    'canvasDarknessChanged',
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
      userRestriction: new fields.StringField({
        required: true,
        initial: 'all',
        choices: {
          all: 'BEHAVIOR.TYPES.trigger.USER_RESTRICTION.all.label',
          player: 'BEHAVIOR.TYPES.trigger.USER_RESTRICTION.player.label',
          gm: 'BEHAVIOR.TYPES.trigger.USER_RESTRICTION.gm.label'
        }
      }),
      tokenRestriction: new fields.StringField({
        required: true,
        initial: 'all',
        choices: {
          all: 'BEHAVIOR.TYPES.trigger.TOKEN_RESTRICTION.all.label',
          player: 'BEHAVIOR.TYPES.trigger.TOKEN_RESTRICTION.player.label',
          gm: 'BEHAVIOR.TYPES.trigger.TOKEN_RESTRICTION.gm.label'
        }
      }),
      chance: new fields.NumberField({ required: true, nullable: false, initial: 100, min: 0, max: 100 }),
      minRequired: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
      cooldown: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      pertoken: new fields.BooleanField({ initial: false }),
      vision: new fields.BooleanField({ initial: false }),
      allowPaused: new fields.BooleanField({ initial: false }),
      traceAlpha: new fields.BooleanField({ initial: false }),
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
    if (source.restriction !== undefined) {
      source.userRestriction ??= source.restriction;
      delete source.restriction;
    }
    return super.migrateData(source);
  }

  /** @inheritDoc */
  async _handleRegionEvent(event) {
    await this.run(event);
  }

  /**
   * Run this behavior's handler for `event`, gating first.
   * @param {object} event A core RegionEvent or a pseudo-event.
   * @param {{startTag?: string, anyHandler?: boolean}} [options] `startTag` jumps straight to a landing instead of running from the top; `anyHandler` lets an on-demand caller fall back to the manual or sole handler when the event names none.
   * @returns {Promise<object|null>} The finished run's context, or null if it didn't run.
   */
  async run(event, options = {}) {
    const source = normalizeRunSource(event);
    if (isSuppressed(source.event)) return null;
    const handler = this.handlers[source.event.name] ?? (options.anyHandler ? this.#soleHandler() : null);
    if (!handler) {
      ATLAS.log(2, `Glyph: "${source.event.name}" fired on Region "${source.region.name}" with no handler configured.`);
      return null;
    }
    const uuid = this.parent.uuid;
    const tail = (runQueues.get(uuid) ?? Promise.resolve()).then(() => this.#runQueued(source, handler, options)).catch(() => null);
    runQueues.set(uuid, tail);
    const result = await tail;
    if (runQueues.get(uuid) === tail) runQueues.delete(uuid);
    return result;
  }

  /**
   * The handler an on-demand run falls back to when the event names none: the manual handler, the importer's on-demand copy, or the only one configured.
   * @returns {object|null} The handler tree, or null when the choice is ambiguous.
   */
  #soleHandler() {
    if (this.handlers.manual) return this.handlers.manual;
    if (this.handlers.onDemand) return this.handlers.onDemand;
    const keys = Object.keys(this.handlers);
    return keys.length === 1 ? this.handlers[keys[0]] : null;
  }

  /**
   * Gate and execute one already-queued trigger.
   * @param {RunSource} source The normalized run source.
   * @param {object} handler The handler tree to run.
   * @param {{startTag?: string}} options `startTag` jumps straight to a landing before the first child runs.
   * @returns {Promise<object|null>} The finished run's context, or null if it didn't run.
   */
  async #runQueued(source, handler, options) {
    if (!(await checkGates(this.parent, source.event))) return null;
    if (Hooks.call(MODULE.HOOKS.PRE_TRIGGER, this.parent, source.event) === false) return null;
    const context = createRunContext(source, this.parent);
    if (options.startTag) context.control.goto = options.startTag;
    activeRuns.set(this.parent.uuid, context);
    try {
      await runNode(handler, context);
      await this.#followCrossHandlerGoto(context);
    } catch (error) {
      ATLAS.log(1, `Glyph: Trigger "${source.event.name}" on Region "${source.region.name}" failed.`, error);
      await recordFailure(this.parent, source.event, error);
      await sendRenderIntent(source.event.user, 'triggerFailed', { region: source.region.name, error: error.message });
      return null;
    } finally {
      if (activeRuns.get(this.parent.uuid) === context) activeRuns.delete(this.parent.uuid);
    }
    Hooks.callAll(MODULE.HOOKS.TRIGGER, this.parent, source.event);
    return context;
  }

  /**
   * Follow a `goto` that fell off the end of its own handler into whichever sibling handler holds that landing.
   * @param {RunContext} context The active run context.
   */
  async #followCrossHandlerGoto(context) {
    for (let hop = 0; context.control.goto && !context.control.stopped; hop++) {
      const tag = context.control.goto;
      if (hop >= MAX_GOTO_HOPS) {
        ATLAS.log(2, `Glyph: Jumping to landing "${tag}" on Region "${this.parent.parent?.name}" did not settle within ${MAX_GOTO_HOPS} hops - stopping.`);
        return;
      }
      const target = Object.values(this.handlers).find((node) => hasLanding(node, tag));
      if (!target) return;
      await runNode(target, context);
      if (context.control.goto === tag) return;
    }
  }
}

/** Register `TriggerRegionBehaviorType` into CONFIG.RegionBehavior. */
export function registerTriggerBehavior() {
  CONFIG.RegionBehavior.dataModels[MODULE.BEHAVIOR_TYPE] = TriggerRegionBehaviorType;
  CONFIG.RegionBehavior.typeLabels[MODULE.BEHAVIOR_TYPE] = `TYPES.RegionBehavior.${MODULE.BEHAVIOR_TYPE}`;
  CONFIG.RegionBehavior.typeIcons[MODULE.BEHAVIOR_TYPE] = MODULE.ICON;
}
