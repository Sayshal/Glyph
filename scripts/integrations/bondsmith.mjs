import { isModuleActive } from '../capability.mjs';
import { MODULE } from '../constants.mjs';

/** Register glyph's trigger-fired hook as a Bondsmith automation trigger source. */
export function registerBondsmithIntegration() {
  if (!isModuleActive('bondsmith')) return;
  BONDSMITH.api.automation.registerTriggerHook({
    hookName: MODULE.HOOKS.TRIGGER,
    label: 'GLYPH.INTEGRATIONS.bondsmithTriggerLabel',
    toPayload: (behavior, event) => ({
      behaviorUuid: behavior.uuid,
      region: behavior.parent?.name ?? null,
      eventName: event.name,
      actorUuid: event.data?.token?.actor?.uuid ?? null
    }),
    extractUuid: (payload) => payload.actorUuid
  });
}
