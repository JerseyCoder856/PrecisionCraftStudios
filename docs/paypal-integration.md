# PayPal Integration Audit and Setup

## Current implementation status

The storefront now uses a server-side PayPal Checkout integration. The browser loads the PayPal JavaScript SDK only after asking this server for the configured public client ID, creates orders through `/api/orders`, captures approved orders through `/api/orders/:paypalOrderId/capture`, and displays persisted server order details on `success.html`.

The previous implementation created and captured PayPal orders entirely in the browser with a hard-coded client ID and then submitted order details to Formspree. That approach has been replaced because client-created totals can be tampered with and there was no durable payment record, webhook processor, or signature verification.

## Problems discovered

- PayPal SDK URL contained a hard-coded client ID in `checkout.html`.
- Order creation used `actions.order.create()` in the browser, so prices and totals came from localStorage and could be modified by a customer.
- Capture used `actions.order.capture()` in the browser, leaving no server-side verification before fulfillment.
- No backend API existed for order creation, capture, payment verification, or order lookup.
- No database schema existed for orders, transactions, captures, webhook events, or duplicate-event handling.
- No webhook endpoint existed, and PayPal webhook signatures were not verified.
- No idempotency key or unique capture/order constraints existed to prevent duplicate processing.
- The free-order coupon was hard-coded in client JavaScript and effectively unlimited.
- Formspree was used as order intake after payment instead of a source of truth.
- Product IDs were missing from some cart items, making server-side catalog validation difficult.

## Missing components now added

- Node HTTP server with static hosting and API routes.
- SQLite persistence for orders and PayPal webhook events.
- Migration runner and initial payment schema.
- Server-side catalog and cart normalization.
- Server-side PayPal access token, order creation, order capture, and webhook signature verification helpers.
- Checkout frontend that calls server APIs, captures server-created PayPal orders when the backend is available, and explicitly renders the configured PayPal payment buttons when eligible. It also restores the previous static PayPal button behavior as a fallback so buttons still appear if the page is opened without the Node backend.
- Success page that can hydrate from persisted server order details.

## Security posture

- Product prices are validated against the server catalog; client prices are ignored by the backend.
- PayPal client secret stays server-side.
- PayPal captures are verified against status, currency, and exact server-calculated amount before orders are marked `COMPLETED`.
- PayPal webhook events require `SUCCESS` from PayPal's `verify-webhook-signature` endpoint before processing.
- Duplicate webhook events are rejected by a unique `paypal_event_id` constraint and return a safe 200 duplicate response.
- Duplicate orders/captures are constrained by unique PayPal order and capture IDs.
- The legacy client-side free coupon no longer bypasses PayPal payment processing.

## Required environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes | `development` or `production`. |
| `PORT` | Yes | HTTP port for the Node server. |
| `PUBLIC_BASE_URL` | Yes | Public HTTPS URL used for PayPal return/cancel URLs. |
| `DATABASE_PATH` | Yes | SQLite database file path. |
| `PAYPAL_ENVIRONMENT` | Yes | `sandbox` or `live`. |
| `PAYPAL_CLIENT_ID` | Yes | PayPal REST app client ID for the selected environment. |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal REST app secret for the selected environment. |
| `PAYPAL_WEBHOOK_ID` | Yes for webhooks | Webhook ID from the PayPal dashboard. |
| `PAYPAL_ENABLED_FUNDING` | Optional | Comma-separated PayPal payment buttons to request and render when eligible. Defaults to `paypal,paylater,venmo,card`. |
| `PAYPAL_DISABLED_FUNDING` | Optional | Comma-separated funding sources to suppress. Leave blank by default. |
| `PAYPAL_BUYER_COUNTRY` | Optional | Two-letter buyer country passed to the PayPal JavaScript SDK. Defaults to `US`. |
| `REQUEST_SIZE_LIMIT` | Optional | Reserved request body limit configuration. Defaults to `1mb`. |
| `ADMIN_ORDER_EMAIL` | Optional | Operations metadata only. |
| `FORMSPREE_ENDPOINT` | Optional | Legacy metadata only; not used for payment persistence. |

## Database changes

Run:

```bash
npm run migrate
```

This creates:

- `orders`: source of truth for checkout order state, server-calculated totals, customer JSON, cart JSON, PayPal order/capture IDs, raw PayPal payloads, and completion timestamps.
- `payment_events`: idempotent PayPal webhook event ledger.
- `schema_migrations`: migration history.

## Frontend changes

