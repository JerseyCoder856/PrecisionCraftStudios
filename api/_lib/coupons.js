const crypto = require('node:crypto');

function getCouponRules() {
  const code = process.env.CHECKOUT_COUPON_CODE;
  if (!code) return null;

  return {
    code: code.trim().toUpperCase(),
    type: 'percent',
    value: 100,
    maxUsesPerOrder: 1
  };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateCoupon(rawCoupon, subtotal) {
  const rules = getCouponRules();
  if (!rawCoupon || !rules) return { valid: false, discountAmount: 0 };

  const normalized = String(rawCoupon).trim().toUpperCase();
  if (!safeEqual(normalized, rules.code)) {
    return { valid: false, discountAmount: 0 };
  }

  const discountAmount = Number((subtotal * (rules.value / 100)).toFixed(2));
  return { valid: true, discountAmount, appliedCode: normalized };
}

module.exports = { validateCoupon };
