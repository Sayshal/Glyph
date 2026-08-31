import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';

/** VGMusic */
export function registerVgmusicActions() {
  if (!isModuleActive('vgmusic')) return;
  registerNodeType('refreshMusicSections', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.refreshMusicSections.label',
    hint: 'GLYPH.ACTIONS.refreshMusicSections.hint',
    async execute() {
      await VGMUSIC.refreshSections();
    }
  });
}
