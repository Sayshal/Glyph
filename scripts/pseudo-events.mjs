import { MODULE } from './constants.mjs';
import { query, registerQuery } from './queries.mjs';

/**
 * Dispatch a pseudo-event to every subscribed, non-disabled trigger behavior in `regions`.
 * @param {Iterable<RegionDocument>} regions Candidate regions to check.
 * @param {string} name The pseudo-event name.
 * @param {object} [data] Event-specific payload.
 * @param {User} [user] The user that triggered the event. Defaults to the local user.
 */
export function dispatchPseudoEvent(regions, name, data = {}, user = game.user) {
  for (const region of regions) {
    if (region.hidden) continue;
    for (const behavior of region.behaviors) {
      if (behavior.disabled || behavior.type !== MODULE.BEHAVIOR_TYPE) continue;
      if (!behavior.system.pseudoEvents.has(name)) continue;
      behavior.system._handleRegionEvent({ name, data, region, user });
    }
  }
}

registerQuery('runPseudoEvent', ({ regionUuids, name, tokenUuid, data }, { user }) => {
  const regions = regionUuids.map((uuid) => fromUuidSync(uuid)).filter(Boolean);
  dispatchPseudoEvent(regions, name, { ...data, token: tokenUuid ? fromUuidSync(tokenUuid) : null }, user);
});

/**
 * Dispatch a single-client interaction pseudo-event (click family, hover), relaying to the primary GM when non-primary.
 * @param {RegionDocument[]} regions Candidate regions to check.
 * @param {string} name The pseudo-event name.
 * @param {object} [data] Event-specific payload; `data.token`, if present, must be a TokenDocument, and every other field must be JSON-safe.
 */
function dispatchInteractivePseudoEvent(regions, name, data = {}) {
  if (!regions.length) return;
  if (ATLAS.isPrimaryGM) return dispatchPseudoEvent(regions, name, data);
  const gm = ATLAS.primaryGM;
  if (!gm) return;
  const { token, ...rest } = data;
  query(gm, 'runPseudoEvent', { regionUuids: regions.map((r) => r.uuid), name, tokenUuid: token?.uuid ?? null, data: rest });
}

const hoveredRegions = new Set();

/** @type {boolean} Whether glyph is the one currently forcing the pointer cursor, so it only ever resets a state it applied itself. */
let cursorApplied = false;

/** @type {string[]} Pseudo-events worth showing a pointer cursor for - hover and every click variant. */
export const CURSOR_PSEUDO_EVENTS = ['hoverIn', 'hoverOut', 'click', 'rightclick', 'dblclick', 'dblrightclick'];

/**
 * Whether `region` has an enabled trigger listening for hover or a click variant.
 * @param {RegionDocument} region The region to check.
 * @returns {boolean}
 */
function isInteractiveRegion(region) {
  return region.behaviors.some((b) => !b.disabled && b.type === MODULE.BEHAVIOR_TYPE && CURSOR_PSEUDO_EVENTS.some((name) => b.system.pseudoEvents.has(name)));
}

/**
 * Every non-hidden Region on the active scene whose shape contains `pos`.
 * @param {Point} pos A world-space point.
 * @returns {RegionDocument[]} Matching regions.
 */
function regionsAtPoint(pos) {
  if (!canvas.ready || !canvas.scene) return [];
  return canvas.scene.regions.filter((region) => !region.hidden && region.polygonTree.testPoint(pos));
}

/**
 * Dispatch a click-family pseudo-event to every Region under the pointer.
 * @param {string} name The pseudo-event name: "click", "rightclick", "dblclick", or "dblrightclick".
 * @param {MouseEvent} event The originating DOM event.
 */
function checkRegionClick(name, { shiftKey, altKey, ctrlKey, metaKey }) {
  const { x, y } = canvas.mousePosition;
  const regions = regionsAtPoint({ x, y });
  dispatchInteractivePseudoEvent(regions, name, { token: canvas.tokens.controlled[0]?.document ?? null, point: { x, y }, shiftKey, altKey, ctrlKey, metaKey });
}

/**
 * Test the pointer's world position against every Region on the active scene, dispatching `hoverIn`/`hoverOut` on state transitions and showing a pointer cursor over a hover-subscribed Region.
 * @param {Point} pos The pointer's current world position.
 */
function checkRegionHover(pos) {
  if (!canvas.ready || !canvas.scene) return;
  let anyInteractive = false;
  for (const region of canvas.scene.regions) {
    const isHovered = !region.hidden && region.polygonTree.testPoint(pos);
    const wasHovered = hoveredRegions.has(region.id);
    if (isHovered !== wasHovered) {
      if (isHovered) hoveredRegions.add(region.id);
      else hoveredRegions.delete(region.id);
      dispatchInteractivePseudoEvent([region], isHovered ? 'hoverIn' : 'hoverOut');
    }
    if (isHovered && isInteractiveRegion(region)) anyInteractive = true;
  }
  if (anyInteractive && !cursorApplied) {
    canvas.app.view.style.cursor = 'pointer';
    cursorApplied = true;
  } else if (!anyInteractive && cursorApplied) {
    canvas.app.view.style.cursor = '';
    cursorApplied = false;
  }
}

/** @type {number|null} Pending single-click dispatch timer, cancelled by a following dblclick. */
let clickTimer = null;

/** @type {number|null} Pending single-right-click dispatch timer, cancelled by a following right-click. */
let rightClickTimer = null;

