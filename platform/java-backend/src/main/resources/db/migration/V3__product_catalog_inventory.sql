CREATE TABLE platform_identity.store_categories (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES platform_identity.stores(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT store_categories_store_slug_unique UNIQUE (store_id, slug),
  CONSTRAINT store_categories_id_store_unique UNIQUE (id, store_id)
);

CREATE TABLE platform_identity.products (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES platform_identity.stores(id),
  category_id UUID,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_id_store_unique UNIQUE (id, store_id),
  CONSTRAINT products_category_store_fk
    FOREIGN KEY (category_id, store_id)
    REFERENCES platform_identity.store_categories(id, store_id)
);

CREATE INDEX products_store_status_created_idx
  ON platform_identity.products(store_id, status, created_at);

CREATE TABLE platform_identity.product_variants (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sku VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL DEFAULT 'Default',
  price_minor BIGINT NOT NULL CHECK (price_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_variants_store_sku_unique UNIQUE (store_id, sku),
  CONSTRAINT product_variants_id_store_unique UNIQUE (id, store_id),
  CONSTRAINT product_variants_product_store_fk
    FOREIGN KEY (product_id, store_id)
    REFERENCES platform_identity.products(id, store_id)
);

CREATE INDEX product_variants_product_active_idx
  ON platform_identity.product_variants(product_id, active);

CREATE TABLE platform_identity.inventory_balances (
  variant_id UUID PRIMARY KEY,
  store_id UUID NOT NULL,
  on_hand BIGINT NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved BIGINT NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_balance_variant_store_fk
    FOREIGN KEY (variant_id, store_id)
    REFERENCES platform_identity.product_variants(id, store_id)
);

CREATE TABLE platform_identity.inventory_movements (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES platform_identity.users(id),
  quantity_delta BIGINT NOT NULL CHECK (quantity_delta <> 0),
  reason VARCHAR(240) NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_movement_variant_store_fk
    FOREIGN KEY (variant_id, store_id)
    REFERENCES platform_identity.product_variants(id, store_id),
  CONSTRAINT inventory_movement_store_idempotency_unique
    UNIQUE (store_id, idempotency_key)
);

CREATE INDEX inventory_movements_variant_created_idx
  ON platform_identity.inventory_movements(variant_id, created_at);
