import { isModuleActive } from '../capability.mjs';
import { dispatchPseudoEvent } from '../pseudo-events.mjs';

/** Register a `characterCreated` pseudo-event, dispatched when Hero Mancer finishes a new PC. */
export function registerHeroMancerIntegration() {
  if (!isModuleActive('hero-mancer')) return;
  Hooks.on('heroMancer.Created', ({ actor }) => {
    if (!ATLAS.isPrimaryGM) return;
    for (const scene of game.scenes) dispatchPseudoEvent(scene.regions, 'characterCreated', { actor });
  });
}
