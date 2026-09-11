import { isModuleActive } from '../capability.mjs';
import { MODULE } from '../constants.mjs';
import { buildTriggerSystem } from '../data/trigger-system.mjs';
import { validateNode } from '../nodes/types.mjs';
import { regionShapeFromTile, regionShapesFromTile } from '../tile-link.mjs';
import { ACTION_MAP, FILTER_MAP, PLACEABLE_COLLECTIONS, audienceFromShowto, isStaticValuePath, resultValueTest } from './matt-action-map.mjs';
import { MODE_MAP } from './matt-modes.mjs';
import { CURSOR_PSEUDO_EVENTS } from '../pseudo-events.mjs';
import { idOf } from './matt-sentinels.mjs';
import { hasUnresolvedTemplate, translateMattTemplate } from './matt-template.mjs';

/** @type {Record<string, string>} MATT per-tile flags with a same-shape glyph field. MATT's `restriction` filters by token ownership, `controlled` by triggering user. */
const FIELD_MAP = {
  restriction: 'tokenRestriction',
  controlled: 'userRestriction',
  chance: 'chance',
  minrequired: 'minRequired',
  cooldown: 'cooldown',
  pertoken: 'pertoken',
  vision: 'vision',
  allowpaused: 'allowPaused',
  usealpha: 'traceAlpha'
};

/** @type {Record<string, string>} MATT per-tile flags with no glyph equivalent. `snap` is per-action in MATT too and `record` gates a history glyph always keeps, so neither is listed. */
const DROPPED_FIELDS = {
  pointer: 'Cosmetic hover cursor; glyph shows one automatically over a Region whose trigger listens for a click or hover, so this only matters on a tile that listens for neither.'
};

/**
 * A report note for a converted node whose text still holds a placeholder glyph can't resolve.
 * @param {object} node The converted glyph node.
 * @param {boolean} inLoop Whether a loop body is being converted, where `{{item}}` is bound.
 * @returns {string|null} The note, or null when every placeholder resolves.
 */
function templateNote(node, inLoop) {
  if (!inLoop && JSON.stringify(node ?? null).includes('{{item')) {
    return "MATT's `{{entity}}` names the action's own current selection, which glyph only binds inside a For Each - it was rewritten as `{{item}}` but resolves to nothing here.";
  }
  return hasUnresolvedTemplate(node) ? 'Text still holds a MATT `{{value...}}` placeholder with no glyph equivalent - rewrite it by hand.' : null;
}

/**
 * Convert one MATT action-list entry into a glyph program node, or a manual-review stub. A `drop` entry leaves no report line.
 * @param {{action: string, data: object}} entry One entry of MATT's flat `actions[]`.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object, for converters needing tile-level data.
 * @returns {object|null} A glyph program node (real, or a `__mattManualStub` placeholder), or null for an action glyph needs no node for.
 */
function convertAction(entry, out, matt) {
  const label = entry.action ?? entry.type ?? '(unknown)';
  const mapping = ACTION_MAP[label];
  if (!mapping) {
    out.report.push({ level: 'manual', matt: entry, note: `Unrecognized MATT action "${label}" - no entry in the conversion table.` });
    return stub(entry, out);
  }
  if (mapping.drop?.(entry.data ?? {})) return null;
  const skip = typeof mapping.skip === 'function' ? mapping.skip(entry.data ?? {}) : mapping.skip;
  if (skip) {
    out.report.push({ level: 'skipped', matt: entry, note: skip });
    return null;
  }
  if (mapping.manual) {
    out.report.push({ level: 'manual', matt: entry, note: mapping.manual });
    return stub(entry, out);
  }
  try {
    const node = mapping.convert(entry.data ?? {}, matt, out);
    validateNode(node);
    const mapped = typeof mapping.partial === 'function' ? mapping.partial(entry.data ?? {}) : mapping.partial;
    const partial = mapped ?? templateNote(node, !!out.inLoop);
    out.report.push(partial ? { level: 'partial', matt: entry, note: partial } : { level: 'ok', matt: entry });
    return node;
  } catch (error) {
    out.report.push({ level: 'manual', matt: entry, note: `Couldn't convert "${label}": ${error.message}` });
    return stub(entry, out);
  }
}

/**
 * Convert a run of MATT actions one for one, dropping the ones glyph needs no node for.
 * @param {{action: string, data: object}[]} entries The MATT actions to convert.
 * @param {{report: object[], stubs: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]} The converted program nodes.
 */
function convertEach(entries, out, matt) {
  return entries.map((entry) => convertAction(entry, out, matt)).filter(Boolean);
}

/**
 * Convert a flat MATT action list into glyph program nodes.
 * @param {{action: string, data: object}[]} actions MATT's flat `actions[]`, or a suffix of it.
 * @param {{report: object[], stubs: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]} The converted program nodes.
 */
function convertActions(actions, out, matt) {
  for (let i = 0; i < actions.length; i++) {
    const entry = actions[i];
    if (entry.action === 'first') {
      const node = buildFirstNode(entry, actions.slice(i + 1), out, matt);
      if (node) return [...convertEach(actions.slice(0, i), out, matt), node];
    }
    if (entry.action === 'setcurrent') {
      const built = buildSetCurrentAbsorption(entry, i, actions, out, matt);
      if (built) return [...convertEach(actions.slice(0, i), out, matt), built.node, ...built.rest];
    }
    if (entry.action === 'shuffle') {
      const built = buildShuffleLoopNode(entry, i, actions, out, matt);
      if (built) return [...convertEach(actions.slice(0, i), out, matt), built.node, ...built.rest];
    }
    if (entry.action === 'loop') {
      const built = buildLoopNode(entry, i, actions, out, matt);
      if (built) return [...convertEach(actions.slice(0, i), out, matt), built.node, ...built.rest];
    }
    if (entry.action === 'dialog') {
      const node = buildDialogNode(entry, i, actions, out, matt);
      if (node) return [...convertEach(actions.slice(0, i), out, matt), node];
    }
    if (entry.action === 'checkvalue') {
      const built = buildCheckValueGate(entry, i, actions, out, matt);
      if (built) return built;
    }
    const filter = FILTER_MAP[entry.action];
    if (!filter) continue;
    const narrowed = filter.narrow?.(entry.data ?? {});
    const condition = narrowed ? null : filter.expression(entry.data ?? {});
    if (!narrowed && !condition) continue;
    const inexact = narrowed || filter.exact?.(entry.data ?? {}) ? null : "Converted to an `if` gate using glyph's matching expression function - review the condition.";
    const note = filter.note?.(entry.data ?? {}) ?? inexact;
    out.report.push(note ? { level: 'partial', matt: entry, note } : { level: 'ok', matt: entry });
    const before = convertEach(actions.slice(0, i), out, matt);
    const rest = convertActions(actions.slice(i + 1), out, matt);
    if (narrowed) return [...before, { type: 'forEach', collection: narrowed.collection, filter: narrowed.filter, body: rest.map(rewritePreviousToItem) }];
    const failTag = filter.failLanding(entry.data ?? {});
    if (failTag) return [...before, { type: 'if', condition, then: [], else: [{ type: 'goto', tag: failTag }] }, ...rest];
    return [...before, { type: 'if', condition, then: rest }];
  }
  return convertEach(actions, out, matt);
}

