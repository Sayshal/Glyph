import { MODULE, SETTINGS } from './constants.mjs';

/** Register Glyph's world settings. */
export function registerSettings() {
  game.settings.register(MODULE.ID, SETTINGS.QUICK_CREATE, {
    name: 'GLYPH.Settings.quickCreate.Name',
    hint: 'GLYPH.Settings.quickCreate.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });
}
