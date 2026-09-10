import { MODULE } from './constants.mjs';
import { ACTOR, buildTriggerSystem, seq } from './data/trigger-system.mjs';
import { regionShapeFromTile } from './tile-link.mjs';

/**
 * Create a Region + `glyph.trigger` behavior linked to an existing Tile.
 * @param {Scene} scene The scene to create on.
 * @param {TileDocument} tile The Tile to link.
 * @param {{pseudoEvents?: string[], events?: string[], pertoken?: boolean, handlers: Record<string, object>}} trigger The trigger config.
 * @returns {Promise<void>}
 */
async function createLinkedTrigger(scene, tile, trigger) {
  const system = { ...buildTriggerSystem(trigger), pertoken: !!trigger.pertoken, linkedTile: { kind: 'uuid', value: tile.uuid } };
  await scene.createEmbeddedDocuments('Region', [{ name: trigger.name, shapes: [regionShapeFromTile(tile)], behaviors: [{ type: MODULE.BEHAVIOR_TYPE, system }] }]);
}

/**
 * Drop an Item from the sidebar onto the canvas: create a clickable pickup Tile.
 * @param {{uuid: string, x: number, y: number}} data The drop data.
 * @returns {Promise<void>}
 */
async function dropItem(data) {
  const item = await fromUuid(data.uuid);
  if (!item) return ui.notifications.warn('GLYPH.QUICKCREATE.NOTIFICATIONS.NoItem');
  const size = canvas.scene.dimensions.size;
  const [tile] = await canvas.scene.createEmbeddedDocuments('Tile', [{ x: data.x - size / 2, y: data.y - size / 2, width: size, height: size, texture: { src: item.img } }]);
  await createLinkedTrigger(canvas.scene, tile, {
    name: item.name,
    pseudoEvents: ['click'],
    pertoken: true,
    handlers: {
      click: seq(
        { type: 'toggleTileVisibility', tile: { kind: 'uuid', value: tile.uuid }, mode: 'hide' },
        { type: 'addItem', actor: ACTOR, itemUuid: item.uuid },
        { type: 'notification', text: `${item.name} added to inventory.`, level: 'info', audience: 'triggeringUser' }
      )
    }
  });
}

/**
 * Drop a Scene from the sidebar onto the canvas: create a clickable scene-shortcut Tile.
 * @param {{uuid: string, x: number, y: number}} data The drop data.
 * @returns {Promise<void>}
 */
async function dropScene(data) {
  const scene = await fromUuid(data.uuid);
  if (!scene) return ui.notifications.warn('GLYPH.QUICKCREATE.NOTIFICATIONS.NoScene');
  const size = canvas.scene.dimensions.size;
  const [tile] = await canvas.scene.createEmbeddedDocuments('Tile', [{ x: data.x - size / 2, y: data.y - size / 2, width: size, height: size, texture: { src: scene.thumb } }]);
  await createLinkedTrigger(canvas.scene, tile, { name: scene.name, pseudoEvents: ['click'], handlers: { click: { type: 'changeScene', sceneUuid: scene.uuid, activate: false } } });
}

/**
 * Drop a Macro from the sidebar onto the canvas: create a clickable macro-button Tile.
 * @param {{uuid: string, x: number, y: number}} data The drop data.
 * @returns {Promise<void>}
 */
async function dropMacro(data) {
  const macro = await fromUuid(data.uuid);
  if (!macro) return ui.notifications.warn('GLYPH.QUICKCREATE.NOTIFICATIONS.NoMacro');
  const size = canvas.scene.dimensions.size;
  const [tile] = await canvas.scene.createEmbeddedDocuments('Tile', [
    { x: data.x - size / 2, y: data.y - size / 2, width: size, height: size, texture: { src: macro.img || 'icons/svg/dice-target.svg' } }
  ]);
  await createLinkedTrigger(canvas.scene, tile, { name: macro.name, pseudoEvents: ['click'], handlers: { click: { type: 'runMacro', macroUuid: macro.uuid } } });
}

/** Auto-create a trigger Tile when an Item, Scene, or Macro is dropped from the sidebar onto the canvas. */
export function registerQuickCreate() {
  Hooks.on('dropCanvasData', (_canvas, data) => {
    if (!game.user.isGM || !canvas.scene) return;
    if (data.type === 'Item') dropItem(data);
    else if (data.type === 'Scene') dropScene(data);
    else if (data.type === 'Macro') dropMacro(data);
  });
}