/**
 * Resolve a MATT `first` filter's `entity` to a glyph collection resolver id.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {string|null} A `resolveCollection`-compatible id, or null if unbuildable.
 */
function tokenCollectionFromEntity(entity) {
  const id = idOf(entity);
  if (PLACEABLE_COLLECTIONS.includes(id)) return id;
  if (id?.startsWith('tagger')) return `tag:${id.slice(7)}`;
  return null;
}

/**
 * Resolve a MATT `first` filter's free-text `position` field to a `forEach` pick mode.
 * @param {*} position The raw MATT `position` value.
 * @returns {{pick: string, pickIndex?: number}|null} The `forEach` pick fields, or null if unrecognized.
 */
function pickFromPosition(position) {
  const pos = String(position ?? 'first').trim();
  if (pos === 'first' || pos === 'last' || pos === 'random') return { pick: pos };
  if (pos === 'min') return { pick: 'minName' };
  if (pos === 'max') return { pick: 'maxName' };
  const n = Number(pos);
  return Number.isInteger(n) && n >= 1 ? { pick: 'index', pickIndex: n - 1 } : null;
}

/** @type {Set<string>} MATT action ids whose glyph conversion records a result in the run's `{{results}}` bag. */
const RESULT_PRODUCING_ACTIONS = new Set(['runmacro', 'runcode', 'rolltable', 'trigger']);

/**
 * Build an `if` gate for a MATT `checkvalue` filter reading the run's accumulated results.
 * @param {{action: string, data: object}} entry The MATT `checkvalue` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]|null} The converted node array, or null.
 */
function buildCheckValueGate(entry, index, actions, out, matt) {
  const data = entry.data ?? {};
  if (isStaticValuePath(data.name) || !actions.slice(0, index).some((a) => RESULT_PRODUCING_ACTIONS.has(a.action))) return null;
  const condition = resultValueTest(data);
  if (!condition) return null;
  out.report.push({
    level: 'partial',
    matt: entry,
    note: "Converted to an `if` gate on the run's accumulated results - review the condition; glyph records a result for macro, code, roll-table and trigger actions only, so a value one of MATT's other actions wrote is not tracked."
  });
  const before = convertEach(actions.slice(0, index), out, matt);
  const rest = convertActions(actions.slice(index + 1), out, matt);
  const failTag = data.fail || null;
  if (failTag) return [...before, { type: 'if', condition, then: [], else: [{ type: 'goto', tag: failTag }] }, ...rest];
  return [...before, { type: 'if', condition, then: rest }];
}

/**
 * Rewrite every `previous`/`current` reference (object or string-embedded `{{previous}}`) in a program tree.
 * @param {*} node A program node, reference object, string, or other plain value.
 * @param {{kind: string, value: string}} ref The reference to substitute for an object-form reference.
 * @param {string} text The placeholder to substitute for a string-embedded `{{previous}}`.
 * @returns {*} The same value, with matching references rewritten in place.
 */
function rewritePrevious(node, ref, text) {
  if (typeof node === 'string') return node.includes('{{previous}}') ? node.replaceAll('{{previous}}', text) : node;
  if (!node || typeof node !== 'object') return node;
  if (node.kind === 'context' && node.value === 'previous') return { ...ref };
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) node[key] = value.map((child) => rewritePrevious(child, ref, text));
    else node[key] = rewritePrevious(value, ref, text);
  }
  return node;
}

/** Rewrite a loop body's references to MATT's "current" selection to the current `forEach` item. */
const rewritePreviousToItem = (node) => rewritePrevious(node, { kind: 'context', value: 'item' }, '{{item}}');

/** Rewrite a loop body's references to MATT's "current" selection to the triggering token. */
const rewritePreviousToTriggerToken = (node) => rewritePrevious(node, { kind: 'triggerToken', value: '' }, '{{token}}');

/**
 * Build a `forEach` node for a MATT `first` filter with an explicit, statically-resolvable `entity`.
 * @param {{action: string, data: object}} entry The MATT `first` action.
 * @param {{action: string, data: object}[]} restEntries The remaining MATT actions in this chain.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object|null} A `forEach` program node, or null.
 */
function buildFirstNode(entry, restEntries, out, matt) {
  const data = entry.data ?? {};
  const collection = tokenCollectionFromEntity(data.entity);
  if (!collection) return null;
  const pickInfo = pickFromPosition(data.position);
  if (!pickInfo) return null;
  out.report.push({ level: 'ok', matt: entry });
  const body = convertActions(restEntries, out, matt).map(rewritePreviousToItem);
  return { type: 'forEach', collection, ...pickInfo, body };
}

/** @type {Set<string>} MATT action ids whose `entity` defaults to the shared "current tokens" selection - plain actions only, no filters. */
const TOKEN_BAG_ACTIONS = new Set([
  'teleport',
  'rotation',
  'showhide',
  'alter',
  'hurtheal',
  'chatmessage',
  'activeeffect',
  'additem',
  'removeitem',
  'addtocombat',
  'elevation',
  'target',
  'scrollingtext',
  'movetoken'
]);

/**
 * Resolve a MATT `setcurrent` action's `entity` to a `resolveCollection`-compatible source id.
 * @param {*} entity The raw MATT `entity` value.
 * @param {boolean} [activeUser] `setcurrent`'s `activeuser` flag, for a Users entity.
 * @returns {string|null} A `resolveCollection`-compatible id, or null if unbuildable.
 */
function currentSourceFromEntity(entity, activeUser) {
  const id = idOf(entity);
  if (PLACEABLE_COLLECTIONS.includes(id)) return id;
  if (id === 'users') return activeUser ? 'users:active' : 'users';
  if (id?.startsWith('tagger')) return `tag:${id.slice(7)}`;
  return null;
}

