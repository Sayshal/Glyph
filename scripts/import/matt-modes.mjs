/**
 * @typedef {object} ModeMapping
 * @property {string[]} [events] Core `RegionEvent` names this mode maps to.
 * @property {string[]} [pseudoEvents] Glyph pseudo-event names this mode maps to.
 * @property {string} [note] Present when the mapping is approximate, not exact.
 * @property {boolean} [manual] True when no handler should be wired for this mode. Any `events`/`pseudoEvents` still name what a `method` filter on it should test.
 * @property {string} [gate] A condition expression the wired handler is wrapped in, for a mode narrower than the core event it maps to.
 * @property {string} [handler] A handler key the chain is written to instead of an event handler, for a mode fired on demand rather than by an event.
 */

/** @type {Record<string, ModeMapping>} */
export const MODE_MAP = {
  enter: { events: ['tokenEnter'] },
  create: { pseudoEvents: ['tokenCreated'] },
  exit: { events: ['tokenExit'] },
  both: { events: ['tokenEnter', 'tokenExit'] },
  movement: {
    events: ['tokenMoveWithin'],
    note: 'MATT fires when a token that was already inside the tile changes x/y, which is what tokenMoveWithin covers; tokenMoveWithin also covers a move that only changes elevation.'
  },
  stop: {
    events: ['tokenMoveIn', 'tokenMoveWithin'],
    gate: 'movementEnded()',
    note: 'MATT fires only when movement *ends* inside the tile, which no core Region event distinguishes on its own, so the handler is gated on movementEnded(). MATT also drops the trigger when the path crosses the tile boundary more than once; glyph does not.'
  },
  elevation: { events: ['tokenMoveWithin'], gate: 'elevationChanged()' },
  rotation: { pseudoEvents: ['tokenRotated'] },
  click: { pseudoEvents: ['click'] },
  rightclick: { pseudoEvents: ['rightclick'] },
  dblclick: { pseudoEvents: ['dblclick'] },
  dblrightclick: { pseudoEvents: ['dblrightclick'] },
  hoverin: { pseudoEvents: ['hoverIn'] },
  hoverout: { pseudoEvents: ['hoverOut'] },
  hover: { pseudoEvents: ['hoverIn', 'hoverOut'] },
  combatstart: {
    pseudoEvents: ['combatStart'],
    note: 'MATT hands the trigger every combatant as its token list and fires once per connected GM; glyph fires the Region once, with no triggering token, so a converted chain that acted on the token needs a collection to work over.'
  },
  combatend: {
    pseudoEvents: ['combatEnd'],
    note: 'Same as combatstart.'
  },
  round: { pseudoEvents: ['combatRound'] },
  turn: {
    pseudoEvents: ['combatTurnStart'],
    note: 'MATT fires at most one of round/turn/combatstart per combat update, round first, so a tile set to both round and turn ran only its round pass; glyph fires each subscribed event.'
  },
  turnend: { pseudoEvents: ['combatTurnEnd'] },
  ready: {
    pseudoEvents: ['canvasReady'],
    note: 'MATT runs this on every client that loads the scene; glyph runs it once, when the primary GM loads it, so a converted chain that did per-client work has to target an audience explicitly.'
  },
  manual: {
    manual: true,
    pseudoEvents: ['manual'],
    handler: 'manual',
    note: 'MATT\'s tile-HUD power button. The chain is written to the "manual" handler, fired by the Tile HUD power button or by GLYPH.runTrigger(behaviorUuid).'
  },
  door: {
    pseudoEvents: ['doorOpened', 'doorClosed', 'doorLocked', 'doorUnlocked'],
    note: 'MATT opts into the door trigger per wall, each wall naming its tile and enabling its own transitions; no wall on this scene named this Tile, so all four glyph pseudo-events are wired to the same converted handler. Glyph also fires on a programmatic door change, where MATT only fires on a click of the door control.'
  },
  darkness: { pseudoEvents: ['darknessChanged'] },
  lighting: { pseudoEvents: ['canvasDarknessChanged'] },
  time: { pseudoEvents: ['worldTimeChanged'] },
  region: {
    manual: true,
    note: 'MATT\'s own Region-Behavior integration mode, emitted at run time rather than chosen in the When list. The events of any MATT triggerTile behavior naming this Tile are carried onto the converted Region, but a method test against "region" itself cannot be reproduced.'
  },
  trigger: {
    manual: true,
    note: 'Invoked externally via MATT\'s triggerTile(uuid) API/@Tile[] link, bypassing this tile\'s own When list - not a mode to convert on its own. Every converted tile keeps an ungated "onDemand" handler a trigger node, an @Trigger link or GLYPH.runTrigger runs; see the `trigger` action-map entry.'
  }
};
