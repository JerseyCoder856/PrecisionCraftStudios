CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  paypal_order_id TEXT UNIQUE,
  paypal_capture_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('CREATED','APPROVED','COMPLETED','FAILED','CANCELLED','REFUNDED')),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  paypal_order_json TEXT,
  paypal_capture_json TEXT,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paypal_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  paypal_order_id TEXT,
  payload_json TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  processing_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_events_resource_id ON payment_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_paypal_order_id ON payment_events(paypal_order_id);
