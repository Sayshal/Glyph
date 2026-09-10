import { resolveAudience, sendToAudience } from '../audience.mjs';
import { batchCreate, batchUpdate } from '../batch.mjs';
import { MODULE } from '../constants.mjs';
import { withTriggersSuppressed } from '../gates.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent, sendRenderIntent } from '../queries.mjs';
import { resolveNumber, setResult } from '../run-context.mjs';
import { resolvePoint, resolveReference } from '../targeting.mjs';
import { toTriggerBehavior } from '../tile-link.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';
import { resolveHidden } from './tile.mjs';

registerNodeType('pauseGame', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.pauseGame.label',
  hint: 'GLYPH.ACTIONS.pauseGame.hint',
  fields: [
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.pauseGame.FIELDS.mode.label',
      choices: { pause: 'GLYPH.PAUSE_MODE.pause', unpause: 'GLYPH.PAUSE_MODE.unpause', toggle: 'GLYPH.PAUSE_MODE.toggle' }
    }
  ],
  async execute(node) {
    const mode = node.mode ?? 'pause';
    await game.togglePause(mode === 'toggle' ? !game.paused : mode !== 'unpause', { broadcast: true });
  }
});

registerNodeType('toggleAmbientVisibility', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.toggleAmbientVisibility.label',
  hint: 'GLYPH.ACTIONS.toggleAmbientVisibility.hint',
  fields: [
    { name: 'placeable', widget: 'reference', label: 'GLYPH.ACTIONS.toggleAmbientVisibility.FIELDS.placeable.label', required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.toggleAmbientVisibility.FIELDS.mode.label',
      choices: { show: 'GLYPH.VISIBILITY_MODE.show', hide: 'GLYPH.VISIBILITY_MODE.hide', toggle: 'GLYPH.VISIBILITY_MODE.toggle' }
    }
  ],
  validate(node) {
    if (typeof node.placeable !== 'object') throw new Error('toggleAmbientVisibility.placeable must be a reference object.');
  },
  async execute(node, context) {
    const doc = resolveReference(node.placeable, context);
    if (!(doc instanceof AmbientLightDocument || doc instanceof AmbientSoundDocument)) return;
    await doc.update({ hidden: resolveHidden(node, doc) });
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => {
        const doc = resolveReference(node.placeable, context);
        const valid = doc instanceof AmbientLightDocument || doc instanceof AmbientSoundDocument;
        return { doc: valid ? doc : null, changes: valid ? { hidden: resolveHidden(node, doc) } : {} };
      })
    );
  }
});

registerNodeType('adjustDarkness', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.adjustDarkness.label',
  hint: 'GLYPH.ACTIONS.adjustDarkness.hint',
  fields: [
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.adjustDarkness.FIELDS.mode.label',
      choices: { override: 'GLYPH.DARKNESS_MODE.override', brighten: 'GLYPH.DARKNESS_MODE.brighten', darken: 'GLYPH.DARKNESS_MODE.darken' }
    },
    {
      name: 'modifier',
      widget: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      label: 'GLYPH.ACTIONS.adjustDarkness.FIELDS.modifier.label',
      hint: 'GLYPH.ACTIONS.adjustDarkness.FIELDS.modifier.hint',
      required: true
    },
    { name: 'duration', widget: 'number', min: 0, step: 100, label: 'GLYPH.ACTIONS.adjustDarkness.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.adjustDarkness.FIELDS.duration.hint' }
  ],
  validate(node) {
    if (typeof node.modifier !== 'number') throw new Error('adjustDarkness.modifier must be a number.');
  },
  async execute(node, context) {
    const scene = context.info.scene;
    if (!scene) return;
    const current = scene.environment.darknessLevel;
    const mode = node.mode ?? 'override';
    const target = mode === 'brighten' ? current * (1 - node.modifier) : mode === 'darken' ? 1 - (1 - current) * (1 - node.modifier) : node.modifier;
    await scene.update({ 'environment.darknessLevel': Math.min(1, Math.max(0, target)) }, { animateDarkness: node.duration || true });
  }
});

