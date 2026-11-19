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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CatalogFlowIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
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
    }

    private Cookie csrf() throws Exception {
        return mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent())
            .andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private MockHttpServletRequestBuilder postWithCsrf(String path) throws Exception {
        Cookie token = csrf();
        return post(path).cookie(token).header("X-XSRF-TOKEN", token.getValue());
    }

    private String register(String phone) throws Exception {
        String body = """
            {"name":"Catalog Owner","phone":"%s","password":"a-strong-test-password"}
            """.formatted(phone);
        return mvc.perform(postWithCsrf("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andReturn().getResponse()
            .getCookie("foodora_platform_session").getValue();
    }

    private String createApprovedStore(String session) throws Exception {
        String application = """
            {"businessName":"Catalog Store","contactName":"Catalog Owner",
             "contactPhone":"01712345678","businessAddress":"Agrabad, Chattogram"}
            """;
        var submitted = mvc.perform(postWithCsrf("/api/v1/vendor/applications")
                .cookie(new Cookie("foodora_platform_session", session))
                .contentType(MediaType.APPLICATION_JSON).content(application))
            .andExpect(status().isCreated()).andReturn();
        String applicationId = com.jayway.jsonpath.JsonPath.read(
            submitted.getResponse().getContentAsString(), "$.id");
        java.util.UUID adminId = java.util.UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.users(id, full_name, phone, password_hash, role)
            VALUES (?, 'Catalog Admin', '01612345678', 'test-hash', 'ADMIN')
            """, adminId);
        // Provision a test-only authenticated ADMIN session using the same opaque-token contract.
        String raw = "a".repeat(64);
        jdbc.update("""
            INSERT INTO platform_identity.sessions(token_hash, user_id, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, com.foodora.platform.security.SessionAuthenticationFilter.sha256(raw), adminId);
        mvc.perform(postWithCsrf("/api/v1/admin/vendor/applications/" + applicationId + "/approve")
                .cookie(new Cookie("foodora_platform_session", raw)))
            .andExpect(status().isOk());
        return jdbc.queryForObject("SELECT id FROM platform_identity.stores WHERE application_id = ?",
            String.class, java.util.UUID.fromString(applicationId));
    }

    @Test
    void catalogAndInventoryAreStoreScopedAndStockCannotGoNegative() throws Exception {
        String owner = register("01712345678");
        String storeId = createApprovedStore(owner);
        String categoryBody = """
            {"name":"Electronics"}
            """;
        var category = mvc.perform(postWithCsrf("/api/v1/vendor/stores/" + storeId + "/categories")
                .cookie(new Cookie("foodora_platform_session", owner))
                .contentType(MediaType.APPLICATION_JSON).content(categoryBody))
            .andExpect(status().isCreated()).andReturn();
        String categoryId = com.jayway.jsonpath.JsonPath.read(
            category.getResponse().getContentAsString(), "$.id");

        String productBody = """
            {"categoryId":"%s","name":"USB-C Cable","description":"Braided cable",
             "sku":"USB-C-001","variantLabel":"1 metre","priceMinor":12500}
            """.formatted(categoryId);
        var created = mvc.perform(postWithCsrf("/api/v1/vendor/stores/" + storeId + "/products")
                .cookie(new Cookie("foodora_platform_session", owner))
                .contentType(MediaType.APPLICATION_JSON).content(productBody))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.priceMinor").value(12500))
            .andExpect(jsonPath("$.currency").value("BDT"))
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andReturn();
        String variantId = com.jayway.jsonpath.JsonPath.read(
            created.getResponse().getContentAsString(), "$.variantId");

        String adjustmentPath = "/api/v1/vendor/stores/" + storeId + "/variants/" + variantId + "/stock-adjustments";
        String key = java.util.UUID.randomUUID().toString();
        mvc.perform(postWithCsrf(adjustmentPath).cookie(new Cookie("foodora_platform_session", owner))
                .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON)
                .content("{\"quantityDelta\":20,\"reason\":\"Opening stock\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.onHand").value(20))
            .andExpect(jsonPath("$.available").value(20));
        mvc.perform(postWithCsrf(adjustmentPath).cookie(new Cookie("foodora_platform_session", owner))
                .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON)
                .content("{\"quantityDelta\":20,\"reason\":\"Retry opening stock\"}"))
            .andExpect(status().isConflict());
        mvc.perform(postWithCsrf(adjustmentPath).cookie(new Cookie("foodora_platform_session", owner))
                .header("Idempotency-Key", java.util.UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"quantityDelta\":-21,\"reason\":\"Invalid deduction\"}"))
            .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/vendor/stores/" + storeId + "/products")
                .cookie(new Cookie("foodora_platform_session", owner)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].onHand").value(20));

        String other = register("01812345678");
        mvc.perform(get("/api/v1/vendor/stores/" + storeId + "/products")
                .cookie(new Cookie("foodora_platform_session", other)))
            .andExpect(status().isUnauthorized());
    }
}
