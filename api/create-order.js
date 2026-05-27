const { getAccessToken, paypalRequest } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency = 'USD' } = req.body || {};

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'A valid amount is required to create a PayPal order.' });
    }

    const accessToken = await getAccessToken();

    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      accessToken,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: Number(amount).toFixed(2)
            },
            description: 'Precision Craft Studios Order'
          }
        ]
      }
    });

    return res.status(200).json({ id: order.id, status: order.status });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
};
