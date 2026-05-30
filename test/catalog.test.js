const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCart, formatMoney } = require('../src/server/catalog');

test('normalizeCart uses server catalog prices instead of client prices', () => {
  const cart = normalizeCart([{ productId: 'custom-sticker-pack', name: 'Custom Sticker Pack', price: 0.01, qty: 3 }]);
  assert.equal(cart.totalCents, 1500);
  assert.equal(formatMoney(cart.totalCents), '15.00');
});

test('normalizeCart forces one-of-a-kind items to quantity one', () => {
  const cart = normalizeCart([{ productId: 'jesus-saves-signature-snapback', qty: 99 }]);
  assert.equal(cart.items[0].quantity, 1);
  assert.equal(cart.totalCents, 1000);
});

test('normalizeCart rejects unknown products', () => {
  assert.throws(() => normalizeCart([{ productId: 'unknown-product', qty: 1 }]), /Unknown product/);
});
