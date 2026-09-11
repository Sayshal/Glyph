import { getNodeType } from '../nodes/registry.mjs';
import { MODE_MAP } from './matt-modes.mjs';
import { idOf, pointFromLocation, referenceFromSentinel } from './matt-sentinels.mjs';
import { translateMattTemplate } from './matt-template.mjs';

/** @type {RegExp} A UUID naming an embedded document with no Scene prefix. */
const EMBEDDED_ONLY = /^(?:Tile|Token|Drawing|Wall|Note|Region|AmbientLight|AmbientSound|MeasuredTemplate)\.[a-zA-Z0-9]{16,}$/;

/** @type {string[]} MATT entity sentinels naming a group of placeables, each matching a glyph resolver by name. */
export const PLACEABLE_COLLECTIONS = ['within', 'players', 'players:active', 'controlled'];

/** @type {{kind: string, value: string}} The trigger's own linked Tile, meant by a tile action with no entity set. */
const SELF_TILE = { kind: 'linkedTile', value: '' };

/**
 * Resolve a MATT entity/location sentinel to a glyph reference, throwing if unresolved.
 * @param {*} entry The MATT entity/location value.
 * @param {string} [defaultType] The ctrl's `defaultType`, for a bare document id.
 * @param {string} [fallback] The ctrl's `defvalue`, used when the entity is unset.
 * @returns {object} The resolved reference.
 */
function requireRef(entry, defaultType, fallback = 'previous') {
  const ref = referenceFromSentinel(entry ?? fallback, defaultType);
  if (!ref) throw new Error('unresolved reference');
  return ref;
}

/**
 * Resolve a MATT location value to a point, throwing if unresolved.
 * @param {*} location The MATT location value.
 * @returns {{x: number, y: number}} The resolved point.
 */
function requirePoint(location) {
  const point = pointFromLocation(location);
  if (point) return point;
  const ref = referenceFromSentinel(location);
  if (!ref) throw new Error('location is neither a literal point nor a document glyph can resolve');
  if (ref.kind === 'uuid' && EMBEDDED_ONLY.test(ref.value)) {
    if (!location.sceneId) throw new Error(`"${ref.value}" names an embedded document without its scene, which glyph cannot resolve at import time`);
    return { kind: 'uuid', value: `Scene.${location.sceneId}.${ref.value}` };
  }
  return ref;
}

/**
 * Resolve a MATT entity sentinel to a bare UUID string.
 * @param {*} entry The MATT entity value.
 * @returns {string} The UUID.
 */
function requireUuid(entry, defaultType) {
  const ref = requireRef(entry, defaultType);
  if (ref.kind !== 'uuid') throw new Error('not a concrete document reference');
  return ref.value;
}

/**
 * Resolve a MATT Teleport Token `entity` value: a single triggering-token reference, or a full group.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {{single: true, ref: object}|{single: false, collection: string}} The resolved entity source.
 */
function resolveTeleportEntity(entity) {
  const id = idOf(entity) ?? 'token';
  if (id === 'within' || id === 'players') return { single: false, collection: id };
  if (id.startsWith('tagger')) return { single: false, collection: `tag:${id.slice(7)}` };
  return { single: true, ref: requireRef(entity ?? 'token') };
}

/**
 * Resolve a MATT Teleport Token `location` value to a glyph reference, queuing a Region to auto-create at commit time.
 * @param {*} location The raw MATT `location` value.
 * @param {{destinations: object[]}} out Accumulator this call appends to.
 * @returns {object} A glyph reference - a tag reference, or a pending-Region placeholder resolved at commit.
 */
function resolveTeleportDestination(location, out) {
  const id = idOf(location);
  if (id?.startsWith('tagger')) return { kind: 'tag', value: id.slice(7) };
  const point = pointFromLocation(location);
  const destId = foundry.utils.randomID();
  if (point) {
    out.destinations.push({ destId, point: { ...point, sceneId: location.sceneId ?? null } });
    return { kind: '__pendingRegion', value: destId };
  }
  out.destinations.push({ destId, uuid: requireUuid(location) });
  return { kind: '__pendingRegion', value: destId };
}

/**
 * Rewrite a MATT numeric field as a glyph formula: inline rolls expanded, `{{...}}` roots remapped.
 * @param {string} body The field body, with any sign and leading `=` already stripped.
 * @returns {string|null} A glyph formula, or null when the value is JavaScript with no formula equivalent.
 */
function mattFormula(body) {
  const expanded = body.replace(/\[\[(?:\/\w+\s+)?(.+?)\]{2,3}(?:\{[^}]*\})?/g, '($1)');
  const template = translateMattTemplate(expanded);
  if (!template) return null;
  if (template.includes('{{')) return template;
  return /^[\dd+\-*/%.\s()]+$/i.test(template) ? template : null;
}

/**
 * Parse a MATT numeric field, splitting off its relative `+ n`/`- n` form and falling back to a formula.
 * @param {*} raw The raw MATT text value.
 * @returns {{relative: boolean, value?: number, formula?: string}} The number, or the formula that produces it.
 */
function numericOrFormula(raw) {
  const text = String(raw ?? '').trim();
  const relative = /^[+-]\s/.test(text);
  const body = relative ? text.slice(1).trim() : text.replace(/^=\s*/, '');
  const negated = relative && text.startsWith('-');
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(body)) {
    const value = Number(body);
    return { relative, value: negated ? -value : value };
  }
  const formula = mattFormula(body);
  if (!formula) throw new Error('only a number, a template, or a roll converts - this is an expression MATT evaluates as JavaScript');
  return { relative, formula: negated ? `-(${formula})` : formula };
}

/**
 * Build a `runCode` node for MATT's `= expr` alter form, which it evaluated as JavaScript against the document.
 * @param {object} data The MATT `alter` action data.
 * @param {string} expression The expression body, with its leading `=` stripped.
 * @returns {object} A `runCode` program node.
 */
function alterExpressionNode(data, expression) {
  if (!expression) throw new Error('empty evaluated value');
  const ref = requireRef(data.entity);
  const source = ref.kind === 'triggerToken' ? 'token' : ref.kind === 'uuid' ? `await fromUuid(${JSON.stringify(ref.value)})` : null;
  if (!source) throw new Error("an evaluated value needs a concrete document, which this target doesn't name at import time");
  const path = JSON.stringify(String(data.attribute ?? ''));
  return { type: 'runCode', code: `const document = ${source};\nif (document) await document.update({ [${path}]: ${expression} });` };
}

/**
 * Note a location pinned to a scene, which a glyph point does not carry.
 * @param {*} location The raw MATT `location` value.
 * @returns {string|null} The note, or null.
 */
function crossSceneNote(location) {
  return location?.sceneId ? 'The location named a specific scene, which a glyph point does not carry - it now means the same coordinates on whichever scene the trigger runs on.' : null;
}

/**
 * Rewrite a MATT elevation expression as JavaScript, binding the target document to `document`.
 * @param {*} raw The raw MATT `value`.
 * @returns {string} The JavaScript expression body.
 */
function elevationExpression(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^=\s*/, '')
    .replace(/\{\{\s*entity\.(.*?)\s*\}\}/gs, (_match, path) => `foundry.utils.getProperty(document, ${JSON.stringify(path)})`);
}

/**
 * Assert that an integration's glyph node type is registered, so a missing module reports as itself.
 * @param {string} type The glyph node type name.
 * @param {string} moduleName The module's display name, for the error.
 * @returns {string} `type`.
 */
function requireNodeType(type, moduleName) {
  if (!getNodeType(type)) throw new Error(`${moduleName} is not active in this world, so glyph registers no action to convert this to`);
  return type;
}

/**
 * Parse a raw MATT text value as JSON, falling back to the raw string if it isn't valid JSON.
 * @param {*} raw The raw MATT text value.
 * @returns {*} The coerced value.
 */
