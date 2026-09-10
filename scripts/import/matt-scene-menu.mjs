import { MattImportDialog } from '../apps/matt-import-dialog.mjs';
import { findMattTiles } from './matt-import.mjs';

/**
 * Resolve the scene a context-menu row refers to.
 * @param {HTMLElement} li The row the menu was opened on.
 * @returns {Scene|undefined} The scene, if the row names one.
 */
function resolveScene(li) {
  if (li.dataset.levelId) return undefined;
  return game.scenes.get(li.dataset.entryId ?? li.dataset.sceneId);
}

/** Add an "Import MATT Triggers" entry to the Scenes sidebar's right-click context menu. */
export function registerMattImportContextMenu() {
  Hooks.on('getSceneContextOptions', (_app, entries) => {
    entries.push({
      label: 'GLYPH.IMPORT.title',
      icon: 'fa-solid fa-file-import',
      visible: (li) => game.user.isGM && findMattTiles(resolveScene(li)).length > 0,
      onClick: (_event, li) => {
        const scene = resolveScene(li);
        if (!scene) return;
        new MattImportDialog({ scene, tiles: findMattTiles(scene) }).render({ force: true });
      }
    });
  });
}
