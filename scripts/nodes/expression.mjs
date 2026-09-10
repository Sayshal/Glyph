import { isModuleActive } from '../capability.mjs';
import { MODULE } from '../constants.mjs';
import { resolvePath } from '../run-context.mjs';
import { resolveCollection, resolveReference, toActor } from '../targeting.mjs';
import { toTriggerBehavior } from '../tile-link.mjs';

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
 * Whether the run's movement event ended inside the triggering Region, rather than passing through it.
 * @param {object} context The active run context.
 * @returns {boolean}
 */
function movementEndedInside(context) {
  const { token, movement } = context.info.event?.data ?? {};
  if (!token || !movement) return false;
  return !movement.pending.waypoints.length && !!context.info.region?.testPoint(token.getCenterPoint(movement.destination));
}

/**
 * Whether the event's movement changed the token's elevation.
 * @param {object} context The active run context.
 * @returns {boolean}
 */
function movementChangedElevation(context) {
  const { movement } = context.info.event?.data ?? {};
  if (!movement) return false;
  return movement.origin.elevation !== movement.destination.elevation;
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

/** @type {string[]} Comparison operators, longest first so `>=` is found before `>`. */
const OPERATOR_KEYS = Object.keys(OPERATORS);

/**
 * A TokenDocument, Region (or other placeable-backed document), or plain point reference to a measurable point.
 * @param {*} ref A resolved operand.
 * @returns {Point|null}
 */
function toPoint(ref) {
  if (typeof ref === 'string' && ref) ref = fromUuidSync(ref) ?? ref;
  if (typeof ref?.getCenterPoint === 'function') return ref.getCenterPoint();
  if (ref?.polygonTree) return ref.polygonTree.bounds.center;
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
  if (typeof ref === 'string' && ref) ref = fromUuidSync(ref) ?? ref;
  const bounds = ref?.polygonTree?.bounds ?? ref?.object?.bounds;
  if (!bounds || !towards) return toPoint(ref);
  return { x: Math.min(Math.max(towards.x, bounds.left), bounds.right), y: Math.min(Math.max(towards.y, bounds.top), bounds.bottom) };
}

/**
 * Resolve a `variable()` target: the running trigger when unset, else whatever `ref` names.
 * @param {*} ref A resolved operand, or a bare UUID string.
 * @param {object} context The active run context.
 * @returns {RegionBehavior|null}
 */
function toVariableBehavior(ref, context) {
  if (ref === null || ref === undefined || ref === '') return toTriggerBehavior(context.info.behavior);
  return toTriggerBehavior(typeof ref === 'string' ? fromUuidSync(ref) : ref);
}

/**
 * Split `raw` at every occurrence of `separator` outside parentheses and quoted text.
 * @param {string} raw The raw text.
 * @param {string} separator The separator to split on.
 * @returns {string[]} The split parts, untrimmed.
 */
function splitTopLevel(raw, separator) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && raw.startsWith(separator, i)) {
      parts.push(raw.slice(start, i));
      i += separator.length - 1;
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  return parts;
}

/**
 * Split a condition at its first comparison operator outside parentheses and quoted text.
 * @param {string} raw The raw condition text.
 * @returns {{left: string, op: string, right: string}|null} The operands and operator, or null when the condition holds no comparison.
 */
function splitComparison(raw) {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0) {
      const op = OPERATOR_KEYS.find((key) => raw.startsWith(key, i));
      if (op) return { left: raw.slice(0, i), op, right: raw.slice(i + op.length) };
    }
  }
  return null;
}

/**
 * Evaluate `any(collection, condition)`/`all(collection, condition)`, keeping `condition` unresolved until it runs per-item.
 * @param {'any'|'all'} name Which quantifier.
 * @param {string} argsRaw The raw, unsplit argument text.
 * @param {object} context The active run context.
 * @returns {Promise<boolean>}
 */
