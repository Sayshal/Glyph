import { MODULE } from '../constants.mjs';
import { commitConversions, convertTile } from '../import/matt-import.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Review dialog for converting a scene's MATT-flagged Tiles into glyph Regions + `trigger` behaviors. */
export class MattImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Scene} The scene being converted. */
  #scene;

  /** @type {{tile: TileDocument, converted: ReturnType<typeof convertTile>}[]} */
  #entries;

  /**
   * @param {object} options
   * @param {Scene} options.scene The scene to convert.
   * @param {TileDocument[]} options.tiles The MATT-flagged tiles to convert.
   */
  constructor({ scene, tiles, ...options } = {}) {
    super(options);
    this.#scene = scene;
    this.#entries = tiles.map((tile) => ({ tile, converted: convertTile(tile) }));
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: 'glyph-matt-import',
    tag: 'div',
    classes: ['glyph', 'glyph-matt-import'],
    window: { title: 'GLYPH.IMPORT.title', icon: 'fa-solid fa-file-import' },
    position: { width: 720, height: 'auto' },
    actions: { commit: MattImportDialog.#onCommit }
  };

  /** @inheritDoc */
  static PARTS = {
    main: { template: `modules/${MODULE.ID}/templates/matt-import.hbs`, scrollable: ['.glyph-import-tiles'] }
  };

  /** @inheritDoc */
  async _prepareContext() {
    const rows = this.#entries.map(({ tile, converted }) => {
      const counts = { ok: 0, partial: 0, manual: 0, skipped: 0 };
      const issues = [];
      for (const entry of converted.report) {
        counts[entry.level]++;
        if (entry.level !== 'ok') issues.push({ level: entry.level, note: entry.note, matt: JSON.stringify(entry.matt) });
      }
      return { name: tile.name || tile.id, counts, issues, linked: !!converted.linkedTile };
    });
    const totals = rows.reduce(
      (sum, row) => ({ ok: sum.ok + row.counts.ok, partial: sum.partial + row.counts.partial, manual: sum.manual + row.counts.manual, skipped: sum.skipped + row.counts.skipped }),
      {
        ok: 0,
        partial: 0,
        manual: 0,
        skipped: 0
      }
    );
    return { rows, totals, tileCount: this.#entries.length };
  }

  /**
   * Write every converted Region + behavior, creating a stub Macro for each manual-review action.
   * @this {MattImportDialog}
   * @returns {Promise<void>}
   */
  static async #onCommit() {
    const regions = await commitConversions(this.#scene, this.#entries);
    const manualCount = this.#entries.reduce((sum, { converted }) => sum + converted.stubs.length, 0);
    ui.notifications.info('GLYPH.IMPORT.NOTIFICATIONS.Committed', { format: { regions: regions.length, manual: manualCount } });
    this.close();
  }
}