registerNodeType('resetTriggerHistory', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.resetTriggerHistory.label',
  hint: 'GLYPH.ACTIONS.resetTriggerHistory.hint',
  fields: [{ name: 'behavior', widget: 'reference', label: 'GLYPH.ACTIONS.resetTriggerHistory.FIELDS.behavior.label', hint: 'GLYPH.ACTIONS.resetTriggerHistory.FIELDS.behavior.hint' }],
  validate(node) {
    if (node.behavior !== undefined && typeof node.behavior !== 'object') throw new Error('resetTriggerHistory.behavior must be a reference object.');
  },
  async execute(node, context) {
    const target = node.behavior ? resolveReference(node.behavior, context) : context.info.behavior;
    if (!(target instanceof RegionBehavior) || target.type !== MODULE.BEHAVIOR_TYPE) return;
    await target.update({ [`flags.${MODULE.ID}.history`]: [], [`flags.${MODULE.ID}.triggerCount`]: 0 });
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => {
        const target = node.behavior ? resolveReference(node.behavior, context) : context.info.behavior;
        const valid = target instanceof RegionBehavior && target.type === MODULE.BEHAVIOR_TYPE;
        return { doc: valid ? target : null, changes: valid ? { [`flags.${MODULE.ID}.history`]: [], [`flags.${MODULE.ID}.triggerCount`]: 0 } : {} };
      })
    );
  }
});

registerNodeType('changeScene', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.changeScene.label',
  hint: 'GLYPH.ACTIONS.changeScene.hint',
  fields: [
    { name: 'sceneUuid', widget: 'uuid', documentType: 'Scene', label: 'GLYPH.ACTIONS.changeScene.FIELDS.sceneUuid.label', required: true },
    { name: 'activate', widget: 'boolean', label: 'GLYPH.ACTIONS.changeScene.FIELDS.activate.label' }
  ],
  validate(node) {
    if (typeof node.sceneUuid !== 'string' || !node.sceneUuid) throw new Error('changeScene.sceneUuid must be a non-empty string.');
  },
  async execute(node) {
    const scene = await fromUuid(node.sceneUuid);
    if (!(scene instanceof Scene)) return;
    if (node.activate && game.user.isGM) await scene.activate();
    else await scene.view();
  }
});

registerNodeType('changeSceneBackground', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.changeSceneBackground.label',
  hint: 'GLYPH.ACTIONS.changeSceneBackground.hint',
  fields: [
    {
      name: 'sceneUuid',
      widget: 'uuid',
      documentType: 'Scene',
      label: 'GLYPH.ACTIONS.changeSceneBackground.FIELDS.sceneUuid.label',
      hint: 'GLYPH.ACTIONS.changeSceneBackground.FIELDS.sceneUuid.hint',
      required: true
    },
    { name: 'src', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.changeSceneBackground.FIELDS.src.label', required: true }
  ],
  validate(node) {
    if (typeof node.sceneUuid !== 'string' || typeof node.src !== 'string') {
      throw new Error('changeSceneBackground.sceneUuid and .src must be strings.');
    }
  },
  async execute(node) {
    const scene = await fromUuid(node.sceneUuid);
    const level = scene?.levels.contents[0];
    if (level) await level.update({ 'background.src': node.src });
  }
});

registerNodeType('pingLocation', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.pingLocation.label',
  hint: 'GLYPH.ACTIONS.pingLocation.hint',
  fields: [
    { name: 'location', widget: 'point', label: 'GLYPH.ACTIONS.pingLocation.FIELDS.location.label', hint: 'GLYPH.ACTIONS.FIELDS.worldPoint.hint', required: true },
    {
      name: 'style',
      widget: 'select',
      label: 'GLYPH.ACTIONS.pingLocation.FIELDS.style.label',
      choices: { pulse: 'GLYPH.PING_STYLE.pulse', alert: 'GLYPH.PING_STYLE.alert', chevron: 'GLYPH.PING_STYLE.chevron', arrow: 'GLYPH.PING_STYLE.arrow' }
    }
  ],
  validate(node) {
    if (typeof node.location !== 'object') throw new Error('pingLocation.location must be a point object.');
  },
  async execute(node, context) {
    const location = resolvePoint(node.location, context);
    if (!location) return;
    await canvas.ping(location, node.style ? { style: node.style } : {});
  }
});

registerNodeType('resetFog', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.resetFog.label',
  hint: 'GLYPH.ACTIONS.resetFog.hint',
  async execute() {
    await canvas.fog?.reset();
  }
});

/**
 * Add or remove tokens as Combatants of the viewed encounter.
 * @param {TokenDocument[]} tokens The tokens to add or remove.
 * @param {string} [mode] "add" or "remove"; defaults to add.
 * @param {boolean} [start] Roll initiative and begin the encounter.
 */
async function applyCombatants(tokens, mode, start) {
  if (mode === 'remove') {
    if (game.combats.viewed) await TokenDocument.deleteCombatants(tokens);
    return;
  }
  await TokenDocument.createCombatants(tokens);
  const combat = game.combats.viewed;
  if (!start || !combat || combat.started) return;
  await combat.rollAll();
  await combat.startCombat();
}

