import { getNodeType } from './registry.mjs';

/**
 * Execute one program node.
 * @param {object} node The node to run.
 * @param {import('../run-context.mjs').RunContext} context The active run context.
 * @returns {Promise<void>}
 */
export async function runNode(node, context) {
  if (!node || node.enabled === false) return;
  const definition = getNodeType(node.type);
  if (!definition) return;
  await definition.execute(node, context);
}
