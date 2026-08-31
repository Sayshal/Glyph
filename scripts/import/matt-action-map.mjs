/** MATT action -> glyph program node conversion table. */

import { pointFromLocation, referenceFromSentinel } from './matt-sentinels.mjs';

/**
 * Resolve a MATT entity/location sentinel to a glyph reference, throwing if unresolved.
 * @param {*} entry The MATT entity/location value.
 * @returns {object} The resolved reference.
 */
function requireRef(entry) {
  const ref = referenceFromSentinel(entry);
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
  if (!point) throw new Error('location is not a literal point');
  return point;
}

/**
 * Resolve a MATT entity sentinel to a bare UUID string.
 * @param {*} entry The MATT entity value.
 * @returns {string} The UUID.
 */
function requireUuid(entry) {
  const ref = requireRef(entry);
  if (ref.kind !== 'uuid') throw new Error('not a concrete document reference');
  return ref.value;
}

/**
 * Parse an absolute number, rejecting relative `+ n`/`- n` deltas.
 * @param {*} raw The raw MATT text value.
 * @returns {number} The absolute numeric value.
 */
function requireAbsoluteNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.startsWith('+') || text.startsWith('-')) throw new Error('relative value has no glyph equivalent');
  const value = parseFloat(text);
  if (!Number.isFinite(value)) throw new Error('non-numeric value');
  return value;
}

/**
 * Parse a raw MATT text value as JSON, falling back to the raw string if it isn't valid JSON.
 * @param {*} raw The raw MATT text value.
 * @returns {*} The coerced value.
 */