registerNodeType('addToCombat', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.addToCombat.label',
  hint: 'GLYPH.ACTIONS.addToCombat.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.addToCombat.FIELDS.token.label', required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.addToCombat.FIELDS.mode.label',
      choices: { add: 'GLYPH.COMBAT_MODE.add', remove: 'GLYPH.COMBAT_MODE.remove' }
    },
    { name: 'start', widget: 'boolean', label: 'GLYPH.ACTIONS.addToCombat.FIELDS.start.label', hint: 'GLYPH.ACTIONS.addToCombat.FIELDS.start.hint' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('addToCombat.token must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (token) await applyCombatants([token], node.mode, node.start);
  },
  async batchExecute(pairs) {
    const groups = new Map();
    for (const { node, context } of pairs) {
      const token = resolveReference(node.token, context);
      if (!token) continue;
      const mode = node.mode ?? 'add';
      if (!groups.has(mode)) groups.set(mode, { tokens: [], start: false });
      groups.get(mode).tokens.push(token);
      if (node.start) groups.get(mode).start = true;
    }
    for (const [mode, { tokens, start }] of groups) await applyCombatants(tokens, mode, start);
  }
});

/**
 * The ownership-carrying document behind a permission target: a Token defers to its base Actor.
 * @param {*} resolved The resolved reference.
 * @returns {*} The document to update, or null.
 */
function permissionTarget(resolved) {
  if (resolved instanceof TokenDocument) return game.actors.get(resolved.actor?.id) ?? null;
  return resolved ?? null;
}

/**
 * The non-GM users a `changePermissions` node writes entries for. GMs always own, so they are never written.
 * @param {string} scope One of "everyone", "players", "gm", "triggeringUser".
 * @param {object} context The active run context.
 * @returns {User[]} The users to write.
 */
function permissionUsers(scope, context) {
  if (scope === 'gm') return [];
  if (scope === 'triggeringUser') return [context.info.event.user].filter((u) => u && !u.isGM);
  return game.users.filter((u) => !u.isGM);
}

/**
 * Build a `changePermissions` node's update payload. The "default" level removes a user's entry rather than writing one.
 * @param {object} node The `changePermissions` node.
 * @param {object} context The active run context.
 * @returns {object} The `document.update()` payload.
 */
function ownershipChanges(node, context) {
  const level = node.level === 'default' ? null : CONST.DOCUMENT_OWNERSHIP_LEVELS[node.level.toUpperCase()];
  if (level === undefined) throw new Error(`changePermissions: unknown level "${node.level}".`);
  const scope = node.users ?? 'everyone';
  if (scope === 'everyone' && level !== null) return { 'ownership.default': level };
  return Object.fromEntries(permissionUsers(scope, context).map((user) => [`ownership.${level === null ? '-=' : ''}${user.id}`, level]));
}

registerNodeType('changePermissions', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.changePermissions.label',
  hint: 'GLYPH.ACTIONS.changePermissions.hint',
  fields: [
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.changePermissions.FIELDS.target.label', required: true },
    {
      name: 'level',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changePermissions.FIELDS.level.label',
      required: true,
      choices: {
        none: 'GLYPH.OWNERSHIP.none',
        limited: 'GLYPH.OWNERSHIP.limited',
        observer: 'GLYPH.OWNERSHIP.observer',
        owner: 'GLYPH.OWNERSHIP.owner',
        default: 'GLYPH.OWNERSHIP.default'
      }
    },
    {
      name: 'users',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changePermissions.FIELDS.users.label',
      hint: 'GLYPH.ACTIONS.changePermissions.FIELDS.users.hint',
      choices: {
        everyone: 'GLYPH.AUDIENCE.everyone',
        players: 'GLYPH.AUDIENCE.players',
        gm: 'GLYPH.AUDIENCE.gm',
        triggeringUser: 'GLYPH.AUDIENCE.triggeringUser'
      }
    }
  ],
  validate(node) {
    if (typeof node.target !== 'object' || typeof node.level !== 'string') {
      throw new Error('changePermissions.target must be a reference and .level a string.');
    }
  },
  async execute(node, context) {
    const document = permissionTarget(resolveReference(node.target, context));
    if (!document) return;
    const changes = ownershipChanges(node, context);
    if (Object.keys(changes).length) await document.update(changes);
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => ({
        doc: permissionTarget(resolveReference(node.target, context)),
        changes: ownershipChanges(node, context)
      }))
    );
  }
});

