const PRODUCT_CATALOG = {
  'Custom Sticker Pack': { unitAmount: 14.99, allowQuantity: true, minQty: 1, maxQty: 100 },
  'Logo Sticker Pack': { unitAmount: 12.99, allowQuantity: true, minQty: 1, maxQty: 100 },
  "Custom Signature Snapback's": { unitAmount: 35.0, allowQuantity: true, minQty: 1, maxQty: 50 }
};

const ALLOWED_CURRENCY = 'USD';

function toMoney(value) {
  return Number(value).toFixed(2);
}

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) {
    throw new Error('Cart is empty.');
  }

  return rawCart.map((rawItem) => {
    const name = String(rawItem?.name || '').trim();
    const catalogItem = PRODUCT_CATALOG[name];
    if (!catalogItem) {
      throw new Error(`Unsupported product: ${name || 'unknown'}`);
    }

    const parsedQty = Number.parseInt(rawItem.qty, 10);
    const qty = Number.isInteger(parsedQty) ? parsedQty : catalogItem.minQty;

    if (qty < catalogItem.minQty || qty > catalogItem.maxQty) {
      throw new Error(`Invalid quantity for ${name}.`);
    }

    return {
      name,
      qty,
      unitAmount: catalogItem.unitAmount,
      lineAmount: Number((catalogItem.unitAmount * qty).toFixed(2))
    };
  });
}

function calculateTotals(items, discountAmount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.lineAmount, 0);
  const discount = Math.max(0, Math.min(Number(discountAmount || 0), subtotal));
  const total = Number((subtotal - discount).toFixed(2));

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total,
    currencyCode: ALLOWED_CURRENCY
  };
}

module.exports = {
  PRODUCT_CATALOG,
  ALLOWED_CURRENCY,
  toMoney,
  normalizeCart,
  calculateTotals
};