/**
 * Turn a resolved `setcurrent` source id into a deterministic glyph variable name.
 * @param {string} source A `currentSourceFromEntity` result.
 * @returns {string} A `context.variables` key, namespaced to avoid colliding with hand-set variables.
 */
function currentBucketName(source) {
  return `current_${source.replace(/[^A-Za-z0-9]+/g, '_')}`;
}

/**
 * The MATT `collection` type a resolved `setcurrent` source's entities belong to, for matching a later Clear.
 * @param {string} source A `currentSourceFromEntity` result.
 * @returns {string|null} A MATT collection type name, or null if the source's type can't be inferred.
 */
function mattTypeOfSource(source) {
  if (source === 'within' || source === 'players' || source.startsWith('tag:')) return 'tokens';
  if (source === 'users' || source === 'users:active') return 'users';
  return null;
}

/**
 * Build a `setCurrent` node for a MATT `setcurrent` action, wrapping any following actions that consume the selection in a `forEach` over it.
 * @param {{action: string, data: object}} entry The MATT `setcurrent` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {{node: object, rest: object[]}|null} The converted node(s) plus the unabsorbed remainder, or null.
 */
function buildSetCurrentAbsorption(entry, index, actions, out, matt) {
  const data = entry.data ?? {};
  const mode = data.action ?? 'add';
  const restEntries = actions.slice(index + 1);

  if (mode === 'clear') {
    const names = new Set();
    let usedTagSource = false;
    for (const prior of actions.slice(0, index)) {
      if (prior.action !== 'setcurrent' || (prior.data?.action ?? 'add') === 'clear') continue;
      const source = currentSourceFromEntity(prior.data?.entity, prior.data?.activeuser);
      if (!source || mattTypeOfSource(source) !== data.collection) continue;
      if (source.startsWith('tag:')) usedTagSource = true;
      names.add(currentBucketName(source));
    }
    if (!names.size && !['tokens', 'users'].includes(data.collection)) return null;
    out.report.push(
      usedTagSource
        ? { level: 'partial', matt: entry, note: "Clears every Within/Players/Tagger selection tracked so far - a Tagger tag on something other than a token isn't accounted for." }
        : { level: 'ok', matt: entry }
    );
    const node = { type: 'sequence', children: [...names].map((name) => ({ type: 'setCurrent', name, action: 'clear' })) };
    return { node, rest: convertActions(restEntries, out, matt) };
  }

  const source = currentSourceFromEntity(data.entity, data.activeuser);
  if (!source) return null;
  const name = currentBucketName(source);
  const setCurrentNode = { type: 'setCurrent', name, source, action: mode, owners: !!data.owners };
  out.report.push({ level: 'ok', matt: entry });

  let count = 0;
  while (count < restEntries.length && TOKEN_BAG_ACTIONS.has(restEntries[count].action)) count++;
  if (count === 0) return { node: setCurrentNode, rest: convertCurrentTail(source, restEntries, out, matt) };
  const body = convertActions(restEntries.slice(0, count), out, matt).map(rewritePreviousToItem);
  const rest = convertCurrentTail(source, restEntries.slice(count), out, matt);
  return { node: { type: 'sequence', children: [setCurrentNode, { type: 'forEach', collection: `var:${name}`, body }] }, rest };
}

/**
 * Convert the actions following a `setcurrent`, resolving a leading `loop` over MATT's "current" selection to the variable it just filled.
 * @param {string} source The `currentSourceFromEntity` result the preceding `setcurrent` resolved to.
 * @param {{action: string, data: object}[]} tail The MATT actions following the `setcurrent` and anything absorbed with it.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]} The converted program nodes.
 */
function convertCurrentTail(source, tail, out, matt) {
  const entry = tail[0];
  const id = idOf(entry?.data?.entity);
  const usesCurrent = !id || id === 'previous' || id === 'current';
  if (entry?.action === 'loop' && usesCurrent && (entry.data?.collection ?? 'tokens') === mattTypeOfSource(source)) {
    const built = buildLoopBody(`var:${currentBucketName(source)}`, entry, 0, tail, out, matt);
    if (built) return [built.node, ...built.rest];
  }
  return convertActions(tail, out, matt);
}

/**
 * Resolve a MATT `loop` action's `entity` to a glyph collection resolver id.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {string|null} A `resolveCollection`-compatible id, or null if unbuildable.
 */
function loopCollectionFromEntity(entity) {
  const id = idOf(entity);
  if (PLACEABLE_COLLECTIONS.includes(id) || id === 'users' || id === 'users:active') return id;
  if (id?.startsWith('tagger')) return `tag:${id.slice(7)}`;
  return null;
}

/**
 * Convert a skipped span from its first Landing on, which MATT can still jump to.
 * @param {{action: string, data: object}[]} skipped Actions the loop analysis did not absorb.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object[]} The converted nodes, from the first landing onward.
 */
function labelReachable(skipped, out, matt) {
  const first = skipped.findIndex((a) => a.action === 'anchor');
  if (first === -1) {
    if (skipped.length) out.report.push({ level: 'skipped', matt: { actions: skipped }, note: 'Dropped as unreachable - no Landing in this run for a jump to target.' });
    return [];
  }
  if (first > 0) out.report.push({ level: 'skipped', matt: { actions: skipped.slice(0, first) }, note: 'Dropped as unreachable - before the first Landing in this run.' });
  out.report.push({ level: 'partial', matt: { actions: skipped.slice(first, first + 1) }, note: 'Kept as a jump target: the loop never reaches it, but MATT can land here by tag from elsewhere.' });
  const nodes = convertActions(skipped.slice(first), out, matt);
  if (nodes[0]?.type === 'landing') nodes[0].stop = true;
  return nodes;
}

/**
 * Build a `forEach` node for a MATT `loop` action over a known collection, its body ending at the first anchor that stops when reached.
 * @param {string|null} collection The resolved glyph collection id to iterate, or null to run the body once over the triggering token.
 * @param {{action: string, data: object}} entry The MATT `loop` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @param {object} [extraFields] Extra fields merged onto the built `forEach` node.
 * @param {{action: string, data: object}[]} [prefixEntries] Actions to convert and run ahead of the loop's own body, inside the same iteration.
 * @returns {{node: object, rest: object[]}|null} The `forEach` node plus the unabsorbed remainder, or null.
 */