/** Register hover, click, rotation, token-creation, combat, scene-load, world-time, darkness, and door pseudo-event dispatch. */
export function registerPseudoEvents() {
  Hooks.once('canvasReady', () => {
    canvas.registerMouseMoveHandler(checkRegionHover);
    canvas.environment.addEventListener('darknessChange', (event) => {
      if (!ATLAS.isPrimaryGM) return;
      dispatchPseudoEvent(canvas.scene?.regions ?? [], 'canvasDarknessChanged', event.environmentData);
    });
    canvas.app.view.addEventListener('click', (event) => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => checkRegionClick('click', event), 300);
    });
    canvas.app.view.addEventListener('contextmenu', (event) => {
      if (rightClickTimer) {
        clearTimeout(rightClickTimer);
        rightClickTimer = null;
        return checkRegionClick('dblrightclick', event);
      }
      rightClickTimer = setTimeout(() => {
        rightClickTimer = null;
        checkRegionClick('rightclick', event);
      }, 300);
    });
    canvas.app.view.addEventListener('dblclick', (event) => {
      clearTimeout(clickTimer);
      checkRegionClick('dblclick', event);
    });
  });
  Hooks.on('canvasReady', () => {
    hoveredRegions.clear();
    cursorApplied = false;
    if (ATLAS.isPrimaryGM) dispatchPseudoEvent(canvas.scene?.regions ?? [], 'canvasReady');
  });
  Hooks.on('updateToken', (token, changed) => {
    if (changed.rotation === undefined || !ATLAS.isPrimaryGM) return;
    dispatchPseudoEvent(token.regions, 'tokenRotated', { token, rotation: token.rotation });
  });
  Hooks.on('createToken', (token) => {
    if (!ATLAS.isPrimaryGM) return;
    dispatchPseudoEvent(token.regions, 'tokenCreated', { token });
  });
  Hooks.on('preUpdateCombat', (combat, changed) => {
    if (!combat.started || !ATLAS.isPrimaryGM) return;
    if (changed.turn === undefined && changed.round === undefined) return;
    dispatchPseudoEvent(combat.scene?.regions ?? [], 'combatTurnEnd', { combat, token: combat.combatant?.token ?? null });
  });
  Hooks.on('updateCombat', (combat, changed) => {
    if (!combat.started || !ATLAS.isPrimaryGM) return;
    if (changed.round === 1 && combat.turn === 0) dispatchPseudoEvent(combat.scene?.regions ?? [], 'combatStart', { combat });
    if (changed.round !== undefined) dispatchPseudoEvent(combat.scene?.regions ?? [], 'combatRound', { combat, round: combat.round });
    if (changed.turn !== undefined || changed.round !== undefined) dispatchPseudoEvent(combat.scene?.regions ?? [], 'combatTurnStart', { combat, token: combat.combatant?.token ?? null });
  });
  Hooks.on('deleteCombat', (combat) => {
    if (!combat.started || !ATLAS.isPrimaryGM) return;
    dispatchPseudoEvent(combat.scene?.regions ?? [], 'combatEnd', { combat });
  });
  Hooks.on('updateWorldTime', () => {
    if (!ATLAS.isPrimaryGM) return;
    for (const scene of game.scenes) dispatchPseudoEvent(scene.regions, 'worldTimeChanged');
  });
  Hooks.on('updateScene', (scene, changed) => {
    if (changed.environment?.darknessLevel === undefined || !ATLAS.isPrimaryGM) return;
    dispatchPseudoEvent(scene.regions, 'darknessChanged');
  });
  Hooks.on('preUpdateWall', (wall, changes, options) => {
    if (changes.ds !== undefined) options._priorDs = wall.ds;
  });
  Hooks.on('updateWall', (wall, changed, options) => {
    const scene = wall.parent;
    if (!scene) return;
    const regions = regionsNearWall(scene, wall);
    if (!regions.length) return;
    if (changed.ds !== undefined && options._priorDs !== undefined) {
      const name = doorStateEventName(options._priorDs, wall.ds);
      if (name) dispatchPseudoEvent(regions, name, { wall });
    }
    if (changed.door !== undefined && wall.door !== CONST.WALL_DOOR_TYPES.SECRET) dispatchPseudoEvent(regions, 'doorRevealed', { wall });
  });
}

/**
 * The pseudo-event name for a door state transition.
 * @param {number} from The prior `WALL_DOOR_STATES` value.
 * @param {number} to The new `WALL_DOOR_STATES` value.
 * @returns {string|null} The pseudo-event name, or null if the transition doesn't map to one.
 */
function doorStateEventName(from, to) {
  const { OPEN, CLOSED, LOCKED } = CONST.WALL_DOOR_STATES;
  if (to === OPEN) return 'doorOpened';
  if (to === LOCKED) return 'doorLocked';
  if (to === CLOSED) return from === LOCKED ? 'doorUnlocked' : 'doorClosed';
  return null;
}

/**
 * Find every Region on `scene` whose shape contains a wall's midpoint.
 * @param {Scene} scene The wall's parent scene.
 * @param {WallDocument} wall The wall to test.
 * @returns {RegionDocument[]} Regions containing the wall's midpoint.
 */
function regionsNearWall(scene, wall) {
  const [x1, y1, x2, y2] = wall.c;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  return scene.regions.filter((region) => region.polygonTree.testPoint(mid));
}
