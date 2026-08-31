import { MattImportDialog } from '../apps/matt-import-dialog.mjs';
import { findMattTiles } from './matt-import.mjs';

/** Add an "Import MATT Triggers" entry to the Scenes sidebar's right-click context menu. */
export function registerMattImportContextMenu() {
  Hooks.on('getSceneContextOptions', (_app, entries) => {
    entries.push({
      label: 'GLYPH.IMPORT.title',
      icon: 'fa-solid fa-file-import',
      visible: (li) => game.user.isGM && findMattTiles(game.scenes.get(li.dataset.entryId)).length > 0,
      onClick: (_event, li) => {
        const scene = game.scenes.get(li.dataset.entryId);
        new MattImportDialog({ scene, tiles: findMattTiles(scene) }).render({ force: true });
      }
    });
  });
}
