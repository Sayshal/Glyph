import { MODULE } from '../constants.mjs';
import { applyRecipe, listRecipes } from '../recipes.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Lists shipped recipes and creates every RegionBehavior one needs on a Region in one step. */
export class RecipePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {ApplicationV2} The open RegionConfig this picker was launched from. */
  #regionConfig;

  /**
   * @param {object} options
   * @param {ApplicationV2} options.regionConfig The open RegionConfig this picker was launched from.
   */
  constructor({ regionConfig, ...options } = {}) {
    super(options);
    this.#regionConfig = regionConfig;
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: 'glyph-recipe-picker',
    tag: 'div',
    classes: ['glyph', 'glyph-recipe-picker'],
    window: { title: 'GLYPH.RECIPES.label', icon: 'fa-solid fa-wand-magic-sparkles' },
    position: { width: 420, height: 600 },
    actions: { apply: RecipePicker.#onApply }
  };

  /** @inheritDoc */
  static PARTS = {
    main: { template: `modules/${MODULE.ID}/templates/recipe-picker.hbs`, scrollable: [''] }
  };

  /** @inheritDoc */
  async _prepareContext() {
    const byCategory = Object.groupBy(listRecipes(), (r) => r.category);
    const groups = Object.entries(byCategory).map(([category, recipes]) => ({
      category: _loc(`GLYPH.RECIPES.CATEGORIES.${category}`),
      recipes: recipes.map((r) => ({ id: r.id, name: _loc(r.name), hint: _loc(r.hint) }))
    }));
    return { groups };
  }

  /**
   * Apply the clicked recipe to the launching RegionConfig's Region, then refresh its Behaviors list.
   * @this {RecipePicker}
   * @param {PointerEvent} _event The click event.
   * @param {HTMLElement} target The element carrying `data-action="apply"`.
   */
  static async #onApply(_event, target) {
    await applyRecipe(this.#regionConfig.document, target.dataset.recipeId);
    await this.#regionConfig.render({ parts: ['behaviors'] });
    this.close();
  }
}
