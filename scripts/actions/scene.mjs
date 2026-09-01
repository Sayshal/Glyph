import { sendToAudience } from '../audience.mjs';
import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../render-intent.mjs';
import { resolveReference } from '../targeting.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

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
    { name: 'hidden', widget: 'boolean', label: 'GLYPH.ACTIONS.toggleAmbientVisibility.FIELDS.hidden.label' }
  ],
  validate(node) {
    if (typeof node.placeable !== 'object') throw new Error('toggleAmbientVisibility.placeable must be a reference object.');
  },
  async execute(node, context) {
    const doc = resolveReference(node.placeable, context);
    if (!(doc instanceof AmbientLightDocument || doc instanceof AmbientSoundDocument)) return;
    await doc.update({ hidden: node.hidden ?? !doc.hidden });
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
  async execute(node) {
    await canvas.ping(node.location, node.style ? { style: node.style } : {});
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

registerNodeType('addToCombat', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.addToCombat.label',
  hint: 'GLYPH.ACTIONS.addToCombat.hint',
  fields: [
    { name: 'token', widget: 'reference', label: 'GLYPH.ACTIONS.addToCombat.FIELDS.token.label', required: true },
    { name: 'start', widget: 'boolean', label: 'GLYPH.ACTIONS.addToCombat.FIELDS.start.label' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('addToCombat.token must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    if (!token) return;
    let combat = game.combats.find((c) => c.scene?.id === token.parent.id) ?? (await Combat.create({ scene: token.parent.id }));
    await combat.createEmbeddedDocuments('Combatant', [{ tokenId: token.id, sceneId: token.parent.id }]);
    if (node.start) await combat.startCombat();
  }
});

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
      choices: { none: 'GLYPH.OWNERSHIP.none', limited: 'GLYPH.OWNERSHIP.limited', observer: 'GLYPH.OWNERSHIP.observer', owner: 'GLYPH.OWNERSHIP.owner' }
    }
  ],
  validate(node) {
    if (typeof node.target !== 'object' || typeof node.level !== 'string') {
      throw new Error('changePermissions.target must be a reference and .level a string.');
    }
  },
  async execute(node, context) {
    const document = resolveReference(node.target, context);
    if (!document) return;
    const level = CONST.DOCUMENT_OWNERSHIP_LEVELS[node.level.toUpperCase()];
    if (level === undefined) throw new Error(`changePermissions: unknown level "${node.level}".`);
    await document.update({ 'ownership.default': level });
  }
});

registerNodeType('setGameTime', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.setGameTime.label',
  hint: 'GLYPH.ACTIONS.setGameTime.hint',
  fields: [{ name: 'seconds', widget: 'number', label: 'GLYPH.ACTIONS.setGameTime.FIELDS.seconds.label', required: true }],
  validate(node) {
    if (typeof node.seconds !== 'number') throw new Error('setGameTime.seconds must be a number.');
  },
  async execute(node) {
    await game.time.advance(node.seconds);
  }
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
    { name: 'volume', widget: 'number', min: 0, max: 1, step: 0.05, label: 'GLYPH.ACTIONS.changeGlobalVolume.FIELDS.volume.label', required: true }
  ],
  validate(node) {
    if (typeof node.bus !== 'string' || typeof node.volume !== 'number') {
      throw new Error('changeGlobalVolume.bus must be a string and .volume a number.');
    }
  },
  async execute(node) {
    await game.settings.set('core', node.bus, node.volume);
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

/** @type {Record<string, string>} Wall restriction choices shared by movement/light/sight/sound, mapped to `CONST.EDGE_SENSE_TYPES` in `execute`. */
const WALL_RESTRICTION_CHOICES = { none: 'GLYPH.WALL_RESTRICTION.none', normal: 'GLYPH.WALL_RESTRICTION.normal', limited: 'GLYPH.WALL_RESTRICTION.limited' };

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
    { name: 'move', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.move.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_RESTRICTION_CHOICES },
    { name: 'light', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.light.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_RESTRICTION_CHOICES },
    { name: 'sight', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.sight.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_RESTRICTION_CHOICES },
    { name: 'sound', widget: 'select', label: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.sound.label', hint: 'GLYPH.ACTIONS.changeWallDoor.FIELDS.restriction.hint', choices: WALL_RESTRICTION_CHOICES }
  ],
  validate(node) {
    if (typeof node.wall !== 'object') throw new Error('changeWallDoor.wall must be a reference object.');
  },
  async execute(node, context) {
    const wall = resolveReference(node.wall, context);
    if (!wall) return;
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
    for (const key of ['move', 'light', 'sight', 'sound']) if (node[key] !== undefined) changes[key] = CONST.EDGE_SENSE_TYPES[node[key].toUpperCase()];
    if (Object.keys(changes).length) await wall.update(changes);
  }
});

