/**
 * @typedef {object} ModeMapping
 * @property {string[]} [events] Core `RegionEvent` names this mode maps to.
 * @property {string[]} [pseudoEvents] Glyph pseudo-event names this mode maps to.
 * @property {string} [note] Present when the mapping is approximate, not exact.
 * @property {boolean} [manual] True when this mode has no usable glyph equivalent at all.
 */

/** @type {Record<string, ModeMapping>} */
export const MODE_MAP = {
  enter: { events: ['tokenEnter'] },
  create: { events: ['tokenEnter'], note: 'Core already fires tokenEnter for a token created inside the Region, folding MATT\'s separate "create" mode in.' },
  exit: { events: ['tokenExit'] },
  movement: {
    events: ['tokenMoveWithin'],
    note: 'Closest core equivalent; MATT\'s "movement" also fires on a segment merely crossing the tile, which tokenMoveWithin does not distinguish from ending inside it.'
  },
  stop: {
    manual: true,
    note: 'MATT fires when movement *ends* inside the tile - no core Region event distinguishes "ended here" from "passing through" (tokenMoveWithin/tokenEnter are the closest, already mapped to other modes).'
  },
  elevation: { events: ['tokenMoveWithin'], note: "Core folds elevation changes into its general move events; there is no elevation-specific Region event to isolate MATT's narrower case." },
  rotation: { manual: true, note: 'Token rotation does not trigger any core Region event.' },
  click: { pseudoEvents: ['click'] },
  rightclick: { pseudoEvents: ['rightclick'] },
  dblclick: { pseudoEvents: ['dblclick'] },
  dblrightclick: { manual: true, note: 'Glyph has no double-right-click pseudo-event.' },
  hoverin: { pseudoEvents: ['hoverIn'] },
  hoverout: { pseudoEvents: ['hoverOut'] },
  combatstart: { manual: true, note: 'Global combat-lifecycle event, not scoped to a Region; glyph only exposes per-token round/turn events.' },
  combatend: { manual: true, note: 'Same as combatstart.' },
  round: { events: ['tokenRoundStart'] },
  turn: { events: ['tokenTurnStart'] },
  turnend: { events: ['tokenTurnEnd'] },
  ready: { manual: true, note: 'Fires once per client on canvas load; glyph has no equivalent (a Region trigger only runs off a real event).' },
  manual: { manual: true, note: "MATT's tile-HUD power button. Use glyph's manual trigger API instead of an event handler." },
  door: {
    pseudoEvents: ['doorOpened', 'doorClosed', 'doorLocked', 'doorUnlocked'],
    note: 'MATT\'s single "door" mode does not distinguish open/close/lock/unlock; all four glyph pseudo-events are wired to the same converted handler.'
  },
  darkness: { pseudoEvents: ['darknessChanged'] },
  lighting: {
    pseudoEvents: ['darknessChanged'],
    note: 'MATT distinguishes the raw scene darkness setting ("darkness") from the computed canvas value ("lighting"); glyph exposes only one darknessChanged pseudo-event.'
  },
  time: { pseudoEvents: ['worldTimeChanged'] },
  region: {
    manual: true,
    note: "MATT's own Region-Behavior integration mode (used when a Region already drives the tile) - the tile is already effectively glyph-shaped; review by hand rather than converting."
  },
  trigger: {
    manual: true,
    note: "Invoked externally via MATT's triggerTile(uuid) API/@Tile[] link, bypassing this tile's own When list - not a mode to convert on its own; see the `triggertile` action-map entry."
  }
};