registerNodeType('setGameTime', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.setGameTime.label',
  hint: 'GLYPH.ACTIONS.setGameTime.hint',
  fields: [
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.setGameTime.FIELDS.mode.label',
      choices: { advance: 'GLYPH.TIME_MODE.advance', timeOfDay: 'GLYPH.TIME_MODE.timeOfDay' }
    },
    { name: 'seconds', widget: 'number', label: 'GLYPH.ACTIONS.setGameTime.FIELDS.seconds.label', hint: 'GLYPH.ACTIONS.setGameTime.FIELDS.seconds.hint', required: true },
    { name: 'secondsFormula', widget: 'formula', label: 'GLYPH.ACTIONS.setGameTime.FIELDS.secondsFormula.label', hint: 'GLYPH.ACTIONS.setGameTime.FIELDS.secondsFormula.hint' }
  ],
  validate(node) {
    if (!node.secondsFormula && typeof node.seconds !== 'number') throw new Error('setGameTime.seconds must be a number, unless .secondsFormula is set.');
  },
  async execute(node, context) {
    const seconds = (await resolveNumber(node.secondsFormula, context)) ?? node.seconds;
    if ((node.mode ?? 'advance') === 'advance') {
      await game.time.advance(seconds);
      return;
    }
    const { hour, minute, second } = game.time.components;
    await game.time.advance(seconds - game.time.calendar.componentsToTime({ hour, minute, second }));
  }
});

registerRenderIntent('changeGlobalVolume', async ({ bus, volume }) => {
  await game.settings.set('core', bus, volume);
});

registerNodeType('changeGlobalVolume', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.changeGlobalVolume.label',
  hint: 'GLYPH.ACTIONS.changeGlobalVolume.hint',
  fields: [
    {
      name: 'bus',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changeGlobalVolume.FIELDS.bus.label',
      required: true,
      choices: { globalPlaylistVolume: 'GLYPH.AUDIO_CHANNELS.music', globalAmbientVolume: 'GLYPH.AUDIO_CHANNELS.environment', globalInterfaceVolume: 'GLYPH.AUDIO_CHANNELS.interface' }
    },
    { name: 'volume', widget: 'number', min: 0, max: 1, step: 0.05, label: 'GLYPH.ACTIONS.changeGlobalVolume.FIELDS.volume.label', required: true },
    { ...AUDIENCE_FIELD, hint: 'GLYPH.ACTIONS.changeGlobalVolume.FIELDS.audience.hint' }
  ],
  validate(node) {
    if (typeof node.bus !== 'string' || typeof node.volume !== 'number') {
      throw new Error('changeGlobalVolume.bus must be a string and .volume a number.');
    }
  },
  async execute(node, context) {
    await sendToAudience(node.audience ?? 'everyone', context, 'changeGlobalVolume', { bus: node.bus, volume: Math.min(1, Math.max(0, node.volume)) });
  }
});

registerNodeType('preloadScene', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.preloadScene.label',
  hint: 'GLYPH.ACTIONS.preloadScene.hint',
  fields: [{ name: 'sceneUuid', widget: 'uuid', documentType: 'Scene', label: 'GLYPH.ACTIONS.preloadScene.FIELDS.sceneUuid.label', required: true }],
  validate(node) {
    if (typeof node.sceneUuid !== 'string' || !node.sceneUuid) throw new Error('preloadScene.sceneUuid must be a non-empty string.');
  },
  async execute(node) {
    const scene = await fromUuid(node.sceneUuid);
    if (scene instanceof Scene) await game.scenes.preload(scene.id);
  }
});

/** @type {Record<string, string>} Movement restriction choices, mapped to `CONST.WALL_MOVEMENT_TYPES` in `wallDoorChanges`. */
const WALL_MOVE_CHOICES = { none: 'GLYPH.WALL_RESTRICTION.none', normal: 'GLYPH.WALL_RESTRICTION.normal', toggle: 'GLYPH.WALL_RESTRICTION.toggle' };

/** @type {Record<string, string>} Sense restriction choices shared by light/sight/sound, mapped to `CONST.EDGE_SENSE_TYPES` in `wallDoorChanges`. */
const WALL_SENSE_CHOICES = {
  none: 'GLYPH.WALL_RESTRICTION.none',
  normal: 'GLYPH.WALL_RESTRICTION.normal',
  limited: 'GLYPH.WALL_RESTRICTION.limited',
  proximity: 'GLYPH.WALL_RESTRICTION.proximity',
  distance: 'GLYPH.WALL_RESTRICTION.distance',
  toggle: 'GLYPH.WALL_RESTRICTION.toggle'
};

/**
 * Build a `changeWallDoor` node's update payload against a resolved wall's current state.
 * @param {object} node The `changeWallDoor` node.
 * @param {WallDocument} wall The resolved wall.
 * @returns {object} The `wall.update()` payload.
 */