registerNodeType('runMacro', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.runMacro.label',
  hint: 'GLYPH.ACTIONS.runMacro.hint',
  fields: [
    { name: 'macroUuid', widget: 'uuid', documentType: 'Macro', label: 'GLYPH.ACTIONS.runMacro.FIELDS.macroUuid.label', required: true },
    { name: 'args', widget: 'json', label: 'GLYPH.ACTIONS.runMacro.FIELDS.args.label', hint: 'GLYPH.ACTIONS.runMacro.FIELDS.args.hint' },
    { name: 'background', widget: 'boolean', label: 'GLYPH.ACTIONS.runMacro.FIELDS.background.label', hint: 'GLYPH.ACTIONS.runMacro.FIELDS.background.hint' }
  ],
  validate(node) {
    if (typeof node.macroUuid !== 'string' || !node.macroUuid) throw new Error('runMacro.macroUuid must be a non-empty string.');
  },
  async execute(node, context) {
    const macro = await fromUuid(node.macroUuid);
    if (!(macro instanceof Macro)) return;
    const run = macro.execute({ ...node.args, event: context.info.event, variables: context.variables });
    if (node.background) return;
    context.previous = await run;
  }
});

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
    const scope = { ...node.args, event: context.info.event, variables: context.variables, region: context.info.region, scene: context.info.scene };
    const argNames = Object.keys(scope);
    const fn = new foundry.utils.AsyncFunction(...argNames, node.code);
    const run = fn(...argNames.map((name) => scope[name]));
    if (node.background) return;
    context.previous = await run;
  }
});

registerNodeType('triggerBehavior', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.triggerBehavior.label',
  hint: 'GLYPH.ACTIONS.triggerBehavior.hint',
  fields: [{ name: 'behavior', widget: 'reference', label: 'GLYPH.ACTIONS.triggerBehavior.FIELDS.behavior.label', required: true }],
  validate(node) {
    if (typeof node.behavior !== 'object') throw new Error('triggerBehavior.behavior must be a reference object.');
  },
  async execute(node, context) {
    const target = resolveReference(node.behavior, context);
    if (!(target instanceof RegionBehavior) || target.type !== MODULE.BEHAVIOR_TYPE) return;
    const { name, data, user } = context.info.event;
    await target.system.run({ name, data, region: target.parent, user });
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
    { name: 'pan', widget: 'boolean', label: 'GLYPH.ACTIONS.teleportToken.FIELDS.pan.label' }
  ],
  validate(node) {
    if (typeof node.token !== 'object') throw new Error('teleportToken.token must be a reference object.');
    if (typeof node.destination !== 'object') throw new Error('teleportToken.destination must be a reference object.');
  },
  async execute(node, context) {
    const token = resolveReference(node.token, context);
    const destination = resolveReference(node.destination, context);
    if (!(token instanceof TokenDocument) || !(destination instanceof RegionDocument)) return;
    await destination.teleportTokens([token], { placement: node.placement ?? 'random', snap: node.snap ?? true, avoidOccupied: node.avoidOccupied ?? true, pan: node.pan });
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
    const target = resolveReference(node.behavior, context);
    if (!(target instanceof RegionBehavior)) return;
    const mode = node.mode ?? 'toggle';
    await target.update({ disabled: mode === 'toggle' ? !target.disabled : mode === 'disable' });
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
    await sendToAudience(node.audience, context, 'panCanvas', { location: node.location, scale: node.scale || undefined });
  }
});

registerNodeType('createJournalNote', {
  category: 'scene',
  label: 'GLYPH.ACTIONS.createJournalNote.label',
  hint: 'GLYPH.ACTIONS.createJournalNote.hint',
  fields: [
    { name: 'journalUuid', widget: 'uuid', documentType: 'JournalEntry', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.journalUuid.label', required: true },
    { name: 'location', widget: 'point', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.location.label', hint: 'GLYPH.ACTIONS.FIELDS.worldPoint.hint', required: true },
    { name: 'icon', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.createJournalNote.FIELDS.icon.label' }
  ],
  validate(node) {
    if (typeof node.journalUuid !== 'string' || !node.journalUuid) throw new Error('createJournalNote.journalUuid must be a non-empty string.');
    if (typeof node.location !== 'object') throw new Error('createJournalNote.location must be a point object.');
  },
  async execute(node, context) {
    const journal = await fromUuid(node.journalUuid);
    const scene = context.info.scene;
    if (!(journal instanceof JournalEntry) || !scene) return;
    await scene.createEmbeddedDocuments('Note', [{ entryId: journal.id, x: node.location.x, y: node.location.y, texture: node.icon ? { src: node.icon } : undefined }]);
  }
});
