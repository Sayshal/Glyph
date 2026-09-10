import { sendToAudience } from '../audience.mjs';
import { batchUpdate } from '../batch.mjs';
import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../queries.mjs';
import { resolveReference } from '../targeting.mjs';
import { applyTileTransition } from '../tile-transitions.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

/** @type {Map<string, string[]>} Wildcard patterns already expanded. */
const wildcardCache = new Map();

/**
 * Expand any "*" wildcard entries in a configured image list.
 * @param {string[]} images The configured paths.
 * @returns {Promise<string[]>} The concrete image paths.
 */
async function expandImagePaths(images) {
  if (!images.some((path) => path.includes('*'))) return images;
  const expanded = [];
  for (const path of images) {
    if (!path.includes('*')) {
      expanded.push(path);
      continue;
    }
    if (!wildcardCache.has(path)) {
      const source = CONFIG.ux.FilePicker.matchS3URL(path) ? 's3' : 'data';
      const result = await CONFIG.ux.FilePicker.browse(source, path, { wildcard: true }).catch(() => null);
      wildcardCache.set(path, result?.files ?? []);
    }
    expanded.push(...wildcardCache.get(path));
  }
  return expanded;
}

/**
 * A tile's own configured image list.
 * @param {TileDocument|null} tile The tile to read.
 * @returns {string[]} The configured paths.
 */
function tileImages(tile) {
  const images = tile?.getFlag(MODULE.ID, 'images');
  return Array.isArray(images) ? images.filter((path) => typeof path === 'string' && path) : [];
}

/**
 * Resolve which image `select` picks from `images`, persisting the chosen index on the tile.
 * @param {TileDocument} tile The tile whose image index is read/written.
 * @param {string} select One of "first"/"last"/"next"/"previous"/"random"/"other"/"index".
 * @param {string[]} configured The configured image list.
 * @param {number} [explicitIndex] The index to use when `select` is "index".
 * @param {string} [randomRange] For "random", a "min-max" or dice-formula string constraining which indexes are eligible.
 * @returns {Promise<string|null>} The resolved image path, or null if `images` is empty.
 */
async function resolveListImage(tile, select, configured, explicitIndex, randomRange) {
  const images = await expandImagePaths(configured);
  if (!images.length) return null;
  const current = tile.getFlag(MODULE.ID, 'imageIndex') ?? 0;
  let index;
  if (select === 'first') index = 0;
  else if (select === 'last') index = images.length - 1;
  else if (select === 'next') index = (current + 1) % images.length;
  else if (select === 'previous') index = (current - 1 + images.length) % images.length;
  else if (select === 'random') index = await resolveRandomIndex(images.length, randomRange);
  else if (select === 'other') index = images.length > 1 ? (current + 1 + Math.floor(Math.random() * (images.length - 1))) % images.length : current;
  else index = Math.min(Math.max(Number(explicitIndex) || 0, 0), images.length - 1);
  await tile.setFlag(MODULE.ID, 'imageIndex', index);
  return images[index];
}

/**
 * Pick a random image index, optionally constrained to a "min-max" range or a dice formula.
 * @param {number} length The image list's length.
 * @param {string} [range] A "min-max" range, a comma-separated index list, or a dice formula.
 * @returns {Promise<number>} The chosen index.
 */
async function resolveRandomIndex(length, range) {
  const text = String(range ?? '').trim();
  if (text.includes(',')) {
    const choices = text
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n));
    if (choices.length) return Math.min(Math.max(choices[Math.floor(Math.random() * choices.length)], 0), length - 1);
  }
  const bounds = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (bounds) {
    const min = Math.max(0, Math.min(Number(bounds[1]), length - 1));
    const max = Math.max(min, Math.min(Number(bounds[2]), length - 1));
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  if (range) {
    const roll = await new Roll(range).evaluate();
    return Math.min(Math.max(Math.trunc(roll.total), 0), length - 1);
  }
  return Math.floor(Math.random() * length);
}

