import { validateNode } from './types.mjs';

/**
 * Collect every tag of `matchType` nodes reachable anywhere under `node`.
 * @param {object} node A program node.
 * @param {string} matchType The node type to collect tags from ("landing" or "goto").
 * @param {Set<string>} tags Accumulator.
 */
function collectTags(node, matchType, tags) {
  if (!node || typeof node !== 'object') return;
  if (node.type === matchType && typeof node.tag === 'string') tags.add(node.tag);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((n) => collectTags(n, matchType, tags));
    else if (value && typeof value === 'object') collectTags(value, matchType, tags);
  }
}

/**
 * Whether a handler tree contains a landing with this tag.
 * @param {object} node A program node.
 * @param {string} tag The landing tag to look for.
 * @returns {boolean}
 */
export function hasLanding(node, tag) {
  const tags = new Set();
  collectTags(node, 'landing', tags);
  return tags.has(tag);
}

/** A schema field holding glyph's per-event handler trees: `{<eventName>: <sequence node>}`. */
export class ProgramField extends foundry.data.fields.ObjectField {
  /** @inheritDoc */
  _validateType(value, options = {}) {
    super._validateType(value, options);
    const landings = new Set();
    for (const node of Object.values(value)) collectTags(node, 'landing', landings);
    for (const [name, node] of Object.entries(value)) {
      try {
        validateNode(node);
      } catch (err) {
        throw new Error(`handlers.${name}: ${err.message}`);
      }
      const gotos = new Set();
      collectTags(node, 'goto', gotos);
      for (const tag of gotos) if (!landings.has(tag)) throw new Error(`handlers.${name}: goto references unknown landing "${tag}".`);
    }
  }
}