function buildLoopBody(collection, entry, index, actions, out, matt, extraFields = {}, prefixEntries = []) {
  const data = entry.data ?? {};
  if (!data.tag || String(data.tag).includes('{{')) return null;
  const anchorIdx = actions.findIndex((a, i) => i > index && a.action === 'anchor' && a.data?.tag === data.tag);
  if (anchorIdx === -1) return null;

  let bodyEnd = anchorIdx + 1;
  let endedByResumeAnchor = false;
  let assumedConvention = false;
  while (bodyEnd < actions.length) {
    const a = actions[bodyEnd];
    if (a.action === 'anchor' && a.data?.stop) {
      endedByResumeAnchor = data.resume ? a.data?.tag === data.resume : false;
      break;
    }
    if (data.resume && a.action === 'anchor' && a.data?.tag === data.resume) {
      endedByResumeAnchor = true;
      assumedConvention = true;
      break;
    }
    bodyEnd++;
  }

  let resumeIdx = -1;
  let resumeIsBackward = false;
  if (data.resume) {
    const matches = (a, i) => i !== anchorIdx && a.action === 'anchor' && a.data?.tag === data.resume;
    resumeIdx = endedByResumeAnchor ? bodyEnd : actions.findIndex((a, i) => i > bodyEnd && matches(a, i));
    if (resumeIdx === -1) {
      resumeIdx = actions.findIndex((a, i) => i < index && matches(a, i));
      resumeIsBackward = resumeIdx !== -1;
    }
  }
  if (data.resume && resumeIdx === -1) {
    out.report.push({ level: 'skipped', matt: entry, note: 'The Resume landing was never found - nothing after this loop runs.' });
  } else if (!data.resume && bodyEnd < actions.length) {
    out.report.push({ level: 'skipped', matt: entry, note: 'The loop names no Resume landing, so MATT never returns to the chain - nothing after the loop body runs.' });
  }

  const notes = [
    collection ? '' : "Loops MATT's untouched starting selection, so it runs once over the triggering token.",
    assumedConvention
      ? "The Resume landing doesn't stop when reached, so MATT fell through and ran the rest of the chain once per entity as well - converted with the loop body ending at the Resume, which runs the tail once."
      : ''
  ].filter(Boolean);
  out.report.push(notes.length ? { level: 'partial', matt: entry, note: notes.join(' ') } : { level: 'ok', matt: entry });
  const rewrite = collection ? rewritePreviousToItem : rewritePreviousToTriggerToken;
  const wasInLoop = out.inLoop;
  out.inLoop = !!collection;
  const body = convertActions([...prefixEntries, ...actions.slice(anchorIdx + 1, bodyEnd)], out, matt).map(rewrite);
  out.inLoop = wasInLoop;
  const skipped = resumeIdx === -1 || resumeIsBackward ? actions.slice(bodyEnd) : [...actions.slice(index + 1, anchorIdx), ...actions.slice(bodyEnd, resumeIdx)];
  let tail = [];
  if (resumeIsBackward) {
    tail = [{ type: 'goto', tag: data.resume }];
    out.report.push({ level: 'partial', matt: entry, note: 'The Resume landing sits before the loop, so the chain jumps back to it - review the Go To for a runaway loop.' });
  } else if (resumeIdx !== -1) {
    tail = [{ type: 'landing', tag: data.resume }, ...convertActions(actions.slice(resumeIdx + 1), out, matt)];
  }
  const rest = [...tail, ...labelReachable(skipped, out, matt)];
  const node = collection ? { type: 'forEach', collection, ...extraFields, body } : { type: 'sequence', children: body };
  return { node, rest };
}

/**
 * Build a `forEach` node for a MATT `loop` action.
 * @param {{action: string, data: object}} entry The MATT `loop` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {{node: object, rest: object[]}|null} The `forEach` node plus the unabsorbed remainder, or null.
 */
function buildLoopNode(entry, index, actions, out, matt) {
  const data = entry.data ?? {};
  const id = idOf(data.entity);
  if (id && id !== 'previous' && id !== 'current') {
    const collection = loopCollectionFromEntity(data.entity);
    return collection ? buildLoopBody(collection, entry, index, actions, out, matt) : null;
  }
  if ((data.collection ?? 'tokens') !== 'tokens' || !startsAsTriggerTokens(actions, index)) return null;
  return buildLoopBody(null, entry, index, actions, out, matt);
}

/**
 * Whether MATT's running selection is still the untouched triggering tokens by `index`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {number} index The index to test up to.
 * @returns {boolean} True if nothing earlier in the chain replaced the selection.
 */
function startsAsTriggerTokens(actions, index) {
  return actions.slice(0, index).every((a) => {
    if (a.action === 'anchor') return true;
    if (!TOKEN_BAG_ACTIONS.has(a.action)) return false;
    const id = idOf(a.data?.entity);
    return !id || id === 'previous' || id === 'current';
  });
}

/** @type {Record<string, string>} MATT shuffle/loop `collection` ids mapped to the matching glyph forEach resolver id. */
const SHUFFLE_COLLECTION_MAP = {
  tokens: 'within',
  scene: 'scene',
  users: 'users',
  drawings: 'drawings',
  tiles: 'tiles',
  walls: 'walls',
  actors: 'actors',
  items: 'items',
  journal: 'journal',
  macros: 'macros'
};

/**
 * Build a `forEach` node for a MATT `shuffle` that feeds a later `loop` over the same collection, absorbing any intervening actions into the body.
 * @param {{action: string, data: object}} entry The MATT `shuffle` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[]}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {{node: object, rest: object[]}|null} The `forEach` node plus the unabsorbed remainder, or null.
 */
function buildShuffleLoopNode(entry, index, actions, out, matt) {
  const data = entry.data ?? {};
  const mattCollection = data.collection ?? 'tokens';
  const resolverId = SHUFFLE_COLLECTION_MAP[mattCollection];
  if (!resolverId) return null;

  let cursor = index + 1;
  while (actions[cursor] && TOKEN_BAG_ACTIONS.has(actions[cursor].action)) cursor++;
  const loopEntry = actions[cursor];
  if (loopEntry?.action !== 'loop') return null;
  const loopData = loopEntry.data ?? {};
  const loopId = idOf(loopData.entity);
  if (loopId && loopId !== 'previous' && loopId !== 'current') return null;
  if ((loopData.collection ?? 'tokens') !== mattCollection) return null;

  const prefixEntries = actions.slice(index + 1, cursor);
  const built = buildLoopBody(resolverId, loopEntry, cursor, actions, out, matt, { randomize: true }, prefixEntries);
  if (!built) return null;
  out.report.push({ level: 'ok', matt: entry });
  return built;
}

