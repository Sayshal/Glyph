import { MODULE } from './constants.mjs';
import { EXAMPLE_TRIGGERS } from './data/example-triggers.mjs';
import { getNodeType } from './nodes/registry.mjs';

/** @type {string} Name of the world-scoped compendium glyph's trigger templates live in. */
const PACK_NAME = 'glyph-trigger-templates';

/** @type {string} Prefix marking a template id as a shipped example rather than a Compendium UUID. */
const EXAMPLE_PREFIX = 'example:';

/**
 * Whether every action node reachable under `node` is currently a registered node type.
 * @param {object} node A program node.
 * @returns {boolean}
 */
export function allNodeTypesRegistered(node) {
  if (!node || typeof node !== 'object') return true;
  if (typeof node.type === 'string' && !getNodeType(node.type)) return false;
  return Object.values(node).every((value) => {
    if (Array.isArray(value)) return value.every(allNodeTypesRegistered);
    if (value && typeof value === 'object') return allNodeTypesRegistered(value);
    return true;
  });
}

/**
 * Get glyph's own trigger-template compendium, creating it (GM only) on first use.
 * @returns {Promise<CompendiumCollection|null>} The pack, or null if unavailable.
 */
async function getTemplatePack() {
  const existing = game.packs.get(`world.${PACK_NAME}`);
  if (existing) return existing;
  if (!game.user.isGM) return null;
  await CompendiumCollection.createCompendium({ type: 'JournalEntry', label: 'Glyph Trigger Templates', name: PACK_NAME });
  return game.packs.get(`world.${PACK_NAME}`);
}

/**
 * Save a trigger behavior's configuration as a reusable template.
 * @param {RegionBehavior} behavior The behavior to save.
 * @param {string} name The template's name.
 * @returns {Promise<JournalEntry|null>} The created template document.
 */
export async function saveTemplate(behavior, name) {
  const pack = await getTemplatePack();
  if (!pack) return null;
  return JournalEntry.create({ name, flags: { [MODULE.ID]: { template: behavior.toObject().system } } }, { pack: pack.collection });
}

/**
 * List every saved template plus every shipped example whose actions are all currently registered.
 * @returns {Promise<{uuid: string, name: string, category: string}[]>} The available templates.
 */
export async function listTemplates() {
  const pack = game.packs.get(`world.${PACK_NAME}`);
  const index = pack ? await pack.getIndex() : [];
  const saved = index.map((entry) => ({ uuid: `Compendium.${pack.collection}.${entry._id}`, name: entry.name, category: 'yours' }));
  const examples = EXAMPLE_TRIGGERS.filter((e) => Object.values(e.system.handlers).every(allNodeTypesRegistered)).map((e) => ({
    uuid: `${EXAMPLE_PREFIX}${e.id}`,
    name: e.name,
    category: e.category
  }));
  return [...saved, ...examples];
}

/**
 * Apply a saved template's, or a shipped example's, configuration onto a trigger behavior.
 * @param {RegionBehavior} behavior The behavior to overwrite.
 * @param {string} templateUuid UUID of the template JournalEntry, or an `example:<id>` key.
 * @returns {Promise<void>}
 */
export async function applyTemplate(behavior, templateUuid) {
  let template;
  if (templateUuid.startsWith(EXAMPLE_PREFIX)) template = EXAMPLE_TRIGGERS.find((e) => e.id === templateUuid.slice(EXAMPLE_PREFIX.length))?.system;
  else template = (await fromUuid(templateUuid))?.getFlag(MODULE.ID, 'template');
  if (!template) return;
  await behavior.update({ system: foundry.data.operators.ForcedReplacement.create(template) });
}
