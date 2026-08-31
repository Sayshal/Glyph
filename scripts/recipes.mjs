import { RecipePicker } from './apps/recipe-picker.mjs';
import { MODULE } from './constants.mjs';
import { RECIPES } from './data/recipes.mjs';
import { allNodeTypesRegistered } from './templates.mjs';

/**
 * List every shipped recipe whose `glyph.trigger` half (if any) has all its actions currently registered.
 * @returns {{id: string, name: string, hint: string, category: string}[]} The available recipes.
 */
export function listRecipes() {
  return RECIPES.filter((recipe) => recipe.behaviors.every((b) => b.type !== MODULE.BEHAVIOR_TYPE || Object.values(b.system.handlers).every(allNodeTypesRegistered))).map(
    ({ id, name, hint, category }) => ({ id, name, hint, category })
  );
}

/**
 * Create every RegionBehavior a recipe needs on `region` in one batched call.
 * @param {RegionDocument} region The Region to add the recipe's behaviors to.
 * @param {string} recipeId The recipe to apply.
 * @returns {Promise<RegionBehavior[]>} The created behaviors.
 */
export async function applyRecipe(region, recipeId) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return [];
  return region.createEmbeddedDocuments('RegionBehavior', recipe.behaviors);
}

/** Add a "Recipes" button to core's Region config sheet, beside its own "Add Behavior" button. */
export function registerRecipesButton() {
  Hooks.on('renderRegionConfig', (app, element) => {
    if (!game.user.isGM) return;
    const controls = element.querySelector('header.region-behavior .region-element-controls');
    if (!controls || controls.querySelector('[data-action="glyph-recipes"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-control icon fa-solid fa-wand-magic-sparkles';
    button.dataset.action = 'glyph-recipes';
    button.ariaLabel = _loc('GLYPH.RECIPES.label');
    button.dataset.tooltip = '';
    button.addEventListener('click', () => new RecipePicker({ regionConfig: app }).render({ force: true }));
    controls.prepend(button);
  });
}
