CREATE TABLE platform_identity.order_status_events (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES platform_identity.orders(id) ON DELETE CASCADE,
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL
    CHECK (to_status IN ('AWAITING_PAYMENT','PAYMENT_REVIEW','CONFIRMED','CANCELLED','FULFILLED')),
  actor_user_id UUID REFERENCES platform_identity.users(id),
  actor_role VARCHAR(24) NOT NULL,
  reason VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX order_status_events_order_created_idx
  ON platform_identity.order_status_events(order_id, created_at, id);

INSERT INTO platform_identity.order_status_events
  (id, order_id, from_status, to_status, actor_user_id, actor_role, reason, created_at)
SELECT gen_random_uuid(), id, NULL, status, customer_id, 'CUSTOMER',
       'Order created at checkout', created_at
FROM platform_identity.orders;
