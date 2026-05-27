const crypto = require('node:crypto');
const { paypalRequest, getEnv } = require('../_lib/paypal');

const processedEventIds = new Set();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const event = req.body;
    const headers = req.headers || {};

    const verificationBody = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: getEnv('PAYPAL_WEBHOOK_ID'),
      webhook_event: event
    };

    const verify = await paypalRequest('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: verificationBody
    });

    if (!verify.ok || verify.data?.verification_status !== 'SUCCESS') {
      console.error('webhook verification failed', verify.status, verify.data);
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    if (processedEventIds.has(event.id)) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    processedEventIds.add(event.id);

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        console.log('Webhook capture completed', {
          eventId: event.id,
          captureId: event.resource?.id,
          amount: event.resource?.amount?.value
        });
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        console.warn('Webhook capture denied', { eventId: event.id, resource: event.resource?.id });
        break;
      case 'CHECKOUT.ORDER.APPROVED':
        console.log('Webhook order approved', { eventId: event.id, orderId: event.resource?.id });
        break;
      default:
        console.log('Webhook event ignored', { eventId: event.id, eventType: event.event_type });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('webhook internal error', error);
    return res.status(400).json({ error: 'Webhook handling failed.' });
  }
};