/**
 * Build a `showDialog` node for a MATT `dialog` action, synthesizing one named handler per landing the dialog can reach.
 * @param {{action: string, data: object}} entry The MATT `dialog` action.
 * @param {number} index `entry`'s index in `actions`.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {{report: object[], stubs: object[], destinations: object[], extraHandlers: Record<string, object>}} out Accumulators this call appends to.
 * @param {object} matt The tile's whole `flags.monks-active-tiles` object.
 * @returns {object|null} A `showDialog` program node, or null.
 */
function buildDialogNode(entry, index, actions, out, matt) {
  const data = entry.data ?? {};
  const dialogType = data.dialogtype ?? 'confirm';
  let buttonSpecs;
  if (dialogType === 'confirm')
    buttonSpecs = [
      { label: 'Yes', goto: data.yes },
      { label: 'No', goto: data.no }
    ];
  else if (dialogType === 'alert') buttonSpecs = [{ label: 'OK', resume: true }];
  else if (dialogType === 'custom') buttonSpecs = (data.buttons ?? []).map((b) => ({ label: b.name ?? b.label ?? 'OK', goto: b.goto }));
  else return null;

  const handlerByTag = new Map();
  /**
   * Name the handler holding everything MATT would run after a landing, building it on first use. Handlers take the landing's own name so an HTML file's `<input name="goto">` can pick one by tag.
   * @param {string} tag The landing tag, or '' for the actions following the dialog itself.
   * @returns {string|undefined} The handler name, or undefined if no such landing exists.
   */
  const handlerFor = (tag) => {
    if (handlerByTag.has(tag)) return handlerByTag.get(tag);
    const bodyStart = tag ? actions.findIndex((a) => a.action === 'anchor' && a.data?.tag === tag) + 1 : index + 1;
    if (!bodyStart) return undefined;
    const name = tag || `__mattDialog_${foundry.utils.randomID()}`;
    out.extraHandlers[name] = { type: 'sequence', children: convertActions(actions.slice(bodyStart), out, matt) };
    handlerByTag.set(tag, name);
    return name;
  };
  const landing = (tag) => handlerFor(tag) ?? handlerFor('_failedlanding');

  const buttons = buttonSpecs.map((spec) => {
    const handler = spec.resume ? handlerFor('') : spec.goto ? landing(spec.goto) : undefined;
    return handler ? { label: spec.label, handler } : { label: spec.label };
  });
  const closeHandler = data.close === '_prevent' ? undefined : data.close ? landing(data.close) : handlerFor('');
  if (data.file) for (const a of actions) if (a.action === 'anchor' && a.data?.tag) handlerFor(a.data.tag);

  const title = translateMattTemplate(data.title ?? '');
  const content = data.file ? '' : translateMattTemplate(data.content ?? '');
  const notes = [];
  if (title === null || content === null) notes.push('Text names a MATT template root glyph has no equivalent for - rewrite its {{...}} placeholders by hand.');
  if (data.file)
    notes.push("The HTML file is rendered as authored: its own {{...}} placeholders resolve against glyph's run context, not MATT's, and a form field named `goto` picks the landing to run.");
  if (data.showto === 'owner' || data.showto === 'previous') notes.push(`MATT's "${data.showto}" audience has no glyph keyword - the dialog now shows to everyone.`);
  if (data.classes) notes.push(`The dialog's custom CSS classes ("${data.classes}") were dropped.`);
  if (data.id) notes.push(`The dialog's id ("${data.id}") was dropped - glyph's Close Dialog closes whichever dialog this trigger opened.`);
  out.report.push(notes.length ? { level: 'partial', matt: entry, note: notes.join(' ') } : { level: 'ok', matt: entry });
  return {
    type: 'showDialog',
    title: title ?? data.title ?? '',
    content: content ?? data.content ?? '',
    contentFile: data.file || undefined,
    buttons,
    closeHandler,
    width: dialogSize(data.width),
    height: dialogSize(data.height),
    audience: audienceFromShowto(data.showto)
  };
}

/**
 * Read one of MATT's dialog size fields, which also accept "auto" and templates glyph has no number for.
 * @param {*} value The raw MATT `width`/`height` value.
 * @returns {number|undefined} A positive pixel size, or undefined to size the dialog automatically.
 */
function dialogSize(value) {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : undefined;
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
 * Replace every pending-Region teleport destination in a program tree with the real Region reference created for it.
 * @param {object} node A program node (recurses through `children`/`then`/`else`/`body`).
 * @param {Record<string, object>} regionRefByDestId Destination id -> resolved `{kind: 'uuid', value}` reference.
 * @returns {object} The same node, with pending destinations resolved in place.
 */
export function resolveDestinations(node, regionRefByDestId) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'teleportToken' && node.destination?.kind === '__pendingRegion') node.destination = regionRefByDestId[node.destination.value] ?? null;
  for (const key of ['children', 'then', 'else', 'body']) if (Array.isArray(node[key])) node[key] = node[key].map((child) => resolveDestinations(child, regionRefByDestId));
  return node;
}

/**
 * Replace every pending Tile reference in a program tree with the real Behavior UUID created for that Tile.
 * @param {object} node A program node (recurses through `children`/`then`/`else`/`body`).
 * @param {Record<string, string>} behaviorUuidByTileUuid Tile UUID -> its converted Behavior UUID.
 * @returns {object} The same node, with pending behaviors resolved in place.
 */