function wallDoorChanges(node, wall) {
  const changes = {};
  if (node.state) {
    const ds =
      node.state === 'toggle'
        ? wall.ds === CONST.WALL_DOOR_STATES.OPEN
          ? CONST.WALL_DOOR_STATES.CLOSED
          : CONST.WALL_DOOR_STATES.OPEN
        : { open: CONST.WALL_DOOR_STATES.OPEN, closed: CONST.WALL_DOOR_STATES.CLOSED, locked: CONST.WALL_DOOR_STATES.LOCKED }[node.state];
    if (ds !== undefined) changes.ds = ds;
  }
  if (node.doorType) {
    const door =
      node.doorType === 'toggle' ? (wall.door === CONST.WALL_DOOR_TYPES.DOOR ? CONST.WALL_DOOR_TYPES.SECRET : CONST.WALL_DOOR_TYPES.DOOR) : CONST.WALL_DOOR_TYPES[node.doorType.toUpperCase()];
    if (door !== undefined) changes.door = door;
  }
  if (node.move) {
    const move =
      node.move === 'toggle' ? (wall.move === CONST.WALL_MOVEMENT_TYPES.NONE ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE) : CONST.WALL_MOVEMENT_TYPES[node.move.toUpperCase()];
    if (move !== undefined) changes.move = move;
  }
  for (const key of ['light', 'sight', 'sound']) {
    if (!node[key]) continue;
    const level =
      node[key] === 'toggle' ? (wall[key] === CONST.EDGE_SENSE_TYPES.NORMAL ? CONST.EDGE_SENSE_TYPES.NONE : CONST.EDGE_SENSE_TYPES.NORMAL) : CONST.EDGE_SENSE_TYPES[node[key].toUpperCase()];
    if (level === undefined) continue;
    changes[key] = level;
    if (level !== CONST.EDGE_SENSE_TYPES.PROXIMITY && level !== CONST.EDGE_SENSE_TYPES.DISTANCE) changes[`threshold.${key}`] = null;
  }
  return changes;
}

registerNodeType('changeWallDoor', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.changeWallDoor.label',
  hint: 'GLYPH.ACTIONS.changeWallDoor.hint',
  fields: [
    { name: 'wall', widget: 'reference', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.wall.label', required: true },
    {
      name: 'state',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.state.label',
      choices: { open: 'GLYPH.DOOR_STATE.open', closed: 'GLYPH.DOOR_STATE.closed', locked: 'GLYPH.DOOR_STATE.locked', toggle: 'GLYPH.DOOR_STATE.toggle' }
    },
    {
      name: 'doorType',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.doorType.label',
      hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.doorType.hint',
      choices: { none: 'GLYPH.DOOR_TYPE.none', door: 'GLYPH.DOOR_TYPE.door', secret: 'GLYPH.DOOR_TYPE.secret', toggle: 'GLYPH.DOOR_TYPE.toggle' }
    },
    { name: 'move', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.move.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_MOVE_CHOICES },
    { name: 'light', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.light.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_SENSE_CHOICES },
    { name: 'sight', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.sight.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_SENSE_CHOICES },
    { name: 'sound', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.sound.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_SENSE_CHOICES }
  ],
  validate(node) {
    if (typeof node.wall !== 'object') throw new Error('changeWallDoor.wall must be a reference object.');
  },
  async execute(node, context) {
    const wall = resolveReference(node.wall, context);
    if (!wall) return;
    const changes = wallDoorChanges(node, wall);
    if (Object.keys(changes).length) await wall.update(changes);
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => {
        const wall = resolveReference(node.wall, context);
        return { doc: wall, changes: wall ? wallDoorChanges(node, wall) : {} };
      })
    );
  }
});

registerRenderIntent('runMacro', async ({ macroUuid, args }) => {
  const macro = await fromUuid(macroUuid);
  return macro instanceof Macro ? macro.execute(args) : undefined;
});

