package com.foodora.platform.catalog;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
public class PublicCatalogController {
    private final JdbcTemplate jdbc;

    public PublicCatalogController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/v1/stores/{storeId}/products")
    public List<CatalogDtos.ProductResponse> listActiveProducts(@PathVariable UUID storeId) {
        return jdbc.query("""
            SELECT p.id, p.category_id, p.name, p.description, p.status,
                   v.id AS variant_id, v.sku, v.label AS variant_label,
                   v.price_minor, v.currency, b.on_hand, b.reserved,
                   (b.on_hand - b.reserved) AS available, p.created_at
            FROM platform_identity.products p
            JOIN platform_identity.stores s ON s.id = p.store_id
            JOIN platform_identity.product_variants v
              ON v.product_id = p.id AND v.store_id = p.store_id AND v.active = TRUE
            JOIN platform_identity.inventory_balances b
              ON b.variant_id = v.id AND b.store_id = v.store_id
            WHERE p.store_id = ? AND s.status = 'ACTIVE' AND p.status = 'ACTIVE'
            ORDER BY p.created_at DESC, p.id
            LIMIT 100
            """, (rs, row) -> new CatalogDtos.ProductResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("category_id", UUID.class),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("status"),
                rs.getObject("variant_id", UUID.class),
                rs.getString("sku"),
                rs.getString("variant_label"),
                rs.getLong("price_minor"),
                rs.getString("currency").trim(),
                rs.getLong("on_hand"),
                rs.getLong("reserved"),
                rs.getLong("available"),
                rs.getObject("created_at", OffsetDateTime.class)), storeId);
    }
}
