const crypto = require('node:crypto');
const { normalizeCart, calculateTotals, toMoney } = require('../_lib/catalog');
const { validateCoupon } = require('../_lib/coupons');
const { paypalRequest } = require('../_lib/paypal');

const seenCaptureIds = new Set();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, cart, couponCode } = req.body || {};
    if (!orderId || typeof orderId !== 'string') return res.status(400).json({ error: 'Missing PayPal order id.' });

    const items = normalizeCart(cart);
    const baseTotals = calculateTotals(items, 0);
    const coupon = validateCoupon(couponCode, baseTotals.subtotal);
    const totals = calculateTotals(items, coupon.discountAmount);

    if (totals.total <= 0) return res.status(400).json({ error: 'Use free-order flow when total is zero.' });

    const captureRequestId = crypto.createHash('sha256').update(`capture-${orderId}`).digest('hex');
    const capture = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': captureRequestId }
    });

    if (!capture.ok) {
      console.error('capture-order paypal error', capture.status, capture.data);
      return res.status(502).json({ error: 'Unable to capture payment.' });
    }

    const unit = capture.data?.purchase_units?.[0];
    const captured = unit?.payments?.captures?.[0];
    const status = captured?.status;
    const amountValue = captured?.amount?.value;
    const captureId = captured?.id;

    if (!captureId || seenCaptureIds.has(captureId)) {
      return res.status(409).json({ error: 'Capture already processed.' });
    }

    if (status !== 'COMPLETED' || amountValue !== toMoney(totals.total)) {
      console.error('capture validation failed', { status, amountValue, expected: toMoney(totals.total) });
      return res.status(409).json({ error: 'Captured amount validation failed.' });
    }

    seenCaptureIds.add(captureId);
    return res.status(200).json({
      ok: true,
      captureId,
      orderId,
      totals,
      payer: capture.data?.payer || null,
      paypal: capture.data
    });
  } catch (error) {
    console.error('capture-order internal error', error);
    return res.status(400).json({ error: error.message || 'Invalid capture request.' });
  }
};
