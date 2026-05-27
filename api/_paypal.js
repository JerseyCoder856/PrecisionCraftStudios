const PAYPAL_BASE_URL = 'https://api-m.paypal.com';

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getAccessToken() {
  const clientId = getRequiredEnv('PAYPAL_CLIENT_ID');
  const clientSecret = getRequiredEnv('PAYPAL_CLIENT_SECRET');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error_description || data?.error || 'Failed to authenticate with PayPal.';
    throw new Error(message);
  }

  return data.access_token;
}

async function paypalRequest(path, { method = 'GET', accessToken, body } = {}) {
  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const issue = data?.details?.[0]?.issue;
    const description = data?.details?.[0]?.description;
    const message = description || data?.message || issue || 'PayPal API request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

module.exports = {
  PAYPAL_BASE_URL,
  getRequiredEnv,
  getAccessToken,
  paypalRequest
};
