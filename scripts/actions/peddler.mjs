import { sendToAudience } from '../audience.mjs';
import { isModuleActive } from '../capability.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../render-intent.mjs';
import { resolveReference } from '../targeting.mjs';
import { AUDIENCE_FIELD } from './messaging.mjs';

registerRenderIntent('openPeddlerShop', ({ shopUuid }) => Peddler.openShop({ shopUuid, userId: game.user.id }));

/** Peddler */
export function registerPeddlerActions() {
  if (!isModuleActive('peddler')) return;
  registerNodeType('openPeddlerShop', {
    category: 'messaging',
    label: 'GLYPH.ACTIONS.openPeddlerShop.label',
    hint: 'GLYPH.ACTIONS.openPeddlerShop.hint',
    fields: [{ name: 'shop', widget: 'reference', label: 'GLYPH.ACTIONS.openPeddlerShop.FIELDS.shop.label', required: true }, AUDIENCE_FIELD],
    validate(node) {
      if (typeof node.shop !== 'object') throw new Error('openPeddlerShop.shop must be a reference object.');
    },
    async execute(node, context) {
      const shop = resolveReference(node.shop, context);
      if (!shop) return;
      await sendToAudience(node.audience, context, 'openPeddlerShop', { shopUuid: shop.uuid });
    }
  });

  registerNodeType('peddlerRestock', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.peddlerRestock.label',
    hint: 'GLYPH.ACTIONS.peddlerRestock.hint',
    fields: [{ name: 'shop', widget: 'reference', label: 'GLYPH.ACTIONS.peddlerRestock.FIELDS.shop.label', required: true }],
    validate(node) {
      if (typeof node.shop !== 'object') throw new Error('peddlerRestock.shop must be a reference object.');
    },
    async execute(node, context) {
      const shop = resolveReference(node.shop, context);
      if (shop) await Peddler.runRestock(shop);
    }
  });

  registerNodeType('peddlerSetPriceModifier', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.peddlerSetPriceModifier.label',
    hint: 'GLYPH.ACTIONS.peddlerSetPriceModifier.hint',
    fields: [
      { name: 'shop', widget: 'reference', label: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.shop.label', required: true },
      { name: 'buyer', widget: 'reference', label: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.buyer.label', required: true },
      { name: 'buy', widget: 'number', label: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.buy.label', hint: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.buy.hint' },
      { name: 'sell', widget: 'number', label: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.sell.label', hint: 'GLYPH.ACTIONS.peddlerSetPriceModifier.FIELDS.sell.hint' }
    ],
    validate(node) {
      if (typeof node.shop !== 'object') throw new Error('peddlerSetPriceModifier.shop must be a reference object.');
      if (typeof node.buyer !== 'object') throw new Error('peddlerSetPriceModifier.buyer must be a reference object.');
    },
    async execute(node, context) {
      const shop = resolveReference(node.shop, context);
      const buyer = resolveReference(node.buyer, context);
      if (shop && buyer) await Peddler.setActorModifier(shop, buyer, { buy: node.buy || 1, sell: node.sell || 1 });
    }
  });

  registerNodeType('peddlerSetTrust', {
    category: 'scene',
    label: 'GLYPH.ACTIONS.peddlerSetTrust.label',
    hint: 'GLYPH.ACTIONS.peddlerSetTrust.hint',
    fields: [
      { name: 'shop', widget: 'reference', label: 'GLYPH.ACTIONS.peddlerSetTrust.FIELDS.shop.label', required: true },
      { name: 'value', widget: 'number', label: 'GLYPH.ACTIONS.peddlerSetTrust.FIELDS.value.label', required: true }
    ],
    validate(node) {
      if (typeof node.shop !== 'object') throw new Error('peddlerSetTrust.shop must be a reference object.');
      if (typeof node.value !== 'number') throw new Error('peddlerSetTrust.value must be a number.');
    },
    async execute(node, context) {
      const shop = resolveReference(node.shop, context);
      if (shop) await Peddler.setTrust(shop, node.value);
    }
  });
}
