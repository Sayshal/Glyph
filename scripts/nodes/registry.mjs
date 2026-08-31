const nodeTypes = new Map();

/**
 * Register a program node type.
 * @param {string} type The node type name.
 * @param {{validate?: (node: object) => void, execute: (node: object, context: import('../run-context.mjs').RunContext) => Promise<void>}} definition
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
