package com.foodora.platform.catalog;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductReviewIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();
    private final UUID applicationId = UUID.randomUUID();
    private final UUID storeId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final UUID variantId = UUID.randomUUID();
    private final String ownerToken = "a".repeat(64);
    private final String adminToken = "b".repeat(64);

    @BeforeEach
    void seedIsolatedDatabase() {
        jdbc.update("DELETE FROM platform_identity.product_status_events");
        jdbc.update("DELETE FROM platform_identity.inventory_movements");
        jdbc.update("DELETE FROM platform_identity.inventory_balances");
        jdbc.update("DELETE FROM platform_identity.product_variants");
        jdbc.update("DELETE FROM platform_identity.products");
        jdbc.update("DELETE FROM platform_identity.store_categories");
        jdbc.update("DELETE FROM platform_identity.store_memberships");
        jdbc.update("DELETE FROM platform_identity.stores");
        jdbc.update("DELETE FROM platform_identity.vendor_applications");
        jdbc.update("DELETE FROM platform_identity.sessions");
        jdbc.update("DELETE FROM platform_identity.users");

        jdbc.update("""
            INSERT INTO platform_identity.users(id, full_name, phone, password_hash, role)
            VALUES (?, 'Review Owner', '01711111111', 'test-hash', 'CUSTOMER'),
                   (?, 'Review Admin', '01722222222', 'test-hash', 'ADMIN')
            """, ownerId, adminId);
        jdbc.update("""
            INSERT INTO platform_identity.sessions(token_hash, user_id, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '1' DAY),
                   (?, ?, CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, sha256(ownerToken), ownerId, sha256(adminToken), adminId);
        jdbc.update("""
            INSERT INTO platform_identity.vendor_applications
              (id, applicant_user_id, business_name, contact_name, contact_phone,
               business_address, status, reviewed_by, reviewed_at)
            VALUES (?, ?, 'Review Store', 'Review Owner', '01711111111',
                    'Agrabad, Chattogram', 'APPROVED', ?, CURRENT_TIMESTAMP)
            """, applicationId, ownerId, adminId);
        jdbc.update("""
            INSERT INTO platform_identity.stores
              (id, application_id, owner_user_id, name, slug, phone, address)
            VALUES (?, ?, ?, 'Review Store', ?, '01711111111', 'Agrabad, Chattogram')
            """, storeId, applicationId, ownerId, "review-store-" + storeId.toString().substring(0, 8));
        jdbc.update("""
            INSERT INTO platform_identity.store_memberships(store_id, user_id, role)
            VALUES (?, ?, 'OWNER')
            """, storeId, ownerId);
        jdbc.update("""
            INSERT INTO platform_identity.products(id, store_id, name, description, status)
            VALUES (?, ?, 'Test Product', 'Review workflow test', 'DRAFT')
            """, productId, storeId);
        jdbc.update("""
            INSERT INTO platform_identity.product_variants
              (id, store_id, product_id, sku, label, price_minor, currency)
            VALUES (?, ?, ?, 'REVIEW-001', 'Default', 10000, 'BDT')
            """, variantId, storeId, productId);
        jdbc.update("""
            INSERT INTO platform_identity.inventory_balances(variant_id, store_id, on_hand, reserved)
            VALUES (?, ?, 5, 0)
            """, variantId, storeId);
    }

    private Cookie csrf() throws Exception {
        return mvc.perform(get("/api/v1/auth/csrf"))
            .andExpect(status().isNoContent())
            .andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private MockHttpServletRequestBuilder postWithCsrf(String path, String sessionToken)
            throws Exception {
        Cookie token = csrf();
        return post(path)
            .cookie(token)
            .cookie(new Cookie("foodora_platform_session", sessionToken))
            .header("X-XSRF-TOKEN", token.getValue());
    }

    private static String sha256(String token) {
        try {
            return java.util.HexFormat.of().formatHex(
                java.security.MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Test
    void onlyAdminCanApproveAndOnlyApprovedProductsArePublic() throws Exception {
        String publicPath = "/api/v1/stores/" + storeId + "/products";
        String submitPath = "/api/v1/vendor/stores/" + storeId
            + "/products/" + productId + "/submit-for-review";
        String approvePath = "/api/v1/admin/products/" + productId + "/approve";
        String queuePath = "/api/v1/admin/products/pending-review";

        mvc.perform(get(publicPath))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());

        mvc.perform(postWithCsrf(submitPath, ownerToken))
            .andExpect(status().isNoContent());
        mvc.perform(get(publicPath))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());

        mvc.perform(get(queuePath).cookie(new Cookie("foodora_platform_session", ownerToken)))
            .andExpect(status().isForbidden());
        mvc.perform(get(queuePath).cookie(new Cookie("foodora_platform_session", adminToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].productId").value(productId.toString()));

        mvc.perform(postWithCsrf(approvePath, ownerToken))
            .andExpect(status().isForbidden());
        mvc.perform(postWithCsrf(approvePath, adminToken))
            .andExpect(status().isNoContent());

        mvc.perform(get(publicPath))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(productId.toString()))
            .andExpect(jsonPath("$[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$[0].available").value(5));

        mvc.perform(postWithCsrf(approvePath, adminToken))
            .andExpect(status().isConflict());
        mvc.perform(get(queuePath).cookie(new Cookie("foodora_platform_session", adminToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());

        Integer events = jdbc.queryForObject("""
            SELECT COUNT(*) FROM platform_identity.product_status_events
            WHERE product_id = ?
            """, Integer.class, productId);
        org.junit.jupiter.api.Assertions.assertEquals(2, events);
    }

    @Test
    void rejectionRequiresNoteAndCanBeResubmittedByStoreOwner() throws Exception {
        String submitPath = "/api/v1/vendor/stores/" + storeId
            + "/products/" + productId + "/submit-for-review";
        String rejectPath = "/api/v1/admin/products/" + productId + "/reject";

        mvc.perform(postWithCsrf(submitPath, ownerToken))
            .andExpect(status().isNoContent());
        mvc.perform(postWithCsrf(rejectPath, adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"  \"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(postWithCsrf(rejectPath, adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"Image is unclear\"}"))
            .andExpect(status().isNoContent());
        mvc.perform(postWithCsrf(submitPath, ownerToken))
            .andExpect(status().isNoContent());

        String status = jdbc.queryForObject("""
            SELECT status FROM platform_identity.products WHERE id = ?
            """, String.class, productId);
        org.junit.jupiter.api.Assertions.assertEquals("PENDING_REVIEW", status);
    }

    @Test
    void anotherStoresOwnerCannotSubmitThisProduct() throws Exception {
        UUID otherId = UUID.randomUUID();
        String otherToken = "c".repeat(64);
        jdbc.update("""
            INSERT INTO platform_identity.users(id, full_name, phone, password_hash, role)
            VALUES (?, 'Other Owner', '01733333333', 'test-hash', 'CUSTOMER')
            """, otherId);
        jdbc.update("""
            INSERT INTO platform_identity.sessions(token_hash, user_id, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, sha256(otherToken), otherId);

        String submitPath = "/api/v1/vendor/stores/" + storeId
            + "/products/" + productId + "/submit-for-review";
        mvc.perform(postWithCsrf(submitPath, otherToken))
            .andExpect(status().isNotFound());
    }
}
