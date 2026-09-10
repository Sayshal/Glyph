import { MODULE } from '../constants.mjs';
import { activeRuns } from '../run-context.mjs';
import { resolveCollection, resolveReference } from '../targeting.mjs';
import { runNode } from './executor.mjs';
import { evaluateCondition } from './expression.mjs';
import { getNodeType, registerNodeType } from './registry.mjs';

/** @type {number} Hard cap on forEach iterations, so a bad collection can't hang a run. */
const MAX_ITERATIONS = 1000;

/**
 * Fisher-Yates shuffle, in place.
 * @param {object[]} items The list to shuffle.
 * @returns {object[]} `items`, shuffled.
 */
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Narrow a resolved item list to exactly one item, per forEach's `pick` mode.
 * @param {object[]} items The filtered/limited item list.
 * @param {string} mode One of "first"/"last"/"random"/"min"/"max"/"minName"/"maxName"/"index".
 * @param {string} [path] The dot-path compared for "min"/"max"/"minName"/"maxName".
 * @param {number} [index] The index used for "index".
 * @returns {object[]} Zero or one items.
 */
function pickOne(items, mode, path, index) {
  if (!items.length) return [];
  if (mode === 'first') return [items[0]];
  if (mode === 'last') return [items[items.length - 1]];
  if (mode === 'random') return [items[Math.floor(Math.random() * items.length)]];
  if (mode === 'index') return [items[Math.min(Math.max(Number(index) || 0, 0), items.length - 1)]];
  if (mode === 'min' || mode === 'max') {
    const valueOf = (item) => Number(foundry.utils.getProperty(item, path ?? '')) || 0;
    return [items.reduce((best, item) => ((mode === 'min' ? valueOf(item) < valueOf(best) : valueOf(item) > valueOf(best)) ? item : best))];
  }
  if (mode === 'minName' || mode === 'maxName') {
    const valueOf = (item) => String(foundry.utils.getProperty(item, path || 'name') ?? '');
    return [items.reduce((best, item) => ((mode === 'minName' ? valueOf(item) < valueOf(best) : valueOf(item) > valueOf(best)) ? item : best))];
  }
  return [items[0]];
}

/**
 * Validate that `value` is an array of nodes; recurse into each.
 * @param {*} value The value to check.
 * @param {string} label The field name, for the thrown message.
 */
function requireNodeArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of nodes.`);
  value.forEach(validateNode);
}

/**
 * Validate one program node against its registered type.
 * @param {object} node The node to validate.
 */
export function validateNode(node) {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object' || typeof node.type !== 'string') throw new Error('A program node must be an object with a string "type".');
  nodeTypeOf(node.type).validate?.(node);
}

/**
 * Look up a node type's definition, throwing if it isn't registered.
 * @param {string} type The node type name.
 * @returns {object} The node type's definition.
 */
function nodeTypeOf(type) {
  const definition = getNodeType(type);
  if (!definition) throw new Error(`Unknown program node type "${type}".`);
  return definition;
}

registerNodeType('sequence', {
  structural: true,
  category: 'structural',
  label: 'GLYPH.NODES.sequence.label',
  hint: 'GLYPH.NODES.sequence.hint',
  slots: [{ name: 'children', label: 'GLYPH.NODES.sequence.SLOTS.children' }],
  validate(node) {
    requireNodeArray(node.children, 'sequence.children');
  },
  async execute(node, context) {
    let i = 0;
    while (i < node.children.length) {
      if (context.control.stopped || context.control.skip) return;
      if (context.control.goto) {
        const target = node.children.findIndex((c) => c.type === 'landing' && c.tag === context.control.goto);
        if (target === -1) return;
        context.control.goto = null;
        i = target + 1;
        continue;
      }
      await runNode(node.children[i], context);
      i++;
    }
  }
});

registerNodeType('if', {
  structural: true,
  category: 'structural',
  label: 'GLYPH.NODES.if.label',
  hint: 'GLYPH.NODES.if.hint',
  fields: [{ name: 'condition', widget: 'expression', label: 'GLYPH.NODES.if.FIELDS.condition.label', hint: 'GLYPH.NODES.if.FIELDS.condition.hint' }],
  slots: [
    { name: 'then', label: 'GLYPH.NODES.if.SLOTS.then' },
    { name: 'else', label: 'GLYPH.NODES.if.SLOTS.else', optional: true }
  ],
  validate(node) {
    requireNodeArray(node.then, 'if.then');
    if (node.else !== undefined) requireNodeArray(node.else, 'if.else');
  },
  async execute(node, context) {
    const branch = (await evaluateCondition(node.condition, context)) ? node.then : (node.else ?? []);
    await runNode({ type: 'sequence', children: branch }, context);
  }
});

registerNodeType('forEach', {
  structural: true,
  category: 'structural',
  label: 'GLYPH.NODES.forEach.label',
  hint: 'GLYPH.NODES.forEach.hint',
  fields: [
    { name: 'collection', widget: 'resolverSelect', label: 'GLYPH.NODES.forEach.FIELDS.collection.label', required: true },
    { name: 'randomize', widget: 'boolean', label: 'GLYPH.NODES.forEach.FIELDS.randomize.label', hint: 'GLYPH.NODES.forEach.FIELDS.randomize.hint' },
    { name: 'filter', widget: 'expression', label: 'GLYPH.NODES.forEach.FIELDS.filter.label', hint: 'GLYPH.NODES.forEach.FIELDS.filter.hint' },
    { name: 'limit', widget: 'number', min: 0, label: 'GLYPH.NODES.forEach.FIELDS.limit.label', hint: 'GLYPH.NODES.forEach.FIELDS.limit.hint' },
    {
      name: 'pick',
      widget: 'select',
      label: 'GLYPH.NODES.forEach.FIELDS.pick.label',
      hint: 'GLYPH.NODES.forEach.FIELDS.pick.hint',
      choices: {
        all: 'GLYPH.PICK_MODE.all',
        first: 'GLYPH.PICK_MODE.first',
        last: 'GLYPH.PICK_MODE.last',
        random: 'GLYPH.PICK_MODE.random',
        min: 'GLYPH.PICK_MODE.min',
        max: 'GLYPH.PICK_MODE.max',
        minName: 'GLYPH.PICK_MODE.minName',
        maxName: 'GLYPH.PICK_MODE.maxName',
        index: 'GLYPH.PICK_MODE.index'
      }
    },
    { name: 'pickPath', widget: 'text', label: 'GLYPH.NODES.forEach.FIELDS.pickPath.label', hint: 'GLYPH.NODES.forEach.FIELDS.pickPath.hint' },
    { name: 'pickIndex', widget: 'number', min: 0, label: 'GLYPH.NODES.forEach.FIELDS.pickIndex.label', hint: 'GLYPH.NODES.forEach.FIELDS.pickIndex.hint' }
  ],
  slots: [{ name: 'body', label: 'GLYPH.NODES.forEach.SLOTS.body' }],
  validate(node) {
    if (typeof node.collection !== 'string' || !node.collection) throw new Error('forEach.collection must be a non-empty string.');
    requireNodeArray(node.body, 'forEach.body');
  },
  async execute(node, context) {
    let items = resolveCollection(node.collection, context);
    if (node.randomize) items = shuffle([...items]);
    if (node.filter) {
      const kept = await Promise.all(items.map((item) => evaluateCondition(node.filter, { ...context, item })));
      items = items.filter((_item, i) => kept[i]);
    }
    if (node.pick && node.pick !== 'all') items = pickOne(items, node.pick, node.pickPath, node.pickIndex);
    else if (node.limit > 0) items = items.slice(0, node.limit);
    const sliced = items.slice(0, MAX_ITERATIONS);
    const bodyType = node.body.length === 1 ? getNodeType(node.body[0].type) : null;
    if (bodyType?.batchExecute && sliced.length && !context.control.stopped && !context.control.goto) {
      await bodyType.batchExecute(sliced.map((item) => ({ node: node.body[0], context: { ...context, item } })));
    } else {
      for (const item of sliced) {
        if (context.control.stopped || context.control.goto) return;
        await runNode({ type: 'sequence', children: node.body }, { ...context, item });
        context.control.skip = false;
      }
    }
    if (items.length > MAX_ITERATIONS) ATLAS.log(2, `forEach over "${node.collection}" truncated at ${MAX_ITERATIONS} of ${items.length} items.`);
  }
});

registerNodeType('goto', {
  category: 'structural',
  label: 'GLYPH.NODES.goto.label',
  hint: 'GLYPH.NODES.goto.hint',
  fields: [
    { name: 'tag', widget: 'tagRef', label: 'GLYPH.NODES.goto.FIELDS.tag.label', required: true },
    { name: 'limit', widget: 'number', min: 0, label: 'GLYPH.NODES.goto.FIELDS.limit.label', hint: 'GLYPH.NODES.goto.FIELDS.limit.hint' }
  ],
  validate(node) {
    if (typeof node.tag !== 'string' || !node.tag) throw new Error('goto.tag must be a non-empty string.');
  },
  async execute(node, context) {
    const behavior = context.info.behavior;
    if (node.limit > 0 && behavior) {
      const key = `gotoCount.${node.tag}`;
      const count = (behavior.getFlag(MODULE.ID, key) ?? 0) + 1;
      if (count > node.limit) return;
      await behavior.setFlag(MODULE.ID, key, count);
    }
    context.control.goto = node.tag;
  }
});

registerNodeType('landing', {
  category: 'structural',
  label: 'GLYPH.NODES.landing.label',
  hint: 'GLYPH.NODES.landing.hint',
  fields: [
    { name: 'tag', widget: 'text', label: 'GLYPH.NODES.landing.FIELDS.tag.label', required: true },
    { name: 'stop', widget: 'boolean', label: 'GLYPH.NODES.landing.FIELDS.stop.label', hint: 'GLYPH.NODES.landing.FIELDS.stop.hint' }
  ],
  validate(node) {
    if (typeof node.tag !== 'string' || !node.tag) throw new Error('landing.tag must be a non-empty string.');
  },
  async execute(node, context) {
    if (node.stop) context.control.stopped = true;
  }
});

registerNodeType('call', {
  category: 'structural',
  label: 'GLYPH.NODES.call.label',
  hint: 'GLYPH.NODES.call.hint',
  fields: [{ name: 'handler', widget: 'handlerRef', label: 'GLYPH.NODES.call.FIELDS.handler.label', required: true }],
  validate(node) {
    if (typeof node.handler !== 'string' || !node.handler) throw new Error('call.handler must be a non-empty string.');
  },
  async execute(node, context) {
    const target = context.info.behavior?.system?.handlers?.[node.handler];
    if (!target) return;
    await runNode(target, { ...context, control: { stopped: false, skip: false, goto: null, pause: false } });
  }
});

/**
 * Resolve after `ms` milliseconds.
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @type {RegExp} A `low-high` range, matched on a formula entry after the comma split. */
const WAIT_RANGE = /^(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)$/;

/**
 * Resolve a wait node's delay: a plain `seconds` number, or one entry of a comma-separated `formula`.
 * @param {object} node The wait node.
 * @returns {Promise<number>} The resolved delay, in seconds.
 */
async function resolveWaitSeconds(node) {
  if (!node.formula) return node.seconds ?? 0;
  const options = node.formula
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const picked = options.length > 1 ? options[Math.floor(Math.random() * options.length)] : options[0];
  if (!picked) return node.seconds ?? 0;
  if (/^-?\d+(\.\d+)?$/.test(picked)) return Number(picked);
  const range = picked.match(WAIT_RANGE);
  if (range) {
    const [low, high] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
    return Math.random() * (high - low) + low;
  }
  const roll = await new Roll(picked).evaluate();
  return roll.total;
}

registerNodeType('wait', {
  category: 'flow',
  label: 'GLYPH.NODES.wait.label',
  hint: 'GLYPH.NODES.wait.hint',
  fields: [
    { name: 'seconds', widget: 'number', min: 0, step: 0.1, label: 'GLYPH.NODES.wait.FIELDS.seconds.label' },
    { name: 'formula', widget: 'text', label: 'GLYPH.NODES.wait.FIELDS.formula.label', hint: 'GLYPH.NODES.wait.FIELDS.formula.hint' }
  ],
  validate(node) {
    if (!node.formula && (typeof node.seconds !== 'number' || node.seconds < 0)) throw new Error('wait.seconds must be a non-negative number, unless .formula is set.');
  },
  async execute(node) {
    await sleep((await resolveWaitSeconds(node)) * 1000);
  }
});

registerNodeType('nextItem', {
  category: 'flow',
  label: 'GLYPH.NODES.nextItem.label',
  hint: 'GLYPH.NODES.nextItem.hint',
  execute(_node, context) {
    context.control.skip = true;
  }
});

registerNodeType('stopActions', {
  category: 'flow',
  label: 'GLYPH.NODES.stopActions.label',
  hint: 'GLYPH.NODES.stopActions.hint',
  fields: [{ name: 'behavior', widget: 'reference', label: 'GLYPH.NODES.stopActions.FIELDS.behavior.label', hint: 'GLYPH.NODES.stopActions.FIELDS.behavior.hint' }],
  async execute(node, context) {
    if (!('behavior' in node)) {
      context.control.stopped = true;
      return;
    }
    const target = resolveReference(node.behavior, context);
    const run = target instanceof RegionBehavior ? activeRuns.get(target.uuid) : null;
    if (run) run.control.stopped = true;
  }
});
