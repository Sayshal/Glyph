/**
 * Whether a module is active.
 * @param {string} moduleId The module id.
 * @returns {boolean} Whether the module is active.
 */
export function isModuleActive(moduleId) {
  return game.modules.get(moduleId)?.active ?? false;
}
