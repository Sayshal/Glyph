import { isModuleActive } from '../capability.mjs';
import { MODULE } from '../constants.mjs';
import { resolvePath } from '../run-context.mjs';
import { resolveCollection, resolveReference, toActor } from '../targeting.mjs';

/**
 * Grid distance between two points, in scene distance units.
 * @param {Point} a The first point.
 * @param {Point} b The second point.
 * @returns {number} The measured distance.
 */
function distanceTo(a, b) {
  return canvas.grid.measurePath([a, b]).distance;
}

/**
 * Convert a raw grid-square or pixel count into scene distance units, using the active scene's grid.
 * @param {number} value The raw count.
 * @param {string} unit `"sq"` (grid squares) or `"px"` (pixels).
 * @returns {number} The equivalent scene distance.
 */
function sceneDistanceFrom(value, unit) {
  return (unit === 'px' ? value / canvas.grid.size : value) * canvas.grid.distance;
}

/**
 * Whether a point lies inside a Region's shape.
 * @param {Point|null} point The point to test.
 * @param {RegionDocument|null} region The Region to test against.
 * @returns {boolean}
 */
function pointInsideRegion(point, region) {
  return !!(point && region?.polygonTree?.testPoint(point));
}

/**
 * Whether `actor` has the given status effect.
 * @param {Actor} actor The actor to check.
 * @param {string} statusId The status id.
 * @returns {boolean}
 */
function hasCondition(actor, statusId) {
  return actor?.statuses.has(statusId) ?? false;
}

/**
 * Whether a ray between two points is unobstructed by a sight-blocking wall.
 * @param {Point} a The origin point.
 * @param {Point} b The destination point.
 * @returns {boolean}
 */
function canSee(a, b) {
  if (!a || !b) return false;
  return !CONFIG.Canvas.polygonBackends.sight.testCollision(a, b, { type: 'sight', mode: 'any' });
}

const OPERATORS = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '>=': (a, b) => Number(a) >= Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '>': (a, b) => Number(a) > Number(b),
  '<': (a, b) => Number(a) < Number(b)
};

const OPERATOR_PATTERN = /\s*(==|!=|>=|<=|>|<)\s*/;

/**
 * A TokenDocument, Region (or other placeable-backed document), or plain point reference to a measurable point.
 * @param {*} ref A resolved operand.
 * @returns {Point|null}
 */
function toPoint(ref) {
  if (typeof ref?.getCenterPoint === 'function') return ref.getCenterPoint();
  if (ref?.object?.center) return ref.object.center;
  return ref ?? null;
}

/**
 * Whether a TokenDocument's placeable is currently visible to the executing client.
 * @param {*} ref A resolved operand, expected to be a TokenDocument.
 * @returns {boolean}
 */
function isVisible(ref) {
  const token = ref?.object ?? null;
  if (!token || !canvas.ready) return true;
  return canvas.visibility.testVisibility(token.center, { object: token });
}

/**
 * The nearest point on a resolved ref's placeable bounds to another point, or its center if it has no bounds.
 * @param {*} ref A resolved operand.
 * @param {Point|null} towards The point to project toward.
 * @returns {Point|null}
 */
function toEdgePoint(ref, towards) {
  const bounds = ref?.object?.bounds;
  if (!bounds || !towards) return toPoint(ref);
  return { x: Math.min(Math.max(towards.x, bounds.left), bounds.right), y: Math.min(Math.max(towards.y, bounds.top), bounds.bottom) };
}

/**
 * Resolve a `variable()` target: a resolved RegionBehavior, or a raw UUID string naming one.
 * @param {*} ref A resolved operand, or a bare UUID string.
 * @param {import('../run-context.mjs').RunContext} context The active run context.
 * @returns {RegionBehavior|null}
 */
function toVariableBehavior(ref, context) {
  const behavior = ref instanceof RegionBehavior ? ref : typeof ref === 'string' && ref ? fromUuidSync(ref) : (context.info.behavior ?? null);
  return behavior instanceof RegionBehavior ? behavior : null;
}

/**
 * Split a comma-separated argument list at top-level commas only, ignoring commas nested inside parentheses.
 * @param {string} raw The raw argument text.
 * @returns {string[]}
 */
function splitTopLevelArgs(raw) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '(') depth++;
    else if (raw[i] === ')') depth--;
    else if (raw[i] === ',' && depth === 0) {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  return parts;
}

/**
 * Evaluate `any(collection, condition)`/`all(collection, condition)`, keeping `condition` unresolved until it runs per-item.
 * @param {'any'|'all'} name Which quantifier.
 * @param {string} argsRaw The raw, unsplit argument text.
 * @param {import('../run-context.mjs').RunContext} context The active run context.
 * @returns {boolean}
 */
