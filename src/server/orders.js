const crypto = require('crypto');
const { getDb } = require('./db');
const { formatMoney, normalizeCart } = require('./catalog');
const { buildOrderPayload, createPayPalOrder, capturePayPalOrder, verifyWebhookSignature } = require('./paypal');

function createPublicId() {
  return `PCS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function json(value) { return JSON.stringify(value); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }

function validateCustomer(customer = {}) {
  const normalized = {
    name: String(customer.name || '').trim().slice(0, 160),
    email: String(customer.email || '').trim().slice(0, 254),
    phone: String(customer.phone || '').trim().slice(0, 40),
    address: String(customer.address || '').trim().slice(0, 1000),
    notes: String(customer.notes || '').trim().slice(0, 2000),
    isGift: Boolean(customer.isGift),
    giftMessage: String(customer.giftMessage || '').trim().slice(0, 1000)
  };
  if (!normalized.name) throw Object.assign(new Error('Customer name is required.'), { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(normalized.email)) throw Object.assign(new Error('A valid customer email is required.'), { status: 400 });
  if (normalized.address.length < 5) throw Object.assign(new Error('Shipping address is required.'), { status: 400 });
  return normalized;
}

function parseOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    paypalOrderId: row.paypal_order_id,
    paypalCaptureId: row.paypal_capture_id,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    totalCents: row.total_cents,
    customer: parseJson(row.customer_json, {}),
    items: parseJson(row.items_json, []),
    completedAt: row.completed_at,
    errorMessage: row.error_message
  };
}

function serializeOrder(order) {
  return {
    id: order.publicId,
    paypalOrderId: order.paypalOrderId,
    status: order.status,
    currency: order.currency,
    subtotal: formatMoney(order.subtotalCents),
    total: formatMoney(order.totalCents),
    customer: order.customer,
    items: order.items.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitAmount: formatMoney(item.unitAmountCents),
      totalAmount: formatMoney(item.totalAmountCents),
      currency: item.currency,
      customization: item.customization,
      image: item.image
    })),
    completedAt: order.completedAt,
    errorMessage: order.errorMessage
  };
}

function findOrderByPayPalOrderId(paypalOrderId) {
  const row = getDb().prepare('SELECT * FROM orders WHERE paypal_order_id = ?').get(paypalOrderId);
  return parseOrder(row);
}

function findOrderByPublicId(publicId) {
  const row = getDb().prepare('SELECT * FROM orders WHERE public_id = ?').get(publicId);
  return parseOrder(row);
}

async function handleCreateOrder(req, res, next, config) {
  try {
    const customer = validateCustomer(req.body?.customer);
    const cart = normalizeCart(req.body?.cart);
    const idempotencyKey = String(req.body?.idempotencyKey || crypto.createHash('sha256').update(json({ cart: cart.items, customer })).digest('hex')).slice(0, 128);
    const db = getDb();
    const existing = db.prepare("SELECT * FROM orders WHERE idempotency_key = ? AND status IN ('CREATED','APPROVED')").get(idempotencyKey);
    if (existing) return res.json({ order: serializeOrder(parseOrder(existing)) });

    const publicId = createPublicId();
    const now = new Date().toISOString();
    const paypalPayload = buildOrderPayload({
      order: { publicId, currency: cart.currency, subtotal: formatMoney(cart.subtotalCents), total: formatMoney(cart.totalCents) },
      items: cart.items.map(item => ({ ...item, unitAmount: formatMoney(item.unitAmountCents) })),
      publicBaseUrl: config.publicBaseUrl
    });
    const paypalOrder = await createPayPalOrder(config, paypalPayload, idempotencyKey);

    db.prepare(`
      INSERT INTO orders (public_id, paypal_order_id, status, currency, subtotal_cents, total_cents, customer_json, items_json, paypal_order_json, idempotency_key, created_at, updated_at)
      VALUES (?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(publicId, paypalOrder.id, cart.currency, cart.subtotalCents, cart.totalCents, json(customer), json(cart.items), json(paypalOrder), idempotencyKey, now, now);

    const saved = findOrderByPayPalOrderId(paypalOrder.id);
    console.log('Created PayPal order', { publicId, paypalOrderId: paypalOrder.id, total: formatMoney(cart.totalCents) });
    res.status(201).json({ order: serializeOrder(saved) });
  } catch (err) { next(err); }
}

function extractCapture(captureResponse) {
  const purchaseUnit = captureResponse.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];
  return { purchaseUnit, capture };
}

