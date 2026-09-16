import { MODULE } from './constants.mjs';
import { queryPrimaryGM, registerQuery } from './queries.mjs';
import { behaviorsLinkedTo } from './tile-link.mjs';

/**
 * Run a `glyph.trigger` behavior's handler on demand, e.g. from a macro or a showDialog button, relaying to the primary GM when non-primary.
 * @param {string} behaviorUuid UUID of the RegionBehavior to trigger.
 * @param {string} [handler] The handler key to run.
 * @param {object} [data] Event payload the handler reads as top-level `{{path}}` values, e.g. a dialog form's fields. `data.token`, if present, must be a TokenDocument, and every other field must be JSON-safe.
 * @returns {Promise<void>}
 */
export async function runTrigger(behaviorUuid, handler = 'manual', data = {}) {
  if (ATLAS.isPrimaryGM) return runTriggerAs(behaviorUuid, handler, data, game.user);
  await queryPrimaryGM('runTrigger', data, { behaviorUuid, handler });
}

/**
 * Run a trigger's handler on the primary GM's client on behalf of `user`.
 * @param {string} behaviorUuid UUID of the RegionBehavior to trigger.
 * @param {string} handler The handler key to run.
 * @param {object} data Event payload.
 * @param {User} user The user the run is attributed to.
 * @returns {Promise<void>}
 */
async function runTriggerAs(behaviorUuid, handler, data, user) {
  const behavior = await fromUuid(behaviorUuid);
  if (!(behavior instanceof RegionBehavior) || behavior.type !== MODULE.BEHAVIOR_TYPE) throw new Error(`Glyph: "${behaviorUuid}" is not a glyph.trigger RegionBehavior.`);
  await behavior.system.run({ name: handler, data, region: behavior.parent, user }, { anyHandler: true });
}

registerQuery('runTrigger', async ({ behaviorUuid, handler, tokenUuid, data }, { user }) => {
  await runTriggerAs(behaviorUuid, handler, { ...data, token: tokenUuid ? await fromUuid(tokenUuid) : null }, user);
});

/** Add a power button to the Tile HUD for every enabled trigger linked to that Tile with a manual handler. */
export function registerManualTriggerHud() {
  Hooks.on('renderTileHUD', (hud, element) => {
    const tile = hud.document;
    const behaviors = behaviorsLinkedTo(tile.parent, tile.uuid).filter((behavior) => !behavior.disabled && behavior.system.handlers?.manual);
    if (!behaviors.length) return;
    const controls = element.querySelector('.col.right');
    if (!controls || controls.querySelector('[data-action="glyph-manual-trigger"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon';
    button.dataset.action = 'glyph-manual-trigger';
    button.dataset.tooltip = '';
    button.ariaLabel = _loc('GLYPH.MANUAL_TRIGGER.label');
    button.innerHTML = '<i class="fa-solid fa-power-off" inert></i>';
    button.addEventListener('click', () => {
      const token = canvas.tokens.controlled[0]?.document ?? null;
      for (const behavior of behaviors) runTrigger(behavior.uuid, 'manual', { token });
    });
    controls.append(button);
  });
}
