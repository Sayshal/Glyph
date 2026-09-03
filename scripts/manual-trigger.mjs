import { MODULE } from './constants.mjs';

/**
 * Run a `glyph.trigger` behavior's handler on demand, e.g. from a macro or a showDialog button.
 * @param {string} behaviorUuid UUID of the RegionBehavior to trigger.
 * @param {string} [handler] The handler key to run.
 * @returns {Promise<void>}
 */
export async function runTrigger(behaviorUuid, handler = 'manual') {
  const behavior = await fromUuid(behaviorUuid);
  if (!(behavior instanceof RegionBehavior) || behavior.type !== MODULE.BEHAVIOR_TYPE) throw new Error(`Glyph: "${behaviorUuid}" is not a glyph.trigger RegionBehavior.`);
  await behavior.system.run({ name: handler, data: {}, region: behavior.parent, user: game.user });
}