export function coerceJsonValue(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const ACTION_MAP = {
  pause: { convert: (data) => ({ type: 'pauseGame', mode: ['pause', 'unpause', 'toggle'].includes(data.pause) ? data.pause : 'pause' }) },
  delay: {
    convert: (data) => {
      const text = String(data.delay ?? '').trim();
      if (!Number.isNaN(Number(text))) return { type: 'wait', seconds: Number(text) };
      return { type: 'wait', formula: text };
    },
    skip: (data) => (String(data.delay ?? '').trim() ? null : 'MATT parks its chain on an empty delay and never schedules the timer to resume it, so nothing after this ever ran.')
  },
  movement: { convert: (data) => ({ type: 'stopTokenMovement', token: requireRef(data.entity ?? 'token'), snap: !!data.snap }) },
  pancanvas: {
    convert: (data) => ({ type: 'panCanvas', location: requirePoint(data.location), scale: Number(data.location?.scale) || undefined, audience: audienceFromFor(data.panfor) }),
    partial: (data) => crossSceneNote(data.location)
  },
  ping: {
    convert: (data) => ({ type: 'pingLocation', location: requirePoint(data.location), style: data.style ?? 'pulse' }),
    partial: (data) => crossSceneNote(data.location)
  },
  teleport: {
    convert: (data, _matt, out) => {
      const entity = resolveTeleportEntity(data.entity);
      const destination = resolveTeleportDestination(data.location, out);
      const teleportNode = {
        type: 'teleportToken',
        token: entity.single ? entity.ref : { kind: 'context', value: 'item' },
        destination,
        placement: ['random', 'center', 'relative'].includes(data.position) ? data.position : 'random',
        snap: !!data.remotesnap,
        avoidOccupied: !!data.avoidtokens,
        pan: !!data.animatepan,
        keepOrigin: data.deletesource !== true,
        suppressTriggers: data.triggerremote !== true
      };
      return entity.single ? teleportNode : { type: 'forEach', collection: entity.collection, body: [teleportNode] };
    }
  },
  movetoken: {
    convert: (data) => ({ type: 'moveToken', token: requireRef(data.entity), destination: requirePoint(data.location), snap: !!data.snap }),
    partial: (data) => crossSceneNote(data.location)
  },
  rotation: {
    convert: (data) => {
      const { value, formula, relative } = numericOrFormula(data.rotation);
      const node = { type: 'rotateToken', token: requireRef(data.entity), relative, duration: Math.round((data.duration ?? 5) * 1000) };
      if (formula) return { ...node, rotationFormula: formula };
      return { ...node, rotation: relative ? value : ((value % 360) + 360) % 360 };
    },
    partial: (data) => (numericOrFormula(data.rotation).formula ? 'The value is resolved as a roll each run, so it is not normalized to 0-359 the way a fixed angle is.' : null)
  },
  showhide: {
    convert: (data) => {
      if (!['show', 'hide', 'toggle'].includes(data.hidden)) throw new Error(`unrecognized state "${data.hidden}"`);
      return { type: 'toggleTileVisibility', tile: requireRef(data.entity, 'tiles', 'tile'), mode: data.hidden, duration: Number(data.fade) || undefined };
    }
  },
  create: { convert: (data) => ({ type: 'createToken', actorUuid: requireUuid(data.entity, 'actors'), placement: data.position ?? 'random', snap: !!data.snap }) },
  createjournal: { convert: (data) => ({ type: 'createJournalNote', journalUuid: requireUuid(data.entity, 'journal'), location: requirePoint(data.location), icon: data.icon, snap: !!data.snap }) },
  activate: {
    convert: (data) => {
      const ref = requireRef(data.entity, 'tiles', 'tile');
      const documentType = ref.kind === 'uuid' ? ref.value.split('.').at(-2) : null;
      if (documentType === 'Tile' || (!documentType && (data.collection ?? 'tiles') === 'tiles')) {
        if (ref.kind !== 'uuid') throw new Error("turning another tile on/off needs that tile's own trigger, which a Previous or Tagger target doesn't name at import time");
        const mode = { activate: 'enable', deactivate: 'disable', toggle: 'toggle', previous: 'enable' }[data.activate];
        if (!mode) throw new Error(`unrecognized state "${data.activate}"`);
        return { type: 'toggleTriggerBehavior', behavior: { kind: '__pendingBehavior', value: ref.value }, mode };
      }
      const mode = { activate: 'show', deactivate: 'hide', toggle: 'toggle', previous: 'hide' }[data.activate];
      if (!mode) throw new Error(`unrecognized state "${data.activate}"`);
      return { type: 'toggleAmbientVisibility', placeable: ref, mode };
    }
  },
  alter: {
    convert: (data) => {
      const node = { type: 'alter', target: requireRef(data.entity), path: data.attribute };
      const text = String(data.value ?? '').trim();
      const bool = text.match(/^=\s*(true|false)$/i);
      if (bool) return { ...node, value: bool[1].toLowerCase() === 'true' };
      const relative = text.match(/^([+-])\s+(.+)$/);
      if (relative) {
        const body = relative[2].trim();
        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(body)) return { ...node, mode: 'add', value: relative[1] === '-' ? -Number(body) : Number(body) };
        return { ...node, mode: relative[1] === '-' ? 'remove' : 'add', value: body.split(',').map((entry) => coerceJsonValue(entry.trim())) };
      }
      if (text.startsWith('=')) return alterExpressionNode(data, text.slice(1).trim());
      return { ...node, value: coerceJsonValue(data.value) };
    },
    partial: (data) => {
      const text = String(data.value ?? '').trim();
      if (text.startsWith('=') && !/^=\s*(true|false)$/i.test(text))
        return 'MATT evaluated this value as JavaScript, so it converts to a Run Code action - check the expression reads the right property and returns the right type.';
      const relative = text.match(/^[+-]\s+(.+)$/);
      if (relative && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(relative[1].trim()))
        return 'This adds or removes list entries. On a property that holds a number rather than a list it does nothing, where MATT wrote the raw text.';
      return null;
    }
  },
  tempimage: {
    convert: (data) => ({ type: 'tempTileImage', tile: requireRef(data.entity), src: data.img || undefined, audience: audienceFromShowto(data.showto) })
  },
  hurtheal: {
    convert: (data) => {
      if (
        String(data.value ?? '')
          .trim()
          .startsWith('=')
      )
        throw new Error('the value is a JavaScript expression, which MATT ran through eval() and glyph has no equivalent for');
      const formula = hurtHealFormula(data.value);
      if (!formula) throw new Error('the value is empty, so there is nothing to roll');
      const node = { type: 'hurtHeal', actor: requireRef(data.entity), value: formula };
      if (data.chatMessage) node.chatCard = true;
      if (ROLL_MODE_MAP[data.rollmode]) node.rollMode = ROLL_MODE_MAP[data.rollmode];
      return node;
    }
  },
  playsound: {
    convert: (data) => ({
      type: 'playSound',
      path: data.audiofile,
      loop: !!data.loop,
      volume: Number(data.volume ?? 1),
      channel: 'environment',
      restrictToScene: !!data.scenerestrict,
      preventOverlap: !!data.prevent,
      waitForCompletion: !!data.delay,
      fadeIn: Number(data.fade ?? 0),
      audience: audienceFromFor(data.audiofor)
    })
  },
  playlist: {
    convert: (data) => {
      const state = { play: 'play', pause: 'pause', stop: 'stop', next: 'next', prev: 'previous' }[data.play || 'play'];
      if (!state) throw new Error('unrecognized playlist command has no glyph equivalent');
      const node = { type: 'playPlaylist', state };
      if (state === 'play') {
        const rawVolume = data.volume && typeof data.volume === 'object' ? data.volume.value : data.volume;
        if (Number.isFinite(Number(rawVolume))) node.volume = Number(rawVolume);
        if (data.loop) node.loop = true;
      }
      const id = idOf(data.entity);
      const collection = id === 'controlled' ? 'playing' : id?.startsWith('tagger') ? `tag:${id.slice(7)}` : null;
      if (collection) return { type: 'forEach', collection, body: [{ ...node, target: { kind: 'context', value: 'item' } }] };
      node.target = requireRef(data.entity);
      return node;
    }
  },
  stopsound: {
    convert: (data) => {
      const node = { type: 'stopSound' };
      if (Number.isFinite(Number(data.fade))) node.fade = Number(data.fade);
      const ref = referenceFromSentinel(data.entity);
      if (!ref) return node;
      if (ref.kind !== 'uuid') throw new Error("stopping a tagged tile's sound has no glyph equivalent (Stop Sound reads one named trigger's own tracked sounds)");
      node.behavior = { kind: '__pendingBehavior', value: ref.value };
      return node;
    }
  },
  showimage: { convert: (data) => ({ type: 'showImage', src: data.imagefile, caption: data.caption ?? '', audience: audienceFromShowto(data.showfor) }) },
  changedoor: {
    convert: (data) => {
      const changes = wallDoorChanges(data);
      const collection = multiCollection(data.entity) ?? (idOf(data.entity) === 'previous' ? 'previous' : null);
      if (collection) return { type: 'forEach', collection, body: [{ type: 'changeWallDoor', wall: { kind: 'context', value: 'item' }, ...changes }] };
      return { type: 'changeWallDoor', wall: requireRef(data.entity), ...changes };
    },
    skip: (data) => (Object.keys(wallDoorChanges(data)).length ? null : 'Every wall property was left on "--No Change--", so this action does nothing in MATT either.'),
    partial: (data) => {
      const dropped = WALL_CTRL_FIELDS.filter(([, key, map]) => data[key] && !isWallNoChange(data[key]) && wallChoice(data[key], map) === undefined).map(([, key]) => key);
      return dropped.length ? `Left ${dropped.join(' and ')} unchanged - no glyph equivalent for the configured value.` : null;
    }
  },
  notification: {
    convert: (data) => ({ type: 'notification', text: data.text, level: data.type === 'warning' ? 'warn' : (data.type ?? 'info'), audience: audienceFromShowto(data.showto) })
  },
  chatmessage: {
    convert: (data) => {
      const node = { type: 'chatMessage', text: data.text };
      if (data.flavor) node.flavor = data.flavor;
      if (data.incharacter) node.inCharacter = true;
      const audience = CHAT_AUDIENCE_MAP[data.showto];
      if (audience) node.audience = audience;
      if (data.chatbubble !== 'false') node.bubble = data.chatbubble === 'bubble' ? 'bubbleOnly' : 'messageAndBubble';
      if (data.language) node.language = String(data.language).split(':').pop();
      const speakerId = idOf(data.entity);
      if (speakerId?.startsWith('tagger')) {
        node.speaker = { kind: 'context', value: 'item' };
        return { type: 'forEach', collection: `tag:${speakerId.slice(7)}`, body: [node] };
      }
      const speaker = referenceFromSentinel(data.entity);
      if (speaker) node.speaker = speaker;
      return node;
    },
    partial: (data) =>
      CHAT_AUDIENCE_MAP[data.showto] || !data.showto || data.showto === 'everyone'
        ? null
        : `Shown to "${data.showto}", which glyph's audience list has no equivalent for - the message posts publicly, so set a Roll Mode or Audience by hand.`
  },
  runmacro: { convert: (data) => ({ type: 'runMacro', macroUuid: requireUuid(data.entity, 'macros'), args: data.args ? { matt: data.args } : undefined }) },
  runcode: {
    convert: (data) => ({ type: 'runCode', code: mattCodeShim(data.code ?? '') + (data.code ?? '') }),
    partial: (data) =>
      /\b(goto|stopmovement)\b/.test(data.code ?? '')
        ? "This code returns one of MATT's control values (`goto`/`stopmovement`), which steered MATT's action chain - glyph keeps a returned value as `{{previous}}` only, so rebuild that branch as a Goto or Stop action."
        : null
  },
  rolltable: { convert: (data) => ({ type: 'rollTable', tableUuid: requireUuid(data.rolltableid, 'rolltables'), displayChat: data.chatmessage !== false }) },
  resetfog: { convert: () => ({ type: 'resetFog' }) },
  activeeffect: {
    convert: (data) => {
      const mode = { add: 'add', remove: 'remove', toggle: 'toggle', clear: 'clear' }[data.addeffect ?? 'add'];
      if (!mode) throw new Error(`unrecognized effect mode "${data.addeffect}"`);
      if (mode !== 'clear' && !data.effectid) throw new Error('no condition selected');
      const node = { type: 'toggleCondition', mode };
      if (mode !== 'clear') node.statusId = data.effectid;
      const collection = multiCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, actor: { kind: 'context', value: 'item' } }] };
      return { ...node, actor: requireRef(data.entity) };
    },
    partial: (data) =>
      data.altereffect ? `A PF2e condition value ("${data.altereffect}") was dropped - glyph's Toggle Condition applies or removes a condition, with no numeric value to raise or lower.` : null
  },
  playanimation: {
    convert: (data) => {
      const state = { start: 'play', pause: 'pause', stop: 'stop', reset: 'reset', toggle: 'toggle' }[data.play ?? 'start'];
      if (!state) throw new Error(`unrecognized animation state "${data.play}"`);
      const node = { type: 'tileVideo', state, audience: audienceFromFor(data.animatefor) };
      if (state === 'play' && Number.isFinite(Number(data.offset))) node.offset = Number(data.offset);
      const collection = multiCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, tile: { kind: 'context', value: 'item' } }] };
      return { ...node, tile: requireRef(data.entity) };
    }
  },
  openjournal: {
    convert: (data) => {
      const journalUuid = requireUuid(data.entity);
      return { type: 'openJournal', uuid: data.page ? `${journalUuid}.JournalEntryPage.${data.page}` : journalUuid, audience: audienceFromShowto(data.showto) };
    }
  },
  openactor: { convert: (data) => ({ type: 'openActorSheet', actor: requireRef(data.entity), audience: audienceFromShowto(data.showto) }) },
  additem: { convert: (data) => ({ type: 'addItem', actor: requireRef(data.entity), itemUuid: requireUuid(data.item, 'items') }) },
  removeitem: { convert: (data) => ({ type: 'removeItem', actor: requireRef(data.entity), itemName: data.item }) },
  permissions: {
    convert: (data) => {
      if (!['default', 'none', 'limited', 'observer', 'owner'].includes(data.permission)) throw new Error(`unrecognized permission level "${data.permission}"`);
      const ref = requireRef(data.entity);
      const target = data.page && ref.kind === 'uuid' ? { kind: 'uuid', value: `${ref.value}.JournalEntryPage.${data.page}` } : ref;
      return { type: 'changePermissions', target, level: data.permission, users: audienceFromShowto(data.changefor) };
    },
    partial: (data) => {
      const notes = [];
      if (PERMISSION_AUDIENCE_NOTES[data.changefor]) {
        notes.push(`Changed for "${data.changefor}", which glyph's user list has no keyword for - ${PERMISSION_AUDIENCE_NOTES[data.changefor]}. Narrow it by hand.`);
      }
      if (targetsScene(data) && data.permission !== 'observer' && data.permission !== 'default') {
        notes.push(
          `MATT discarded the chosen level on a Scene and always wrote Observer (actions.js:4526), so this tile granted Observer whatever its dropdown said; glyph writes "${data.permission}" as chosen. Set it to Observer to keep what the tile actually did.`
        );
      }
      return notes.length ? notes.join(' ') : null;
    }
  },
  attack: {
    skip: (data) => {
      if (!data.attack?.id) return 'No attack item was chosen, which MATT itself treated as doing nothing (actions.js:4761).';
      if (data.rollattack === 'false') return 'Set to Use rather than Attack, which under the system did nothing but re-target (actions.js:4718).';
      return null;
    },
    convert: (data) => {
      const node = {
        type: 'dnd5eAttack',
        actor: requireRef(data.actor),
        itemId: data.attack.id,
        chatCard: data.rollattack === 'chatcard' || data.chatcard !== false,
        cardOnly: data.rollattack === 'chatcard',
        fastForward: !!data.fastforward,
        rollDamage: !!data.rolldamage,
        rollMode: data.rollmode
      };
      const collection = multiCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, target: { kind: 'context', value: 'item' } }] };
      const target = referenceFromSentinel(data.entity);
      return target ? { ...node, target } : node;
    }
  },
  trigger: {
    convert: (data) => {
      const targetRef = requireRef(data.entity);
      const node = { type: 'triggerBehavior', behavior: targetRef.kind === 'uuid' ? { kind: '__pendingBehavior', value: targetRef.value } : targetRef };
      const tokenRef = referenceFromSentinel(data.token);
      if (tokenRef) node.token = tokenRef;
      if (data.allowdisabled) node.allowDisabled = true;
      if (data.return === false) node.mergeResult = false;
      if (data.landing) node.startTag = data.landing;
      const collection = multiCollection(data.entity) ?? (idOf(data.entity) === 'previous' ? 'previous' : null);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, behavior: { kind: 'context', value: 'item' } }] };
      return node;
    },
    partial: (data) => (idOf(data.entity)?.startsWith('tagger') ? "Runs each tagged tile's trigger in turn - MATT runs them together, so a Wait in one now delays the next." : null)
  },
  scene: { convert: (data) => ({ type: 'changeScene', sceneUuid: requireUuid(data.sceneid, 'scenes'), activate: !!data.activate }) },
  scenebackground: { convert: (data) => ({ type: 'changeSceneBackground', sceneUuid: requireUuid(data.sceneid, 'scenes'), src: data.img }) },
  addtocombat: {
    convert: (data) => ({
      type: 'addToCombat',
      token: requireRef(data.entity),
      mode: data.addto === 'remove' ? 'remove' : 'add',
      start: data.addto !== 'remove' && !!data.start
    })
  },
  elevation: {
    convert: (data) => {
      const target = requireRef(data.entity);
      let parsed = null;
      try {
        parsed = numericOrFormula(data.value);
      } catch {
        return alterExpressionNode({ ...data, attribute: 'elevation' }, elevationExpression(data.value));
      }
      const node = { type: 'alter', target, path: 'elevation', mode: parsed.relative ? 'add' : 'set' };
      return parsed.formula ? { ...node, valueFormula: parsed.formula } : { ...node, value: parsed.value };
    },
    partial: (data) => {
      try {
        return numericOrFormula(data.value).formula ? 'MATT does not expand an inline roll on this action, so a bracketed roll it would have discarded now rolls for real.' : null;
      } catch {
        return 'The value is JavaScript, so it converts to a Run Code action that writes the elevation directly. It no longer batches with neighbouring updates.';
      }
    }
  },
  resethistory: { convert: () => ({ type: 'resetTriggerHistory' }) },
  preloadtileimage: {
    convert: (data) => {
      const node = { type: 'preloadTileImages', tile: referenceFromSentinel(data.entity) ?? SELF_TILE, audience: 'everyone' };
      const collection = multiCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, tile: { kind: 'context', value: 'item' } }] };
      return node;
    }
  },
  tileimage: {
    convert: (data) => {
      const node = {
        type: 'changeTileImage',
        tile: referenceFromSentinel(data.entity) ?? SELF_TILE,
        ...(imageSelectMode(data.select) ?? { select: 'next' }),
        transition: transitionFromMatt(data.transition),
        duration: (data.speed ?? 1) * 1000,
        repeat: Number(data.loop) > 1 ? Number(data.loop) : undefined
      };
      const collection = multiCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ ...node, tile: { kind: 'context', value: 'item' } }] };
      return node;
    },
    partial: (data) =>
      imageSelectMode(data.select)
        ? null
        : `Couldn't read the image-select value "${data.select}", so it fell back to Next - MATT allows a template or inline roll here, which glyph resolves when importing.`
  },
  delete: { convert: (data) => ({ type: 'deleteEntity', target: requireRef(data.entity) }) },
  target: { convert: (data) => ({ type: 'targetTokens', token: requireRef(data.entity), targeted: ['add', 'target'].includes(data.target), releaseOthers: data.target === 'target' }) },
  scenelighting: {
    convert: (data) => ({ type: 'adjustDarkness', mode: 'override', modifier: Number(data.darkness), duration: (data.speed ?? 1) * 1000 })
  },
  globalvolume: {
    convert: (data) => ({
      type: 'changeGlobalVolume',
      bus: data.volumetype,
      volume: Math.round(Math.pow(Math.min(1, Math.max(0, Number(data.volume) || 0)), 1.5) * 1000) / 1000,
      audience: audienceFromFor(data.for)
    }),
    skip: (data) =>
      ['globalPlaylistVolume', 'globalAmbientVolume', 'globalInterfaceVolume'].includes(data.volumetype)
        ? null
        : `The "${data.volumetype}" bus comes from Monk's Sound Enhancements, which glyph does not integrate with.`
  },
  gametime: {
    convert: (data) => {
      const raw = String(data.time ?? '').trim();
      const sign = /^[+-]/.test(raw) ? raw[0] : '';
      const body = sign ? raw.slice(1).trim() : raw;
      const seconds = clockSeconds(body);
      if (seconds === null) {
        const formula = body.includes(':') ? null : mattFormula(body);
        if (!formula) throw new Error('non-numeric value');
        const scaled = `(${formula}) * 60`;
        if (!sign) return { type: 'setGameTime', mode: 'timeOfDay', secondsFormula: scaled };
        return { type: 'setGameTime', mode: 'advance', secondsFormula: sign === '-' ? `-(${scaled})` : scaled };
      }
      if (!sign) return { type: 'setGameTime', mode: 'timeOfDay', seconds };
      return { type: 'setGameTime', mode: 'advance', seconds: sign === '-' ? -seconds : seconds };
    }
  },
  dialog: {
    convert: (data) => ({ type: 'showDialog', title: data.title, content: data.content ?? '', audience: audienceFromShowto(data.showto) }),
    partial: (data) => `Unrecognized dialog type "${data.dialogtype}" - the dialog now shows a single Confirm button, and its buttons and landing targets were dropped.`
  },
  closedialog: { convert: () => ({ type: 'closeDialog' }) },
  scrollingtext: {
    convert: (data) => ({
      type: 'scrollingText',
      target: requireRef(data.entity),
      text: data.text,
      duration: data.duration ? Number(data.duration) : undefined,
      anchor: ['center', 'bottom', 'top', 'left', 'right'][Number(data.anchor)],
      direction: ['center', 'bottom', 'top', 'left', 'right'][Number(data.direction)],
      audience: audienceFromShowto(data.for)
    })
  },
  preload: { convert: (data) => ({ type: 'preloadScene', sceneUuid: requireUuid(data.entity, 'scenes') }) },
  append: {
    convert: (data) => {
      const mode = { append: 'append', appendline: 'append', prepend: 'prepend', prependline: 'prepend', overwrite: 'overwrite', insert: 'insert' }[data.append] ?? 'append';
      const entryUuid = requireUuid(data.entity, 'journal');
      return {
        type: 'writeToJournal',
        pageUuid: data.page ? `${entryUuid}.JournalEntryPage.${data.page}` : entryUuid,
        text: data.text,
        line: data.append === 'appendline' || data.append === 'prependline',
        mode,
        index: mode === 'insert' ? Number(data.position) || 0 : undefined,
        replaceCount: mode === 'insert' && Number(data.replace) > 0 ? Number(data.replace) : undefined,
        createPage: !!data.create,
        pageName: data.create ? data.createname || undefined : undefined,
        language: data.language || undefined
      };
    },
    partial: (data) =>
      data.page
        ? null
        : data.create
          ? 'No journal page was chosen, so this adds a new page to the entry on every run, as MATT does.'
          : "No journal page was chosen, so this writes to the entry's first page, as MATT does.",
    skip: (data) =>
      ['players', 'previous', 'current'].includes(idOf(data.entity) ?? '') ? 'MATT resolves this target to tokens, which its own journal check then rejects, so the action never wrote anything.' : null
  },
  setvariable: {
    convert: (data) => {
      if (!data.name) throw new Error('no variable name');
      return {
        type: 'setVariable',
        name: data.name,
        value: data.value === '_null' ? null : coerceJsonValue(data.value),
        target: variableTarget(data.entity)
      };
    }
  },
  setcurrent: {
    manual:
      'A specific placeable (rather than a Within/Players/Users/Tagger selection), or a Clear naming a collection type nothing earlier in this chain could have populated, has no automatic conversion - rebuild by hand as a setCurrent node.'
  },
  shuffle: {
    manual: 'Nothing in this chain later loops over the same collection to consume the shuffled order - rebuild by hand as a For Each with the randomize option.'
  },
  url: { convert: (data) => ({ type: 'openURL', url: /^https?:\/\//.test(data.url) ? data.url : `http://${data.url}` }) },
  runbatch: { skip: "Forces MATT's queued document writes to land early. Glyph writes each action's changes as it runs, so there is nothing to flush - dropped." },
  distance: { manual: 'An entity this chain cannot resolve to a token, a collection or a concrete document has no automatic conversion - rebuild by hand as an If condition using distance().' },
  visibility: {
    manual: 'An entity or a target this chain cannot resolve to a token, a collection or a concrete document has no automatic conversion - rebuild by hand as an If condition using canSee().'
  },
  attribute: { manual: 'An attribute path mixing text with a template has no automatic conversion - rebuild by hand as an If condition using attribute().' },
  inventory: { manual: 'An entity this chain cannot resolve, or an item name mixing text with a template, has no automatic conversion - rebuild by hand as an If condition using itemCount().' },
  condition: { drop: (data) => !data.effectid, manual: 'Rebuild by hand as an If condition using hasCondition().' },
  checkvariable: { manual: "Rebuild by hand as an If condition comparing the variable's value." },
  checkvalue: {
    manual:
      'Nothing earlier in this chain records a result glyph tracks, or the value name is built from a template - rebuild by hand as an If condition using {{results}}, {{previous}} or a Variable.'
  },
  first: {
    manual:
      'This uses MATT\'s own "current" selection (Entity left as Previous/Current, or unset) rather than an explicit collection - glyph has no equivalent implicit accumulator. Rebuild by hand as a For Each choosing the collection yourself.'
  },
  anchor: { convert: (data) => ({ type: 'landing', tag: data.tag, stop: !!data.stop }) },
  goto: { convert: (data) => ({ type: 'goto', tag: data.tag, limit: data.limit ? Number(data.limit) || undefined : undefined }) },
  loop: {
    manual:
      "A Landing name built from a template (a different landing per entity), a Landing that never appears after the loop, or a Previous/Current selection this chain can't statically resolve have no automatic conversion - rebuild by hand as a For Each over the right collection."
  },
  stop: {
    convert: (data, _matt, out) => {
      const ref = referenceFromSentinel(data.entity);
      const self = () => (out?.inLoop ? { type: 'nextItem' } : { type: 'stopActions' });
      if (!ref || ref.kind === 'linkedTile') return self();
      if (ref.kind !== 'uuid') throw new Error("stopping a Previous or Tagger tile's chain has no automatic conversion - that target doesn't name a trigger at import time");
      return { type: 'stopActions', behavior: { kind: '__pendingBehavior', value: ref.value } };
    }
  },
  stoptriggers: {
    skip: "MATT's Stop Triggers returns no `continue` flag (actions.js:8347), so its own chain runs on - it only keeps other tiles from firing on the same event. Glyph has no cross-Region suppression, so nothing was emitted."
  },
  checkdata: {
    manual: 'An attribute path mixing text with a template has no automatic conversion - rebuild by hand as an If condition on tileData().'
  },
  playertype: {
    convert: (data) => {
      const gmTag = data.gm;
      const playerTag = data.player;
      if (!gmTag && !playerTag) return { type: 'stopActions' };
      return {
        type: 'if',
        condition: '{{event.user.isGM}} == true',
        then: gmTag ? [{ type: 'goto', tag: gmTag }] : [{ type: 'stopActions' }],
        else: playerTag ? [{ type: 'goto', tag: playerTag }] : [{ type: 'stopActions' }]
      };
    },
    partial: (data) =>
      [data.gm, data.player].some((tag) => String(tag ?? '').includes('{{')) ? 'A landing name built from a template was written out as literal text, so the jump will not find its landing.' : null
  },
  exists: {
    manual: 'A count that is not a comparison glyph can read, or a single named document rather than a collection, has no automatic conversion - rebuild by hand as an If condition using count().'
  },
  triggercount: { manual: 'The trigger count is not a comparison glyph can read - rebuild by hand as an If condition using triggerCount().' },
  tokencount: { manual: 'The per-token count is not a comparison glyph can read - rebuild by hand as an If condition using tokenCount().' },
  'tagger.execute': {
    convert: (data) => {
      const tag = String(data.tag ?? '');
      if (!tag || tag.includes('{{')) throw new Error('tag is empty or built from a template');
      const state = ['add', 'remove', 'toggle'].includes(data.state) ? data.state : 'add';
      const collection = entityCollection(data.entity);
      if (collection) return { type: 'forEach', collection, body: [{ type: requireNodeType('alterTag', 'Tagger'), entity: { kind: 'context', value: 'item' }, tag, state }] };
      return { type: requireNodeType('alterTag', 'Tagger'), entity: requireRef(data.entity ?? 'previous'), tag, state };
    }
  },
  'fxmaster.weather': {
    convert: (data) => {
      const effect = String(data.effect ?? '').split(':')[1];
      if (!effect) throw new Error('no particle effect selected');
      const options = Object.fromEntries(
        ['scale', 'direction', 'speed', 'lifetime', 'density'].map((key) => [key, data[key]]).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      return { type: requireNodeType('weatherEffect', 'FXMaster'), effect, options: Object.keys(options).length ? options : undefined };
    },
    partial: 'MATT toggles this effect by name, so re-running the action turned it back off; weatherEffect always starts it.'
  },
  'fxmaster.clear': { convert: () => ({ type: requireNodeType('clearWeatherEffects', 'FXMaster') }) },
  'forien-quest-log.openfql': { manual: "Opening Forien's Quest Log has no glyph equivalent - rebuild by hand as a Run Macro." },
  'forien-quest-log.openquest': { manual: "Opening a Forien's Quest Log quest has no glyph equivalent - rebuild by hand as a Run Macro." },
  'kandashis-fluid-canvas.execute': { manual: "Kandashi's Fluid Canvas effects have no glyph equivalent - rebuild by hand as a Run Macro." },
  'confetti.shoot': { manual: 'Confetti has no glyph equivalent - rebuild by hand as a Run Macro.' },
  'celebrate.shoot': { manual: 'Celebrate has no glyph equivalent - rebuild by hand as a Run Macro.' },
  'party-inventory.open-window': { manual: 'Opening Party Inventory has no glyph equivalent - rebuild by hand as a Run Macro.' },
  'dfreds-convenient-effects.dfreds-add': {
    manual: "Convenient Effects has no glyph equivalent - rebuild by hand with glyph's own Active Effect action, or as a Run Macro."
  },
  'dfreds-convenient-effects.dfreds-filter': {
    manual: 'Filtering by a Convenient Effect has no glyph equivalent - rebuild by hand as an If condition using hasCondition().'
  }
};

/** @type {Record<string, string>} MATT rollmode ids -> a core `CONST.DICE_ROLL_MODES` value. */
const ROLL_MODE_MAP = { roll: 'publicroll', gmroll: 'gmroll', blindroll: 'blindroll', selfroll: 'selfroll' };

/**
 * Convert a MATT `hurtheal` value into a glyph formula, inverting MATT's sign.
 * @param {*} raw The raw MATT `value`.
 * @returns {string} A glyph formula, or an empty string when there is nothing to roll.
 */
function hurtHealFormula(raw) {
  const text = String(raw ?? '')
    .replace(/\[\[(?:\/\w+\s+)?(.+?)\]{2,3}(?:\{[^}]*\})?/g, '($1)')
    .replace(/^([-+])\s+/, '$1')
    .trim();
  return text ? `-(${text})` : '';
}

/**
 * Convert a MATT `tileimage` select value into glyph's select mode and supporting fields.
 * @param {*} raw The raw MATT `select` value.
 * @returns {{select: string, index?: number, randomRange?: string}|null} The glyph fields, or null.
 */
function imageSelectMode(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { select: 'next' };
  if (['first', 'last', 'next', 'previous', 'random', 'other'].includes(text)) return { select: text };
  if (/^\d+$/.test(text)) return { select: 'index', index: Math.max(0, Number(text) - 1) };
  if (/^\d+\s*-\s*\d+$/.test(text)) return { select: 'random', randomRange: text };
  if (/^[\d\s,]+$/.test(text)) {
    const indexes = text
      .split(',')
      .map((part) => Number(part.trim()) - 1)
      .filter((n) => Number.isFinite(n) && n >= 0);
    return indexes.length ? { select: 'random', randomRange: indexes.join(',') } : null;
  }
  if (/^[\dd+\-*/\s()]+$/i.test(text)) return { select: 'random', randomRange: text };
  return null;
}

/**
 * Parse a MATT `gametime` value: `HH:MM[:SS]`, or a bare number of minutes.
 * @param {string} text The unsigned time text.
 * @returns {number|null} The value in seconds, or null.
 */
function clockSeconds(text) {
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part.trim()));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  const minutes = Number(text);
  return Number.isFinite(minutes) ? minutes * 60 : null;
}

/** @type {RegExp} A MATT numeric text field: an optional leading `=`, a number, an optional trailing `%`, and nothing else. */
const NUMERIC_FIELD = /^=?\s*(-?(?:\d+\.?\d*|\.\d+))\s*%?$/;

/** @type {RegExp} A MATT inline roll, `[[1d100]]` or `[[/publicroll 1d100]]`, optionally with a `{flavor}` suffix. */
const INLINE_ROLL = /^\[\[\s*(?:\/[a-z]+\s+)?(.+?)\s*\]{2,3}(?:\{[^}]*\})?$/i;

/** @type {RegExp} Arithmetic over numbers alone, which MATT evals. */
const ARITHMETIC_FIELD = /^[\d\s+\-*/().]*[+\-*/][\d\s+\-*/().]*$/;

/**
 * Read a MATT random-percent field as a `chance()` argument.
 * @param {*} raw The MATT `number` field.
 * @returns {{arg: string, exact: boolean}|null} The expression source and whether it reproduces MATT exactly, or null if unreadable.
 */
function mattPercent(raw) {
  const text = String(raw ?? '').trim();
  const literal = text.match(NUMERIC_FIELD);
  if (literal) {
    const num = Math.abs(Number(literal[1]));
    return { arg: String(num > 1 ? num : num * 100), exact: true };
  }
  const inline = text.match(INLINE_ROLL);
  if (inline) return { arg: `roll("${inline[1].replace(/"/g, '\\"')}")`, exact: false };
  const bare = text.replace(/^=\s*/, '').replace(/\s*%$/, '').trim();
  const template = translateMattTemplate(bare);
  if (template && /^\{\{[^{}]+\}\}$/.test(template)) return { arg: template, exact: false };
  if (ARITHMETIC_FIELD.test(bare) && /\d/.test(bare)) return { arg: `roll("${bare}")`, exact: false };
  return null;
}

/** @type {string} A percent only known at run time, where MATT's fraction rescale is decided at convert time. */
const RUNTIME_PERCENT_NOTE =
  "The percent is only known at run time, so it converts as a plain percentage - MATT rescales a value of 1 or less as a fraction, which can't be decided ahead of the roll.";

/**
 * Filters with a safe rewrite to an `if` node using glyph's expression functions.
 * @type {Record<string, {expression: (data: object) => string|boolean|null, narrow?: (data: object) => {collection: string, filter: string}|null, exact?: (data: object) => boolean, note?: (data: object) => string|null, failLanding: (data: object) => string|null}>}
 */
export const FILTER_MAP = {
  condition: {
    expression: (data) => {
      const subject = singleEntitySubject(data.entity);
      return data.effectid && subject ? conditionTest(data)(subject) : null;
    },
    narrow: (data) => (data.effectid ? narrowedFilter(data, conditionTest(data)) : null),
    exact: (data) => isTriggerTokenEntity(data.entity),
    failLanding: () => null
  },
  random: {
    expression: (data) => {
      const percent = mattPercent(data.number);
      return percent ? `chance(${percent.arg})` : 'false';
    },
    exact: (data) => mattPercent(data.number)?.exact === true,
    note: (data) => {
      const percent = mattPercent(data.number);
      if (!percent) return 'MATT reads a percent it cannot parse as zero and never continues, so this converts as a permanently false gate.';
      return percent.exact ? null : RUNTIME_PERCENT_NOTE;
    },
    failLanding: (data) => data.fail || null
  },
  checkvariable: {
    expression: (data) => variableTest(data),
    exact: () => true,
    note: (data) => literalBooleanNote(data.value),
    failLanding: (data) => data.fail || null
  },
  checkvalue: {
    expression: (data) => valueTest(data),
    exact: () => true,
    note: (data) =>
      String(data.name ?? '').trim() === 'time'
        ? 'MATT counts minutes into the day from an offset fixed when the world was created; timeOfDay() reads the calendar clock instead, so the two only agree if that offset was zero.'
        : null,
    failLanding: (data) => data.fail || null
  },
  checkdata: {
    expression: (data) => tileDataTest(data),
    exact: () => true,
    note: (data) => literalBooleanNote(data.value),
    failLanding: (data) => data.fail || null
  },
  attribute: {
    expression: (data) => {
      const subject = singleEntitySubject(data.entity);
      const test = attributeTest(data);
      return test && subject ? test(subject) : null;
    },
    narrow: (data) => narrowedFilter(data, attributeTest(data)),
    exact: (data) => isTriggerTokenEntity(data.entity),
    failLanding: () => null
  },
  inventory: {
    expression: (data) => {
      const subject = singleEntitySubject(data.entity);
      const test = inventoryTest(data);
      return test && subject ? test(subject) : null;
    },
    narrow: (data) => narrowedFilter(data, inventoryTest(data)),
    exact: (data) => isTriggerTokenEntity(data.entity),
    note: (data) =>
      data.quantity
        ? 'MATT keeps an entity when any one matching item passes the quantity check; this compares the summed stack instead, which only differs when the same item is carried in more than one stack.'
        : null,
    failLanding: () => null
  },
  exists: {
    expression: (data) => {
      const comparison = variableComparison(data.count ?? '> 0');
      if (!comparison) return null;
      if ((idOfSentinel(data.entity) ?? 'previous') === 'token') return `1 ${comparison.operator} ${comparison.operand}`;
      const collection = entityCollection(data.entity);
      return collection ? `count("${collection}") ${comparison.operator} ${comparison.operand}` : null;
    },
    exact: () => true,
    note: (data) => (entityCollection(data.entity) === 'previous' ? PREVIOUS_BUCKET_NOTE : null),
    failLanding: (data) => data.none || null
  },
  triggercount: {
    expression: (data) => {
      const comparison = variableComparison(data.count ?? '> 1');
      return comparison ? `${data.unique ? 'uniqueTriggerCount' : 'triggerCount'}() ${comparison.operator} ${comparison.operand}` : null;
    },
    exact: (data) => !data.unique,
    note: (data) => (data.unique ? HISTORY_CAP_NOTE : null),
    failLanding: (data) => data.none || null
  },
  tokencount: {
    expression: (data) => {
      const subject = singleEntitySubject(data.entity);
      const test = tokenCountTest(data);
      return subject && test ? test(subject) : null;
    },
    narrow: (data) => narrowedFilter(data, tokenCountTest(data)),
    note: (data) =>
      narrowedFilter(data, tokenCountTest(data))
        ? HISTORY_CAP_NOTE
        : `${HISTORY_CAP_NOTE} MATT narrows the running selection to the tokens that pass; converted here as a gate on the one entity, which only matches while that selection holds a single token.`,
    failLanding: () => null
  },
  distance: {
    expression: (data) => {
      const continueMode = data.continue ?? 'within';
      if (continueMode === 'always') return true;
      const test = distanceTest(data);
      return test ? entityQuantifiedTest(data.entity, continueMode, test) : null;
    },
    narrow: (data) => narrowedFilter(data, distanceTest(data)),
    exact: (data) => isTriggerTokenEntity(data.entity),
    failLanding: () => null
  },
  visibility: {
    expression: (data) => {
      const target = visibilityTarget(data);
      if (!target) return null;
      const continueMode = data.continue ?? 'within';
      if (continueMode === 'always') return true;
      return entityQuantifiedTest(data.entity, continueMode, (ref) => `canSee(${ref}, ${target})`);
    },
    narrow: (data) => {
      const target = visibilityTarget(data);
      return target ? narrowedFilter(data, (ref) => `canSee(${ref}, ${target})`) : null;
    },
    exact: (data) => isTriggerTokenEntity(data.entity),
    failLanding: () => null
  },
  method: {
    expression: (data) => {
      const names = modeEventNames(data.method);
      if (!names.length) return 'false';
      if (names.length === 1) return `{{event.name}} == "${names[0]}"`;
      return `eventIs(${names.map((name) => `"${name}"`).join(', ')})`;
    },
    exact: (data) => {
      const names = modeEventNames(data.method);
      return names.length === 1 && !collidingModes(data.method).length;
    },
    note: (data) => {
      const mapping = MODE_MAP[data.method];
      if (!modeEventNames(data.method).length) {
        const why = mapping?.note ?? `Unrecognized MATT trigger mode "${data.method}".`;
        return `${why} Converted as a permanently false gate, which is what MATT's filter does here - glyph builds no handler for this mode, so the gate could never pass.`;
      }
      const collisions = collidingModes(data.method);
      if (collisions.length)
        return `MATT's "${data.method}" and "${collisions.join('", "')}" both map onto glyph's ${modeEventNames(data.method)[0]} event, so the gate can't tell them apart - review the condition.`;
      return mapping.note ?? null;
    },
    failLanding: (data) => data.goto || null
  }
};

/** @type {Record<string, string>} Glyph event name -> the MATT trigger mode it came from; first mode listed in `MODE_MAP` wins each collision. */
const MATT_MODE_BY_EVENT = Object.entries(MODE_MAP).reduce((map, [mode, mapping]) => {
  for (const name of [...(mapping.events ?? []), ...(mapping.pseudoEvents ?? [])]) map[name] ??= mode;
  return map;
}, {});

/**
 * Reassignments restoring the `method` and `event` shapes MATT's Run Code saw, prepended only when the imported code reads them.
 * @param {string} code The imported MATT code.
 * @returns {string} The prologue, empty when the code reads neither name.
 */
function mattCodeShim(code) {
  const lines = [];
  if (/\bmethod\b/.test(code)) lines.push(`method = ${JSON.stringify(MATT_MODE_BY_EVENT)}[method] ?? method;`);
  if (/\bevent\b/.test(code)) lines.push('event = { ...event, ...event.data };');
  if (!lines.length) return '';
  return ["// Added by the glyph importer, restoring the shapes MATT's Run Code used.", ...lines, '', ''].join('\n');
}

/**
 * The glyph event names a MATT trigger mode maps to.
 * @param {string} mode A MATT trigger mode id.
 * @returns {string[]} The mapped event names, empty when the mode has no glyph equivalent.
 */
function modeEventNames(mode) {
  const mapping = MODE_MAP[mode];
  return [...(mapping?.events ?? []), ...(mapping?.pseudoEvents ?? [])];
}

/**
 * Other MATT trigger modes that map onto the same single glyph event as this one.
 * @param {string} mode A MATT trigger mode id.
 * @returns {string[]} The colliding mode ids.
 */
function collidingModes(mode) {
  const names = modeEventNames(mode);
  if (names.length !== 1) return [];
  return Object.keys(MODE_MAP).filter((other) => other !== mode && modeEventNames(other).join() === names[0]);
}

/**
 * Build a MATT `distance` filter's geometry/distance test against `{{region}}`.
 * @param {object} data The MATT `distance` action's data.
 * @returns {((ref: string) => string)|null} A function producing the test expression for a given operand, or null if unbuildable.
 */
function distanceTest(data) {
  if (data.measure === 'lt') return (ref) => `insideRegion(${ref}, {{region}})`;
  const raw = data.distance && typeof data.distance === 'object' ? data.distance.value : data.distance;
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  const unit = data.unit === 'px' ? 'px' : 'sq';
  const cmp = data.measure === 'gt' ? '>' : '<=';
  const edge = data.from === 'center' ? '' : ', "edge"';
  return (ref) => `distance(${ref}, {{region}}${edge}) ${cmp} sceneDistance(${value}, "${unit}")`;
}

/**
 * Read a MATT text field as an expression argument: a quoted literal, or a bare template.
 * @param {*} raw The raw field value.
 * @returns {string|null} The argument source, or null if unbuildable.
 */
function templateArg(raw) {
  const text = translateMattTemplate(raw);
  if (!text) return null;
  if (!text.includes('{{')) return JSON.stringify(text);
  return /^\{\{[^{}]+\}\}$/.test(text) ? text : null;
}

/**
 * Build a MATT `attribute` filter's test against an operand.
 * @param {object} data The MATT `attribute` action's data.
 * @returns {((ref: string) => string)|null} A function producing the test expression for a given operand, or null if unbuildable.
 */
function attributeTest(data) {
  const path = templateArg(data.attribute);
  if (!path) return null;
  const { operator, operand } = comparisonFrom(data.value, '');
  return (ref) => `attribute(${ref}, ${path}) ${operator} ${operand}`;
}

/**
 * Build a MATT `inventory` filter's test against an operand.
 * @param {object} data The MATT `inventory` action's data.
 * @returns {((ref: string) => string)|null} A function producing the test expression for a given operand, or null if unbuildable.
 */
function inventoryTest(data) {
  const name = templateArg(data.item);
  if (!name) return null;
  const { operator, operand } = comparisonFrom(data.count, '> 0');
  const guard = satisfiedByZero(operator, operand);
  const quantity = data.quantity ? comparisonFrom(data.quantity, '>= 1') : null;
  const stack = (ref) => (quantity ? ` && itemQuantity(${ref}, ${name}) ${quantity.operator} ${quantity.operand}` : '');
  return (ref) => `${guard ? actorGuard(ref) : ''}itemCount(${ref}, ${name}) ${operator} ${operand}${stack(ref)}`;
}

/**
 * A clause prefix dropping actorless entities, the way MATT's `inventory` and `condition` filters do.
 * @param {string} ref The operand being tested.
 * @returns {string}
 */
function actorGuard(ref) {
  return `hasActor(${ref}) == true && `;
}

/**
 * Whether a comparison against an item count is already satisfied by zero.
 * @param {string} operator The comparison operator.
 * @param {string} operand The operand as an expression literal.
 * @returns {boolean}
 */
function satisfiedByZero(operator, operand) {
  const value = Number(coerceJsonValue(operand));
  if (operator === '==') return value === 0;
  if (operator === '!=') return value !== 0;
  if (operator === '>') return 0 > value;
  if (operator === '>=') return 0 >= value;
  if (operator === '<') return 0 < value;
  return 0 <= value;
}

/**
 * Build a MATT `condition` filter's status-effect test against an operand.
 * @param {object} data The MATT `condition` action's data.
 * @returns {(ref: string) => string} A function producing the test expression for a given operand.
 */
function conditionTest(data) {
  const wanted = data.hascondition !== 'hasnot';
  return (ref) => `${wanted ? '' : actorGuard(ref)}hasCondition(${ref}, "${data.effectid}") == ${wanted}`;
}

/**
 * Whether a MATT permission action's target is known to be a Scene, whose chosen level MATT discards for OBSERVER.
 * @param {object} data The MATT `permissions` action's data.
 * @returns {boolean} Whether the target resolves to a Scene at convert time.
 */
function targetsScene(data) {
  const id = idOf(data.entity);
  if (!id) return false;
  if (/^Scene\.[a-zA-Z0-9]+$/.test(id)) return true;
  return (id === 'previous' || id === 'current') && data.collection === 'scenes';
}

/** @type {Record<string, string>} MATT `changefor` values with no glyph user-list equivalent, and what they convert to instead. */
const PERMISSION_AUDIENCE_NOTES = {
  token: "it means the triggering token's owners, and this now changes ownership for the triggering user only",
  owner: "it means the previous action's tokens' owners, and this now changes ownership for every player",
  previous: "it is MATT's per-run user list, and this now changes ownership for every player"
};

/**
 * A MATT entity sentinel naming many documents -> a glyph `forEach` collection id.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {string|null} The collection id, or null when the sentinel names a single document.
 */
function multiCollection(entity) {
  const id = idOf(entity);
  if (!id) return null;
  if (id.startsWith('tagger')) return `tag:${id.slice(7)}`;
  return PLACEABLE_COLLECTIONS.includes(id) ? id : null;
}

/** @type {Record<string, string>} MATT door-state values (legacy lowercase, current CONST keys, legacy numbers) -> a `changeWallDoor.state` choice. */
const DOOR_STATE_MAP = { open: 'open', closed: 'closed', lock: 'locked', locked: 'locked', toggle: 'toggle', 0: 'closed', 1: 'open', 2: 'locked' };

/** @type {Record<string, string>} MATT door-type values -> a `changeWallDoor.doorType` choice. Lowercase "none" is MATT's no-change sentinel, where the CONST key "NONE" means not-a-door. */
const DOOR_TYPE_MAP = { NONE: 'none', door: 'door', secret: 'secret', toggle: 'toggle', 0: 'none', 1: 'door', 2: 'secret' };

/** @type {Record<string, string>} MATT movement-restriction values -> a `changeWallDoor.move` choice. */
const WALL_MOVE_MAP = { none: 'none', normal: 'normal', toggle: 'toggle', 0: 'none', 20: 'normal' };

/** @type {Record<string, string>} MATT sense-restriction values -> a light/sight/sound choice. */
const WALL_SENSE_MAP = {
  none: 'none',
  limited: 'limited',
  normal: 'normal',
  proximity: 'proximity',
  distance: 'distance',
  toggle: 'toggle',
  0: 'none',
  10: 'limited',
  20: 'normal',
  30: 'proximity',
  40: 'distance'
};

/** @type {[string, string, Record<string, string>][]} Each `changeWallDoor` field, the MATT ctrl id it reads, and its value map. */
const WALL_CTRL_FIELDS = [
  ['state', 'state', DOOR_STATE_MAP],
  ['doorType', 'type', DOOR_TYPE_MAP],
  ['move', 'movement', WALL_MOVE_MAP],
  ['light', 'light', WALL_SENSE_MAP],
  ['sight', 'sight', WALL_SENSE_MAP],
  ['sound', 'sound', WALL_SENSE_MAP]
];

/**
 * Whether a MATT wall ctrl value means "leave this property alone".
 * @param {*} raw The raw ctrl value.
 * @returns {boolean}
 */
function isWallNoChange(raw) {
  if (raw === undefined || raw === null || raw === '') return true;
  return String(raw).toLowerCase() === 'nothing' || raw === 'none';
}

/**
 * Resolve one MATT wall ctrl value to its glyph choice.
 * @param {*} raw The raw ctrl value.
 * @param {Record<string, string>} map The field's value map.
 * @returns {string|undefined} The choice, or undefined for no change or an unrecognized value.
 */
function wallChoice(raw, map) {
  if (raw === undefined || raw === null || raw === '' || String(raw).toLowerCase() === 'nothing') return undefined;
  return map[raw] ?? map[String(raw).toLowerCase()];
}

/**
 * Every `changeWallDoor` field a MATT `changedoor` action actually changes.
 * @param {object} data The MATT action data.
 * @returns {object} The node's change fields, empty when every ctrl is on "--No Change--".
 */
function wallDoorChanges(data) {
  const changes = {};
  for (const [field, key, map] of WALL_CTRL_FIELDS) {
    const value = wallChoice(data[key], map);
    if (value !== undefined) changes[field] = value;
  }
  return changes;
}

/** @type {Record<string, string>} Each comparison operator's negation. */
const INVERTED_OPERATORS = { '==': '!=', '!=': '==', '>': '<=', '<=': '>', '<': '>=', '>=': '<' };

/**
 * Resolve a MATT variable action's `entity` field to a `setVariable` target.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {object|undefined} A glyph reference, or undefined when it names this tile.
 */
function variableTarget(entity) {
  if (!entity || idOfSentinel(entity) === 'tile') return undefined;
  const ref = requireRef(entity);
  return ref.kind === 'uuid' ? { kind: '__pendingBehavior', value: ref.value } : ref;
}

/**
 * `comparisonFrom`, keeping a whole-field `{{...}}` template unquoted.
 * @param {*} raw The raw `value` field.
 * @returns {{operator: string, operand: string}|null} The comparison, or null if unbuildable.
 */
function variableComparison(raw) {
  const text = translateMattTemplate(String(raw ?? '').trim());
  if (text === null) return null;
  if (!text.includes('{{')) return comparisonFrom(text, '');
  const match = text.match(/^(==|!=|>=|<=|>|<|=)\s*(.*)$/);
  const operand = (match ? match[2] : text).trim();
  if (!/^\{\{[^{}]+\}\}$/.test(operand)) return null;
  return { operator: !match || match[1] === '=' ? '==' : match[1], operand };
}

/**
 * Note MATT reading a `= true`/`= false` field as that literal instead of comparing.
 * @param {*} raw The raw `value` field.
 * @returns {string|null} A note when the field takes that path, otherwise null.
 */
function literalBooleanNote(raw) {
  return /^=\s*(true|false)$/i.test(String(raw ?? '').trim())
    ? "MATT's `= true`/`= false` returns that literal instead of comparing, so the check always passed or always failed - converted as the comparison it reads as."
    : null;
}

/**
 * Build a MATT `checkdata` filter's test against the Tile's own data.
 * @param {object} data The MATT `checkdata` action's data.
 * @returns {string|null} The test expression, or null if unbuildable.
 */
function tileDataTest(data) {
  const path = templateArg(data.attribute);
  if (!path) return null;
  const comparison = variableComparison(data.value);
  return comparison ? `tileData(${path}) ${comparison.operator} ${comparison.operand}` : null;
}

/**
 * Build a MATT `checkvariable` filter's test, quantified across the tiles its entity names.
 * @param {object} data The MATT `checkvariable` action's data.
 * @returns {string|null} The test expression, or null if unbuildable.
 */
function variableTest(data) {
  const name = translateMattTemplate(data.name);
  if (!name || name.includes('{{')) return null;
  const comparison = variableComparison(data.value);
  if (!comparison) return null;
  const { operator, operand } = data.type === 'none' ? { ...comparison, operator: INVERTED_OPERATORS[comparison.operator] } : comparison;
  const test = (ref) => `variable(${ref}, "${name}") ${operator} ${operand}`;
  const id = idOfSentinel(data.entity) ?? 'tile';
  if (id === 'tile') return test('');
  if (id === 'previous' || id === 'current') return test('{{previous}}');
  if (id.startsWith('tagger')) return `${data.type === 'any' ? 'any' : 'all'}("tag:${id.slice(7)}", ${test('{{item}}')})`;
  const uuid = requireUuidOrNull(data.entity);
  return uuid ? test(`"__pendingBehavior:${uuid}"`) : null;
}

/** @type {Record<string, string>} MATT `checkvalue` paths with a glyph equivalent. */
const VALUE_PATH_MAP = {
  darkness: 'darkness()',
  time: 'timeOfDay()',
  userId: '{{event.user.id}}',
  'event.shiftKey': '{{shiftKey}}',
  'event.altKey': '{{altKey}}',
  'event.ctrlKey': '{{ctrlKey}}',
  'event.metaKey': '{{metaKey}}'
};

/**
 * Whether a MATT `checkvalue` name is one `valueTest` can build.
 * @param {*} name The raw MATT `name` field.
 * @returns {boolean}
 */
export function isStaticValuePath(name) {
  return String(name ?? '').trim() in VALUE_PATH_MAP;
}

/**
 * Build a MATT `checkvalue` filter's test against a trigger-args root.
 * @param {object} data The MATT `checkvalue` action's data.
 * @returns {string|null} The test expression, or null if unbuildable.
 */
function valueTest(data) {
  const subject = VALUE_PATH_MAP[String(data.name ?? '').trim()];
  const comparison = subject ? variableComparison(data.value) : null;
  return comparison ? `${subject} ${comparison.operator} ${comparison.operand}` : null;
}

/**
 * Build a MATT `checkvalue` filter's test against the run's accumulated results.
 * @param {object} data The MATT `checkvalue` action's data.
 * @returns {string|null} The test expression, or null if unbuildable.
 */
export function resultValueTest(data) {
  const name = String(data.name ?? '').trim();
  if (!name || name.includes('{{')) return null;
  const comparison = variableComparison(data.value);
  return comparison ? `{{results.${name}}} ${comparison.operator} ${comparison.operand}` : null;
}

/**
 * Split one of MATT's free-text comparison fields into an operator and an operand.
 * @param {*} raw The raw field value.
 * @param {string} fallback The comparison to assume when the field is empty.
 * @returns {{operator: string, operand: string}} The operator, and the operand as an expression literal.
 */
function comparisonFrom(raw, fallback) {
  const text = String(raw ?? '').trim() || fallback;
  const match = text.match(/^(==|!=|>=|<=|>|<|=)\s*(.*)$/);
  const operator = !match ? '==' : match[1] === '=' ? '==' : match[1];
  return { operator, operand: JSON.stringify(coerceJsonValue(match ? match[2] : text)) };
}

/**
 * Whether a MATT filter's `entity` names the triggering token, which converts to `{{token}}` exactly.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {boolean}
 */
function isTriggerTokenEntity(entity) {
  return idOfSentinel(entity) === 'token';
}

/**
 * Resolve a MATT filter's `entity` field to a single expression operand.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {string|null} An operand, or null when the entity names a collection (which narrows instead).
 */
function singleEntitySubject(entity) {
  const id = idOfSentinel(entity) ?? 'previous';
  if (id === 'token') return '{{token}}';
  if (id === 'tile') return '{{region}}';
  return id === 'previous' || id === 'current' ? '{{previous}}' : null;
}

/**
 * Resolve a MATT `visibility` filter's `target` field to an expression operand.
 * @param {object} data The MATT `visibility` action's data.
 * @returns {string|null} An expression operand, or null if unbuildable.
 */
function visibilityTarget(data) {
  const id = idOfSentinel(data.target);
  if (!id || id === 'tile') return '{{region}}';
  if (id.startsWith('tagger')) return `byTag("${id.slice(7)}")`;
  const uuid = requireUuidOrNull(data.target);
  return uuid ? JSON.stringify(uuid) : null;
}

/**
 * Build a MATT `entity` filter field's quantified test.
 * @param {*} entity The raw MATT `entity` value.
 * @param {string} continueMode The MATT `continue` value (`within`/`all`).
 * @param {(ref: string) => string} test Builds the test expression for a given operand.
 * @returns {string|null} The full test expression, or null if `entity` doesn't resolve to a buildable source.
 */
function entityQuantifiedTest(entity, continueMode, test) {
  const id = idOfSentinel(entity) ?? 'previous';
  if (id === 'token') return test('{{token}}');
  const collection = entityCollection(entity);
  if (collection) return `${continueMode === 'all' ? 'all' : 'any'}("${collection}", ${test('{{item}}')})`;
  const uuid = requireUuidOrNull(entity);
  return uuid ? test(JSON.stringify(uuid)) : null;
}

/** @type {string} MATT keeps one result bucket per document type; glyph keeps a single `previous`. */
const PREVIOUS_BUCKET_NOTE =
  'MATT keeps one result bucket per document type and this read only the chosen one; glyph keeps a single previous result, so it reads whatever the preceding node produced.';

/**
 * Resolve a MATT filter `entity` field to a `resolveCollection`-compatible id.
 * @param {*} entity The raw MATT `entity` value.
 * @returns {string|null} A collection id, or null for a single-entity source.
 */
function entityCollection(entity) {
  const id = idOfSentinel(entity) ?? 'previous';
  if (id === 'previous' || id === 'current') return 'previous';
  if (PLACEABLE_COLLECTIONS.includes(id)) return id;
  return id.startsWith('tagger') ? `tag:${id.slice(7)}` : null;
}

/**
 * Build a MATT filter's narrowing form - the collection to walk and the per-item test to keep by.
 * @param {object} data The MATT filter action's data.
 * @param {((ref: string) => string)|null} test Builds the test expression for a given operand.
 * @returns {{collection: string, filter: string}|null} The `forEach` collection and filter, or null if it can't narrow.
 */
function narrowedFilter(data, test) {
  if ((data.continue ?? 'within') === 'all') return null;
  const collection = entityCollection(data.entity);
  return collection && test ? { collection, filter: test('{{item}}') } : null;
}

/**
 * @type {string} Glyph caps its trigger history, so a count derived from it undercounts a long-lived trigger.
 */
const HISTORY_CAP_NOTE = 'Glyph keeps only the most recent 500 history entries, so this count stops rising once that cap is reached.';

/**
 * Build a MATT `tokencount` filter's per-token test against glyph's trigger history.
 * @param {object} data The MATT `tokencount` action's data.
 * @returns {((ref: string) => string)|null} Builds the test for a given operand, or null if unbuildable.
 */
function tokenCountTest(data) {
  const comparison = variableComparison(data.count ?? '= 1');
  return comparison ? (ref) => `tokenCount(${ref}) ${comparison.operator} ${comparison.operand}` : null;
}

/**
 * Pull the sentinel id out of a MATT entity value.
 * @param {*} entry The raw MATT `entity` value.
 * @returns {string|undefined}
 */
function idOfSentinel(entry) {
  return typeof entry === 'string' ? entry : entry?.id;
}

/**
 * `requireUuid`, but returning null instead of throwing.
 * @param {*} entry The MATT entity value.
 * @returns {string|null}
 */
function requireUuidOrNull(entry) {
  try {
    return requireUuid(entry);
  } catch {
    return null;
  }
}

/**
 * MATT's named transitions
 * @param {string} matt The raw MATT transition name.
 * @returns {string} A glyph `changeTileImage` transition choice.
 */
function transitionFromMatt(matt) {
  if (!matt || matt === 'none') return 'none';
  if (matt === 'fade' || matt === 'blur') return 'fade';
  if (matt.startsWith('slide')) return matt.includes('random') ? 'slide-random' : matt;
  if (matt.startsWith('bump')) return matt.includes('random') ? 'bump-random' : matt;
  return 'fade';
}

/** @type {Record<string, string>} MATT's `showto` -> glyph's chat audience. */
const CHAT_AUDIENCE_MAP = { everyone: 'everyone', players: 'players', gm: 'gm', trigger: 'triggeringUser' };

/**
 * MATT's `showfor`/`showto` sentinel -> glyph's `AUDIENCE_FIELD` choices.
 * @param {string} showto The MATT audience sentinel.
 * @returns {string} A glyph audience choice.
 */
export function audienceFromShowto(showto) {
  if (showto === 'gm') return 'gm';
  if (showto === 'players') return 'players';
  if (showto === 'trigger' || showto === 'token') return 'triggeringUser';
  return 'everyone';
}

/**
 * MATT's `panfor` sentinel -> glyph's `AUDIENCE_FIELD` choices.
 * @param {string} panfor The MATT audience sentinel.
 * @returns {string} A glyph audience choice.
 */
function audienceFromFor(panfor) {
  return audienceFromShowto(panfor);
}
