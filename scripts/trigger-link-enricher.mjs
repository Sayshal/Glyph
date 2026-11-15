import { MODULE } from './constants.mjs';
import { runTrigger } from './manual-trigger.mjs';

/** `@Trigger[uuid]{Label}` matches a `glyph.trigger` RegionBehavior's UUID. */
const PATTERN = /@Trigger\[(?<uuid>[^\]]+)\](?:\{(?<label>[^}]+)\})?/g;

/**
 * Render one `@Trigger[...]` match as a content link to the referenced trigger.
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
  return a;
}

/**
 * Wire a rendered trigger link's click to run its trigger.
 * @param {HTMLElement} element The enriched-content wrapper.
 * @param {{signal: AbortSignal}} options Listener options.
 */
function onRenderTriggerLink(element, { signal }) {
  const link = element.querySelector('.glyph-trigger-link');
  link?.addEventListener(
    'click',
    async () => {
      try {
        await runTrigger(link.dataset.uuid);
      } catch (error) {
        ui.notifications.error(error.message);
      }
    },
    { signal }
  );
}

/** Register the `@Trigger[...]` text enricher. */
export function registerTriggerLinkEnricher() {
  CONFIG.TextEditor.enrichers.push({ id: `${MODULE.ID}.trigger`, pattern: PATTERN, enricher: enrichTriggerLink, onRender: onRenderTriggerLink });
}
