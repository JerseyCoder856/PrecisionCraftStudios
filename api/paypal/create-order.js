const crypto = require('node:crypto');
const { normalizeCart, calculateTotals, toMoney } = require('../_lib/catalog');
const { validateCoupon } = require('../_lib/coupons');
const { paypalRequest } = require('../_lib/paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { cart, couponCode, customer } = req.body || {};
    const items = normalizeCart(cart);
    const baseTotals = calculateTotals(items, 0);
    const coupon = validateCoupon(couponCode, baseTotals.subtotal);
    const totals = calculateTotals(items, coupon.discountAmount);

    if (totals.total <= 0) {
      return res.status(400).json({ error: 'Free orders must use the free-order endpoint.' });
    }

    const customId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: customId,
        custom_id: customId,
        description: 'Precision Craft Studios Order',
        amount: {
          currency_code: totals.currencyCode,
          value: toMoney(totals.total),
          breakdown: {
            item_total: { currency_code: totals.currencyCode, value: toMoney(totals.subtotal) },
            discount: { currency_code: totals.currencyCode, value: toMoney(totals.discount) }
          }
        },
        items: items.map((item) => ({
          name: item.name,
          quantity: String(item.qty),
          unit_amount: { currency_code: totals.currencyCode, value: toMoney(item.unitAmount) }
        }))
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING'
      }
    };

    const createOrder = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': requestId },
      body: orderPayload
    });

    if (!createOrder.ok) {
      console.error('create-order paypal error', createOrder.status, createOrder.data);
      return res.status(502).json({ error: 'Unable to create PayPal order.' });
    }

    return res.status(200).json({
      orderId: createOrder.data.id,
      customId,
      totals,
      couponApplied: coupon.valid,
      customerSummary: { email: String(customer?.email || '').trim() }
    });
  } catch (error) {
    console.error('create-order internal error', error);
    return res.status(400).json({ error: error.message || 'Invalid checkout request.' });
  }
};
