package com.foodora.platform.catalog;

import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class CatalogService {
    private final JdbcTemplate jdbc;

    public CatalogService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public CatalogDtos.CategoryResponse createCategory(UUID storeId, Authentication auth,
                                                        CatalogDtos.CategoryRequest request) {
        UUID userId = requireStoreManager(storeId, auth);
        UUID id = UUID.randomUUID();
        String name = request.name().trim();
        String slug = slug(name);
        try {
            jdbc.update("""
                INSERT INTO platform_identity.store_categories(id, store_id, name, slug)
                VALUES (?, ?, ?, ?)
                """, id, storeId, name, slug);
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "এই store-এ category name আগে থেকেই আছে।");
        }
        return jdbc.queryForObject("""
            SELECT id, name, slug, active, created_at
            FROM platform_identity.store_categories WHERE id = ? AND store_id = ?
            """, (rs, row) -> new CatalogDtos.CategoryResponse(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("slug"),
                rs.getBoolean("active"), rs.getObject("created_at", OffsetDateTime.class)), id, storeId);
    }

    @Transactional
    public CatalogDtos.ProductResponse createProduct(UUID storeId, Authentication auth,
                                                      CatalogDtos.ProductCreateRequest request) {
        requireStoreManager(storeId, auth);
        UUID productId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();
        String sku = request.sku().trim().toUpperCase(Locale.ROOT);
        try {
            jdbc.update("""
                INSERT INTO platform_identity.products(id, store_id, category_id, name, description)
                VALUES (?, ?, ?, ?, ?)
                """, productId, storeId, request.categoryId(), request.name().trim(),
                request.description() == null ? "" : request.description().trim());
            jdbc.update("""
                INSERT INTO platform_identity.product_variants
                  (id, store_id, product_id, sku, label, price_minor, currency)
                VALUES (?, ?, ?, ?, ?, ?, 'BDT')
                """, variantId, storeId, productId, sku, request.variantLabel().trim(),
                request.priceMinor());
            jdbc.update("""
                INSERT INTO platform_identity.inventory_balances(variant_id, store_id)
                VALUES (?, ?)
                """, variantId, storeId);
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "SKU বা category conflict হয়েছে; তথ্য যাচাই করুন।");
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                "নির্বাচিত category এই store-এর নয় অথবা product data অবৈধ।");
        }
        return product(storeId, productId, auth);
    }

    public List<CatalogDtos.ProductResponse> listProducts(UUID storeId, Authentication auth) {
        requireStoreManager(storeId, auth);
        return jdbc.query("""
            SELECT p.id, p.category_id, p.name, p.description, p.status,
                   v.id AS variant_id, v.sku, v.label AS variant_label, v.price_minor, v.currency,
                   b.on_hand, b.reserved, (b.on_hand - b.reserved) AS available, p.created_at
            FROM platform_identity.products p
            JOIN platform_identity.product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
            JOIN platform_identity.inventory_balances b ON b.variant_id = v.id AND b.store_id = v.store_id
            WHERE p.store_id = ? AND v.active = TRUE
            ORDER BY p.created_at DESC, p.id
            """, (rs, row) -> productRow(rs), storeId);
    }

    @Transactional
    public CatalogDtos.StockAdjustmentResponse adjustStock(UUID storeId, UUID variantId,
            Authentication auth, UUID idempotencyKey, CatalogDtos.StockAdjustmentRequest request) {
        UUID actorId = requireStoreManager(storeId, auth);
        if (idempotencyKey == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key UUID header প্রয়োজন।");
        long delta = request.quantityDelta();
        if (delta == 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock adjustment শূন্য হতে পারবে না।");

        var balances = jdbc.query("""
            SELECT on_hand, reserved FROM platform_identity.inventory_balances
            WHERE variant_id = ? AND store_id = ? FOR UPDATE
            """, (rs, row) -> new Balance(rs.getLong("on_hand"), rs.getLong("reserved")),
            variantId, storeId);
        if (balances.isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "এই store-এ variant পাওয়া যায়নি।");
        Balance current = balances.getFirst();
        long next;
        try { next = Math.addExact(current.onHand(), delta); }
        catch (ArithmeticException ex) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Stock quantity সীমা অতিক্রম করেছে।");
        }
        if (next < current.reserved())
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "নতুন stock reserved quantity-এর চেয়ে কম হতে পারবে না।");

        UUID movementId = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO platform_identity.inventory_movements
                  (id, store_id, variant_id, actor_user_id, quantity_delta, reason, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, movementId, storeId, variantId, actorId, delta, request.reason().trim(), idempotencyKey);
        } catch (DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "এই Idempotency-Key আগে ব্যবহার করা হয়েছে; duplicate stock change বন্ধ করা হয়েছে।");
        }
        jdbc.update("""
            UPDATE platform_identity.inventory_balances
            SET on_hand = ?, updated_at = CURRENT_TIMESTAMP
            WHERE variant_id = ? AND store_id = ?
            """, next, variantId, storeId);
        return new CatalogDtos.StockAdjustmentResponse(variantId, next, current.reserved(),
            next - current.reserved(), movementId, idempotencyKey);
    }

    private CatalogDtos.ProductResponse product(UUID storeId, UUID productId, Authentication auth) {
        requireStoreManager(storeId, auth);
        return jdbc.queryForObject("""
            SELECT p.id, p.category_id, p.name, p.description, p.status,
                   v.id AS variant_id, v.sku, v.label AS variant_label, v.price_minor, v.currency,
                   b.on_hand, b.reserved, (b.on_hand - b.reserved) AS available, p.created_at
            FROM platform_identity.products p
            JOIN platform_identity.product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
            JOIN platform_identity.inventory_balances b ON b.variant_id = v.id AND b.store_id = v.store_id
            WHERE p.id = ? AND p.store_id = ? AND v.active = TRUE
            """, (rs, row) -> productRow(rs), productId, storeId);
    }

    private CatalogDtos.ProductResponse productRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new CatalogDtos.ProductResponse(
            rs.getObject("id", UUID.class), rs.getObject("category_id", UUID.class),
            rs.getString("name"), rs.getString("description"), rs.getString("status"),
            rs.getObject("variant_id", UUID.class), rs.getString("sku"),
            rs.getString("variant_label"), rs.getLong("price_minor"), rs.getString("currency").trim(),
            rs.getLong("on_hand"), rs.getLong("reserved"), rs.getLong("available"),
            rs.getObject("created_at", OffsetDateTime.class));
    }

    private UUID requireStoreManager(UUID storeId, Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof SessionPrincipal principal))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "লগইন করুন।");
        Boolean allowed = jdbc.queryForObject("""
            SELECT EXISTS (
              SELECT 1 FROM platform_identity.stores s
              JOIN platform_identity.store_memberships m ON m.store_id = s.id
              WHERE s.id = ? AND s.status = 'ACTIVE' AND m.user_id = ?
                AND m.active = TRUE AND m.role IN ('OWNER', 'MANAGER')
            )
            """, Boolean.class, storeId, principal.id());
        if (!Boolean.TRUE.equals(allowed))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Store not found.");
        return principal.id();
    }

    private String slug(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKD)
            .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "category" : normalized.substring(0, Math.min(110, normalized.length()));
    }

    private record Balance(long onHand, long reserved) {}
}