registerNodeType('changeTileImage', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.changeTileImage.label',
  hint: 'GLYPH.ACTIONS.changeTileImage.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.tile.label', required: true },
    {
      name: 'select',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.select.label',
      choices: {
        direct: 'GLYPH.IMAGE_SELECT.direct',
        first: 'GLYPH.IMAGE_SELECT.first',
        last: 'GLYPH.IMAGE_SELECT.last',
        next: 'GLYPH.IMAGE_SELECT.next',
        previous: 'GLYPH.IMAGE_SELECT.previous',
        random: 'GLYPH.IMAGE_SELECT.random',
        other: 'GLYPH.IMAGE_SELECT.other',
        index: 'GLYPH.IMAGE_SELECT.index'
      }
    },
    { name: 'src', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.src.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.src.hint' },
    { name: 'images', widget: 'json', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.images.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.images.hint' },
    { name: 'index', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.index.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.index.hint' },
    { name: 'randomRange', widget: 'text', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.randomRange.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.randomRange.hint' },
    {
      name: 'transition',
      widget: 'select',
      label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.transition.label',
      choices: {
        none: 'GLYPH.TRANSITION.none',
        fade: 'GLYPH.TRANSITION.fade',
        'slide-left': 'GLYPH.TRANSITION.slideLeft',
        'slide-up': 'GLYPH.TRANSITION.slideUp',
        'slide-right': 'GLYPH.TRANSITION.slideRight',
        'slide-down': 'GLYPH.TRANSITION.slideDown',
        'slide-random': 'GLYPH.TRANSITION.slideRandom',
        'bump-left': 'GLYPH.TRANSITION.bumpLeft',
        'bump-up': 'GLYPH.TRANSITION.bumpUp',
        'bump-right': 'GLYPH.TRANSITION.bumpRight',
        'bump-down': 'GLYPH.TRANSITION.bumpDown',
        'bump-random': 'GLYPH.TRANSITION.bumpRandom'
      }
    },
    { name: 'duration', widget: 'number', min: 50, step: 50, label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.duration.hint' },
    { name: 'repeat', widget: 'number', min: 1, label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.repeat.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.repeat.hint' }
  ],
  validate(node) {
    if (typeof node.tile !== 'object') throw new Error('changeTileImage.tile must be a reference object.');
    if ((node.select ?? 'direct') === 'direct' && node.src !== undefined && typeof node.src !== 'string') {
      throw new Error('changeTileImage.src must be a string.');
    }
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (!tile) return;
    const select = node.select ?? 'direct';
    const steps = select === 'direct' ? 1 : Math.max(Number(node.repeat) || 1, 1);
    for (let step = 0; step < steps; step++) {
      const configured = Array.isArray(node.images) && node.images.length ? node.images : tileImages(tile);
      const src = select === 'direct' ? node.src : await resolveListImage(tile, select, configured, node.index, node.randomRange);
      if (!src) return;
      await applyTileTransition(tile, src, node.transition ?? 'none', node.duration ?? 500);
    }
  },
  async batchExecute(pairs) {
    await Promise.all(pairs.map(({ node, context }) => this.execute(node, context)));
  }
});

registerRenderIntent('preloadTileImages', async ({ images }) => {
  await foundry.canvas.TextureLoader.loader.load(images, { displayProgress: false });
});

registerNodeType('preloadTileImages', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.preloadTileImages.label',
  hint: 'GLYPH.ACTIONS.preloadTileImages.hint',
  fields: [
    { name: 'images', widget: 'json', label: 'GLYPH.ACTIONS.preloadTileImages.FIELDS.images.label', hint: 'GLYPH.ACTIONS.preloadTileImages.FIELDS.images.hint' },
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.preloadTileImages.FIELDS.tile.label', hint: 'GLYPH.ACTIONS.preloadTileImages.FIELDS.tile.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (node.images !== undefined && !Array.isArray(node.images)) throw new Error('preloadTileImages.images must be an array.');
    if (!node.images?.length && typeof node.tile !== 'object') throw new Error('preloadTileImages needs either an image list or a Tile to read one from.');
  },
  async execute(node, context) {
    const tile = node.tile ? resolveReference(node.tile, context) : null;
    const configured = Array.isArray(node.images) && node.images.length ? node.images : tileImages(tile);
    const images = await expandImagePaths(configured.filter((path) => typeof path === 'string' && path));
    if (tile?.texture?.src) images.push(tile.texture.src);
    if (!images.length) return;
    await sendToAudience(node.audience ?? 'everyone', context, 'preloadTileImages', { images: [...new Set(images)] });
  }
});

registerRenderIntent('tempTileImage', async ({ tileUuid, src }) => {
  const mesh = fromUuidSync(tileUuid)?.object?.mesh;
  if (!mesh) return;
  const texture = await foundry.canvas.loadTexture(src);
  if (texture) mesh.texture = texture;
});

registerNodeType('tempTileImage', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.tempTileImage.label',
  hint: 'GLYPH.ACTIONS.tempTileImage.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.tempTileImage.FIELDS.tile.label', required: true },
    { name: 'src', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.tempTileImage.FIELDS.src.label', hint: 'GLYPH.ACTIONS.tempTileImage.FIELDS.src.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.tile !== 'object') throw new Error('tempTileImage.tile must be a reference object.');
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (!tile) return;
    await sendToAudience(node.audience, context, 'tempTileImage', { tileUuid: tile.uuid, src: node.src || tile.texture.src });
  }
});

/** Drive a video tile's element on this client. Triggers run on the primary GM only, so every other viewer needs the intent. */
registerRenderIntent('tileVideo', async ({ tileUuid, state, offset }) => {
  const source = (await fromUuid(tileUuid))?.object?.sourceElement;
  if (!source) return;
  if (state === 'stop') game.video.stop(source);
  else await game.video.play(source, { playing: state !== 'pause', offset: state === 'reset' ? 0 : offset });
});