registerNodeType('runMacro', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.runMacro.label',
  hint: 'GLYPH.ACTIONS.runMacro.hint',
  fields: [
    { name: 'macroUuid', widget: 'uuid', documentType: 'Macro', label: 'GLYPH.ACTIONS.runMacro.FIELDS.macroUuid.label', required: true },
    { name: 'args', widget: 'json', label: 'GLYPH.ACTIONS.runMacro.FIELDS.args.label', hint: 'GLYPH.ACTIONS.runMacro.FIELDS.args.hint' },
    { name: 'background', widget: 'boolean', label: 'GLYPH.ACTIONS.runMacro.FIELDS.background.label', hint: 'GLYPH.ACTIONS.runMacro.FIELDS.background.hint' },
    { ...AUDIENCE_FIELD, hint: 'GLYPH.ACTIONS.runMacro.FIELDS.audience.hint' }
  ],
  validate(node) {
    if (typeof node.macroUuid !== 'string' || !node.macroUuid) throw new Error('runMacro.macroUuid must be a non-empty string.');
  },
  async execute(node, context) {
    const macro = await fromUuid(node.macroUuid);
    if (!(macro instanceof Macro)) return;
    const args = { ...node.args, event: context.info.event, variables: context.variables };
    if (node.audience && node.audience !== 'gm') {
      const users = resolveAudience(node.audience, context);
      if (users.length === 1) {
        const run = sendRenderIntent(users[0], 'runMacro', { macroUuid: node.macroUuid, args });
        if (node.background) return;
        setResult(context, await run);
        return;
      }
      await sendToAudience(node.audience, context, 'runMacro', { macroUuid: node.macroUuid, args });
      return;
    }
    const run = macro.execute(args);
    if (node.background) return;
    setResult(context, await run);
  }
});

/**
 * The region-boundary crossing point of the triggering token's movement, or null if this run has none.
 * @param {object} context The active run context.
 * @returns {{x: number, y: number, x2?: number, y2?: number}|null} The crossing point, or null.
 */
function crossingPoint(context) {
  const { event, region } = context.info;
  const { token, movement } = event.data ?? {};
  if (!token || !movement) return null;
  const segments = token.segmentizeRegionMovementPath(region, [movement.origin, ...movement.passed.waypoints]);
  const enter = segments.find((s) => s.type === CONST.REGION_MOVEMENT_SEGMENTS.ENTER);
  if (enter) return { x: enter.to.x, y: enter.to.y };
  const exit = segments.find((s) => s.type === CONST.REGION_MOVEMENT_SEGMENTS.EXIT);
  if (exit) return { x: exit.from.x, y: exit.from.y };
  const move = segments.find((s) => s.type === CONST.REGION_MOVEMENT_SEGMENTS.MOVE);
  return move ? { x: move.from.x, y: move.from.y, x2: move.to.x, y2: move.to.y } : null;
}

registerNodeType('runCode', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.runCode.label',
  hint: 'GLYPH.ACTIONS.runCode.hint',
  fields: [
    { name: 'code', widget: 'textarea', label: 'GLYPH.ACTIONS.runCode.FIELDS.code.label', hint: 'GLYPH.ACTIONS.runCode.FIELDS.code.hint', required: true },
    { name: 'args', widget: 'json', label: 'GLYPH.ACTIONS.runCode.FIELDS.args.label', hint: 'GLYPH.ACTIONS.runCode.FIELDS.args.hint' },
    { name: 'background', widget: 'boolean', label: 'GLYPH.ACTIONS.runCode.FIELDS.background.label', hint: 'GLYPH.ACTIONS.runCode.FIELDS.background.hint' }
  ],
  validate(node) {
    if (typeof node.code !== 'string' || !node.code) throw new Error('runCode.code must be a non-empty string.');
  },
  async execute(node, context) {
    const token = context.info.event.data?.token ?? null;
    const scope = {
      ...node.args,
      event: context.info.event,
      variables: context.variables,
      region: context.info.region,
      scene: context.info.scene,
      token,
      actor: token?.actor ?? null,
      character: game.user.character ?? null,
      speaker: ChatMessage.getSpeaker({ token }),
      args: node.args ?? {},
      tile: resolveReference(context.info.behavior?.system?.linkedTile, context),
      method: context.info.event.name,
      pt: crossingPoint(context)
    };
    const argNames = Object.keys(scope);
    const fn = new foundry.utils.AsyncFunction(...argNames, node.code);
    const run = fn(...argNames.map((name) => scope[name]));
    if (node.background) return;
    setResult(context, await run);
  }
});

registerNodeType('triggerBehavior', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.triggerBehavior.label',
  hint: 'GLYPH.ACTIONS.triggerBehavior.hint',
  fields: [
    { name: 'behavior', widget: 'reference', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.behavior.label', required: true },
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.token.label', hint: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.token.hint' },
    { name: 'allowDisabled', widget: 'boolean', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.allowDisabled.label' },
    { name: 'mergeResult', widget: 'boolean', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.mergeResult.label', hint: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.mergeResult.hint' },
    { name: 'startTag', widget: 'text', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.startTag.label', hint: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.startTag.hint' }
  ],
  validate(node) {
    if (typeof node.behavior !== 'object') throw new Error('triggerBehavior.behavior must be a reference object.');
  },
  async execute(node, context) {
    const target = toTriggerBehavior(resolveReference(node.behavior, context));
    if (!target) return;
    if (target.disabled && !node.allowDisabled) return;
    const { name, data, user } = context.info.event;
    const tokenOverride = node.token ? resolveReference(node.token, context) : null;
    const result = await target.system.run(
      { name, data: tokenOverride ? { ...data, token: tokenOverride } : data, region: target.parent, user },
      { startTag: node.startTag || undefined, anyHandler: true }
    );
    if (!result || node.mergeResult === false) return;
    Object.assign(context.results, result.results);
    setResult(context, result.previous);
  }
});

