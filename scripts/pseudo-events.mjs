import { MODULE } from './constants.mjs';

/**
 * Dispatch a pseudo-event to every subscribed, non-disabled trigger behavior in `regions`.
 * @param {Iterable<RegionDocument>} regions Candidate regions to check.
 * @param {string} name The pseudo-event name.
 * @param {object} [data] Event-specific payload.
 */
export function dispatchPseudoEvent(regions, name, data = {}) {
  for (const region of regions) {
    if (region.hidden) continue;
    for (const behavior of region.behaviors) {
      if (behavior.disabled || behavior.type !== MODULE.BEHAVIOR_TYPE) continue;
      if (!behavior.system.pseudoEvents.has(name)) continue;
      behavior.system._handleRegionEvent({ name, data, region, user: game.user });
    }
  }
}

const hoveredRegions = new Set();

/** @type {boolean} Whether glyph is the one currently forcing the pointer cursor, so it only ever resets a state it applied itself. */
let cursorApplied = false;

/** @type {string[]} Pseudo-events worth showing a pointer cursor for - hover and every click variant. */
const CURSOR_PSEUDO_EVENTS = ['hoverIn', 'hoverOut', 'click', 'rightclick', 'dblclick'];

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
 * @param {string} name The pseudo-event name: "click", "rightclick", or "dblclick".
 */
function checkRegionClick(name) {
  const regions = regionsAtPoint(canvas.mousePosition);
  if (regions.length) dispatchPseudoEvent(regions, name, { token: canvas.tokens.controlled[0]?.document ?? null });
}

/**
 * Test the pointer's world position against every Region on the active scene, dispatching `hoverIn`/`hoverOut` on state transitions and showing a pointer cursor over a hover-subscribed Region.
 * @param {Point} pos The pointer's current world position.
 */
function checkRegionHover(pos) {
  if (!canvas.ready || !canvas.scene) return;
  let anyInteractive = false;
  for (const region of canvas.scene.regions) {
    const isHovered = region.polygonTree.testPoint(pos);
    const wasHovered = hoveredRegions.has(region.id);
    if (isHovered !== wasHovered) {
      if (isHovered) hoveredRegions.add(region.id);
      else hoveredRegions.delete(region.id);
      dispatchPseudoEvent([region], isHovered ? 'hoverIn' : 'hoverOut');
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

/** Register hover, click, world-time, and darkness pseudo-event dispatch. */
export function registerPseudoEvents() {
  Hooks.once('canvasReady', () => {
    canvas.registerMouseMoveHandler(checkRegionHover);
    canvas.app.view.addEventListener('click', () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => checkRegionClick('click'), 300);
    });
    canvas.app.view.addEventListener('contextmenu', () => checkRegionClick('rightclick'));
    canvas.app.view.addEventListener('dblclick', () => {
      clearTimeout(clickTimer);
      checkRegionClick('dblclick');
    });
  });
  Hooks.on('canvasReady', () => {
    hoveredRegions.clear();
    cursorApplied = false;
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
