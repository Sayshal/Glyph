import { MODULE } from './constants.mjs';

/**
 * Recursively rewrite every `{kind:"uuid", value}` reference in `data` from `oldPrefix` to `newPrefix`, mutating in place.
 * @param {*} data The data to walk.
 * @param {string} oldPrefix The old UUID prefix (e.g. `"Scene.OLDID."`).
 * @param {string} newPrefix The new UUID prefix (e.g. `"Scene.NEWID."`).
 */
function remapReferences(data, oldPrefix, newPrefix) {
  if (!data || typeof data !== 'object') return;
  if (data.kind === 'uuid' && typeof data.value === 'string' && data.value.startsWith(oldPrefix)) {
    data.value = newPrefix + data.value.slice(oldPrefix.length);
  }
  for (const value of Object.values(data)) remapReferences(value, oldPrefix, newPrefix);
}

/**
 * Remap every glyph.trigger reference on a copied Scene to point at the copy instead of the original.
 * @param {Scene} scene A newly created Scene.
 * @returns {Promise<void>}
 */
async function remapCopiedSceneReferences(scene) {
  const originalUuid = scene._stats.duplicateSource ?? scene._stats.compendiumSource;
  if (!originalUuid) return;
  const oldPrefix = `${originalUuid}.`;
  const newPrefix = `${scene.uuid}.`;
  for (const region of scene.regions) {
    for (const behavior of region.behaviors) {
      if (behavior.type !== MODULE.BEHAVIOR_TYPE) continue;
      const system = behavior.toObject().system;
      remapReferences(system, oldPrefix, newPrefix);
      await behavior.update({ system });
    }
  }
}

/** Register scene-duplication and compendium-import reference remapping. */
export function registerReferenceRemap() {
  Hooks.on('createScene', (scene) => {
    remapCopiedSceneReferences(scene);
  });
}
