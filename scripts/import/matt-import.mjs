import { MODULE } from '../constants.mjs';
import { buildTriggerSystem } from '../data/trigger-system.mjs';
import { validateNode } from '../nodes/types.mjs';
import { regionShapeFromTile } from '../tile-link.mjs';
import { ACTION_MAP, FILTER_MAP } from './matt-action-map.mjs';
import { MODE_MAP } from './matt-modes.mjs';

/** @type {Record<string, string>} MATT per-tile flags with a same-shape glyph field (MATT-teardown.md §2.2). */
const FIELD_MAP = { restriction: 'restriction', chance: 'chance', minrequired: 'minRequired', cooldown: 'cooldown', pertoken: 'pertoken', vision: 'vision', allowpaused: 'allowPaused' };

/** @type {Record<string, string>} MATT per-tile flags with no glyph equivalent, each with its own reason. */
const DROPPED_FIELDS = {
  snap: 'Per-action movement-snap flag, not a trigger-level setting in glyph - set it on the individual moveToken/createToken node instead.',
  usealpha: "Pixel-alpha hit testing; glyph Regions use their shape's geometry, not the tile's image alpha.",
  pointer: 'Cosmetic hover cursor; glyph has no equivalent per-trigger flag.',
  controlled: 'Client-eligibility restriction (which connected client may fire the trigger); glyph does not expose this.',
  record: "MATT's own trigger-history feature; glyph tracks pertoken/minRequired state differently and exposes no history log."
};

/** @type {Record<string, *>} `DROPPED_FIELDS` values that are MATT's own default, not worth a report line. */
const DROPPED_DEFAULTS = { controlled: 'all' };

/**
 * Whether any string value in a MATT action's data carries MATT's own `{{value.x.y}}` templating.
 * @param {object} data The MATT action's `data` object.
 * @returns {boolean} True if a MATT template placeholder is present.
 */
function hasMattTemplate(data) {
  return Object.values(data ?? {}).some((value) => typeof value === 'string' && value.includes('{{'));
}

/**
 * Convert one MATT action-list entry into a glyph program node, or a manual-review stub.
 * @param {{action: string, data: object}} entry One entry of MATT's flat `actions[]`.
 * @param {{report: object[], stubs: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object, for converters needing tile-level data.
 * @returns {object} A glyph program node (real, or a `__mattManualStub` placeholder).
 */
function convertAction(entry, out, matt) {
  const label = entry.action ?? entry.type ?? '(unknown)';
  const mapping = ACTION_MAP[label];
  if (!mapping) {
    out.report.push({ level: 'manual', matt: entry, note: `Unrecognized MATT action "${label}" - no entry in the conversion table.` });
    return stub(entry, out);
  }
  if (mapping.manual) {
    out.report.push({ level: 'manual', matt: entry, note: mapping.manual });
    return stub(entry, out);
  }
  try {
    const node = mapping.convert(entry.data ?? {}, matt);
    validateNode(node);
    const template = hasMattTemplate(entry.data);
    const partial = mapping.partial ?? (template ? "Text contains MATT's own {{value...}} template placeholders, which don't resolve against glyph's context - rewrite them by hand." : null);
    out.report.push(partial ? { level: 'partial', matt: entry, note: partial } : { level: 'ok', matt: entry });
    return node;
  } catch (error) {
    out.report.push({ level: 'manual', matt: entry, note: `Couldn't convert "${label}": ${error.message}` });
    return stub(entry, out);
  }
}

/**
 * Convert a flat MATT action list into glyph program nodes, wrapping the remainder of the chain in
 * an `if` node wherever a `FILTER_MAP`-eligible filter gates it.
 * @param {{action: string, data: object}[]} actions MATT's flat `actions[]`, or a suffix of it.
 * @param {{report: object[], stubs: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]} The converted program nodes.
 */
function convertActions(actions, out, matt) {
  for (let i = 0; i < actions.length; i++) {
    const entry = actions[i];
    const filter = FILTER_MAP[entry.action];
    if (filter && !filter.failLanding(entry.data ?? {})) {
      const condition = filter.expression(entry.data ?? {});
      if (condition) {
        out.report.push({
          level: 'partial',
          matt: entry,
          note: "Converted to an `if` gate wrapping the rest of this chain, using glyph's matching expression function (Stage 14) - review the condition for correctness."
        });
        const before = actions.slice(0, i).map((e) => convertAction(e, out, matt));
        const rest = convertActions(actions.slice(i + 1), out, matt);
        return [...before, { type: 'if', condition, then: rest }];
      }
    }
  }
  return actions.map((entry) => convertAction(entry, out, matt));
}

/**
 * Build a manual-review placeholder node, queuing its stub Macro creation.
 * @param {{action: string, data: object}} entry The original MATT action.
 * @param {{stubs: object[]}} out Accumulator this call appends to.
 * @returns {{type: string, stubId: string}} The placeholder node.
 */
function stub(entry, out) {
  const stubId = foundry.utils.randomID();
  out.stubs.push({ stubId, matt: entry });
  return { type: '__mattManualStub', stubId };
}

