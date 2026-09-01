import { getNodeType } from '../nodes/registry.mjs';

/**
 * Read a value at a dotted path within a program tree, or the tree itself for an empty path.
 * @param {object} root The handler's root node.
 * @param {string} path A dotted path (array indices as plain numeric segments).
 * @returns {*} The value at that path.
 */
export function getAtPath(root, path) {
  return path ? foundry.utils.getProperty(root, path) : root;
}

/**
 * Split a dotted path into its parent path and final key.
 * @param {string} path A non-empty dotted path.
 * @returns {{parentPath: string, key: string}}
 */
function splitPath(path) {
  const lastDot = path.lastIndexOf('.');
  return { parentPath: lastDot === -1 ? '' : path.slice(0, lastDot), key: path.slice(lastDot + 1) };
}

/**
 * Remove the node (or slot key) at a dotted path.
 * @param {object} root The handler's root node.
 * @param {string} path A non-empty dotted path.
 */
export function deleteAtPath(root, path) {
  const { parentPath, key } = splitPath(path);
  const parent = getAtPath(root, parentPath);
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else delete parent[key];
}

/**
 * Swap a node at a dotted array path with its sibling `offset` positions away, if in bounds.
 * @param {object} root The handler's root node.
 * @param {string} path A non-empty dotted path whose final segment is an array index.
 * @param {number} offset `-1` to move up, `1` to move down.
 */
export function moveAtPath(root, path, offset) {
  const { parentPath, key } = splitPath(path);
  const parent = getAtPath(root, parentPath);
  if (!Array.isArray(parent)) return;
  const index = Number(key);
  const target = index + offset;
  if (target < 0 || target >= parent.length) return;
  [parent[index], parent[target]] = [parent[target], parent[index]];
}

/** @type {Record<string, *>} Default value per field widget kind, when scaffolding a new node. */
const WIDGET_DEFAULTS = {
  boolean: false,
  number: 0,
  multiSelect: [],
  reference: { kind: 'uuid', value: '' }
};

/**
 * Build a minimal valid node of `type`, with every slot initialized empty and every field defaulted.
 * @param {string} type The node type name.
 * @returns {object} A new node.
 */
export function scaffoldNode(type) {
  const definition = getNodeType(type);
  if (!definition) throw new Error(`Unknown program node type "${type}".`);
  const node = { type };
  for (const slot of definition.slots ?? []) node[slot.name] = slot.optional ? undefined : [];
  for (const field of definition.fields ?? []) node[field.name] = WIDGET_DEFAULTS[field.widget] ?? '';
  return node;
}

/**
 * Collect every `landing` tag reachable anywhere under `node`.
 * @param {object} node A program node.
 * @param {Set<string>} [tags] Accumulator.
 * @returns {Set<string>} The accumulated tags.
 */
export function collectLandingTags(node, tags = new Set()) {
  if (!node || typeof node !== 'object') return tags;
  if (node.type === 'landing' && typeof node.tag === 'string') tags.add(node.tag);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((n) => collectLandingTags(n, tags));
    else if (value && typeof value === 'object') collectLandingTags(value, tags);
  }
  return tags;
}
