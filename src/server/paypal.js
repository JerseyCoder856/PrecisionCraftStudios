const { assertPayPalConfigured } = require('./config');

let cachedToken = null;

async function getAccessToken(config) {
  assertPayPalConfigured(config);
  const now = Date.now();
  if (cachedToken && cachedToken.environment === config.paypal.environment && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const response = await fetch(`${config.paypal.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`PayPal OAuth failed (${response.status}): ${body.error_description || body.error || 'Unknown error'}`);
  }

  cachedToken = {
    value: body.access_token,
    environment: config.paypal.environment,
    expiresAt: now + Number(body.expires_in || 0) * 1000
  };
  return cachedToken.value;
}

async function paypalFetch(config, path, options = {}) {
  const token = await getAccessToken(config);
  const response = await fetch(`${config.paypal.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.name || response.statusText || 'PayPal API error';
    const err = new Error(`PayPal API request failed (${response.status}): ${message}`);
    err.status = response.status;
    err.paypal = body;
    throw err;
  }
  return body;
}

function buildOrderPayload({ order, items, publicBaseUrl }) {
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: order.publicId,
      description: 'Precision Craft Studios order',
      custom_id: order.publicId,
      invoice_id: order.publicId,
      amount: {
        currency_code: order.currency,
        value: order.total,
        breakdown: {
          item_total: {
            currency_code: order.currency,
            value: order.subtotal
          }
        }
      },
      items: items.map(item => ({
        name: item.name.slice(0, 127),
        sku: item.productId,
        unit_amount: {
          currency_code: item.currency,
          value: item.unitAmount
        },
        quantity: String(item.quantity),
        category: 'PHYSICAL_GOODS'
      }))
    }],
    application_context: {
      brand_name: 'Precision Craft Studios',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      shipping_preference: 'GET_FROM_FILE',
      return_url: `${publicBaseUrl}/success.html`,
      cancel_url: `${publicBaseUrl}/checkout.html?payment=cancelled`
    }
  };
}

async function createPayPalOrder(config, payload, requestId) {
  return paypalFetch(config, '/v2/checkout/orders', {
    method: 'POST',
    headers: requestId ? { 'PayPal-Request-Id': requestId } : {},
    body: JSON.stringify(payload)
  });
}

async function capturePayPalOrder(config, paypalOrderId, requestId) {
  return paypalFetch(config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: requestId ? { 'PayPal-Request-Id': requestId } : {},
    body: JSON.stringify({})
  });
}

async function verifyWebhookSignature(config, { headers, body }) {
  if (!config.paypal.webhookId) {
    const err = new Error('PAYPAL_WEBHOOK_ID is not configured.');
    err.status = 503;
    throw err;
  }

  return paypalFetch(config, '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: config.paypal.webhookId,
      webhook_event: body
    })
  });
}

module.exports = { buildOrderPayload, createPayPalOrder, capturePayPalOrder, verifyWebhookSignature };
