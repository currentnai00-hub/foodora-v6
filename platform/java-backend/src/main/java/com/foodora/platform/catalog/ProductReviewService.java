package com.foodora.platform.catalog;

import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
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
public class ProductReviewService {
    private final JdbcTemplate jdbc;

    public ProductReviewService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void submit(UUID storeId, UUID productId, Authentication authentication) {
        UUID actorId = requirePrincipal(authentication);
        requireStoreManager(storeId, actorId);
        String current = lockProductStatus(storeId, productId);
        if (!"DRAFT".equals(current) && !"REJECTED".equals(current)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "শুধু DRAFT অথবা REJECTED পণ্য review-এর জন্য জমা দেওয়া যাবে।");
        }
        jdbc.update("""
            UPDATE platform_identity.products
            SET status = 'PENDING_REVIEW', submitted_at = CURRENT_TIMESTAMP,
                reviewed_at = NULL, reviewed_by = NULL, review_note = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND store_id = ?
            """, productId, storeId);
        recordEvent(productId, storeId, actorId, current, "PENDING_REVIEW", null);
    }

    public List<ProductReviewDtos.QueueItem> pending() {
        return jdbc.query("""
            SELECT p.id AS product_id, p.store_id, s.name AS store_name,
                   p.name AS product_name, v.sku, p.status, p.submitted_at, p.created_at
            FROM platform_identity.products p
            JOIN platform_identity.stores s ON s.id = p.store_id
            JOIN platform_identity.product_variants v
              ON v.product_id = p.id AND v.store_id = p.store_id AND v.active = TRUE
            WHERE p.status = 'PENDING_REVIEW'
            ORDER BY p.submitted_at, p.id
            """, (rs, row) -> new ProductReviewDtos.QueueItem(
                rs.getObject("product_id", UUID.class),
                rs.getObject("store_id", UUID.class),
                rs.getString("store_name"),
                rs.getString("product_name"),
                rs.getString("sku"),
                rs.getString("status"),
                rs.getObject("submitted_at", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class)));
    }

    @Transactional
    public void approve(UUID productId, Authentication authentication) {
        UUID reviewerId = requireAdmin(authentication);
        ProductRow product = lockPendingProduct(productId);
        jdbc.update("""
            UPDATE platform_identity.products
            SET status = 'ACTIVE', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
                review_note = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """, reviewerId, productId);
        recordEvent(productId, product.storeId(), reviewerId,
            "PENDING_REVIEW", "ACTIVE", null);
    }

    @Transactional
    public void reject(UUID productId, Authentication authentication, String note) {
        UUID reviewerId = requireAdmin(authentication);
        ProductRow product = lockPendingProduct(productId);
        String cleanNote = note == null ? "" : note.trim();
        if (cleanNote.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Rejection note কমপক্ষে ৩ অক্ষরের হতে হবে।");
        }
        jdbc.update("""
            UPDATE platform_identity.products
            SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
                review_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """, reviewerId, cleanNote, productId);
        recordEvent(productId, product.storeId(), reviewerId,
            "PENDING_REVIEW", "REJECTED", cleanNote);
    }

    private String lockProductStatus(UUID storeId, UUID productId) {
        var rows = jdbc.query("""
            SELECT status FROM platform_identity.products
            WHERE id = ? AND store_id = ? FOR UPDATE
            """, (rs, row) -> rs.getString("status"), productId, storeId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "এই store-এ product পাওয়া যায়নি।");
        }
        return rows.getFirst();
    }

    private ProductRow lockPendingProduct(UUID productId) {
        var rows = jdbc.query("""
            SELECT id, store_id FROM platform_identity.products
            WHERE id = ? AND status = 'PENDING_REVIEW' FOR UPDATE
            """, (rs, row) -> new ProductRow(
                rs.getObject("id", UUID.class),
                rs.getObject("store_id", UUID.class)), productId);
        if (rows.isEmpty()) {
            Boolean exists = jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM platform_identity.products WHERE id = ?)
                """, Boolean.class, productId);
            if (!Boolean.TRUE.equals(exists)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found.");
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "শুধু PENDING_REVIEW পণ্য approve/reject করা যাবে।");
        }
        return rows.getFirst();
    }

    private void recordEvent(UUID productId, UUID storeId, UUID actorId,
                             String from, String to, String note) {
        jdbc.update("""
            INSERT INTO platform_identity.product_status_events
              (id, product_id, store_id, actor_user_id, from_status, to_status, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, UUID.randomUUID(), productId, storeId, actorId, from, to, note);
    }

    private void requireStoreManager(UUID storeId, UUID userId) {
        Boolean allowed = jdbc.queryForObject("""
            SELECT EXISTS (
              SELECT 1 FROM platform_identity.stores s
              JOIN platform_identity.store_memberships m ON m.store_id = s.id
              WHERE s.id = ? AND s.status = 'ACTIVE' AND m.user_id = ?
                AND m.active = TRUE AND m.role IN ('OWNER', 'MANAGER')
            )
            """, Boolean.class, storeId, userId);
        if (!Boolean.TRUE.equals(allowed)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Store not found.");
        }
    }

    private UUID requireAdmin(Authentication authentication) {
        UUID userId = requirePrincipal(authentication);
        if (authentication.getAuthorities().stream()
                .noneMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "শুধু ADMIN এই কাজ করতে পারবেন।");
        }
        return userId;
    }

    private UUID requirePrincipal(Authentication authentication) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof SessionPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "লগইন করুন।");
        }
        return principal.id();
    }

    private record ProductRow(UUID id, UUID storeId) {}
}
