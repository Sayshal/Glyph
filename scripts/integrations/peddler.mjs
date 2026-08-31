import { isModuleActive } from '../capability.mjs';
import { runTrigger } from '../manual-trigger.mjs';

/** Register a `glyph.runTrigger` effect other Peddler dialogue trees can use to fire a glyph trigger. */
export function registerPeddlerIntegration() {
  if (!isModuleActive('peddler')) return;
  Peddler.registry.registerEffect('glyph.runTrigger', {
    label: 'GLYPH.INTEGRATIONS.peddlerEffectLabel',
    kind: 'local',
    args: [
      { name: 'behaviorUuid', type: 'string', widget: 'string' },
      { name: 'handler', type: 'string', widget: 'string' }
    ],
    apply: ([behaviorUuid, handler]) => runTrigger(behaviorUuid, handler || undefined)
  });
}