registerNodeType('teleportToken', {
  category: 'token',
  label: 'GLYPH.ACTIONS.teleportToken.label',
  hint: 'GLYPH.ACTIONS.teleportToken.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.token.label', required: true },
    { name: 'destination', widget: 'reference', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.destination.label', required: true },
    {
      name: 'placement',
      widget: 'select',
      label: 'GLYPH.ACTIONS.teleportToken.FIELDS.placement.label',
      choices: { random: 'GLYPH.TELEPORT_PLACEMENT.random', center: 'GLYPH.TELEPORT_PLACEMENT.center', relative: 'GLYPH.TELEPORT_PLACEMENT.relative' }
    },
    { name: 'snap', widget: 'boolean', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.snap.label' },
    { name: 'avoidOccupied', widget: 'boolean', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.avoidOccupied.label' },
    { name: 'pan', widget: 'boolean', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.pan.label' },
    { name: 'keepOrigin', widget: 'boolean', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.keepOrigin.label', hint: 'GLYPH.ACTIONS.teleportToken.FIELDS.keepOrigin.hint' },
    {
      name: 'suppressTriggers',
      widget: 'boolean',
      label: 'GLYPH.ACTIONS.teleportToken.FIELDS.suppressTriggers.label',
      hint: 'GLYPH.ACTIONS.teleportToken.FIELDS.suppressTriggers.hint'
    }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('teleportToken.token must be a reference object.');
    if (typeof node.destination !== 'object') throw new Error('teleportToken.destination must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    const destination = resolveReference(node.destination, context);
    if (!(token instanceof TokenDocument) || !(destination instanceof RegionDocument)) return;
    const cloneId = node.keepOrigin && token.parent !== destination.parent ? foundry.utils.randomID() : null;
    await withTriggersSuppressed(node.suppressTriggers ? [token.id, cloneId].filter(Boolean) : [], async () => {
      if (cloneId) {
        const { _id, ...tokenData } = token.toObject();
        await token.parent.createEmbeddedDocuments('Token', [{ ...tokenData, _id: cloneId, hidden: true }], { keepId: true });
      }
      await destination.teleportTokens([token], { placement: node.placement ?? 'random', snap: node.snap ?? true, avoidOccupied: node.avoidOccupied ?? true, pan: node.pan });
    });
  },
  async batchExecute(pairs) {
    const resolved = pairs
      .map(({ node, context }) => ({ node, token: resolveReference(node.token, context), destination: resolveReference(node.destination, context) }))
      .filter(({ token, destination }) => token instanceof TokenDocument && destination instanceof RegionDocument);

    const clones = resolved.filter(({ node, token, destination }) => node.keepOrigin && token.parent !== destination.parent).map((entry) => ({ ...entry, cloneId: foundry.utils.randomID() }));

    const groups = new Map();
    for (const { node, token, destination } of resolved) {
      const options = { placement: node.placement ?? 'random', snap: node.snap ?? true, avoidOccupied: node.avoidOccupied ?? true, pan: node.pan };
      const key = `${destination.uuid}:${JSON.stringify(options)}`;
      if (!groups.has(key)) groups.set(key, { destination, options, tokens: [] });
      groups.get(key).tokens.push(token);
    }
    const suppressed = [...resolved.filter(({ node }) => node.suppressTriggers).map(({ token }) => token.id), ...clones.filter(({ node }) => node.suppressTriggers).map(({ cloneId }) => cloneId)];
    await withTriggersSuppressed(suppressed, async () => {
      await batchCreate(
        clones.map(({ token, cloneId }) => {
          const { _id, ...tokenData } = token.toObject();
          return { parent: token.parent, documentName: 'Token', data: { ...tokenData, _id: cloneId, hidden: true }, keepId: true };
        })
      );
      await Promise.all([...groups.values()].map(({ destination, options, tokens }) => destination.teleportTokens(tokens, options)));
    });
  }
});

registerNodeType('toggleTriggerBehavior', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.toggleTriggerBehavior.label',
  hint: 'GLYPH.ACTIONS.toggleTriggerBehavior.hint',
  fields: [
    { name: 'behavior', widget: 'reference', label: 'GLYPH.ACTIONS.toggleTriggerBehavior.FIELDS.behavior.label', required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.toggleTriggerBehavior.FIELDS.mode.label',
      choices: { enable: 'GLYPH.TOGGLE_MODE.enable', disable: 'GLYPH.TOGGLE_MODE.disable', toggle: 'GLYPH.TOGGLE_MODE.toggle' }
    }
  ],
  validate(node) {
    if (typeof node.behavior !== 'object') throw new Error('toggleTriggerBehavior.behavior must be a reference object.');
  },
  async execute(node, context) {
    const target = toTriggerBehavior(resolveReference(node.behavior, context));
    if (!target) return;
    const mode = node.mode ?? 'toggle';
    await target.update({ disabled: mode === 'toggle' ? !target.disabled : mode === 'disable' });
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => {
        const target = toTriggerBehavior(resolveReference(node.behavior, context));
        const mode = node.mode ?? 'toggle';
        return { doc: target, changes: target ? { disabled: mode === 'toggle' ? !target.disabled : mode === 'disable' } : {} };
      })
    );
  }
});

registerRenderIntent('panCanvas', ({ location, scale }) => canvas.animatePan({ x: location.x, y: location.y, scale }));

registerNodeType('panCanvas', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.panCanvas.label',
  hint: 'GLYPH.ACTIONS.panCanvas.hint',
  fields: [
    { name: 'location', widget: 'point', label: 'GLYPH.ACTIONS.panCanvas.FIELDS.location.label', hint: 'GLYPH.ACTIONS.FIELDS.worldPoint.hint', required: true },
    { name: 'scale', widget: 'number', min: 0.1, step: 0.1, label: 'GLYPH.ACTIONS.panCanvas.FIELDS.scale.label', hint: 'GLYPH.ACTIONS.panCanvas.FIELDS.scale.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.location !== 'object') throw new Error('panCanvas.location must be a point object.');
  },
  async execute(node, context) {
    const location = resolvePoint(node.location, context);
    if (!location) return;
    await sendToAudience(node.audience, context, 'panCanvas', { location, scale: node.scale || undefined });
  }
});

/**
 * A Note's placement point, snapped to the nearest half-grid vertex when asked.
 * @param {Point} location The resolved world point.
 * @param {boolean} [snap] Whether to snap.
 * @returns {Point}
 */
function notePoint(location, snap) {
  return snap ? canvas.grid.getSnappedPoint(location, { mode: CONST.GRID_SNAPPING_MODES.VERTEX, resolution: 2 }) : location;
}

registerNodeType('createJournalNote', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.createJournalNote.label',
  hint: 'GLYPH.ACTIONS.createJournalNote.hint',
  fields: [
    { name: 'journalUuid', widget: 'uuid', documentType: 'JournalEntry', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.journalUuid.label', required: true },
    { name: 'location', widget: 'point', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.location.label', hint: 'GLYPH.ACTIONS.FIELDS.worldPoint.hint', required: true },
    { name: 'icon', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.icon.label' },
    { name: 'snap', widget: 'boolean', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.snap.label', hint: 'GLYPH.ACTIONS.createJournalNote.FIELDS.snap.hint' }
  ],
  validate(node) {
    if (typeof node.journalUuid !== 'string' || !node.journalUuid) throw new Error('createJournalNote.journalUuid must be a non-empty string.');
    if (typeof node.location !== 'object') throw new Error('createJournalNote.location must be a point object.');
  },
  async execute(node, context) {
    const journal = await fromUuid(node.journalUuid);
    const scene = context.info.scene;
    if (!(journal instanceof JournalEntry) || !scene) return;
    const location = resolvePoint(node.location, context);
    if (!location) return;
    const point = notePoint(location, node.snap);
    await scene.createEmbeddedDocuments('Note', [{ entryId: journal.id, x: point.x, y: point.y, texture: node.icon ? { src: node.icon } : undefined }]);
  },
  async batchExecute(pairs) {
    const entries = await Promise.all(
      pairs.map(async ({ node, context }) => {
        const journal = await fromUuid(node.journalUuid);
        const scene = context.info.scene;
        const location = resolvePoint(node.location, context);
        if (!(journal instanceof JournalEntry) || !scene || !location) return null;
        const point = notePoint(location, node.snap);
        return { parent: scene, documentName: 'Note', data: { entryId: journal.id, x: point.x, y: point.y, texture: node.icon ? { src: node.icon } : undefined } };
      })
    );
    await batchCreate(entries.filter(Boolean));
  }
});
