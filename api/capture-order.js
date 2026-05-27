const { getAccessToken, paypalRequest } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderID } = req.body || {};

    if (!orderID) {
      return res.status(400).json({ error: 'orderID is required.' });
    }

    const accessToken = await getAccessToken();
    const capture = await paypalRequest(`/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      accessToken,
      body: {}
    });

    return res.status(200).json(capture);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
};