- `checkout.html` now loads PayPal SDK dynamically from `/api/config` with configured funding buttons (`paypal,paylater,venmo,card` by default), buyer country (`US` by default), and the PayPal developer-studio integration source tag. It falls back to the supplied public PayPal client ID if `/api/config` is unavailable.
- PayPal `createOrder` now calls `/api/orders` instead of creating an order in the browser.
- PayPal `onApprove` now calls `/api/orders/:paypalOrderId/capture` instead of browser capture.
- Payment cancellation and errors are surfaced in the checkout UI.
- `success.html` now loads persisted server order details when `?order=PCS-...` is present.
- Cart items now include stable product IDs for server-side validation.

## Backend changes

- `POST /api/orders`: validates customer/cart input, normalizes products against the server catalog, creates a PayPal order, and persists a local order.
- `POST /api/orders/:paypalOrderId/capture`: captures the PayPal order server-side, verifies exact amount/currency/status, and persists completion.
- `POST /api/paypal/webhook`: verifies PayPal webhook signatures and processes approved/completed/failed payment events idempotently.
- `GET /api/orders/:publicId`: returns persisted order confirmation details.
- `GET /api/config`: returns safe public checkout configuration.

## Deployment changes

- Deploy the site as a Node application rather than static-only hosting.
- Run `npm install` and `npm run migrate` during setup/release.
- Configure HTTPS for `PUBLIC_BASE_URL`; PayPal live webhooks should target HTTPS.
- Create two PayPal REST apps or credentials: one sandbox, one live.
- Register a PayPal webhook URL: `https://your-domain.example/api/paypal/webhook`.
- Subscribe at minimum to:
  - `CHECKOUT.ORDER.APPROVED`
  - `PAYMENT.CAPTURE.COMPLETED`
  - `PAYMENT.CAPTURE.DENIED`
  - `PAYMENT.CAPTURE.DECLINED`
- Set `PAYPAL_WEBHOOK_ID` to the webhook ID from the dashboard for the active environment.

## Recommended final architecture

1. Browser stores draft cart/customization locally.
2. Checkout form submits customer details and cart to `POST /api/orders`.
3. Backend validates every item against `src/server/catalog.js`, calculates totals, persists a local order, and creates a PayPal order through Orders API v2.
4. Browser opens the PayPal approval flow for the server-created order ID.
5. Browser calls server capture endpoint after approval.
6. Backend captures through PayPal, verifies status/currency/amount, and marks the local order `COMPLETED`.
7. PayPal webhooks update order status asynchronously and provide a retry-safe event ledger.
8. Fulfillment reads only `COMPLETED` orders from the database.

## Manual setup steps

1. `cp .env.example .env`.
2. Fill in PayPal sandbox credentials.
3. Run `npm install`.
4. Run `npm run migrate`.
5. Start locally with `npm run dev`.
6. Use a tunnel such as ngrok for local webhook testing and register the tunneled `/api/paypal/webhook` URL in the PayPal dashboard.
7. Complete a sandbox checkout using a PayPal sandbox buyer account.
8. Switch `PAYPAL_ENVIRONMENT`, credentials, webhook ID, and `PUBLIC_BASE_URL` for production.

## Testing checklist

- Empty cart cannot create a PayPal order.
- Missing email/address/name blocks checkout before PayPal opens.
- Client-side price tampering still results in server catalog prices.
- One-of-a-kind products are forced to quantity 1 server-side.
- Custom sticker and snapback products allow quantities.
- PayPal sandbox order can be created.
- Approved PayPal sandbox order can be captured.
- Captured amount/currency mismatch fails the order.
- Refreshing after a completed capture does not duplicate the capture.
- Duplicate webhook event returns success without reprocessing.
- Invalid webhook signature returns HTTP 400.
- Success page displays server order details from `?order=`.

## Production readiness checklist

- Live PayPal REST credentials configured.
- Live PayPal webhook ID configured.
- `PUBLIC_BASE_URL` is HTTPS and matches the deployed domain.
- Database file is on persistent storage and backed up.
- Logs are collected by the hosting platform.
- Fulfillment process only ships orders with `status = 'COMPLETED'` from the backend database; the static fallback is for keeping legacy PayPal buttons visible and should not be treated as the production source of truth.
- PayPal dashboard webhook delivery logs have no recurring failures.
- The product catalog in `src/server/catalog.js` is updated whenever storefront products/prices change.

## PayPal documentation reviewed

- PayPal Standard Checkout overview: https://developer.paypal.com/studio/checkout/standard
- PayPal Orders API v2 create/capture pattern: https://developer.paypal.com/docs/multiparty/checkout/standard/integrate/
- PayPal REST authentication: https://developer.paypal.com/api/rest/authentication
- PayPal webhooks overview and retry behavior: https://developer.paypal.com/api/rest/webhooks/
- PayPal webhook signature verification API: https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
- PayPal standalone payment buttons and funding source customization: https://developer.paypal.com/docs/checkout/standard/customize/standalone-buttons/