async function handleCaptureOrder(req, res, next, config) {
  try {
    const paypalOrderId = String(req.params.paypalOrderId || '').trim();
    if (!paypalOrderId) return res.status(400).json({ error: 'Missing PayPal order id.' });
    const db = getDb();
    const order = findOrderByPayPalOrderId(paypalOrderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status === 'COMPLETED') return res.json({ order: serializeOrder(order) });
    if (!['CREATED', 'APPROVED'].includes(order.status)) return res.status(409).json({ error: `Order cannot be captured from status ${order.status}.` });

    const captureResponse = await capturePayPalOrder(config, paypalOrderId, `capture-${order.publicId}`);
    const { capture } = extractCapture(captureResponse);
    const capturedAmount = capture?.amount;
    const capturedCents = capturedAmount ? Math.round(Number(capturedAmount.value) * 100) : 0;
    const isCompleted = captureResponse.status === 'COMPLETED' && capture?.status === 'COMPLETED';
    const amountMatches = capturedAmount?.currency_code === order.currency && capturedCents === order.totalCents;
    const now = new Date().toISOString();

    if (!isCompleted || !amountMatches) {
      db.prepare(`UPDATE orders SET status = 'FAILED', paypal_capture_json = ?, error_message = ?, updated_at = ? WHERE paypal_order_id = ?`)
        .run(json(captureResponse), amountMatches ? 'PayPal capture did not complete.' : 'Captured amount did not match server-calculated total.', now, paypalOrderId);
      return res.status(422).json({ error: 'Payment capture could not be verified.' });
    }

    db.prepare(`
      UPDATE orders SET status = 'COMPLETED', paypal_capture_id = ?, paypal_capture_json = ?, updated_at = ?, completed_at = ?
      WHERE paypal_order_id = ? AND status != 'COMPLETED'
    `).run(capture.id, json(captureResponse), now, now, paypalOrderId);
    const completed = findOrderByPayPalOrderId(paypalOrderId);
    console.log('Captured PayPal order', { publicId: order.publicId, paypalOrderId, captureId: capture.id });
    res.json({ order: serializeOrder(completed) });
  } catch (err) { next(err); }
}

function resourceIds(body) {
  const resource = body?.resource || {};
  return {
    resourceId: resource.id || null,
    paypalOrderId: resource.supplementary_data?.related_ids?.order_id || resource.invoice_id || resource.custom_id || null
  };
}

async function handleWebhook(req, res, next, config) {
  try {
    const event = req.body;
    const eventId = event?.id;
    if (!eventId) return res.status(400).json({ error: 'Webhook event id is required.' });
    const verification = await verifyWebhookSignature(config, { headers: req.headers, body: event });
    if (verification.verification_status !== 'SUCCESS') return res.status(400).json({ error: 'Webhook signature verification failed.' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM payment_events WHERE paypal_event_id = ?').get(eventId);
    if (existing) return res.status(200).json({ received: true, duplicate: true });

    const ids = resourceIds(event);
    let note = '';
    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO payment_events (paypal_event_id, event_type, resource_id, paypal_order_id, payload_json, verification_status, processing_note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, event.event_type || 'UNKNOWN', ids.resourceId, ids.paypalOrderId, json(event), verification.verification_status, 'processing');

      if (event.event_type === 'CHECKOUT.ORDER.APPROVED' && ids.resourceId) {
        const result = db.prepare(`UPDATE orders SET status = 'APPROVED', updated_at = ? WHERE paypal_order_id = ? AND status = 'CREATED'`).run(new Date().toISOString(), ids.resourceId);
        note = `approved rows=${result.changes}`;
      }
      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const resource = event.resource || {};
        const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;
        const result = db.prepare(`
          UPDATE orders SET status = 'COMPLETED', paypal_capture_id = COALESCE(paypal_capture_id, ?), updated_at = ?, completed_at = COALESCE(completed_at, ?)
          WHERE paypal_order_id = ? AND status != 'COMPLETED'
        `).run(resource.id || null, new Date().toISOString(), new Date().toISOString(), paypalOrderId || '');
        note = `capture completed rows=${result.changes}`;
      }
      if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED'].includes(event.event_type)) {
        const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
        const result = db.prepare(`UPDATE orders SET status = 'FAILED', error_message = ?, updated_at = ? WHERE paypal_order_id = ? AND status != 'COMPLETED'`).run(event.event_type, new Date().toISOString(), paypalOrderId || '');
        note = `capture failed rows=${result.changes}`;
      }
      db.prepare(`UPDATE payment_events SET processing_note = ? WHERE paypal_event_id = ?`).run(note, eventId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    console.log('Processed PayPal webhook', { eventId, type: event.event_type, note });
    res.status(200).json({ received: true });
  } catch (err) { next(err); }
}

module.exports = { handleCreateOrder, handleCaptureOrder, handleWebhook, findOrderByPublicId, serializeOrder };
