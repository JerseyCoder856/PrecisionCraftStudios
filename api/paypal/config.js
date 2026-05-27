const { getEnv } = require('../_lib/paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ clientId: getEnv('PAYPAL_CLIENT_ID'), currency: 'USD' });
};
