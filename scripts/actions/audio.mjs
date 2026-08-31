import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { resolveReference } from '../targeting.mjs';

/** @type {string} Name of the module-owned playlist triggered sounds live in. */
const PLAYLIST_NAME = 'Glyph';

/** @type {string} The tracking key used when `playSound`/`stopSound` don't specify one. */
const DEFAULT_SOUND_KEY = 'default';

/**
 * Get (creating if needed) the module-owned playlist.
 * @returns {Promise<Playlist>} The playlist.
 */
async function getPlaylist() {
  return game.playlists.getName(PLAYLIST_NAME) ?? Playlist.create({ name: PLAYLIST_NAME, mode: CONST.PLAYLIST_MODES.DISABLED });
}

/**
 * Stop or pause one tracked `PlaylistSound`.
 * @param {string} soundUuid The sound's UUID.
 * @param {string} [state] "stop" (default) or "pause".
 * @returns {Promise<void>}
 */
async function stopTrackedSound(soundUuid, state) {
  const sound = await fromUuid(soundUuid);
  if (!(sound instanceof PlaylistSound)) return;
  const pausedTime = state === 'pause' ? (sound.sound?.currentTime ?? sound.pausedTime) : 0;
  await sound.update({ playing: false, pausedTime });
}

registerNodeType('playSound', {
  category: 'audio',
  label: 'GLYPH.ACTIONS.playSound.label',
  hint: 'GLYPH.ACTIONS.playSound.hint',
  fields: [
    { name: 'path', widget: 'file', filePickerType: 'audio', label: 'GLYPH.ACTIONS.playSound.FIELDS.path.label', required: true },
    { name: 'loop', widget: 'boolean', label: 'GLYPH.ACTIONS.playSound.FIELDS.loop.label' },
    { name: 'volume', widget: 'number', min: 0, max: 1, step: 0.05, label: 'GLYPH.ACTIONS.playSound.FIELDS.volume.label' },
    {
      name: 'channel',
      widget: 'select',
      label: 'GLYPH.ACTIONS.playSound.FIELDS.channel.label',
      choices: { music: 'GLYPH.AUDIO_CHANNELS.music', environment: 'GLYPH.AUDIO_CHANNELS.environment', interface: 'GLYPH.AUDIO_CHANNELS.interface' }
    },
    { name: 'key', widget: 'text', label: 'GLYPH.ACTIONS.playSound.FIELDS.key.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.key.hint' }
  ],
  validate(node) {
    if (typeof node.path !== 'string' || !node.path) throw new Error('playSound.path must be a non-empty string.');
  },
  async execute(node, context) {
    const playlist = await getPlaylist();
    const [sound] = await playlist.createEmbeddedDocuments('PlaylistSound', [
      { name: node.path, path: node.path, playing: true, repeat: node.loop ?? false, volume: node.volume ?? 1, channel: node.channel ?? 'interface' }
    ]);
    const behavior = context.info.behavior;
    if (!behavior) return;
    const key = node.key || DEFAULT_SOUND_KEY;
    const tracked = (behavior.getFlag(MODULE.ID, 'activeSounds') ?? []).filter((entry) => entry.key !== key);
    tracked.push({ key, soundUuid: sound.uuid });
    await behavior.setFlag(MODULE.ID, 'activeSounds', tracked);
  }
});

registerNodeType('stopSound', {
  category: 'audio',
  label: 'GLYPH.ACTIONS.stopSound.label',
  hint: 'GLYPH.ACTIONS.stopSound.hint',
  fields: [
    { name: 'reference', widget: 'reference', label: 'GLYPH.ACTIONS.stopSound.FIELDS.reference.label', hint: 'GLYPH.ACTIONS.stopSound.FIELDS.reference.hint' },
    { name: 'behavior', widget: 'reference', label: 'GLYPH.ACTIONS.stopSound.FIELDS.behavior.label', hint: 'GLYPH.ACTIONS.stopSound.FIELDS.behavior.hint' },
    { name: 'key', widget: 'text', label: 'GLYPH.ACTIONS.stopSound.FIELDS.key.label', hint: 'GLYPH.ACTIONS.stopSound.FIELDS.key.hint' },
    {
      name: 'state',
      widget: 'select',
      label: 'GLYPH.ACTIONS.stopSound.FIELDS.state.label',
      choices: { stop: 'GLYPH.SOUND_STATE.stop', pause: 'GLYPH.SOUND_STATE.pause' }
    }
  ],
  validate(node) {
    if (node.reference !== undefined && typeof node.reference !== 'object') throw new Error('stopSound.reference must be a reference object.');
  },
  async execute(node, context) {
    if (node.reference) {
      const target = resolveReference(node.reference, context);
      if (target instanceof PlaylistSound) await stopTrackedSound(target.uuid, node.state);
      else if (target instanceof AmbientSoundDocument) await target.update({ hidden: true });
      return;
    }
    const behavior = node.behavior ? resolveReference(node.behavior, context) : context.info.behavior;
    if (!(behavior instanceof RegionBehavior)) return;
    const tracked = behavior.getFlag(MODULE.ID, 'activeSounds') ?? [];
    const [matching, remaining] = node.key ? [tracked.filter((e) => e.key === node.key), tracked.filter((e) => e.key !== node.key)] : [tracked, []];
    await Promise.all(matching.map((entry) => stopTrackedSound(entry.soundUuid, node.state)));
    await behavior.setFlag(MODULE.ID, 'activeSounds', remaining);
  }
});

registerNodeType('playPlaylist', {
  category: 'audio',
  label: 'GLYPH.ACTIONS.playPlaylist.label',
  hint: 'GLYPH.ACTIONS.playPlaylist.hint',
  fields: [
    { name: 'name', widget: 'text', label: 'GLYPH.ACTIONS.playPlaylist.FIELDS.name.label', hint: 'GLYPH.ACTIONS.playPlaylist.FIELDS.name.hint' },
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.playPlaylist.FIELDS.target.label', hint: 'GLYPH.ACTIONS.playPlaylist.FIELDS.target.hint' },
    {
      name: 'state',
      widget: 'select',
      label: 'GLYPH.ACTIONS.playPlaylist.FIELDS.state.label',
      choices: { play: 'GLYPH.PLAYLIST_STATE.play', stop: 'GLYPH.PLAYLIST_STATE.stop', next: 'GLYPH.PLAYLIST_STATE.next', previous: 'GLYPH.PLAYLIST_STATE.previous' }
    }
  ],
  validate(node) {
    if (!node.target && (typeof node.name !== 'string' || !node.name)) throw new Error('playPlaylist requires either .name or .target.');
  },
  async execute(node, context) {
    const resolved = node.target ? resolveReference(node.target, context) : null;
    const sound = resolved instanceof PlaylistSound ? resolved : null;
    const playlist = resolved instanceof Playlist ? resolved : (sound?.parent ?? game.playlists.getName(node.name));
    if (!playlist) return;
    const state = node.state ?? 'play';
    if (state === 'play') await (sound ? playlist.playSound(sound) : playlist.playAll());
    else if (state === 'stop') await (sound ? sound.update({ playing: false }) : playlist.stopAll());
    else {
      const current = sound ?? playlist.sounds.find((s) => s.playing);
      if (current) await playlist.playNext(current.id, { direction: state === 'next' ? 1 : -1 });
    }
  }
});
