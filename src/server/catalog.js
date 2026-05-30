const CURRENCY = 'USD';

const products = Object.freeze({
  'camden-signature-snapback-blue': Object.freeze({
    id: 'camden-signature-snapback-blue',
    names: ['CAMDEN Signature Snapback'],
    displayName: 'CAMDEN Signature Snapback',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),
  'custom-signature-snapback': Object.freeze({
    id: 'custom-signature-snapback',
    names: ["Custom Signature Snapback's"],
    displayName: "Custom Signature Snapback's",
    unitAmountCents: 2500,
    allowQuantity: true,
    category: 'hats',
    requiresCustomization: true
  }),
  'custom-sticker-pack': Object.freeze({
    id: 'custom-sticker-pack',
    names: ['Custom Sticker Pack'],
    displayName: 'Custom Sticker Pack',
    unitAmountCents: 500,
    allowQuantity: true,
    category: 'stickers',
    requiresCustomization: true
  }),
  'logo-sticker-pack': Object.freeze({
    id: 'logo-sticker-pack',
    names: ['Logo Sticker Pack'],
    displayName: 'Logo Sticker Pack',
    unitAmountCents: 500,
    allowQuantity: true,
    category: 'stickers',
    requiresCustomization: true
  }),
  'puerto-rico-signature-snapback': Object.freeze({
    id: 'puerto-rico-signature-snapback',
    names: ['PUERTO RICO Signature Snapback'],
    displayName: 'PUERTO RICO Signature Snapback',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),
  'camden-signature-snapback-green-brim': Object.freeze({
    id: 'camden-signature-snapback-green-brim',
    names: ['CAMDEN Signature Snapback - Green Brim'],
    displayName: 'CAMDEN Signature Snapback - Green Brim',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),
  'pr-puerto-rico-signature-snapback': Object.freeze({
    id: 'pr-puerto-rico-signature-snapback',
    names: ['PR (Puerto Rico) Signature Snapback'],
    displayName: 'PR (Puerto Rico) Signature Snapback',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),

  'camden-signature-snapback-brick': Object.freeze({
    id: 'camden-signature-snapback-brick',
    names: ['Camden Signature Snapback'],
    displayName: 'Camden Signature Snapback',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),
  'puerto-rico-flag-signature-snapback': Object.freeze({
    id: 'puerto-rico-flag-signature-snapback',
    names: ['Puerto Rico Flag Signature Snapback', 'Puerto Rico Signature Snapback'],
    displayName: 'Puerto Rico Flag Signature Snapback',
    unitAmountCents: 2000,
    allowQuantity: false,
    category: 'hats'
  }),
  'jesus-saves-signature-snapback': Object.freeze({
    id: 'jesus-saves-signature-snapback',
    names: ['Jesus Saves Signature Snapback'],
    displayName: 'Jesus Saves Signature Snapback',
    unitAmountCents: 1000,
    allowQuantity: false,
    category: 'hats'
  })
});

const productAliases = new Map();
for (const product of Object.values(products)) {
  productAliases.set(product.id.toLowerCase(), product);
  for (const name of product.names) productAliases.set(name.toLowerCase(), product);
}

function findProduct(item) {
  const key = String(item.productId || item.sku || item.id || item.name || '').trim().toLowerCase();
  return productAliases.get(key) || null;
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2);
}

function normalizeQuantity(product, qty) {
  const parsed = Number.parseInt(qty, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  if (!product.allowQuantity) return 1;
  return Math.min(parsed, 99);
}

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) {
    const err = new Error('Cart is empty.');
    err.status = 400;
    throw err;
  }

  const itemsByProduct = new Map();
  for (const rawItem of rawCart) {
    const product = findProduct(rawItem || {});
    if (!product) {
      const err = new Error(`Unknown product: ${rawItem?.name || rawItem?.productId || 'item'}`);
      err.status = 400;
      throw err;
    }

    const qty = normalizeQuantity(product, rawItem.qty);
    const customization = rawItem.customization && typeof rawItem.customization === 'object' ? rawItem.customization : null;
    const key = product.allowQuantity && !customization ? product.id : `${product.id}:${itemsByProduct.size}`;
    const existing = itemsByProduct.get(key);
    if (existing && product.allowQuantity) {
      existing.quantity = normalizeQuantity(product, existing.quantity + qty);
      continue;
    }

    itemsByProduct.set(key, {
      productId: product.id,
      name: product.displayName,
      quantity: qty,
      unitAmountCents: product.unitAmountCents,
      totalAmountCents: product.unitAmountCents * qty,
      currency: CURRENCY,
      customization,
      image: typeof rawItem.image === 'string' ? rawItem.image.slice(0, 512) : ''
    });
  }

  const items = [...itemsByProduct.values()];
  const subtotalCents = items.reduce((sum, item) => sum + item.totalAmountCents, 0);
  if (subtotalCents <= 0) {
    const err = new Error('Order total must be greater than zero.');
    err.status = 400;
    throw err;
  }

  return { items, subtotalCents, totalCents: subtotalCents, currency: CURRENCY };
}

module.exports = { CURRENCY, products, findProduct, formatMoney, normalizeCart };