registerNodeType('tileVideo', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.tileVideo.label',
  hint: 'GLYPH.ACTIONS.tileVideo.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.tileVideo.FIELDS.tile.label', required: true },
    {
      name: 'state',
      widget: 'select',
      label: 'GLYPH.ACTIONS.tileVideo.FIELDS.state.label',
      required: true,
      choices: {
        play: 'GLYPH.VIDEO_STATE.play',
        pause: 'GLYPH.VIDEO_STATE.pause',
        stop: 'GLYPH.VIDEO_STATE.stop',
        reset: 'GLYPH.VIDEO_STATE.reset',
        toggle: 'GLYPH.VIDEO_STATE.toggle'
      }
    },
    { name: 'offset', widget: 'number', min: 0, step: 0.1, label: 'GLYPH.ACTIONS.tileVideo.FIELDS.offset.label', hint: 'GLYPH.ACTIONS.tileVideo.FIELDS.offset.hint' },
    { ...AUDIENCE_FIELD, hint: 'GLYPH.ACTIONS.tileVideo.FIELDS.audience.hint' }
  ],
  validate(node) {
    if (typeof node.tile !== 'object' || typeof node.state !== 'string') {
      throw new Error('tileVideo.tile must be a reference and .state a string.');
    }
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (!tile?.object?.isVideo) return;
    const state = node.state === 'toggle' ? (tile.object.sourceElement.paused ? 'play' : 'pause') : node.state;
    await sendToAudience(node.audience ?? 'everyone', context, 'tileVideo', { tileUuid: tile.uuid, state, offset: node.offset ?? undefined });
  }
});

/**
 * Resolve a visibility node's target `hidden` state, honouring the legacy boolean `hidden` field.
 * @param {object} node A `toggleTileVisibility`/`toggleAmbientVisibility` node.
 * @param {object} doc The document being updated, read for toggle mode.
 * @returns {boolean} The `hidden` value to write.
 */
export function resolveHidden(node, doc) {
  const mode = node.mode ?? (node.hidden === undefined ? 'toggle' : node.hidden ? 'hide' : 'show');
  return mode === 'toggle' ? !doc.hidden : mode === 'hide';
}

/**
 * Build the update options that fade a visibility change over `node.duration` seconds.
 * @param {object} node A visibility node.
 * @returns {object|undefined} Update options, or undefined for an instant change.
 */
export function visibilityOptions(node) {
  return node.duration ? { animation: { duration: node.duration * 1000 } } : undefined;
}

registerNodeType('toggleTileVisibility', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.toggleTileVisibility.label',
  hint: 'GLYPH.ACTIONS.toggleTileVisibility.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.tile.label', required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.mode.label',
      choices: { show: 'GLYPH.VISIBILITY_MODE.show', hide: 'GLYPH.VISIBILITY_MODE.hide', toggle: 'GLYPH.VISIBILITY_MODE.toggle' }
    },
    { name: 'duration', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.duration.hint' }
  ],
  validate(node) {
    if (typeof node.tile !== 'object') throw new Error('toggleTileVisibility.tile must be a reference object.');
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (tile) await tile.update({ hidden: resolveHidden(node, tile) }, visibilityOptions(node));
  },
  async batchExecute(pairs) {
    await batchUpdate(
      pairs.map(({ node, context }) => {
        const tile = resolveReference(node.tile, context);
        return { doc: tile, changes: tile ? { hidden: resolveHidden(node, tile) } : {}, options: visibilityOptions(node) };
      })
    );
  }
});

registerNodeType('setTileOcclusion', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.setTileOcclusion.label',
  hint: 'GLYPH.ACTIONS.setTileOcclusion.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.setTileOcclusion.FIELDS.tile.label', required: true },
    {
      name: 'modes',
      widget: 'multiSelect',
      numeric: true,
      label: 'GLYPH.ACTIONS.setTileOcclusion.FIELDS.modes.label',
      choices: {
        1: 'GLYPH.OCCLUSION_MODES.fade',
        2: 'GLYPH.OCCLUSION_MODES.surface',
        4: 'GLYPH.OCCLUSION_MODES.radial',
        8: 'GLYPH.OCCLUSION_MODES.vision'
      }
    }
  ],
  validate(node) {
    if (!Array.isArray(node.modes)) throw new Error('setTileOcclusion.modes must be an array.');
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (tile) await tile.update({ 'occlusion.modes': node.modes });
  },
  async batchExecute(pairs) {
    await batchUpdate(pairs.map(({ node, context }) => ({ doc: resolveReference(node.tile, context), changes: { 'occlusion.modes': node.modes } })));
  }
});
