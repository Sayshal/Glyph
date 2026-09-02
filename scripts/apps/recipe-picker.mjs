import { MODULE } from '../constants.mjs';
import { applyRecipe, listRecipes } from '../recipes.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {Record<string, string>} FontAwesome icon per recipe category. */
const CATEGORY_ICONS = {
  movement: 'fa-solid fa-route',
  lighting: 'fa-solid fa-lightbulb',
  hazard: 'fa-solid fa-triangle-exclamation',
  utility: 'fa-solid fa-wrench',
  social: 'fa-solid fa-comments',
  environment: 'fa-solid fa-mountain-sun',
  mechanism: 'fa-solid fa-gear',
  fxmaster: 'fa-solid fa-cloud-bolt',
  tagger: 'fa-solid fa-tag'
};

/** @type {string} Icon shown for a category with no entry in CATEGORY_ICONS. */
const DEFAULT_ICON = 'fa-solid fa-wand-magic-sparkles';

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
    position: { width: 640, height: 600 },
    actions: { apply: RecipePicker.#onApply }
  };

  /** @inheritDoc */
  static PARTS = { main: { template: `modules/${MODULE.ID}/templates/recipe-picker.hbs`, scrollable: [''] } };

  /** @inheritDoc */
  async _prepareContext() {
    const recipes = listRecipes();
    const items = recipes.map((r) => {
      const name = _loc(r.name);
      const hint = _loc(r.hint);
      const categoryLabel = _loc(`GLYPH.RECIPES.CATEGORIES.${r.category}`);
      return { id: r.id, name, hint, category: r.category, categoryLabel, icon: CATEGORY_ICONS[r.category] ?? DEFAULT_ICON, search: `${name} ${hint} ${categoryLabel}`.toLowerCase() };
    });
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { recipes: items };
  }

  /** @inheritDoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener('input', (event) => {
      if (event.target.matches('.glyph-recipe-search-input')) this.#filterRecipes(event.target.value);
    });
  }

  /**
   * Show only the recipe cards whose precomputed search text contains `query`.
   * @param {string} query The search box's current value.
   */
  #filterRecipes(query) {
    const q = query.trim().toLowerCase();
    let anyVisible = false;
    for (const card of this.element.querySelectorAll('.glyph-recipe-card')) {
      const match = !q || card.dataset.search.includes(q);
      card.hidden = !match;
      if (match) anyVisible = true;
    }
    const empty = this.element.querySelector('.glyph-recipe-empty');
    if (empty) empty.hidden = anyVisible;
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
