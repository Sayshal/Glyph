import { sendToAudience } from '../audience.mjs';
import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../queries.mjs';
import { resolveReference } from '../targeting.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

/** Stop or pause, on this client, every currently-playing Sound matching a source path. */
registerRenderIntent('stopLoopingSound', ({ src, state }) => {
  for (const sound of game.audio.playing.values()) {
    if (sound.src !== src) continue;
    if (state === 'pause') sound.pause();
    else sound.stop();
  }
});

/** Play a sound on this client, honoring per-client scene restriction, overlap prevention, and fade-in. */
registerRenderIntent('playSoundIntent', async ({ src, volume, loop, channel, sceneId, preventOverlap, fadeIn }) => {
  if (sceneId && canvas.scene?.id !== sceneId) return;
  if (preventOverlap && [...game.audio.playing.values()].some((sound) => sound.src === src)) return;
  const sound = foundry.audio.AudioHelper.play({ src, volume: fadeIn ? 0 : volume, loop, channel, autoplay: true });
  if (fadeIn) (await sound)?.fade(volume, { duration: fadeIn * 1000 });
});

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
    { name: 'key', widget: 'text', label: 'GLYPH.ACTIONS.playSound.FIELDS.key.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.key.hint' },
    { name: 'restrictToScene', widget: 'boolean', label: 'GLYPH.ACTIONS.playSound.FIELDS.restrictToScene.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.restrictToScene.hint' },
    { name: 'preventOverlap', widget: 'boolean', label: 'GLYPH.ACTIONS.playSound.FIELDS.preventOverlap.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.preventOverlap.hint' },
    { name: 'waitForCompletion', widget: 'boolean', label: 'GLYPH.ACTIONS.playSound.FIELDS.waitForCompletion.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.waitForCompletion.hint' },
    { name: 'fadeIn', widget: 'number', min: 0, step: 0.5, label: 'GLYPH.ACTIONS.playSound.FIELDS.fadeIn.label', hint: 'GLYPH.ACTIONS.playSound.FIELDS.fadeIn.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.path !== 'string' || !node.path) throw new Error('playSound.path must be a non-empty string.');
  },
  async execute(node, context) {
    const volume = node.volume ?? 1;
    const channel = node.channel ?? 'interface';
    const loop = node.loop === true;
    const sceneId = node.restrictToScene ? (context.info.scene?.id ?? null) : null;
    await sendToAudience(node.audience ?? 'everyone', context, 'playSoundIntent', {
      src: node.path,
      volume,
      loop,
      channel,
      sceneId,
      preventOverlap: !!node.preventOverlap,
      fadeIn: node.fadeIn ?? 0
    });
    const behavior = context.info.behavior;
    const key = node.key || node.path;
    let entryId;
    if (behavior) {
      const tracked = (behavior.getFlag(MODULE.ID, 'activeSounds') ?? []).filter((entry) => entry.key !== key);
      entryId = foundry.utils.randomID();
      tracked.push({ key, src: node.path, id: entryId });
      await behavior.setFlag(MODULE.ID, 'activeSounds', tracked);
    }
    if (loop) return;
    if (!entryId && !node.waitForCompletion) return;
    const sound = await foundry.audio.AudioHelper.preloadSound(node.path);
    if (entryId && sound?.duration) {
      setTimeout(async () => {
        const current = behavior.getFlag(MODULE.ID, 'activeSounds') ?? [];
        await behavior.setFlag(
          MODULE.ID,
          'activeSounds',
          current.filter((entry) => entry.id !== entryId)
        );
      }, sound.duration * 1000);
    }
    if (node.waitForCompletion && sound?.duration) await new Promise((resolve) => setTimeout(resolve, sound.duration * 1000));
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
      if (target instanceof PlaylistSound) {
        if (node.state === 'pause') await target.update({ playing: false, pausedTime: target.sound?.currentTime ?? target.pausedTime });
        else await target.delete();
      } else if (target instanceof AmbientSoundDocument) await target.update({ hidden: true });
      return;
    }
    const behavior = node.behavior ? resolveReference(node.behavior, context) : context.info.behavior;
    if (!(behavior instanceof RegionBehavior)) return;
    const tracked = behavior.getFlag(MODULE.ID, 'activeSounds') ?? [];
    const [matching, remaining] = node.key ? [tracked.filter((e) => e.key === node.key), tracked.filter((e) => e.key !== node.key)] : [tracked, []];
    await Promise.all(matching.map((entry) => sendToAudience('everyone', context, 'stopLoopingSound', { src: entry.src, state: node.state })));
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