export function resolvePendingBehaviors(node, behaviorUuidByTileUuid) {
  if (!node || typeof node !== 'object') return node;
  if (node.behavior?.kind === '__pendingBehavior') {
    const uuid = behaviorUuidByTileUuid[node.behavior.value];
    node.behavior = uuid ? { kind: 'uuid', value: uuid } : null;
  }
  if (node.target?.kind === '__pendingBehavior') node.target = { kind: 'uuid', value: behaviorUuidByTileUuid[node.target.value] ?? node.target.value };
  if (typeof node.condition === 'string') node.condition = node.condition.replace(/__pendingBehavior:([^"]+)/g, (_, tileUuid) => behaviorUuidByTileUuid[tileUuid] ?? tileUuid);
  for (const key of ['children', 'then', 'else', 'body']) if (Array.isArray(node[key])) node[key] = node[key].map((child) => resolvePendingBehaviors(child, behaviorUuidByTileUuid));
  return node;
}

/**
 * Copy every MATT image list on a scene into glyph's own tile flags, imported tiles and untouched tagged targets alike.
 * @param {Scene} scene The scene being imported.
 * @returns {Promise<void>}
 */
async function copyTileImageLists(scene) {
  const updates = [];
  for (const tile of scene.tiles) {
    const matt = tile.flags?.['monks-active-tiles'];
    const images = (Array.isArray(matt?.files) ? matt.files : []).map((file) => (typeof file === 'string' ? file : file?.name)).filter((name) => typeof name === 'string' && name);
    if (!images.length) continue;
    const index = Number(matt.fileindex);
    updates.push({ _id: tile.id, [`flags.${MODULE.ID}.images`]: images, [`flags.${MODULE.ID}.imageIndex`]: Number.isInteger(index) ? index : 0 });
  }
  if (updates.length) await scene.updateEmbeddedDocuments('Tile', updates);
}

/**
 * A deleted source tile's Tagger tags, as Region creation flags, so the tag still names its trigger.
 * @param {TileDocument} tile The source Tile.
 * @param {object|null} linkedTile The conversion's linked-tile reference.
 * @returns {object} A `{flags}` fragment, empty when the tile survives or carries no tags.
 */
function taggerFlags(tile, linkedTile) {
  const tags = tile.flags?.tagger?.tags;
  return !linkedTile && Array.isArray(tags) && tags.length ? { flags: { tagger: { tags: [...tags] } } } : {};
}

/**
 * Create the auto-generated destination Region for one queued teleport target.
 * @param {{uuid?: string, point?: {x: number, y: number, sceneId: string|null}}} destination A queued destination descriptor.
 * @param {Scene} fallbackScene The scene a sceneless raw-point destination falls back to.
 * @returns {Promise<{scene: Scene, ref: {kind: 'uuid', value: string}}|null>} The created Region's scene and reference, or null if unresolvable.
 */
async function createTeleportDestinationRegion(destination, fallbackScene) {
  let targetScene, shape;
  if (destination.uuid) {
    const target = await fromUuid(destination.uuid);
    if (target instanceof TileDocument) {
      targetScene = target.parent;
      shape = regionShapeFromTile(target);
    } else if (target instanceof Scene) {
      targetScene = target;
      shape = { type: 'rectangle', x: 0, y: 0, width: target.dimensions.width, height: target.dimensions.height };
    }
  } else if (destination.point) {
    targetScene = destination.point.sceneId ? game.scenes.get(destination.point.sceneId) : fallbackScene;
    const size = targetScene?.dimensions.size ?? 100;
    shape = { type: 'rectangle', x: destination.point.x - size / 2, y: destination.point.y - size / 2, width: size, height: size };
  }
  if (!targetScene || !shape) return null;
  const [region] = await targetScene.createEmbeddedDocuments('Region', [{ name: 'Teleport Destination', shapes: [shape] }]);
  return { scene: targetScene, ref: { kind: 'uuid', value: region.uuid } };
}

/** @type {string} MATT's own Region-Behavior type, which drives a Tile's action list from a Region instead of the tile's own When list. */
const MATT_REGION_BEHAVIOR = 'monks-active-tiles.triggerTile';

/**
 * The core Region events a MATT `triggerTile` Region behavior fires `tile` from.
 * @param {TileDocument} tile The tile being converted.
 * @returns {{events: string[], shared: boolean}} The event names, and whether one of those behaviors also drives another Tile.
 */
function mattRegionBehaviorEvents(tile) {
  const events = new Set();
  let shared = false;
  for (const region of tile.parent?.regions ?? []) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== MATT_REGION_BEHAVIOR || behavior.disabled) continue;
      const uuids = [behavior.system.uuid ?? []].flat().filter(Boolean);
      if (!uuids.includes(tile.uuid)) continue;
      if (uuids.length > 1) shared = true;
      for (const event of behavior.system.events ?? []) events.add(event);
    }
  }
  return { events: [...events], shared };
}

/** @type {Record<string, string>} MATT's per-wall door change types mapped to the glyph pseudo-event that transition fires. `checklock` has no core equivalent. */
const DOOR_CHANGE_EVENTS = { open: 'doorOpened', close: 'doorClosed', lock: 'doorLocked', unlock: 'doorUnlocked', secret: 'doorRevealed' };

/**
 * Whether a MATT wall entity flag names `tile`, resolving MATT's three target shapes.
 * @param {object} entity The wall's `flags.monks-active-tiles.entity`.
 * @param {TileDocument} tile The tile being converted.
 * @param {WallDocument} wall The wall carrying the flag.
 * @returns {boolean}
 */
function doorWallNamesTile(entity, tile, wall) {
  const id = entity?.id;
  if (!id) return false;
  if (id === 'within') {
    const [x1, y1, x2, y2] = wall.c;
    return new PIXI.Rectangle(tile.x, tile.y, tile.width, tile.height).lineSegmentIntersects({ x: x1, y: y1 }, { x: x2, y: y2 }, { inside: true });
  }
  if (id.startsWith('tagger')) return isModuleActive('tagger') && Tagger.getByTag(id.substring(7), { matchAny: true }).includes(tile);
  return id === tile.uuid;
}

/**
 * The door pseudo-events the walls pointing at `tile` actually enable, MATT's door trigger being opted into per wall.
 * @param {TileDocument} tile The tile being converted.
 * @returns {{events: string[], checklock: boolean, matched: boolean}} The enabled event names, whether any wall wanted MATT's check-lock case, and whether any wall named the tile at all.
 */
function mattDoorWalls(tile) {
  const events = new Set();
  let checklock = false;
  let matched = false;
  for (const wall of tile.parent?.walls ?? []) {
    const flags = wall.flags?.['monks-active-tiles'];
    if (!flags?.entity) continue;
    let entity = flags.entity;
    if (typeof entity === 'string') {
      try {
        entity = JSON.parse(entity || '{}');
      } catch {
        continue;
      }
    }
    if (!doorWallNamesTile(entity, tile, wall)) continue;
    matched = true;
    for (const [change, event] of Object.entries(DOOR_CHANGE_EVENTS)) if (flags[change]) events.add(event);
    if (flags.checklock) checklock = true;
  }
  return { events: [...events], checklock, matched };
}

/**
 * The `door` mode's mapping narrowed to what the tile's own walls enable.
 * @param {TileDocument} tile The tile being converted.
 * @returns {{pseudoEvents: string[], note: string}|null} A replacement mapping, or null to keep MODE_MAP's default fan-out.
 */
function doorMapping(tile) {
  const { events, checklock, matched } = mattDoorWalls(tile);
  if (!matched) return null;
  const lockNote = checklock ? " A wall also asked for MATT's Check Lock case - clicking an already-locked door - which core dispatches no event for; rebuild it by hand." : '';
  if (!events.length) return { pseudoEvents: [], note: `No wall pointing at this Tile enabled a door transition glyph can fire, so no door handler was wired.${lockNote}` };
  return { pseudoEvents: events, note: `Wired only the door transitions the walls pointing at this Tile enabled: ${events.join(', ')}.${lockNote}` };
}

