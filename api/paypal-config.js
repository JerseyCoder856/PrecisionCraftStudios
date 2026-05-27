const { getRequiredEnv } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientId = getRequiredEnv('PAYPAL_CLIENT_ID');
    return res.status(200).json({
      clientId,
      currency: 'USD',
      intent: 'CAPTURE'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
