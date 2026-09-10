import { MODULE } from './constants.mjs';
import { alphaShapesFromTile } from './tile-alpha.mjs';

/**
 * Build a rectangle Region shape matching a Tile's bounds.
 * @param {TileDocument} tile The Tile to match.
 * @returns {object} A `RegionShape` data object.
 */
export function regionShapeFromTile(tile) {
  return { type: 'rectangle', x: tile.x, y: tile.y, width: tile.width, height: tile.height, anchorX: tile.texture.anchorX, anchorY: tile.texture.anchorY, rotation: tile.rotation };
}

/**
 * The Region shapes for a Tile: its traced image when asked for, else its bounds.
 * @param {TileDocument} tile The Tile to match.
 * @param {boolean} [traceAlpha] Whether to trace the Tile's opaque pixels.
 * @returns {object[]} `RegionShape` data objects.
 */
export function regionShapesFromTile(tile, traceAlpha) {
  return (traceAlpha ? alphaShapesFromTile(tile) : null) ?? [regionShapeFromTile(tile)];
}

/**
 * Replace a Region's shapes with the ones its linked Tile calls for.
 * @param {RegionDocument} region The Region to sync.
 * @param {TileDocument} tile The linked Tile.
 * @param {RegionBehavior} behavior The trigger behavior holding the link.
 * @returns {Promise<void>}
 */
async function syncRegionToTile(region, tile, behavior) {
  await region.update({ shapes: regionShapesFromTile(tile, behavior?.system?.traceAlpha) });
}

/**
 * Every `glyph.trigger` behavior linked to `tileUuid`.
 * @param {Scene} scene The scene to search.
 * @param {string} tileUuid The linked Tile's UUID.
 * @returns {RegionBehavior[]} Matching behaviors.
 */
export function behaviorsLinkedTo(scene, tileUuid) {
  const matches = [];
  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== MODULE.BEHAVIOR_TYPE) continue;
      if (behavior.system.linkedTile?.value === tileUuid) matches.push(behavior);
    }
  }
  return matches;
}

/**
 * Resolve a trigger behavior from itself, its Region, or a Tile linked to it.
 * @param {*} ref A RegionBehavior, RegionDocument, TileDocument, or a placeable wrapping one.
 * @returns {RegionBehavior|null}
 */
export function toTriggerBehavior(ref) {
  const doc = ref?.document ?? ref;
  if (doc instanceof RegionBehavior) return doc.type === MODULE.BEHAVIOR_TYPE ? doc : null;
  if (doc instanceof RegionDocument) return doc.behaviors.find((behavior) => behavior.type === MODULE.BEHAVIOR_TYPE) ?? null;
  if (doc instanceof TileDocument) return behaviorsLinkedTo(doc.parent, doc.uuid)[0] ?? null;
  return null;
}

/** Register Tile-Region auto-linking: a linked Region's shape stays in sync with its Tile. */
export function registerTileLink() {
  Hooks.on('updateTile', (tile, changed) => {
    if (!['x', 'y', 'width', 'height', 'rotation', 'texture'].some((key) => key in changed)) return;
    for (const behavior of behaviorsLinkedTo(tile.parent, tile.uuid)) syncRegionToTile(behavior.region, tile, behavior);
  });

  Hooks.on('updateRegionBehavior', async (behavior, changed) => {
    const system = changed.system ?? {};
    if (behavior.type !== MODULE.BEHAVIOR_TYPE || !('linkedTile' in system || 'traceAlpha' in system)) return;
    const tile = await fromUuid(behavior.system.linkedTile?.value);
    if (tile) await syncRegionToTile(behavior.region, tile, behavior);
  });
}
