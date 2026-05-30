const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const PAYPAL_ENVIRONMENTS = new Set(['sandbox', 'live']);

function optionalNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listFromEnv(value, fallback = []) {
  const raw = value === undefined || value === null || value === '' ? fallback.join(',') : value;
  return String(raw)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function getConfig() {
  const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
  if (!PAYPAL_ENVIRONMENTS.has(paypalEnvironment)) {
    throw new Error('PAYPAL_ENVIRONMENT must be either sandbox or live.');
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: optionalNumber(process.env.PORT, 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${optionalNumber(process.env.PORT, 3000)}`,
    databasePath: process.env.DATABASE_PATH || './data/precision-craft-studios.sqlite',
    paypal: {
      environment: paypalEnvironment,
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
      enabledFunding: listFromEnv(process.env.PAYPAL_ENABLED_FUNDING, ['paypal', 'paylater', 'venmo', 'card']),
      disabledFunding: listFromEnv(process.env.PAYPAL_DISABLED_FUNDING),
      baseUrl: paypalEnvironment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
    },
    adminOrderEmail: process.env.ADMIN_ORDER_EMAIL || '',
    requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '1mb'
  };
}

function assertPayPalConfigured(config) {
  if (!config.paypal.clientId || !config.paypal.clientSecret) {
    const err = new Error('PayPal credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
    err.status = 503;
    throw err;
  }
}

module.exports = { getConfig, assertPayPalConfigured };
