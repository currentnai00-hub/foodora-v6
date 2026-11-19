package com.foodora.platform.payments;

import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class PaymentService {
    private final JdbcTemplate jdbc;
    public PaymentService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public PaymentDtos.PaymentResponse submit(UUID orderId, Authentication auth,
                                               PaymentDtos.SubmitPaymentRequest request) {
        SessionPrincipal actor = principal(auth, "CUSTOMER");
        List<OrderRow> rows = jdbc.query("""
            SELECT id, order_number, status, total_minor, currency
            FROM platform_identity.orders
            WHERE id = ? AND customer_id = ? FOR UPDATE
            """, (rs, n) -> new OrderRow(rs.getObject("id", UUID.class),
                rs.getString("order_number"), rs.getString("status"),
                rs.getLong("total_minor"), rs.getString("currency").trim()),
            orderId, actor.id());
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order পাওয়া যায়নি।");
        OrderRow order = rows.getFirst();
        if (!"AWAITING_PAYMENT".equals(order.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "এই order-এ এখন payment submission নেওয়া যাবে না।");
        UUID paymentId = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO platform_identity.order_payments
                  (id, order_id, customer_id, payment_method, transaction_id)
                VALUES (?, ?, ?, ?, ?)
                """, paymentId, orderId, actor.id(), request.paymentMethod(),
                request.transactionId().trim());
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "এই payment method-এর Transaction ID আগে জমা হয়েছে।");
        }
        jdbc.update("""
            UPDATE platform_identity.orders SET status = 'PAYMENT_REVIEW',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND customer_id = ? AND status = 'AWAITING_PAYMENT'
            """, orderId, actor.id());
        jdbc.update("""
            INSERT INTO platform_identity.order_status_events
              (id, order_id, from_status, to_status, actor_user_id, actor_role, reason)
            VALUES (?, ?, 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', ?, 'CUSTOMER',
              'Payment transaction submitted for manual verification')
            """, UUID.randomUUID(), orderId, actor.id());
        jdbc.update("""
            INSERT INTO platform_identity.payment_review_events
              (id, payment_id, order_id, action, actor_user_id, actor_role, note)
            VALUES (?, ?, ?, 'SUBMITTED', ?, 'CUSTOMER', 'Customer submitted transaction ID')
            """, UUID.randomUUID(), paymentId, orderId, actor.id());
        return new PaymentDtos.PaymentResponse(paymentId, orderId, request.paymentMethod(),
            "PENDING", request.transactionId().trim(),
            "Transaction ID জমা হয়েছে; প্রকৃত লেনদেন যাচাই না হওয়া পর্যন্ত order confirmed হবে না।",
            OffsetDateTime.now());
    }

    public List<PaymentDtos.PaymentQueueItem> pendingQueue(Authentication auth) {
        principal(auth, "ADMIN");
        return jdbc.query("""
            SELECT p.id AS payment_id, o.id AS order_id, o.order_number,
              u.full_name, u.phone, o.total_minor, o.currency,
              p.payment_method, p.transaction_id, p.submitted_at
            FROM platform_identity.order_payments p
            JOIN platform_identity.orders o ON o.id = p.order_id
            JOIN platform_identity.users u ON u.id = p.customer_id
            WHERE p.status = 'PENDING' AND o.status = 'PAYMENT_REVIEW'
            ORDER BY p.submitted_at, p.id
            LIMIT 200
            """, (rs, n) -> new PaymentDtos.PaymentQueueItem(
                rs.getObject("payment_id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getString("order_number"), rs.getString("full_name"), rs.getString("phone"),
                rs.getLong("total_minor"), rs.getString("currency").trim(),
                rs.getString("payment_method"), rs.getString("transaction_id"),
                rs.getObject("submitted_at", OffsetDateTime.class)));
    }

    @Transactional
    public PaymentDtos.ReviewResponse review(UUID paymentId, Authentication auth,
                                              PaymentDtos.ReviewPaymentRequest request) {
        SessionPrincipal actor = principal(auth, "ADMIN");
        List<PaymentRow> rows = jdbc.query("""
            SELECT p.id, p.order_id, p.status, o.status AS order_status
            FROM platform_identity.order_payments p
            JOIN platform_identity.orders o ON o.id = p.order_id
            WHERE p.id = ? FOR UPDATE
            """, (rs, n) -> new PaymentRow(rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("status"),
                rs.getString("order_status")), paymentId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment submission পাওয়া যায়নি।");
        PaymentRow payment = rows.getFirst();
        if (!"PENDING".equals(payment.status()) || !"PAYMENT_REVIEW".equals(payment.orderStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "এই payment আগেই review হয়েছে বা order state বদলেছে।");
        boolean approve = "approve".equals(request.action());
        String paymentStatus = approve ? "APPROVED" : "REJECTED";
        String orderStatus = approve ? "CONFIRMED" : "AWAITING_PAYMENT";
        String note = request.note() == null ? "" : request.note().trim();
        jdbc.update("""
            UPDATE platform_identity.order_payments
            SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'PENDING'
            """, paymentStatus, note, actor.id(), paymentId);
        jdbc.update("""
            UPDATE platform_identity.orders SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'PAYMENT_REVIEW'
            """, orderStatus, payment.orderId());
        jdbc.update("""
            INSERT INTO platform_identity.order_status_events
              (id, order_id, from_status, to_status, actor_user_id, actor_role, reason)
            VALUES (?, ?, 'PAYMENT_REVIEW', ?, ?, 'ADMIN', ?)
            """, UUID.randomUUID(), payment.orderId(), orderStatus, actor.id(),
            note.isEmpty() ? (approve ? "Payment manually verified" : "Payment rejected") : note);
        jdbc.update("""
            INSERT INTO platform_identity.payment_review_events
              (id, payment_id, order_id, action, actor_user_id, actor_role, note)
            VALUES (?, ?, ?, ?, ?, 'ADMIN', ?)
            """, UUID.randomUUID(), paymentId, payment.orderId(),
            approve ? "APPROVED" : "REJECTED", actor.id(), note);
        return new PaymentDtos.ReviewResponse(paymentId, payment.orderId(), paymentStatus,
            orderStatus, OffsetDateTime.now());
    }

    private SessionPrincipal principal(Authentication auth, String requiredRole) {
        if (auth == null || !(auth.getPrincipal() instanceof SessionPrincipal p)
                || !requiredRole.equals(p.role()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "এই কাজের অনুমতি নেই।");
        return p;
    }

    private record OrderRow(UUID id, String orderNumber, String status, long totalMinor, String currency) {}
    private record PaymentRow(UUID id, UUID orderId, String status, String orderStatus) {}
}