/**
 * Replace every `__mattManualStub` placeholder in a program tree with a real `runMacro` node.
 * @param {object} node A program node (recurses through `children`/`then`/`else`/`body`).
 * @param {Record<string, string>} macroUuidByStubId Stub id -> created Macro UUID.
 * @returns {object} The same node, with stubs resolved in place.
 */
export function resolveStubs(node, macroUuidByStubId) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === '__mattManualStub') return { type: 'runMacro', macroUuid: macroUuidByStubId[node.stubId] };
  for (const key of ['children', 'then', 'else', 'body']) if (Array.isArray(node[key])) node[key] = node[key].map((child) => resolveStubs(child, macroUuidByStubId));
  return node;
}

/**
 * Convert one MATT-flagged Tile into glyph shape, dry-run.
 * @param {TileDocument} tile A Tile carrying `flags.monks-active-tiles`.
 * @returns {{regionShape: object, linkedTile: object|null, disabled: boolean, system: object, report: object[], stubs: object[]}} The converted result.
 */
export function convertTile(tile) {
  const matt = tile.flags?.['monks-active-tiles'];
  const report = [];
  const stubs = [];
  if (!matt) return { regionShape: regionShapeFromTile(tile), linkedTile: null, disabled: true, system: buildTriggerSystem({ handlers: {} }), report, stubs };

  const events = new Set();
  const pseudoEvents = new Set();
  for (const mode of String(matt.trigger ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)) {
    const mapping = MODE_MAP[mode];
    if (!mapping || mapping.manual) {
      report.push({ level: 'manual', matt: { mode }, note: mapping?.note ?? `Unrecognized MATT trigger mode "${mode}".` });
      continue;
    }
    if (mapping.note) report.push({ level: 'partial', matt: { mode }, note: mapping.note });
    mapping.events?.forEach((e) => events.add(e));
    mapping.pseudoEvents?.forEach((e) => pseudoEvents.add(e));
  }

  const out = { report, stubs };
  const sequence = { type: 'sequence', children: convertActions(matt.actions ?? [], out, matt) };
  const handlers = {};
  for (const event of [...events, ...pseudoEvents]) handlers[event] = foundry.utils.deepClone(sequence);

  const fieldOverrides = {};
  for (const [mattKey, glyphKey] of Object.entries(FIELD_MAP)) if (matt[mattKey] !== undefined) fieldOverrides[glyphKey] = matt[mattKey];
  for (const [mattKey, note] of Object.entries(DROPPED_FIELDS))
    if (matt[mattKey] && matt[mattKey] !== DROPPED_DEFAULTS[mattKey]) report.push({ level: 'skipped', matt: { [mattKey]: matt[mattKey] }, note });

  const visible = tile.alpha > 0 && !!tile.texture?.src;
  const linkedTile = visible ? { kind: 'uuid', value: tile.uuid } : null;
  if (!visible)
    report.push({ level: 'ok', matt: { tile: tile.name || tile.id }, note: 'Tile has no visible texture (alpha 0) - treated as an invisible marker; the Tile itself was not kept linked.' });

  const system = { ...buildTriggerSystem({ events: [...events], pseudoEvents: [...pseudoEvents], handlers }), ...fieldOverrides, linkedTile };
  return { regionShape: regionShapeFromTile(tile), linkedTile, disabled: matt.active === false, system, report, stubs };
}

/**
 * Every Tile on a scene carrying MATT trigger flags.
 * @param {Scene} scene The scene to scan.
 * @returns {TileDocument[]} Matching tiles.
 */
export function findMattTiles(scene) {
  return scene.tiles.filter((tile) => !!tile.flags?.['monks-active-tiles']);
}

/**
 * Commit a batch of converted tiles: create stub Macros, resolve them, create the Regions.
 * @param {Scene} scene The scene to create Regions on.
 * @param {{tile: TileDocument, converted: ReturnType<typeof convertTile>}[]} entries Tiles to commit.
 * @returns {Promise<RegionDocument[]>} The created Regions.
 */
export async function commitConversions(scene, entries) {
  const allStubs = entries.flatMap((e) => e.converted.stubs);
  const macros = allStubs.length
    ? await Macro.createDocuments(
        allStubs.map(({ matt }) => ({
          name: `MATT import: ${matt.action ?? matt.type ?? '(unrecognized action)'}`,
          type: 'script',
          command: `/**\n * Needs manual completion - converted from a MATT action glyph couldn't map automatically.\n * Original MATT action data:\n * ${JSON.stringify(matt).replace(/\*\//g, '*\\/')}\n */\n`
        }))
      )
    : [];
  const macroUuidByStubId = Object.fromEntries(allStubs.map(({ stubId }, i) => [stubId, macros[i].uuid]));

  const regions = [];
  for (const { tile, converted } of entries) {
    const system = foundry.utils.deepClone(converted.system);
    for (const event of Object.keys(system.handlers)) system.handlers[event] = resolveStubs(system.handlers[event], macroUuidByStubId);
    const [region] = await scene.createEmbeddedDocuments('Region', [
      { name: tile.name || 'MATT Import', shapes: [converted.regionShape], behaviors: [{ type: MODULE.BEHAVIOR_TYPE, system, disabled: converted.disabled }] }
    ]);
    regions.push(region);
    if (!converted.linkedTile) await tile.delete();
  }
  return regions;
}
