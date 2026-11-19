ALTER TABLE platform_identity.users
  DROP CONSTRAINT users_role_check;
ALTER TABLE platform_identity.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER','ADMIN'));

CREATE TABLE platform_identity.order_payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES platform_identity.orders(id),
  customer_id UUID NOT NULL REFERENCES platform_identity.users(id),
  payment_method VARCHAR(12) NOT NULL CHECK (payment_method IN ('bKash','Nagad')),
  transaction_id VARCHAR(80) NOT NULL,
  payment_method_key VARCHAR(12) NOT NULL,
  transaction_id_key VARCHAR(80) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  review_note VARCHAR(300) NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES platform_identity.users(id),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT order_payments_transaction_length
    CHECK (CHAR_LENGTH(transaction_id) BETWEEN 4 AND 80)
);
CREATE UNIQUE INDEX order_payments_method_transaction_unique
  ON platform_identity.order_payments (payment_method_key, transaction_id_key);
CREATE INDEX order_payments_status_submitted_idx
  ON platform_identity.order_payments(status, submitted_at, id);

CREATE TABLE platform_identity.payment_review_events (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES platform_identity.order_payments(id),
  order_id UUID NOT NULL REFERENCES platform_identity.orders(id),
  action VARCHAR(12) NOT NULL CHECK (action IN ('SUBMITTED','APPROVED','REJECTED')),
  actor_user_id UUID REFERENCES platform_identity.users(id),
  actor_role VARCHAR(24) NOT NULL,
  note VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payment_review_events_order_created_idx
  ON platform_identity.payment_review_events(order_id, created_at, id);