async function evaluateQuantifier(name, argsRaw, context) {
  const [collectionArg = '', ...rest] = splitTopLevel(argsRaw, ',');
  const condition = rest.join(',').trim();
  const items = resolveCollection(await resolveOperand(collectionArg, context), context);
  if (!items.length) return false;
  const results = await Promise.all(items.map((item) => evaluateCondition(condition, { ...context, item })));
  return name === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Convert a `*`/`?` glob pattern to a case-insensitive `RegExp` anchored to the full string.
 * @param {string} pattern The glob pattern.
 * @returns {RegExp} The equivalent regular expression.
 */
export function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * An actor's items whose name matches, exactly or by `*`/`?` glob.
 * @param {Actor|null} actor The actor to search.
 * @param {string} name An item name or glob pattern.
 * @returns {Item[]} The matching items.
 */
function matchingItems(actor, name) {
  const wanted = name.trim().toLowerCase();
  const pattern = /[*?]/.test(wanted) ? globToRegExp(wanted) : null;
  return [...(actor?.items ?? [])].filter((item) => {
    const itemName = (item.name ?? '').trim().toLowerCase();
    return pattern ? pattern.test(itemName) : itemName === wanted;
  });
}

/**
 * Read an attribute path off a document, falling back the way an author writes one.
 * @param {*} ref The resolved document or placeable.
 * @param {string} path A dotted attribute path.
 * @returns {*} The resolved value, or undefined if no fallback found it.
 */
function readAttribute(ref, path) {
  const bases = [ref, toActor(ref)].filter(Boolean);
  const paths = path.startsWith('flags') ? [path] : [path, `system.${path}`];
  for (const base of bases) {
    for (const candidate of paths) {
      if (!foundry.utils.hasProperty(base, candidate)) continue;
      const found = foundry.utils.getProperty(base, candidate);
      return found !== null && typeof found === 'object' && 'value' in found ? found.value : found;
    }
  }
  return undefined;
}

/**
 * The direction this run travelled: a move's origin to its destination, else the Region's centre to the clicked point.
 * @param {object} context The active run context.
 * @param {string} [axis] "y" for up/down, "x" for left/right, omitted for the compound "up-left" form.
 * @returns {string} The direction, or "" when the run has none.
 */
function directionOfRun(context, axis) {
  const data = context.info.event?.data ?? {};
  const from = data.movement?.origin ?? context.info.region?.object?.center;
  const to = data.movement?.destination ?? data.point;
  if (!from || !to) return '';
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const y = angle === 0 || Math.abs(angle) === Math.PI ? '' : angle < 0 ? 'up' : 'down';
  const x = Math.abs(angle) === Math.PI / 2 ? '' : Math.abs(angle) < Math.PI / 2 ? 'right' : 'left';
  if (axis === 'y') return y;
  if (axis === 'x') return x;
  return `${y}-${x}`;
}

/** @type {Record<string, (args: unknown[], context: object) => unknown>} Functions callable from an expression. */
const FUNCTIONS = {
  visible: ([ref]) => isVisible(ref),
  hasActor: ([ref]) => !!toActor(ref),
  hasCondition: ([ref, statusId]) => hasCondition(toActor(ref), statusId),
  distance: ([a, b, mode]) => (mode === 'edge' ? distanceTo(toEdgePoint(a, toPoint(b)), toEdgePoint(b, toPoint(a))) : distanceTo(toPoint(a), toPoint(b))),
  sceneDistance: ([value, unit]) => sceneDistanceFrom(Number(value), unit),
  insideRegion: ([ref, region]) => pointInsideRegion(toPoint(ref), region),
  movementEnded: (_args, context) => movementEndedInside(context),
  elevationChanged: (_args, context) => movementChangedElevation(context),
  canSee: ([a, b]) => canSee(toPoint(a), toPoint(b)),
  attribute: ([ref, path]) => readAttribute(ref, String(path)),
  hasItem: ([ref, name]) => !!toActor(ref)?.items.find((i) => i.name?.toLowerCase() === String(name).toLowerCase()),
  itemCount: ([ref, name]) => matchingItems(toActor(ref), String(name)).length,
  itemQuantity: ([ref, name]) => matchingItems(toActor(ref), String(name)).reduce((total, item) => total + Number(item.system?.quantity ?? 1), 0),
  chance: ([percent]) => Math.random() * 100 < Number(percent),
  roll: async ([formula]) => (await new Roll(String(formula)).evaluate({ allowInteractive: false })).total,
  count: ([id], context) => resolveCollection(id, context).length,
  tileData: ([path], context) => {
    const tile = resolveReference(context.info.behavior?.system?.linkedTile, context);
    if (!tile) return undefined;
    const found = foundry.utils.getProperty(tile, path);
    return found !== null && typeof found === 'object' && 'value' in found ? found.value : found;
  },
  triggerCount: (_args, context) => context.info.triggerCount,
  uniqueTriggerCount: (_args, context) => new Set((context.info.behavior?.getFlag(MODULE.ID, 'history') ?? []).map((entry) => entry.tokenId)).size,
  moveDirection: ([axis], context) => directionOfRun(context, axis === undefined ? undefined : String(axis)),
  darkness: (_args, context) => context.info.scene?.environment.darknessLevel,
  timeOfDay: () => game.time.components.hour * 60 + game.time.components.minute,
  eventIs: (names, context) => names.includes(context.info.event.name),
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
  byTag: ([tag]) => (isModuleActive('tagger') ? (Tagger.getByTag(tag)[0] ?? null) : null),
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
 * @param {object} context The active run context.
 * @returns {Promise<*>} The resolved value.
 */
async function resolveOperand(raw, context) {
  const trimmed = raw.trim();
  const call = trimmed.match(/^(\w+)\((.*)\)$/);
  if (call) {
    const [, name, argsRaw] = call;
    if (name === 'any' || name === 'all') return evaluateQuantifier(name, argsRaw, context);
    const fn = FUNCTIONS[name];
    if (!fn) return undefined;
    const args = argsRaw.trim() === '' ? [] : await Promise.all(splitTopLevel(argsRaw, ',').map((arg) => resolveOperand(arg, context)));
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
 * Evaluate a condition against a run context. Clauses may be joined with `&&`.
 * @param {string|boolean} condition A boolean, a `"<left> <op> <right>"` expression, or a function call.
 * @param {object} context The active run context.
 * @returns {Promise<boolean>} The evaluated result.
 */
export async function evaluateCondition(condition, context) {
  if (typeof condition === 'boolean') return condition;
  if (typeof condition !== 'string' || !condition.trim()) return false;
  const clauses = splitTopLevel(condition, '&&');
  if (clauses.length > 1) {
    for (const clause of clauses) if (!(await evaluateCondition(clause, context))) return false;
    return true;
  }
  const comparison = splitComparison(condition);
  if (!comparison) return !!(await resolveOperand(condition, context));
  return OPERATORS[comparison.op](await resolveOperand(comparison.left, context), await resolveOperand(comparison.right, context));
}
