/** @type {{kind: string, value: string}} A reference to the token that fired the event. */
export const TOKEN = { kind: 'triggerToken', value: '' };

/** @type {{kind: string, value: string}} A reference to the actor of the token that fired the event. */
export const ACTOR = { kind: 'triggerActor', value: '' };

/**
 * Wrap one or more program nodes in a `sequence`.
 * @param {...object} children Program nodes to run in order.
 * @returns {{type: string, children: object[]}} The sequence node.
 */
export const seq = (...children) => ({ type: 'sequence', children });

/**
 * Build a full `TriggerRegionBehaviorType` `system` blob.
 * @param {object} config
 * @param {string[]} [config.events] Core region event names this behavior subscribes to.
 * @param {string[]} [config.pseudoEvents] Pseudo-event names this behavior subscribes to.
 * @param {Record<string, object>} config.handlers `{<event name>: <program node>}`.
 * @returns {object} The `system` blob.
 */
export function buildTriggerSystem({ events = [], pseudoEvents = [], handlers }) {
  const wrapped = {};
  for (const [event, body] of Object.entries(handlers)) wrapped[event] = body.type === 'sequence' ? body : seq(body);
  return {
    events,
    pseudoEvents,
    userRestriction: 'all',
    tokenRestriction: 'all',
    chance: 100,
    minRequired: 1,
    cooldown: 0,
    pertoken: false,
    vision: false,
    allowPaused: false,
    traceAlpha: false,
    linkedTile: null,
    handlers: wrapped
  };
}