/** @type {Record<string, string>} MATT's directional auto-anchors, mapped to the axis each reads. */
const AUTO_ANCHOR_AXES = { up: 'y', down: 'y', left: 'x', right: 'x' };

/** @type {RegExp} An auto-anchor tag carrying a value, like `_rotation90`. */
const AUTO_ANCHOR_VALUE = /^(rotation|elevation|darkness|time)(-?\d+(?:\.\d+)?)$/;

/**
 * Whether a MATT action is an auto-anchor - a Landing whose tag starts with `_`, excluding `_failedlanding`.
 * @param {{action: string, data: object}} entry One MATT action.
 * @returns {boolean}
 */
function isAutoAnchor(entry) {
  const tag = String(entry?.data?.tag ?? '');
  return entry?.action === 'anchor' && tag.startsWith('_') && tag !== '_failedlanding';
}

/**
 * The condition one auto-anchor tests, for one handler.
 * @param {string} tag The anchor's tag, `_` prefix included.
 * @param {string} event The handler key being built.
 * @param {Set<string>} modes The MATT trigger modes this handler stands for.
 * @returns {string|boolean|null} A glyph condition, true when the tag always matches, or null when it never can.
 */
function autoAnchorCondition(tag, event, modes) {
  const name = tag.slice(1);
  if (name === 'gm') return '{{event.user.isGM}} == true';
  if (name === 'player') return '{{event.user.isGM}} == false';
  if (MODE_MAP[name]) return modes.has(name) ? true : null;
  if (name.startsWith('door')) return DOOR_CHANGE_EVENTS[name.slice(4)] === event ? true : null;
  if (game.users?.getName(name)) return `{{event.user.name}} == "${name}"`;
  if (AUTO_ANCHOR_AXES[name]) return `moveDirection("${AUTO_ANCHOR_AXES[name]}") == "${name}"`;
  if (/^(up|down)-(left|right)$/.test(name)) return `moveDirection() == "${name}"`;
  const valued = AUTO_ANCHOR_VALUE.exec(name);
  if (!valued) return null;
  const [, kind, value] = valued;
  if (kind === 'rotation') return `{{token.rotation}} == ${value}`;
  if (kind === 'elevation') return `{{token.elevation}} == ${value}`;
  if (kind === 'darkness') return modes.has('darkness') ? `darkness() == ${Number(value) / 100}` : null;
  return modes.has('time') ? `timeOfDay() == ${value}` : null;
}

/**
 * The jump a handler opens with, reproducing MATT's auto-anchor dispatch.
 * @param {{action: string, data: object}[]} actions The tile's whole flat MATT action list.
 * @param {string} event The handler key being built.
 * @param {Set<string>} modes The MATT trigger modes this handler stands for.
 * @param {Set<string>} used Tags that reached at least one handler, appended to.
 * @returns {object[]} Nodes to run ahead of the chain, empty when no auto-anchor can match.
 */
function autoAnchorDispatch(actions, event, modes, used) {
  let nodes = [];
  for (const entry of actions.filter(isAutoAnchor).reverse()) {
    const tag = entry.data.tag;
    const condition = autoAnchorCondition(tag, event, modes);
    if (condition === null) continue;
    used.add(tag);
    nodes = condition === true ? [{ type: 'goto', tag }] : [{ type: 'if', condition, then: [{ type: 'goto', tag }], ...(nodes.length ? { else: nodes } : {}) }];
  }
  return nodes;
}

/**
 * Convert one MATT-flagged Tile into glyph shape, dry-run.
 * @param {TileDocument} tile A Tile carrying `flags.monks-active-tiles`.
 * @returns {{regionShapes: object[], linkedTile: object|null, disabled: boolean, system: object, report: object[], stubs: object[], destinations: object[]}} The converted result.
 */
