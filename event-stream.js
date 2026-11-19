"use strict";

const MAX_STREAMS = 25;
const HEARTBEAT_MS = 20000;
const REPLAY_LIMIT = 50;

function registerOrderEventStream({ app, pool, adminOnly }) {
  let activeStreams = 0;

  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_event_outbox (
        id BIGSERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('order.created','order.status_changed','payment.status_changed')),
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS order_event_outbox_created_idx
        ON order_event_outbox(created_at DESC);
      CREATE INDEX IF NOT EXISTS order_event_outbox_order_idx
        ON order_event_outbox(order_id,id DESC);
      CREATE OR REPLACE FUNCTION foodora_capture_order_event() RETURNS trigger AS $$
      DECLARE event_id BIGINT;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO order_event_outbox(order_id,event_type,payload)
            VALUES(NEW.id,'order.created',jsonb_build_object(
              'orderId',NEW.id,'status',NEW.status,'paymentStatus',NEW.payment_status
            )) RETURNING id INTO event_id;
          PERFORM pg_notify('foodora_order_events',event_id::text);
          RETURN NEW;
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          INSERT INTO order_event_outbox(order_id,event_type,payload)
            VALUES(NEW.id,'order.status_changed',jsonb_build_object(
              'orderId',NEW.id,'status',NEW.status,'paymentStatus',NEW.payment_status
            )) RETURNING id INTO event_id;
          PERFORM pg_notify('foodora_order_events',event_id::text);
        END IF;
        IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
          INSERT INTO order_event_outbox(order_id,event_type,payload)
            VALUES(NEW.id,'payment.status_changed',jsonb_build_object(
              'orderId',NEW.id,'status',NEW.status,'paymentStatus',NEW.payment_status
            )) RETURNING id INTO event_id;
          PERFORM pg_notify('foodora_order_events',event_id::text);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS foodora_orders_event_trigger ON orders;
      CREATE TRIGGER foodora_orders_event_trigger
        AFTER INSERT OR UPDATE OF status,payment_status ON orders
        FOR EACH ROW EXECUTE FUNCTION foodora_capture_order_event();
    `);
  }

  app.get("/api/admin/events/stream", adminOnly, async (req, res) => {
    if (activeStreams >= MAX_STREAMS) {
      return res.status(503).json({ error: "Live event capacity reached. Use dashboard refresh." });
    }
    activeStreams += 1;
    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();

    let client;
    let closed = false;
    let cursor = Number(req.get("last-event-id") || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    let queryChain = Promise.resolve();

    const writeEvent = row => {
      if (closed || Number(row.id) <= cursor) return;
      cursor = Number(row.id);
      res.write("id: " + row.id + "\n");
      res.write("event: " + row.event_type + "\n");
      res.write("data: " + JSON.stringify(row.payload) + "\n\n");
    };

    const drain = async () => {
      if (closed) return;
      const result = await client.query(
        "SELECT id,event_type,payload FROM order_event_outbox WHERE id > $1 ORDER BY id ASC LIMIT 100",
        [cursor]
      );
      for (const row of result.rows) writeEvent(row);
    };

    const scheduleDrain = () => {
      queryChain = queryChain.then(drain).catch(err => {
        if (!closed) {
          console.error("Order event stream query failed:", err.message);
          res.write("event: stream.error\ndata: {\"retry\":true}\n\n");
        }
      });
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      activeStreams = Math.max(0, activeStreams - 1);
      clearInterval(heartbeat);
      if (client) {
        client.removeListener("notification", onNotification);
        client.query("UNLISTEN foodora_order_events").catch(() => {}).finally(() => client.release());
      }
    };
    const onNotification = message => {
      if (message.channel === "foodora_order_events") scheduleDrain();
    };
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": keep-alive\n\n");
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    req.on("close", cleanup);
    res.on("close", cleanup);

    try {
      client = await pool.connect();
      if (closed) return client.release();
      client.on("notification", onNotification);
      await client.query("LISTEN foodora_order_events");
      if (!cursor) {
        const latest = await client.query(
          "SELECT id FROM order_event_outbox ORDER BY id DESC LIMIT $1",
          [REPLAY_LIMIT]
        );
        cursor = latest.rows.length ? Number(latest.rows[latest.rows.length - 1].id) - 1 : 0;
      }
      await drain();
      res.write(": connected\n\n");
    } catch (err) {
      console.error("Order event stream connection failed:", err.message);
      if (!closed) res.end();
      cleanup();
    }
  });

  return { ensureSchema, getActiveStreams: () => activeStreams };
}

module.exports = { registerOrderEventStream };
