import { isModuleActive } from './capability.mjs';
import { MODULE } from './constants.mjs';
import { runTrigger } from './manual-trigger.mjs';
import { registerNodeType } from './nodes/registry.mjs';

/**
 * Register a custom action node type, namespaced under the caller's own module id.
 * @param {string} moduleId The registering module's id.
 * @param {string} name The action name.
 * @param {{validate?: Function, execute: Function}} definition The node type definition.
 */
function registerAction(moduleId, name, definition) {
  if (!moduleId || !name) throw new Error('registerAction requires a moduleId and a name.');
  registerNodeType(`${moduleId}.${name}`, definition);
}

/**
 * Build the public API and expose it on the module and globally.
 * @returns {object} The API object
 */
export function createApi() {
  const api = { registerAction, isModuleActive, runTrigger };
  game.modules.get(MODULE.ID).api = api;
  globalThis.GLYPH = api;
  return api;
}
