/**
 * Whether a module is active, optionally requiring a minimum version.
 * @param {string} moduleId The module id.
 * @param {string} [minVersion] Minimum required version.
 * @returns {boolean} Whether the module is active and meets the version requirement.
 */
export function isModuleActive(moduleId, minVersion) {
  const module = game.modules.get(moduleId);
  if (!module?.active) return false;
  if (!minVersion) return true;
  return !foundry.utils.isNewerVersion(minVersion, module.version);
}
