import { MODULE } from './constants.mjs';

/** @type {string[]} Document types whose rotation core applies instantly, unlike a Token's. */
const ANIMATED_TYPES = ['Tile', 'Drawing', 'AmbientLight'];

/**
 * The signed shortest turn from one facing to another, so 350 -> 80 turns +90 rather than -270.
 * @param {number} from The starting facing in degrees.
 * @param {number} to The document's new facing in degrees.
 * @returns {number} The target facing, expressed relative to `from`.
 */
function shortestTarget(from, to) {
  return from + ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * Turn a placeable over time on this client, standing in for the animation core only gives Tokens.
 * @param {Document} document The rotated document.
 * @param {number} from The facing the placeable was showing before the update.
 * @param {number} duration The turn time in milliseconds.
 * @returns {Promise<boolean>|void} The animation, or nothing when the placeable isn't drawn.
 */
function animateRotation(document, from, duration) {
  const object = document.object;
  if (!object) return;
  const to = shortestTarget(from, document.rotation);
  const target = document.documentName === 'Tile' ? (object.mesh ?? object.bg) : document.documentName === 'Drawing' ? object.shape : null;
  if (target) return foundry.canvas.animation.CanvasAnimation.animate([{ parent: target, attribute: 'angle', from, to }], { duration });
  if (!object.lightSource) return;
  const state = { angle: from };
  return foundry.canvas.animation.CanvasAnimation.animate([{ parent: state, attribute: 'angle', from, to }], {
    duration,
    ontick: () => {
      object.lightSource.initialize({ rotation: state.angle });
      canvas.perception.update({ refreshLighting: true, refreshVision: true });
    }
  });
}

/** Register timed rotation for Tiles, Drawings and Ambient Lights, driven by the update options `rotateToken` sends. */
export function registerRotationAnimation() {
  for (const documentName of ANIMATED_TYPES) {
    Hooks.on(`update${documentName}`, (document, changed, options) => {
      const from = options?.[MODULE.ID]?.rotateFrom;
      const duration = options?.animation?.duration;
      if (!('rotation' in changed) || from === undefined || !duration) return;
      animateRotation(document, from, duration);
    });
  }
}
