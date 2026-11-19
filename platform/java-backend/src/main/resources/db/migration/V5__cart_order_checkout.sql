CREATE TABLE platform_identity.carts (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES platform_identity.users(id),
  store_id UUID NOT NULL REFERENCES platform_identity.stores(id),
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CHECKED_OUT','ABANDONED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX carts_customer_store_status_idx
  ON platform_identity.carts(customer_id, store_id, status, created_at);

CREATE TABLE platform_identity.cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES platform_identity.carts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES platform_identity.product_variants(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cart_items_cart_variant_unique UNIQUE(cart_id, variant_id)
);
CREATE INDEX cart_items_cart_idx ON platform_identity.cart_items(cart_id);

CREATE TABLE platform_identity.orders (
  id UUID PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES platform_identity.users(id),
  store_id UUID NOT NULL REFERENCES platform_identity.stores(id),
  cart_id UUID NOT NULL UNIQUE REFERENCES platform_identity.carts(id),
  status VARCHAR(24) NOT NULL DEFAULT 'AWAITING_PAYMENT'
    CHECK (status IN ('AWAITING_PAYMENT','PAYMENT_REVIEW','CONFIRMED','CANCELLED','FULFILLED')),
  currency CHAR(3) NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor > 0),
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  recipient_name VARCHAR(80) NOT NULL,
  recipient_phone VARCHAR(11) NOT NULL,
  delivery_address VARCHAR(500) NOT NULL,
  customer_note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (total_minor = subtotal_minor + delivery_fee_minor),
  CHECK (CHAR_LENGTH(recipient_phone) = 11 AND recipient_phone LIKE '01%')
);
CREATE INDEX orders_customer_created_idx ON platform_identity.orders(customer_id, created_at);
CREATE INDEX orders_store_status_created_idx ON platform_identity.orders(store_id, status, created_at);

CREATE TABLE platform_identity.order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES platform_identity.orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES platform_identity.product_variants(id),
  product_name_snapshot VARCHAR(160) NOT NULL,
  variant_label_snapshot VARCHAR(120) NOT NULL,
  sku_snapshot VARCHAR(64) NOT NULL,
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor = unit_price_minor * quantity)
);
CREATE INDEX order_items_order_idx ON platform_identity.order_items(order_id);

CREATE TABLE platform_identity.checkout_idempotency (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES platform_identity.users(id),
  idempotency_key UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES platform_identity.orders(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT checkout_customer_key_unique UNIQUE(customer_id, idempotency_key)
);