function evaluateQuantifier(name, argsRaw, context) {
  const [collectionArg = '', ...rest] = splitTopLevelArgs(argsRaw);
  const condition = rest.join(',').trim();
  const items = resolveCollection(resolveOperand(collectionArg, context), context);
  if (!items.length) return name === 'all';
  const results = items.map((item) => evaluateCondition(condition, { ...context, item }));
  return name === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/** @type {Record<string, (args: unknown[], context: import('../run-context.mjs').RunContext) => unknown>} Functions callable from an expression. */
const FUNCTIONS = {
  visible: ([ref]) => isVisible(ref),
  hasCondition: ([ref, statusId]) => hasCondition(toActor(ref), statusId),
  distance: ([a, b, mode]) => (mode === 'edge' ? distanceTo(toEdgePoint(a, toPoint(b)), toEdgePoint(b, toPoint(a))) : distanceTo(toPoint(a), toPoint(b))),
  sceneDistance: ([value, unit]) => sceneDistanceFrom(Number(value), unit),
  insideRegion: ([ref, region]) => pointInsideRegion(toPoint(ref), region),
  canSee: ([a, b]) => canSee(toPoint(a), toPoint(b)),
  attribute: ([ref, path]) => foundry.utils.getProperty(ref ?? {}, path),
  hasItem: ([ref, name]) => !!toActor(ref)?.items.find((i) => i.name?.toLowerCase() === String(name).toLowerCase()),
  chance: ([percent]) => Math.random() * 100 < Number(percent),
  count: ([id], context) => resolveCollection(id, context).length,
  tileData: ([path], context) => {
    const tile = resolveReference(context.info.behavior?.system?.linkedTile, context);
    return tile ? foundry.utils.getProperty(tile, path) : undefined;
  },
  triggerCount: (_args, context) => context.info.triggerCount,
  tokenCount: ([ref], context) => {
    const tokenId = ref?.id ?? ref?.object?.id;
    const history = context.info.behavior?.getFlag(MODULE.ID, 'history') ?? [];
    return tokenId ? history.filter((entry) => entry.tokenId === tokenId).length : 0;
  },
  variable: ([ref, name], context) => {
    const behavior = toVariableBehavior(ref, context);
    return behavior ? Object.fromEntries((behavior.getFlag(MODULE.ID, 'variables') ?? []).map((entry) => [entry.name, entry.value]))[name] : undefined;
  },
  hasTag: ([ref, tag]) => (isModuleActive('tagger') ? Tagger.hasTags(ref, tag) : false),
  season: () => (isModuleActive('calendaria') ? (CALENDARIA.api.getCurrentSeason()?.name ?? null) : null),
  isRestDay: () => (isModuleActive('calendaria') ? CALENDARIA.api.isRestDay() : false),
  isFestivalDay: () => (isModuleActive('calendaria') ? CALENDARIA.api.isFestivalDay() : false),
  isNighttime: () => (isModuleActive('calendaria') ? CALENDARIA.api.isNighttime() : false),
  weather: ([zoneId]) => (isModuleActive('calendaria') ? CALENDARIA.api.getCurrentWeather(zoneId) : null),
  getMoonPhase: ([moonIndex]) => (isModuleActive('calendaria') ? CALENDARIA.api.getMoonPhase(moonIndex ?? 0) : null),
  isEclipse: () => (isModuleActive('calendaria') ? CALENDARIA.api.isEclipse() : false),
  sunrise: ([zone]) => (isModuleActive('calendaria') ? CALENDARIA.api.getSunrise(zone) : null),
  sunset: ([zone]) => (isModuleActive('calendaria') ? CALENDARIA.api.getSunset(zone) : null),
  tenacityCount: ([ref]) => (isModuleActive('tenacity') ? TENACITY.count(toActor(ref)) : 0),
  bondsmithRep: ([id, type]) => (isModuleActive('bondsmith') ? BONDSMITH.api.reputation.get(id, type) : 0),
  lightLevel: ([ref]) => (isModuleActive('tokenlightcondition') ? TLC.api.getLightLevel(ref?.object ?? ref) : null),
  effectiveLightLevel: ([ref]) => (isModuleActive('tokenlightcondition') ? TLC.api.getEffectiveLightLevel(ref?.object ?? ref) : null),
  activeMood: () => (isModuleActive('minstrel') ? MINSTREL.moods.active() : null),
  peddlerTrust: ([ref]) => (isModuleActive('peddler') ? (Peddler.getTrust(toActor(ref))?.value ?? 0) : 0),
  pendingApprovals: () => (isModuleActive('hero-mancer') ? HEROMANCER.api.getPendingSubmissions().length : 0)
};

/**
 * Resolve one operand: a function call, a `{{path}}` run-context lookup, or a boolean/number/string literal.
 * @param {string} raw The raw operand text.
 * @param {import('../run-context.mjs').RunContext} context The active run context.
 * @returns {*} The resolved value.
 */
function resolveOperand(raw, context) {
  const trimmed = raw.trim();
  const call = trimmed.match(/^(\w+)\((.*)\)$/);
  if (call) {
    const [, name, argsRaw] = call;
    if (name === 'any' || name === 'all') return evaluateQuantifier(name, argsRaw, context);
    const fn = FUNCTIONS[name];
    if (!fn) return undefined;
    const args = argsRaw.trim() === '' ? [] : argsRaw.split(',').map((arg) => resolveOperand(arg, context));
    return fn(args, context);
  }
  const path = trimmed.match(/^\{\{(.+)\}\}$/);
  if (path) return resolvePath(context, path[1].trim());
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, '');
}

/**
 * Evaluate a condition against a run context.
 * @param {string|boolean} condition A boolean, a `"<left> <op> <right>"` expression, or a function call.
 * @param {import('../run-context.mjs').RunContext} context The active run context.
 * @returns {boolean} The evaluated result.
 */
export function evaluateCondition(condition, context) {
  if (typeof condition === 'boolean') return condition;
  if (typeof condition !== 'string' || !condition.trim()) return false;
  const parts = condition.split(OPERATOR_PATTERN);
  if (parts.length === 1) return !!resolveOperand(parts[0], context);
  const [left, op, right] = parts;
  return OPERATORS[op](resolveOperand(left, context), resolveOperand(right, context));
}
