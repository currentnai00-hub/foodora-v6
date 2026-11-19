package com.foodora.platform.orders;

import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class OrderService {
    private final JdbcTemplate jdbc;
    public OrderService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public OrderDtos.CartResponse createCart(UUID storeId, Authentication auth) {
        UUID customerId = customer(auth);
        Boolean active = jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM platform_identity.stores WHERE id = ? AND status = 'ACTIVE')
            """, Boolean.class, storeId);
        if (!Boolean.TRUE.equals(active))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Store পাওয়া যায়নি।");
        UUID cartId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.carts(id, customer_id, store_id)
            VALUES (?, ?, ?)
            """, cartId, customerId, storeId);
        return cart(cartId, customerId);
    }

    public OrderDtos.CartResponse getCart(UUID cartId, Authentication auth) {
        return cart(cartId, customer(auth));
    }

    @Transactional
    public OrderDtos.CartResponse addItem(UUID cartId, Authentication auth, OrderDtos.AddItemRequest request) {
        UUID customerId = customer(auth);
        CartRow cart = lockCart(cartId, customerId);
        var rows = jdbc.query("""
            SELECT v.id, v.price_minor, b.on_hand, b.reserved
            FROM platform_identity.product_variants v
            JOIN platform_identity.products p ON p.id = v.product_id AND p.store_id = v.store_id
            JOIN platform_identity.stores s ON s.id = v.store_id
            JOIN platform_identity.inventory_balances b ON b.variant_id = v.id AND b.store_id = v.store_id
            WHERE v.id = ? AND v.store_id = ? AND v.active = TRUE
              AND p.status = 'ACTIVE' AND s.status = 'ACTIVE'
            FOR UPDATE
            """, (rs, n) -> new VariantRow(rs.getLong("price_minor"),
                rs.getLong("on_hand"), rs.getLong("reserved")), request.variantId(), cart.storeId());
        if (rows.isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "এই store-এ অনুমোদিত variant পাওয়া যায়নি।");
        VariantRow stock = rows.getFirst();
        var current = jdbc.query("""
            SELECT id, quantity FROM platform_identity.cart_items
            WHERE cart_id = ? AND variant_id = ? FOR UPDATE
            """, (rs, n) -> new ExistingItem(rs.getObject("id", UUID.class), rs.getInt("quantity")),
            cartId, request.variantId());
        int next = request.quantity() + (current.isEmpty() ? 0 : current.getFirst().quantity());
        if (next > 99 || next > stock.onHand() - stock.reserved())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "পর্যাপ্ত stock নেই অথবা cart quantity সীমা ছাড়িয়েছে।");
        if (current.isEmpty()) {
            jdbc.update("""
                INSERT INTO platform_identity.cart_items(id, cart_id, variant_id, quantity)
                VALUES (?, ?, ?, ?)
                """, UUID.randomUUID(), cartId, request.variantId(), request.quantity());
        } else {
            jdbc.update("""
                UPDATE platform_identity.cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND cart_id = ?
                """, next, current.getFirst().id(), cartId);
        }
        touchCart(cartId);
        return cart(cartId, customerId);
    }

    @Transactional
    public OrderDtos.CartResponse updateItem(UUID cartId, UUID itemId, Authentication auth,
                                              OrderDtos.UpdateItemRequest request) {
        UUID customerId = customer(auth);
        CartRow cart = lockCart(cartId, customerId);
        var rows = jdbc.query("""
            SELECT ci.variant_id, b.on_hand, b.reserved
            FROM platform_identity.cart_items ci
            JOIN platform_identity.inventory_balances b
              ON b.variant_id = ci.variant_id AND b.store_id = ?
            WHERE ci.id = ? AND ci.cart_id = ? FOR UPDATE
            """, (rs, n) -> new VariantStock(rs.getObject("variant_id", UUID.class),
                rs.getLong("on_hand"), rs.getLong("reserved")), cart.storeId(), itemId, cartId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cart item পাওয়া যায়নি।");
        VariantStock stock = rows.getFirst();
        if (request.quantity() > stock.onHand() - stock.reserved())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "পর্যাপ্ত stock নেই।");
        jdbc.update("""
            UPDATE platform_identity.cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND cart_id = ?
            """, request.quantity(), itemId, cartId);
        touchCart(cartId);
        return cart(cartId, customerId);
    }

    @Transactional
    public OrderDtos.CartResponse removeItem(UUID cartId, UUID itemId, Authentication auth) {
        UUID customerId = customer(auth);
        lockCart(cartId, customerId);
        int deleted = jdbc.update("DELETE FROM platform_identity.cart_items WHERE id = ? AND cart_id = ?",
            itemId, cartId);
        if (deleted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cart item পাওয়া যায়নি।");
        touchCart(cartId);
        return cart(cartId, customerId);
    }

    @Transactional
    public OrderDtos.OrderResponse checkout(UUID cartId, UUID idempotencyKey, Authentication auth,
                                             OrderDtos.CheckoutRequest request) {
        UUID customerId = customer(auth);
        if (idempotencyKey == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key UUID header প্রয়োজন।");

        // Serialize this customer's checkout requests so the same key cannot create two orders.
        List<UUID> locked = jdbc.query("""
            SELECT id FROM platform_identity.users WHERE id = ? FOR UPDATE
            """, (rs, n) -> rs.getObject("id", UUID.class), customerId);
        if (locked.isEmpty())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer account পাওয়া যায়নি।");

        var previous = jdbc.query("""
            SELECT order_id FROM platform_identity.checkout_idempotency
            WHERE customer_id = ? AND idempotency_key = ?
            """, (rs, n) -> rs.getObject("order_id", UUID.class), customerId, idempotencyKey);
        if (!previous.isEmpty()) return order(previous.getFirst(), customerId);

        CartRow cart = lockCart(cartId, customerId);
        List<CheckoutLine> lines = jdbc.query("""
            SELECT ci.variant_id, ci.quantity, p.name AS product_name,
                   v.label AS variant_label, v.sku, v.price_minor,
                   b.on_hand, b.reserved
            FROM platform_identity.cart_items ci
            JOIN platform_identity.product_variants v
              ON v.id = ci.variant_id AND v.store_id = ?
            JOIN platform_identity.products p
              ON p.id = v.product_id AND p.store_id = v.store_id
            JOIN platform_identity.inventory_balances b
              ON b.variant_id = v.id AND b.store_id = v.store_id
            WHERE ci.cart_id = ? AND v.active = TRUE AND p.status = 'ACTIVE'
            ORDER BY ci.variant_id
            FOR UPDATE
            """, (rs, n) -> new CheckoutLine(
                rs.getObject("variant_id", UUID.class), rs.getInt("quantity"),
                rs.getString("product_name"), rs.getString("variant_label"), rs.getString("sku"),
                rs.getLong("price_minor"), rs.getLong("on_hand"), rs.getLong("reserved")),
            cart.storeId(), cartId);
        if (lines.isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "খালি cart checkout করা যাবে না।");

        Boolean storeActive = jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM platform_identity.stores WHERE id = ? AND status = 'ACTIVE')
            """, Boolean.class, cart.storeId());
        if (!Boolean.TRUE.equals(storeActive))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Store বর্তমানে order নিচ্ছে না।");

        long subtotal = 0;
        for (CheckoutLine line : lines) {
            if (line.quantity() > line.onHand() - line.reserved())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "এক বা একাধিক পণ্যের stock শেষ বা অপর্যাপ্ত।");
            try {
                subtotal = Math.addExact(subtotal, Math.multiplyExact(line.priceMinor(), (long) line.quantity()));
            } catch (ArithmeticException ex) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Order total সীমা অতিক্রম করেছে।");
            }
        }
        if (subtotal <= 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Order total অবৈধ।");

        UUID orderId = UUID.randomUUID();
        String orderNumber = "FD" + UUID.randomUUID().toString().replace("-", "").substring(0, 14).toUpperCase(Locale.ROOT);
        long deliveryFee = 0; // Explicitly zero until a server-side delivery pricing policy is introduced.
        long total = Math.addExact(subtotal, deliveryFee);
        jdbc.update("""
            INSERT INTO platform_identity.orders
              (id, order_number, customer_id, store_id, cart_id, status, currency,
               subtotal_minor, delivery_fee_minor, total_minor, recipient_name,
               recipient_phone, delivery_address, customer_note)
            VALUES (?, ?, ?, ?, ?, 'AWAITING_PAYMENT', 'BDT', ?, ?, ?, ?, ?, ?, ?)
            """, orderId, orderNumber, customerId, cart.storeId(), cartId, subtotal, deliveryFee,
            total, request.recipientName().trim(), request.recipientPhone(),
            request.deliveryAddress().trim(), request.customerNote() == null ? "" : request.customerNote().trim());

        jdbc.update("""
            INSERT INTO platform_identity.order_status_events
              (id, order_id, from_status, to_status, actor_user_id, actor_role, reason)
            VALUES (?, ?, NULL, 'AWAITING_PAYMENT', ?, 'CUSTOMER', 'Order created at checkout')
            """, UUID.randomUUID(), orderId, customerId);

        for (CheckoutLine line : lines) {
            int reserved = jdbc.update("""
                UPDATE platform_identity.inventory_balances
                SET reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP
                WHERE variant_id = ? AND store_id = ? AND on_hand - reserved >= ?
                """, line.quantity(), line.variantId(), cart.storeId(), line.quantity());
            if (reserved != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock reservation ব্যর্থ হয়েছে; আবার চেষ্টা করুন।");
            long lineTotal = Math.multiplyExact(line.priceMinor(), (long) line.quantity());
            jdbc.update("""
                INSERT INTO platform_identity.order_items
                  (id, order_id, variant_id, product_name_snapshot, variant_label_snapshot,
                   sku_snapshot, unit_price_minor, quantity, line_total_minor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), orderId, line.variantId(), line.productName(),
                line.variantLabel(), line.sku(), line.priceMinor(), line.quantity(), lineTotal);
        }
        jdbc.update("""
            UPDATE platform_identity.carts SET status = 'CHECKED_OUT', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND customer_id = ? AND status = 'OPEN'
            """, cartId, customerId);
        jdbc.update("""
            INSERT INTO platform_identity.checkout_idempotency(id, customer_id, idempotency_key, order_id)
            VALUES (?, ?, ?, ?)
            """, UUID.randomUUID(), customerId, idempotencyKey, orderId);
        return order(orderId, customerId);
    }

    public OrderDtos.OrderResponse getOrder(UUID orderId, Authentication auth) {
        return order(orderId, customer(auth));
    }

    @Transactional
    public OrderDtos.OrderResponse cancelOrder(UUID orderId, Authentication auth, String reason) {
        UUID customerId = customer(auth);
        List<LockedOrder> rows = jdbc.query("""
            SELECT id, store_id, status FROM platform_identity.orders
            WHERE id = ? AND customer_id = ? FOR UPDATE
            """, (rs, n) -> new LockedOrder(rs.getObject("id", UUID.class),
                rs.getObject("store_id", UUID.class), rs.getString("status")), orderId, customerId);
        if (rows.isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order পাওয়া যায়নি।");
        LockedOrder order = rows.getFirst();
        if (!"AWAITING_PAYMENT".equals(order.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "শুধু payment pending order বাতিল করা যাবে।");

        List<ReservationLine> reservations = jdbc.query("""
            SELECT variant_id, quantity FROM platform_identity.order_items
            WHERE order_id = ? ORDER BY variant_id FOR UPDATE
            """, (rs, n) -> new ReservationLine(rs.getObject("variant_id", UUID.class),
                rs.getInt("quantity")), orderId);
        for (ReservationLine line : reservations) {
            int released = jdbc.update("""
                UPDATE platform_identity.inventory_balances
                SET reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP
                WHERE variant_id = ? AND store_id = ? AND reserved >= ?
                """, line.quantity(), line.variantId(), order.storeId(), line.quantity());
            if (released != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Inventory reservation state mismatch; cancellation rolled back.");
        }
        int changed = jdbc.update("""
            UPDATE platform_identity.orders
            SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND customer_id = ? AND status = 'AWAITING_PAYMENT'
            """, orderId, customerId);
        if (changed != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order status changed; refresh and retry.");
        String safeReason = reason == null ? "" : reason.trim();
        jdbc.update("""
            INSERT INTO platform_identity.order_status_events
              (id, order_id, from_status, to_status, actor_user_id, actor_role, reason)
            VALUES (?, ?, 'AWAITING_PAYMENT', 'CANCELLED', ?, 'CUSTOMER', ?)
            """, UUID.randomUUID(), orderId, customerId, safeReason);
        return order(orderId, customerId);
    }

    private OrderDtos.CartResponse cart(UUID cartId, UUID customerId) {
        List<CartHeader> headers = jdbc.query("""
            SELECT id, store_id, status, updated_at FROM platform_identity.carts
            WHERE id = ? AND customer_id = ?
            """, (rs, n) -> new CartHeader(rs.getObject("id", UUID.class),
                rs.getObject("store_id", UUID.class), rs.getString("status"),
                rs.getObject("updated_at", OffsetDateTime.class)), cartId, customerId);
        if (headers.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cart পাওয়া যায়নি।");
        CartHeader header = headers.getFirst();
        List<OrderDtos.CartItem> items = jdbc.query("""
            SELECT ci.id, ci.variant_id, p.name, v.label, v.sku, v.price_minor, ci.quantity,
                   (v.price_minor * ci.quantity) AS line_total, (b.on_hand - b.reserved) AS available
            FROM platform_identity.cart_items ci
            JOIN platform_identity.product_variants v ON v.id = ci.variant_id
            JOIN platform_identity.products p ON p.id = v.product_id
            JOIN platform_identity.inventory_balances b ON b.variant_id = v.id
            WHERE ci.cart_id = ? ORDER BY ci.created_at, ci.id
            """, (rs, n) -> new OrderDtos.CartItem(rs.getObject("id", UUID.class),
                rs.getObject("variant_id", UUID.class), rs.getString("name"), rs.getString("label"),
                rs.getString("sku"), rs.getLong("price_minor"), rs.getInt("quantity"),
                rs.getLong("line_total"), rs.getLong("available")), cartId);
        long subtotal = 0;
        try { for (var item : items) subtotal = Math.addExact(subtotal, item.lineTotalMinor()); }
        catch (ArithmeticException ex) { throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Cart total overflow."); }
        return new OrderDtos.CartResponse(cartId, header.storeId(), header.status(), items,
            subtotal, "BDT", header.updatedAt());
    }

    private OrderDtos.OrderResponse order(UUID orderId, UUID customerId) {
        List<OrderHeader> headers = jdbc.query("""
            SELECT id, order_number, status, store_id, subtotal_minor, delivery_fee_minor,
                   total_minor, currency, recipient_name, recipient_phone, delivery_address, created_at
            FROM platform_identity.orders WHERE id = ? AND customer_id = ?
            """, (rs, n) -> new OrderHeader(rs.getObject("id", UUID.class), rs.getString("order_number"),
                rs.getString("status"), rs.getObject("store_id", UUID.class), rs.getLong("subtotal_minor"),
                rs.getLong("delivery_fee_minor"), rs.getLong("total_minor"), rs.getString("currency").trim(),
                rs.getString("recipient_name"), rs.getString("recipient_phone"),
                rs.getString("delivery_address"), rs.getObject("created_at", OffsetDateTime.class)),
            orderId, customerId);
        if (headers.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order পাওয়া যায়নি।");
        OrderHeader h = headers.getFirst();
        List<OrderDtos.OrderItem> items = jdbc.query("""
            SELECT variant_id, product_name_snapshot, variant_label_snapshot, sku_snapshot,
                   unit_price_minor, quantity, line_total_minor
            FROM platform_identity.order_items WHERE order_id = ? ORDER BY id
            """, (rs, n) -> new OrderDtos.OrderItem(rs.getObject("variant_id", UUID.class),
                rs.getString("product_name_snapshot"), rs.getString("variant_label_snapshot"),
                rs.getString("sku_snapshot"), rs.getLong("unit_price_minor"), rs.getInt("quantity"),
                rs.getLong("line_total_minor")), orderId);
        return new OrderDtos.OrderResponse(h.id(), h.orderNumber(), h.status(), h.storeId(),
            h.subtotal(), h.deliveryFee(), h.total(), h.currency(), h.recipientName(),
            h.recipientPhone(), h.address(), items, h.createdAt());
    }

    private CartRow lockCart(UUID cartId, UUID customerId) {
        var rows = jdbc.query("""
            SELECT id, store_id, status FROM platform_identity.carts
            WHERE id = ? AND customer_id = ? FOR UPDATE
            """, (rs, n) -> new CartRow(rs.getObject("id", UUID.class),
                rs.getObject("store_id", UUID.class), rs.getString("status")), cartId, customerId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cart পাওয়া যায়নি।");
        CartRow cart = rows.getFirst();
        if (!"OPEN".equals(cart.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "এই cart আর পরিবর্তন করা যাবে না।");
        return cart;
    }

    private void touchCart(UUID cartId) {
        jdbc.update("UPDATE platform_identity.carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            cartId);
    }

    private UUID customer(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof SessionPrincipal p)
                || !"CUSTOMER".equals(p.role()))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer account দিয়ে লগইন করুন।");
        return p.id();
    }

    private record CartRow(UUID id, UUID storeId, String status) {}
    private record CartHeader(UUID id, UUID storeId, String status, OffsetDateTime updatedAt) {}
    private record ExistingItem(UUID id, int quantity) {}
    private record VariantRow(long priceMinor, long onHand, long reserved) {}
    private record VariantStock(UUID variantId, long onHand, long reserved) {}
    private record CheckoutLine(UUID variantId, int quantity, String productName,
        String variantLabel, String sku, long priceMinor, long onHand, long reserved) {}
    private record LockedOrder(UUID id, UUID storeId, String status) {}
    private record ReservationLine(UUID variantId, int quantity) {}
    private record OrderHeader(UUID id, String orderNumber, String status, UUID storeId,
        long subtotal, long deliveryFee, long total, String currency, String recipientName,
        String recipientPhone, String address, OffsetDateTime createdAt) {}
}