function coerceJsonValue(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const ACTION_MAP = {
  pause: {
    convert: (data) => ({ type: 'pauseGame', mode: ['pause', 'unpause', 'toggle'].includes(data.pause) ? data.pause : 'pause' })
  },
  delay: {
    convert: (data) => {
      const text = String(data.delay ?? '').trim();
      if (!text) throw new Error('empty delay value');
      if (!Number.isNaN(Number(text))) return { type: 'wait', seconds: Number(text) };
      const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const [min, max] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
        return { type: 'wait', formula: `1d${max - min + 1}+${min - 1}` };
      }
      return { type: 'wait', formula: text };
    }
  },
  movement: { convert: (data) => ({ type: 'stopTokenMovement', token: requireRef(data.entity ?? 'token') }) },
  pancanvas: { convert: (data) => ({ type: 'panCanvas', location: requirePoint(data.location), audience: audienceFromFor(data.panfor) }) },
  ping: { convert: (data) => ({ type: 'pingLocation', location: requirePoint(data.location), style: data.style ?? 'pulse' }) },
  teleport: {
    manual: "Teleport needs a destination Region, which MATT tiles don't have. Once the destination area is converted, add a Teleport Token action pointing at it by hand."
  },
  movetoken: { convert: (data) => ({ type: 'moveToken', token: requireRef(data.entity), destination: requirePoint(data.location), snap: !!data.snap }) },
  rotation: { convert: (data) => ({ type: 'rotateToken', token: requireRef(data.entity), rotation: ((requireAbsoluteNumber(data.rotation) % 360) + 360) % 360 }) },
  showhide: {
    convert: (data) => {
      if (!['show', 'hide'].includes(data.hidden)) throw new Error('toggle mode has no glyph equivalent');
      return { type: 'toggleTileVisibility', tile: requireRef(data.entity), hidden: data.hidden === 'hide' };
    }
  },
  create: { convert: (data) => ({ type: 'createToken', actorUuid: requireUuid(data.entity), placement: data.position ?? 'random', snap: !!data.snap }) },
  createjournal: { convert: (data) => ({ type: 'createJournalNote', journalUuid: requireUuid(data.entity), location: requirePoint(data.location), icon: data.icon }) },
  activate: {
    convert: (data) => {
      if (data.collection !== 'lights' && data.collection !== 'sounds') {
        throw new Error(
          "Turning another tile on/off can't convert automatically - that tile doesn't exist yet. Once both tiles are converted, add a Toggle Trigger action pointing at the other one by hand."
        );
      }
      const mode = { activate: 'enable', deactivate: 'disable', toggle: 'toggle' }[data.activate];
      if (!mode) throw new Error('"previous" mode has no glyph equivalent (glyph does not track prior hidden state)');
      return { type: 'toggleAmbientVisibility', placeable: requireRef(data.entity), hidden: mode === 'toggle' ? undefined : mode === 'disable' };
    }
  },
  alter: { convert: (data) => ({ type: 'alter', target: requireRef(data.entity), path: data.attribute, value: coerceJsonValue(data.value) }) },
  tempimage: {
    convert: (data) => ({ type: 'tempTileImage', tile: requireRef(data.entity), src: data.img || undefined, audience: audienceFromShowto(data.showto) })
  },
  hurtheal: {
    convert: (data) => {
      const text = String(data.value ?? '').trim();
      if (!text || text.includes('[[')) throw new Error('dice-roll value has no glyph equivalent');
      const value = parseFloat(text);
      if (!Number.isFinite(value)) throw new Error('non-numeric value');
      return { type: 'hurtHeal', actor: requireRef(data.entity), value };
    }
  },
  playsound: {
    convert: (data) => ({ type: 'playSound', path: data.audiofile, loop: !!data.loop, volume: Number(data.volume ?? 1), channel: 'environment' }),
    partial: 'Some sound options (scene restriction, overlap prevention, queuing) have no glyph equivalent and were dropped.'
  },
  playlist: {
    convert: (data) => {
      const state = { play: 'play', pause: 'stop', stop: 'stop', next: 'next', prev: 'previous' }[data.play];
      if (!state) throw new Error('unrecognized playlist command has no glyph equivalent');
      return { type: 'playPlaylist', target: requireRef(data.entity), state };
    },
    partial: "Volume and loop settings have no glyph equivalent here and were dropped. Pause became Stop - glyph doesn't have a separate pause state for playlists."
  },
  stopsound: {
    manual: "This stops a tile's currently-playing sound, but MATT never actually records which sound that is - there's nothing to convert. Use Stop Sound by hand instead."
  },
  showimage: { convert: (data) => ({ type: 'showImage', src: data.imagefile, caption: data.caption ?? '', audience: audienceFromShowto(data.showfor) }) },
  changedoor: {
    convert: (data) => {
      const changes = {};
      if (data.state) {
        const state = data.state === 'toggle' ? 'toggle' : { open: 'open', closed: 'closed', lock: 'locked' }[data.state];
        if (!state) throw new Error('unrecognized door state has no glyph equivalent');
        changes.state = state;
      }
      const restrictionLevels = { none: 'none', normal: 'normal', limited: 'limited', 0: 'none', 10: 'limited', 20: 'normal' };
      for (const key of ['move', 'light', 'sight', 'sound']) {
        const raw = data[key];
        if (raw === undefined || raw === null || raw === '') continue;
        if (raw === 'toggle') throw new Error(`"toggle" on the ${key} restriction has no glyph equivalent (glyph's changeWallDoor only supports toggle for door state)`);
        const level = restrictionLevels[String(raw).toLowerCase()];
        if (level) changes[key] = level;
      }
      if (!Object.keys(changes).length) throw new Error("no recognized wall/door change in this action's data");
      return { type: 'changeWallDoor', wall: requireRef(data.entity), ...changes };
    }
  },
  notification: {
    convert: (data) => ({ type: 'notification', text: data.text, level: data.type === 'warning' ? 'warn' : (data.type ?? 'info'), audience: audienceFromShowto(data.showto) })
  },
  chatmessage: {
    convert: (data) => ({ type: 'chatMessage', text: data.text }),
    partial: 'Flavor text, speaker override, and language options were dropped - the message now always posts as the triggering token.'
  },
  runmacro: { convert: (data) => ({ type: 'runMacro', macroUuid: requireUuid(data.entity), args: data.args ? { matt: data.args } : undefined }) },
  runcode: {
    convert: (data) => ({ type: 'runCode', code: data.code ?? '' }),
    partial: 'The available variables changed names (MATT had token/actor/entity; glyph has event/variables/region/scene) - check the code for references that need updating.'
  },
  rolltable: { convert: (data) => ({ type: 'rollTable', tableUuid: requireUuid(data.rolltableid), displayChat: data.chatmessage !== false }) },
  resetfog: { convert: () => ({ type: 'resetFog' }) },
  activeeffect: {
    convert: (data) => {
      if (!['add', 'remove'].includes(data.addeffect)) throw new Error('toggle/clear mode has no glyph equivalent');
      return { type: 'toggleCondition', actor: requireRef(data.entity), statusId: data.effectid, active: data.addeffect === 'add' };
    }
  },
  playanimation: {
    convert: (data) => {
      const state = { start: 'play', pause: 'pause', stop: 'stop', reset: 'reset' }[data.play];
      if (!state) throw new Error('toggle mode has no glyph equivalent');
      return { type: 'tileVideo', tile: requireRef(data.entity), state };
    }
  },
  openjournal: {
    convert: (data) => {
      const journalUuid = requireUuid(data.entity);
      return { type: 'openJournal', uuid: data.page ? `${journalUuid}.JournalEntryPage.${data.page}` : journalUuid, audience: audienceFromShowto(data.showto) };
    }
  },
  openactor: { convert: (data) => ({ type: 'openActorSheet', actor: requireRef(data.entity), audience: audienceFromShowto(data.showto) }) },
  additem: { convert: (data) => ({ type: 'addItem', actor: requireRef(data.entity), itemUuid: requireUuid(data.item) }) },
  removeitem: { convert: (data) => ({ type: 'removeItem', actor: requireRef(data.entity), itemName: data.item }) },
  permissions: {
    convert: (data) => {
      if (!['none', 'limited', 'observer', 'owner'].includes(data.permission)) throw new Error('"default" permission has no glyph equivalent');
      const ref = requireRef(data.entity);
      const target = data.page && ref.kind === 'uuid' ? { kind: 'uuid', value: `${ref.value}.JournalEntryPage.${data.page}` } : ref;
      return { type: 'changePermissions', target, level: data.permission };
    }
  },
  attack: {
    convert: (data) => {
      if (data.rollattack && data.rollattack !== 'attack') throw new Error(`"${data.rollattack}" mode needs to be rebuilt by hand (only a direct attack roll converts automatically)`);
      return {
        type: 'dnd5eAttack',
        item: requireRef(data.attack ?? data.entity),
        chatCard: data.chatcard !== false,
        fastForward: data.fastforward !== false,
        rollDamage: !!data.rolldamage,
        rollMode: data.rollmode
      };
    },
    partial: 'This is a best-effort guess at field names - check that the right item and actor were picked up before trusting it.'
  },
  trigger: {
    manual: "Fires a whole different tile's trigger from here - convert that tile first, then point at it by hand."
  },
  scene: { convert: (data) => ({ type: 'changeScene', sceneUuid: requireUuid(data.sceneid), activate: !!data.activate }) },
  scenebackground: { convert: (data) => ({ type: 'changeSceneBackground', sceneUuid: requireUuid(data.sceneid), src: data.img }) },
  addtocombat: {
    convert: (data) => {
      if (data.addto === 'remove') throw new Error('remove-from-combat has no glyph equivalent (addToCombat only adds)');
      return { type: 'addToCombat', token: requireRef(data.entity), start: !!data.start };
    }
  },
  elevation: { convert: (data) => ({ type: 'alter', target: requireRef(data.entity), path: 'elevation', value: requireAbsoluteNumber(data.value) }) },
  resethistory: { convert: () => ({ type: 'resetTriggerHistory' }) },
  preloadtileimage: { manual: 'Just preloads images into memory for MATT - not needed once converted.' },
  tileimage: {
    // index/randomRange field names are a best-effort guess - review if the picked image looks wrong.
    convert: (data, matt) => {
      const images = Array.isArray(matt?.files) ? matt.files.filter((f) => typeof f === 'string') : [];
      if (!images.length) throw new Error("this tile's own configured image list (flags.files) is empty or unreadable");
      const select = ['first', 'last', 'next', 'previous', 'random'].includes(data.select) ? data.select : data.select === 'other' ? 'index' : null;
      if (!select) throw new Error('unrecognized select mode has no glyph equivalent');
      return {
        type: 'changeTileImage',
        tile: requireRef(data.entity),
        select,
        images,
        index: select === 'index' ? Number(data.tileimageid) || 0 : undefined,
        randomRange: select === 'random' && data.tileimagerange ? String(data.tileimagerange) : undefined,
        transition: transitionFromMatt(data.transition),
        duration: (data.speed ?? 1) * 1000
      };
    }
  },
  delete: { convert: (data) => ({ type: 'deleteEntity', target: requireRef(data.entity) }) },
  target: { convert: (data) => ({ type: 'targetTokens', token: requireRef(data.entity), targeted: ['add', 'target'].includes(data.target), releaseOthers: data.target === 'target' }) },
  scenelighting: {
    convert: (data) => ({ type: 'adjustDarkness', mode: 'override', modifier: Number(data.darkness), duration: (data.speed ?? 1) * 1000 })
  },
  globalvolume: {
    convert: (data) => {
      if (!['globalPlaylistVolume', 'globalAmbientVolume', 'globalInterfaceVolume'].includes(data.volumetype)) throw new Error('unknown volume bus');
      return { type: 'changeGlobalVolume', bus: data.volumetype, volume: Number(data.volume) };
    }
  },
  gametime: {
    convert: (data) => {
      const text = String(data.time ?? '').trim();
      if (!/^[+-]/.test(text)) throw new Error("an absolute clock time has no glyph equivalent (glyph's setGameTime can only advance relatively)");
      const minutes = Number(text);
      if (!Number.isFinite(minutes)) throw new Error('non-numeric value');
      return { type: 'setGameTime', seconds: minutes * 60 };
    }
  },
  dialog: {
    convert: (data) => ({ type: 'showDialog', title: data.title, content: data.content ?? '', audience: audienceFromShowto(data.showto) }),
    partial: 'Custom buttons and their landing targets were dropped - the dialog now shows a single Confirm button.'
  },
  closedialog: { convert: () => ({ type: 'closeDialog' }) },
  scrollingtext: {
    convert: (data) => ({
      type: 'scrollingText',
      target: requireRef(data.entity),
      text: data.text,
      duration: data.duration ? Number(data.duration) : undefined,
      anchor: ['center', 'bottom', 'top', 'left', 'right'].includes(data.anchor) ? data.anchor : undefined,
      direction: ['center', 'bottom', 'top', 'left', 'right'].includes(data.direction) ? data.direction : undefined,
      audience: audienceFromShowto(data.for)
    }),
    partial: 'Anchor/direction were matched by best guess - check the text moves the direction you expect.'
  },
  preload: { convert: (data) => ({ type: 'preloadScene', sceneUuid: requireUuid(data.entity) }) },
  append: {
    convert: (data) => {
      const mode = { append: 'append', appendline: 'append', prepend: 'prepend', prependline: 'prepend', overwrite: 'overwrite', insert: 'insert' }[data.append];
      if (!mode) throw new Error('unrecognized append mode has no glyph equivalent');
      if (!data.page) throw new Error('no specific journal page selected');
      return {
        type: 'writeToJournal',
        pageUuid: `${requireUuid(data.entity)}.JournalEntryPage.${data.page}`,
        text: data.text,
        mode,
        index: mode === 'insert' ? Number(data.position) || 0 : undefined
      };
    }
  },
  setvariable: {
    convert: (data) => {
      const targetsSelf = !data.entity || referenceFromSentinel(data.entity) === null;
      if (!data.name || /[*?]/.test(data.name)) throw new Error('wildcard variable name has no glyph equivalent');
      return {
        type: 'setVariable',
        name: data.name,
        value: data.value === '_null' ? null : coerceJsonValue(data.value),
        target: targetsSelf ? undefined : requireRef(data.entity)
      };
    }
  },
  setcurrent: { manual: "Relies on a MATT-only concept (a mutable working list) that glyph doesn't have. No conversion possible." },
  shuffle: { manual: 'Same MATT-only concept as Set Current Collection - no glyph equivalent.' },
  url: { convert: (data) => ({ type: 'openURL', url: /^https?:\/\//.test(data.url) ? data.url : `http://${data.url}` }) },
  runbatch: { manual: 'Internal MATT bookkeeping with nothing to convert - not needed in glyph.' },

  distance: {
    manual: 'Rebuild by hand as an If condition using distance().'
  },
  visibility: {
    manual: "Checks whether one thing can see another. Glyph can do this (canSee()), but picking the right second target isn't safe to guess automatically - rebuild by hand as an If condition."
  },
  attribute: { manual: 'Rebuild by hand as an If condition using attribute().' },
  inventory: { manual: 'Rebuild by hand as an If condition using hasItem().' },
  condition: { manual: 'Rebuild by hand as an If condition using hasCondition().' },
  random: { manual: 'Rebuild by hand as an If condition using chance().' },
  checkvariable: { manual: "Rebuild by hand as an If condition comparing the variable's value." },
  checkvalue: { manual: 'Relies on MATT-only internal data glyph does not have. No conversion possible.' },
  first: {
    manual:
      "Picks one item from MATT's own working list, which glyph doesn't track (same reason as Set Current Collection). Glyph's For Each can pick one item this way - rebuild it by hand and choose the collection yourself."
  },

  anchor: { convert: (data) => ({ type: 'landing', tag: data.tag }) },
  goto: { convert: (data) => ({ type: 'goto', tag: data.tag, limit: data.limit ? Number(data.limit) || undefined : undefined }) },
  loop: { manual: 'Rebuild by hand as a For Each over the right collection.' },
  stop: {
    convert: (data) => {
      if (referenceFromSentinel(data.entity)) throw new Error("stopping a different tile's chain has no glyph equivalent (stopActions only stops the current run)");
      return { type: 'stopActions' };
    }
  },
  // "Stop Further Triggers" is always self-scoped in MATT (no entity field) - same as `stop`'s self-case.
  stoptriggers: { convert: () => ({ type: 'stopActions' }) },
  checkdata: {
    manual: "Compares data on the tile itself. Glyph can do this (tileData()), but the branch it gates isn't safe to rebuild automatically - rebuild by hand as an If condition."
  },
  playertype: {
    convert: (data) => {
      const gmTag = data.landing;
      const playerTag = data.fail;
      if (!gmTag && !playerTag) throw new Error('no landing tags found to redirect to');
      return {
        type: 'if',
        condition: '{{event.user.isGM}} == true',
        then: gmTag ? [{ type: 'goto', tag: gmTag }] : [],
        else: playerTag ? [{ type: 'goto', tag: playerTag }] : []
      };
    },
    partial: 'Best-effort guess at which landing is the GM path and which is the player path - double check both branches go the right way.'
  },
  method: { manual: 'Branches on how MATT itself was invoked - a MATT-only concept with no glyph equivalent.' }
};

/**
 * Filters with a safe rewrite to an `if` node using glyph's expression functions.
 * @type {Record<string, {expression: (data: object) => string|null, failLanding: (data: object) => string|null}>}
 */
export const FILTER_MAP = {
  condition: {
    expression: (data) => (data.effectid ? `hasCondition({{event.data.token}}, "${data.effectid}") == ${data.hascondition !== 'hasnot'}` : null),
    failLanding: () => null
  },
  random: {
    expression: (data) => {
      const num = parseFloat(data.number);
      if (Number.isNaN(num)) return null;
      return `chance(${Math.abs(num) > 1 ? Math.abs(num) : Math.abs(num) * 100})`;
    },
    failLanding: (data) => data.fail || null
  },
  checkvariable: {
    expression: (data) => {
      if (!data.name || /[*?]/.test(data.name)) return null;
      const targetsSelf = !data.entity || referenceFromSentinel(data.entity) === null;
      const ref = targetsSelf ? '' : requireUuidOrNull(data.entity);
      if (!targetsSelf && !ref) return null;
      return `variable(${ref ? `"${ref}"` : ''}, "${data.name}") == ${JSON.stringify(coerceJsonValue(data.value))}`;
    },
    failLanding: (data) => data.fail || null
  },
  attribute: {
    expression: (data) => (data.attribute ? `attribute({{event.data.token}}, "${data.attribute}") == ${JSON.stringify(coerceJsonValue(data.value))}` : null),
    failLanding: () => null
  },
  inventory: {
    expression: (data) => (data.item ? `hasItem({{event.data.token}}, "${data.item}")` : null),
    failLanding: () => null
  },
  exists: {
    expression: (data) => {
      const collection = { players: 'players', users: 'users', 'users:active': 'users:active', tokens: 'within', scene: 'scene', regions: 'regions', notes: 'notes' }[data.entity];
      if (!collection) return null;
      return `count("${collection}") ${{ equals: '==', notequal: '!=', greaterthan: '>', lessthan: '<' }[data.operator] ?? '>='} ${Number(data.count) || 0}`;
    },
    failLanding: () => null
  },
  triggercount: {
    expression: (data) => `triggerCount() ${{ equals: '==', notequal: '!=', greaterthan: '>', lessthan: '<' }[data.operator] ?? '>='} ${Number(data.count) || 0}`,
    failLanding: () => null
  },
  tokencount: {
    expression: (data) => `tokenCount({{event.data.token}}) ${{ equals: '==', notequal: '!=', greaterthan: '>', lessthan: '<' }[data.operator] ?? '>='} ${Number(data.count) || 0}`,
    failLanding: () => null
  },
  distance: {
    expression: (data) => {
      if (!data.location) return null;
      const target = requireRefOrNull(data.location);
      if (!target) return null;
      const mode = data.from === 'edge' ? ', "edge"' : '';
      const op = { equals: '==', notequal: '!=', greaterthan: '>', lessthan: '<', lessthanequal: '<=', greaterthanequal: '>=' }[data.operator] ?? '<=';
      if (data.continue !== 'any' && data.continue !== 'all') return `distance({{event.data.token}}, ${target}${mode}) ${op} ${Number(data.distance) || 0}`;
      const entityCollection = { players: 'players', users: 'users', 'users:active': 'users:active', tokens: 'within' }[idOfSentinel(data.entity)] ?? 'within';
      return `${data.continue}("${entityCollection}", distance({{item}}, ${target}${mode}) ${op} ${Number(data.distance) || 0})`;
    },
    failLanding: (data) => data.fail || null
  }
};

/**
 * Pull the sentinel id out of a MATT entity value, same as `matt-sentinels.mjs`'s private helper.
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
 * `requireRef` rendered as an inline expression operand, or null if unresolved/not a literal point.
 * @param {*} entry The MATT entity/location value.
 * @returns {string|null}
 */
function requireRefOrNull(entry) {
  const ref = referenceFromSentinel(entry);
  if (!ref) return null;
  if (ref.kind === 'context') return `{{${ref.value}}}`;
  return `"${ref.value}"`;
}

/**
 * MATT's 13 named transitions (`blur` has no glyph equivalent) collapsed to glyph's set
 * (`scripts/actions/tile.mjs`).
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

/**
 * MATT's `showfor`/`showto` sentinel -> glyph's `AUDIENCE_FIELD` choices (`scripts/actions/messaging.mjs`).
 * @param {string} showto The MATT audience sentinel.
 * @returns {string} A glyph audience choice.
 */
function audienceFromShowto(showto) {
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
