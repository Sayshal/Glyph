import { MODULE } from './constants.mjs';
import { runTrigger } from './manual-trigger.mjs';

/** `@Trigger[uuid]{Label}` matches a `glyph.trigger` RegionBehavior's UUID. */
const PATTERN = /@Trigger\[(?<uuid>[^\]]+)\](?:\{(?<label>[^}]+)\})?/g;

/**
 * Render one `@Trigger[...]` match as a clickable content link that fires the referenced trigger.
 * @param {RegExpMatchArray} match The regex match, with named groups `uuid`/`label`.
 * @returns {Promise<HTMLAnchorElement>} The rendered link.
 */
async function enrichTriggerLink(match) {
  const { uuid, label } = match.groups;
  const behavior = await fromUuid(uuid).catch(() => null);
  const a = document.createElement('a');
  a.classList.add('content-link', 'glyph-trigger-link');
  a.dataset.uuid = uuid;
  a.innerHTML = `<i class="${MODULE.ICON}"></i>${label ?? behavior?.name ?? 'Trigger'}`;
  a.addEventListener('click', async () => {
    try {
      await runTrigger(uuid);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  });
  return a;
}

/** Register the `@Trigger[...]` text enricher. */
export function registerTriggerLinkEnricher() {
  CONFIG.TextEditor.enrichers.push({ pattern: PATTERN, enricher: enrichTriggerLink });
}
