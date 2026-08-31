import { isModuleActive } from '../capability.mjs';
import { dispatchPseudoEvent } from '../pseudo-events.mjs';

/** @type {Record<string, string>} Calendaria hook name to the glyph pseudo-event it becomes. */
const HOOK_MAP = {
  'calendaria.seasonChange': 'seasonChange',
  'calendaria.weatherChange': 'weatherChange',
  'calendaria.dayChange': 'dayChange',
  'calendaria.moonPhaseChange': 'moonPhaseChange',
  'calendaria.restDayChange': 'restDayChange',
  'calendaria.eventTriggered': 'calendarEvent'
};

/** Register Calendaria's world-state hooks as glyph pseudo-events, dispatched world-wide like `worldTimeChanged`. */
export function registerCalendariaIntegration() {
  if (!isModuleActive('calendaria')) return;
  for (const [hookName, pseudoEvent] of Object.entries(HOOK_MAP)) {
    Hooks.on(hookName, (data) => {
      if (!ATLAS.isPrimaryGM) return;
      for (const scene of game.scenes) dispatchPseudoEvent(scene.regions, pseudoEvent, data);
    });
  }
}