export function convertTile(tile) {
  const matt = tile.flags?.['monks-active-tiles'];
  const report = [];
  const stubs = [];
  const destinations = [];
  if (!matt) {
    return { regionShapes: [regionShapeFromTile(tile)], linkedTile: null, disabled: true, system: buildTriggerSystem({ handlers: {} }), report, stubs, destinations };
  }
  const events = new Set();
  const pseudoEvents = new Set();
  const gates = new Map();
  const handlerKeys = new Set();
  const modesByEvent = new Map();
  for (const mode of String(matt.trigger ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)) {
    const mapping = mode === 'door' ? { ...MODE_MAP.door, ...(doorMapping(tile) ?? {}) } : MODE_MAP[mode];
    if (!mapping || mapping.manual) {
      if (mapping?.handler) {
        handlerKeys.add(mapping.handler);
        modesByEvent.set(mapping.handler, (modesByEvent.get(mapping.handler) ?? new Set()).add(mode));
      }
      report.push({ level: mapping?.handler ? 'partial' : 'manual', matt: { mode }, note: mapping?.note ?? `Unrecognized MATT trigger mode "${mode}".` });
      continue;
    }
    if (mapping.note) report.push({ level: 'partial', matt: { mode }, note: mapping.note });
    for (const event of [...(mapping.events ?? []), ...(mapping.pseudoEvents ?? [])]) {
      (mapping.events?.includes(event) ? events : pseudoEvents).add(event);
      gates.set(event, gates.has(event) && gates.get(event) !== mapping.gate ? null : (mapping.gate ?? null));
      modesByEvent.set(event, (modesByEvent.get(event) ?? new Set()).add(mode));
    }
  }
  const fromRegion = mattRegionBehaviorEvents(tile);
  for (const event of fromRegion.events) {
    events.add(event);
    gates.set(event, null);
  }
  if (fromRegion.events.length) {
    report.push({
      level: fromRegion.shared ? 'partial' : 'ok',
      matt: { mode: 'region' },
      note: fromRegion.shared
        ? 'Driven by a MATT triggerTile Region behavior, whose events were carried onto this Region; that behavior also names another Tile, so review which Region should own the chain.'
        : 'Driven by a MATT triggerTile Region behavior, whose events were carried onto this Region.'
    });
  }
  const out = { report, stubs, destinations, extraHandlers: {} };
  const sequence = { type: 'sequence', children: convertActions(matt.actions ?? [], out, matt) };
  const handlers = { ...out.extraHandlers };
  const autoTags = new Set((matt.actions ?? []).filter(isAutoAnchor).map((entry) => entry.data.tag));
  const usedTags = new Set();
  for (const event of [...events, ...pseudoEvents, ...handlerKeys, 'onDemand']) {
    const gate = gates.get(event);
    const dispatch = event === 'onDemand' ? [] : autoAnchorDispatch(matt.actions ?? [], event, modesByEvent.get(event) ?? new Set(), usedTags);
    const children = [...dispatch, ...foundry.utils.deepClone(sequence.children)];
    handlers[event] = gate ? { type: 'sequence', children: [{ type: 'if', condition: gate, then: children }] } : { type: 'sequence', children };
  }
  if (autoTags.size) {
    const unused = [...autoTags].filter((tag) => !usedTags.has(tag));
    report.push(
      unused.length
        ? {
            level: 'partial',
            matt: { autoanchors: [...autoTags] },
            note: `Each handler now opens by jumping to the auto-anchor MATT would have picked for that trigger. These match no event this tile listens for, so nothing reaches them: ${unused.join(', ')}.`
          }
        : { level: 'ok', matt: { autoanchors: [...autoTags] }, note: 'Each handler now opens by jumping to the auto-anchor MATT would have picked for that trigger.' }
    );
  }
  const fieldOverrides = {};
  for (const [mattKey, glyphKey] of Object.entries(FIELD_MAP)) if (matt[mattKey] !== undefined) fieldOverrides[glyphKey] = matt[mattKey];
  const cursorAlready = [...pseudoEvents].some((name) => CURSOR_PSEUDO_EVENTS.includes(name));
  for (const [mattKey, note] of Object.entries(DROPPED_FIELDS)) {
    if (!matt[mattKey]) continue;
    if (mattKey === 'pointer' && cursorAlready) report.push({ level: 'ok', matt: { pointer: matt.pointer }, note });
    else report.push({ level: 'skipped', matt: { [mattKey]: matt[mattKey] }, note });
  }
  const program = JSON.stringify(handlers);
  const visible = tile.alpha > 0 && !!tile.texture?.src;
  const needsTile = program.includes('"linkedTile"') || program.includes('tileData(') || (Array.isArray(matt.files) && matt.files.length > 0);
  const linkedTile = visible || needsTile ? { kind: 'uuid', value: tile.uuid } : null;
  if (!visible) {
    const note = needsTile
      ? 'Tile has no visible texture (alpha 0) - an invisible marker, but kept and linked because the converted chain still targets it.'
      : 'Tile has no visible texture (alpha 0) - an invisible marker nothing in the chain targets, so it is deleted and the Region takes its place, carrying its Tagger tags.';
    report.push({ level: 'ok', matt: { tile: tile.name || tile.id }, note });
  }
  const system = { ...buildTriggerSystem({ events: [...events], pseudoEvents: [...pseudoEvents], handlers }), ...fieldOverrides, linkedTile };
  const regionShapes = regionShapesFromTile(tile, system.traceAlpha);
  if (system.traceAlpha) {
    report.push(
      regionShapes[0].type === 'polygon'
        ? { level: 'ok', matt: { usealpha: true }, note: "The Tile's image was traced into the Region's shape, so the trigger area follows the picture." }
        : {
            level: 'partial',
            matt: { usealpha: true },
            note: "The Tile's image couldn't be traced (no loaded texture, a scaled or offset texture, or too complex an outline) - the Region covers the Tile's bounds instead. Re-save the trigger with the Tile's scene active to retry."
          }
    );
  }
  return { regionShapes, linkedTile, disabled: matt.active === false, system, report, stubs, destinations };
}

/**
 * Every Tile on a scene carrying MATT trigger flags.
 * @param {Scene|undefined} scene The scene to scan.
 * @returns {TileDocument[]} Matching tiles.
 */
export function findMattTiles(scene) {
  return scene?.tiles.filter((tile) => !!tile.flags?.['monks-active-tiles']) ?? [];
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

  const regionRefByDestId = {};
  for (const destination of entries.flatMap((e) => e.converted.destinations)) {
    const created = await createTeleportDestinationRegion(destination, scene);
    if (created) regionRefByDestId[destination.destId] = created.ref;
  }

  await copyTileImageLists(scene);

  const regions = [];
  const behaviorUuidByTileUuid = {};
  const pendingIndexes = [];
  for (const { tile, converted } of entries) {
    const system = foundry.utils.deepClone(converted.system);
    let hasPending = false;
    for (const event of Object.keys(system.handlers)) {
      system.handlers[event] = resolveStubs(system.handlers[event], macroUuidByStubId);
      system.handlers[event] = resolveDestinations(system.handlers[event], regionRefByDestId);
      if (JSON.stringify(system.handlers[event]).includes('__pendingBehavior')) hasPending = true;
    }
    const [region] = await scene.createEmbeddedDocuments('Region', [
      {
        name: tile.name || 'MATT Import',
        shapes: converted.regionShapes,
        behaviors: [{ type: MODULE.BEHAVIOR_TYPE, system, disabled: converted.disabled }],
        ...taggerFlags(tile, converted.linkedTile)
      }
    ]);
    regions.push(region);
    behaviorUuidByTileUuid[tile.uuid] = region.behaviors.find((b) => b.type === MODULE.BEHAVIOR_TYPE)?.uuid;
    if (hasPending) pendingIndexes.push(regions.length - 1);
    if (!converted.linkedTile) await tile.delete();
  }

  for (const i of pendingIndexes) {
    const oldRegion = regions[i];
    const { converted } = entries[i];
    const system = foundry.utils.deepClone(converted.system);
    for (const event of Object.keys(system.handlers)) {
      system.handlers[event] = resolveStubs(system.handlers[event], macroUuidByStubId);
      system.handlers[event] = resolveDestinations(system.handlers[event], regionRefByDestId);
      system.handlers[event] = resolvePendingBehaviors(system.handlers[event], behaviorUuidByTileUuid);
    }
    const disabled = oldRegion.behaviors.find((b) => b.type === MODULE.BEHAVIOR_TYPE)?.disabled ?? false;
    const name = oldRegion.name;
    const shapes = oldRegion.shapes.map((s) => s.toObject());
    await oldRegion.delete();
    const [newRegion] = await scene.createEmbeddedDocuments('Region', [
      { name, shapes, behaviors: [{ type: MODULE.BEHAVIOR_TYPE, system, disabled }], ...taggerFlags(entries[i].tile, entries[i].converted.linkedTile) }
    ]);
    regions[i] = newRegion;
    behaviorUuidByTileUuid[entries[i].tile.uuid] = newRegion.behaviors.find((b) => b.type === MODULE.BEHAVIOR_TYPE)?.uuid;
  }

  return regions;
}
