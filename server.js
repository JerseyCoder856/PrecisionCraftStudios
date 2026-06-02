const http = require('http');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./src/server/config');
const { getDb } = require('./src/server/db');
const { handleCreateOrder, handleCaptureOrder, handleWebhook, findOrderByPublicId, serializeOrder } = require('./src/server/orders');

const config = getConfig();
const rootDir = __dirname;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml'
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function adapt(req, res, params = {}) {
  req.params = params;
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { sendJson(res, this.statusCode, payload); },
    send(payload) { res.writeHead(this.statusCode); res.end(payload); }
  };
}

function handleError(err, res) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err); else console.warn(err.message);
  const paypalPayload = err.paypal && typeof err.paypal === 'object' ? err.paypal : {};
  sendJson(res, status, { ...paypalPayload, error: err.message || paypalPayload.message || 'Internal server error' });
}

async function routeApi(req, res, url) {
  req.body = await parseBody(req);
  const next = err => { if (err) handleError(err, res); };

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, {
      paypalClientId: config.paypal.clientId,
      paypalEnvironment: config.paypal.environment,
      currency: 'USD',
      paypalEnabledFunding: config.paypal.enabledFunding,
      paypalDisabledFunding: config.paypal.disabledFunding,
      paypalBuyerCountry: config.paypal.buyerCountry,
      freeOrderCouponEnabled: false
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    return handleCreateOrder(req, adapt(req, res), next, config);
  }
  const captureMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/capture$/);
  if (req.method === 'POST' && captureMatch) {
    return handleCaptureOrder(req, adapt(req, res, { paypalOrderId: decodeURIComponent(captureMatch[1]) }), next, config);
  }
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'GET' && orderMatch) {
    const order = await findOrderByPublicId(decodeURIComponent(orderMatch[1]));
    if (!order) return sendJson(res, 404, { error: 'Order not found.' });
    return sendJson(res, 200, { order: serializeOrder(order) });
  }
  if (req.method === 'POST' && url.pathname === '/api/paypal/webhook') {
    return handleWebhook(req, adapt(req, res), next, config);
  }
  sendJson(res, 404, { error: 'Not found.' });
}

function serveStatic(res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(rootDir, safePath === '/' ? 'index.html' : safePath.slice(1));
  if (!path.extname(filePath)) filePath += '.html';
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(rootDir, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, config.publicBaseUrl);
  try {
    if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed.' });
    serveStatic(res, url.pathname);
  } catch (err) { handleError(err, res); }
});

if (require.main === module) {
  try {
    getDb();
    server.listen(config.port, () => console.log(`Precision Craft Studios listening on ${config.publicBaseUrl}`));
  } catch (err) {
    console.error('Unable to initialize database', err);
    process.exit(1);
  }
}

module.exports = server;
