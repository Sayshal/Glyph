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
  if (context.dryRun && definition.category !== 'structural') {
    context.trace?.push({ type: node.type });
    return;
  }
  const start = context.trace ? performance.now() : 0;
  try {
    await definition.execute(node, context);
    context.trace?.push({ type: node.type, ms: Math.round(performance.now() - start) });
  } catch (error) {
    context.trace?.push({ type: node.type, ms: Math.round(performance.now() - start), error: error.message });
    throw error;
  }
}
