import { sendToAudience } from '../audience.mjs';
import { MODULE } from '../constants.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../render-intent.mjs';
import { resolveReference } from '../targeting.mjs';
import { applyTileTransition } from '../tile-transitions.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

/**
 * Resolve which image `select` picks from `images`, persisting the chosen index on the tile.
 * @param {TileDocument} tile The tile whose image index is read/written.
 * @param {string} select One of "first"/"last"/"next"/"previous"/"random"/"index".
 * @param {string[]} images The configured image list.
 * @param {number} [explicitIndex] The index to use when `select` is "index".
 * @param {string} [randomRange] For "random", a "min-max" or dice-formula string constraining which indexes are eligible.
 * @returns {Promise<string|null>} The resolved image path, or null if `images` is empty.
 */
async function resolveListImage(tile, select, images, explicitIndex, randomRange) {
  if (!images.length) return null;
  const current = tile.getFlag(MODULE.ID, 'imageIndex') ?? 0;
  let index;
  if (select === 'first') index = 0;
  else if (select === 'last') index = images.length - 1;
  else if (select === 'next') index = (current + 1) % images.length;
  else if (select === 'previous') index = (current - 1 + images.length) % images.length;
  else if (select === 'random') index = await resolveRandomIndex(images.length, randomRange);
  else index = Math.min(Math.max(Number(explicitIndex) || 0, 0), images.length - 1);
  await tile.setFlag(MODULE.ID, 'imageIndex', index);
  return images[index];
}

/**
 * Pick a random image index, optionally constrained to a "min-max" range or a dice formula.
 * @param {number} length The image list's length.
 * @param {string} [range] A "min-max" range, or a dice formula rolled and clamped into range.
 * @returns {Promise<number>} The chosen index.
 */
async function resolveRandomIndex(length, range) {
  const bounds = String(range ?? '').match(/^(\d+)\s*-\s*(\d+)$/);
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
        index: 'GLYPH.IMAGE_SELECT.index'
      }
    },
    { name: 'src', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.src.label' },
    { name: 'images', widget: 'json', label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.images.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.images.hint' },
    { name: 'index', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.index.label' },
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
    { name: 'duration', widget: 'number', min: 50, step: 50, label: 'GLYPH.ACTIONS.changeTileImage.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.changeTileImage.FIELDS.duration.hint' }
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
    let src = node.src;
    if (select !== 'direct') {
      const images = Array.isArray(node.images) ? node.images : [];
      src = await resolveListImage(tile, select, images, node.index, node.randomRange);
    }
    if (!src) return;
    await applyTileTransition(tile, src, node.transition ?? 'none', node.duration ?? 500);
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
      choices: { play: 'GLYPH.VIDEO_STATE.play', pause: 'GLYPH.VIDEO_STATE.pause', stop: 'GLYPH.VIDEO_STATE.stop', reset: 'GLYPH.VIDEO_STATE.reset' }
    }
  ],
  validate(node) {
    if (typeof node.tile !== 'object' || typeof node.state !== 'string') {
      throw new Error('tileVideo.tile must be a reference and .state a string.');
    }
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (!tile?.object?.isVideo) return;
    const source = tile.object.sourceElement;
    if (node.state === 'stop') {
      game.video.stop(source);
    } else {
      const playing = node.state !== 'pause';
      await game.video.play(source, { playing, offset: node.state === 'reset' ? 0 : undefined });
    }
  }
});

registerNodeType('toggleTileVisibility', {
  category: 'tile',
  label: 'GLYPH.ACTIONS.toggleTileVisibility.label',
  hint: 'GLYPH.ACTIONS.toggleTileVisibility.hint',
  fields: [
    { name: 'tile', widget: 'reference', label: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.tile.label', required: true },
    { name: 'hidden', widget: 'boolean', label: 'GLYPH.ACTIONS.toggleTileVisibility.FIELDS.hidden.label' }
  ],
  validate(node) {
    if (typeof node.tile !== 'object') throw new Error('toggleTileVisibility.tile must be a reference object.');
  },
  async execute(node, context) {
    const tile = resolveReference(node.tile, context);
    if (tile) await tile.update({ hidden: node.hidden ?? !tile.hidden });
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
  }
});
