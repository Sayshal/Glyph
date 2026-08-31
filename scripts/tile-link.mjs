import { MODULE } from './constants.mjs';

/**
 * Build a rectangle Region shape matching a Tile's bounds.
 * @param {TileDocument} tile The Tile to match.
 * @returns {object} A `RegionShape` data object.
 */
export function regionShapeFromTile(tile) {
  return { type: 'rectangle', x: tile.x, y: tile.y, width: tile.width, height: tile.height, anchorX: tile.texture.anchorX, anchorY: tile.texture.anchorY, rotation: tile.rotation };
}

/**
 * Replace a Region's shapes with a single rectangle matching a Tile's bounds.
 * @param {RegionDocument} region The Region to sync.
 * @param {TileDocument} tile The linked Tile.
 * @returns {Promise<void>}
 */
async function syncRegionToTile(region, tile) {
  await region.update({ shapes: [regionShapeFromTile(tile)] });
}

/**
 * Every non-disabled `glyph.trigger` behavior linked to `tileUuid`.
 * @param {Scene} scene The scene to search.
 * @param {string} tileUuid The linked Tile's UUID.
 * @returns {RegionBehavior[]} Matching behaviors.
 */
function behaviorsLinkedTo(scene, tileUuid) {
  const matches = [];
  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.disabled || behavior.type !== MODULE.BEHAVIOR_TYPE) continue;
      if (behavior.system.linkedTile?.value === tileUuid) matches.push(behavior);
    }
  }
  return matches;
}

/** Register Tile-Region auto-linking: a linked Region's shape stays in sync with its Tile. */
export function registerTileLink() {
  Hooks.on('updateTile', (tile, changed) => {
    if (!['x', 'y', 'width', 'height', 'rotation', 'texture'].some((key) => key in changed)) return;
    for (const behavior of behaviorsLinkedTo(tile.parent, tile.uuid)) syncRegionToTile(behavior.region, tile);
  });

  Hooks.on('updateRegionBehavior', async (behavior, changed) => {
    if (behavior.type !== MODULE.BEHAVIOR_TYPE || !('linkedTile' in (changed.system ?? {}))) return;
    const tile = await fromUuid(behavior.system.linkedTile?.value);
    if (tile) await syncRegionToTile(behavior.region, tile);
  });
}
