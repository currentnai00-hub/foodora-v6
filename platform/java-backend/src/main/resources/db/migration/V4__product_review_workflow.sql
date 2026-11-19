-- Keep each ADD COLUMN separate for H2 PostgreSQL-mode and PostgreSQL compatibility.
ALTER TABLE platform_identity.products
  ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE platform_identity.products
  ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE platform_identity.products
  ADD COLUMN reviewed_by UUID REFERENCES platform_identity.users(id);
ALTER TABLE platform_identity.products
  ADD COLUMN review_note VARCHAR(500);

CREATE INDEX products_review_queue_idx
  ON platform_identity.products(status, submitted_at, id);

CREATE TABLE platform_identity.product_status_events (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  store_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES platform_identity.users(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL
    CHECK (to_status IN ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED')),
  note VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_status_event_product_store_fk
    FOREIGN KEY (product_id, store_id)
    REFERENCES platform_identity.products(id, store_id) ON DELETE CASCADE
);

CREATE INDEX product_status_events_product_created_idx
  ON platform_identity.product_status_events(product_id, created_at, id);
