const nodeTypes = new Map();

/**
 * @typedef {object} NodeTypeDefinition
 * @property {(node: object) => void} [validate] Throws if the node's config is invalid.
 * @property {(node: object, context: object) => Promise<void>} execute Runs the node once, against a run context.
 * @property {(pairs: {node: object, context: object}[]) => Promise<void>} [batchExecute] Replaces N sequential `execute` calls from a single-node `forEach` body with one coalesced pass.
 */

/**
 * Register a program node type.
 * @param {string} type The node type name.
 * @param {NodeTypeDefinition} definition
 */
export function registerNodeType(type, definition) {
  nodeTypes.set(type, definition);
}

/**
 * Look up a registered node type.
 * @param {string} type The node type name.
 * @returns {object|undefined} The node type's definition.
 */
export function getNodeType(type) {
  return nodeTypes.get(type);
}

/**
 * List every registered node type, for UI pickers.
 * @returns {{type: string, definition: object}[]}
 */
export function listNodeTypes() {
  return [...nodeTypes.entries()].map(([type, definition]) => ({ type, definition }));
}
