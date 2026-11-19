package com.foodora.platform.vendor;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class VendorFlowIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("DELETE FROM platform_identity.checkout_idempotency");
        jdbc.update("DELETE FROM platform_identity.order_items");
        jdbc.update("DELETE FROM platform_identity.orders");
        jdbc.update("DELETE FROM platform_identity.cart_items");
        jdbc.update("DELETE FROM platform_identity.carts");
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
    }

    private Cookie csrfCookie() throws Exception {
        return mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent())
            .andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private MockHttpServletRequestBuilder protectedPost(String path) throws Exception {
        Cookie csrf = csrfCookie();
        return post(path).cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue());
    }

    private MockHttpServletRequestBuilder protectedPut(String path) throws Exception {
        Cookie csrf = csrfCookie();
        return put(path).cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue());
    }

    private Cookie register(String phone, String name) throws Exception {
        String body = """
            {"name":"%s","phone":"%s","password":"a-strong-test-password"}
            """.formatted(name, phone);
        return mvc.perform(protectedPost("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andReturn().getResponse()
            .getCookie("foodora_platform_session");
    }

    private String createAdminAndLogin() throws Exception {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.users(id, full_name, phone, password_hash, role)
            VALUES (?, 'Platform Admin', '01612345678', ?, 'ADMIN')
            """, id, encoder.encode("admin-test-password"));
        String body = """
            {"phone":"01612345678","password":"admin-test-password"}
            """;
        return mvc.perform(protectedPost("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse()
            .getCookie("foodora_platform_session").getValue();
    }

    @Test
    void vendorMustBeApprovedBeforeStoreExistsAndStoreIsIsolated() throws Exception {
        Cookie owner = register("01712345678", "Vendor Owner");
        String application = """
            {"businessName":"Chattogram Fresh","contactName":"Vendor Owner",
             "contactPhone":"01712345678","businessAddress":"Agrabad, Chattogram"}
            """;
        var submitted = mvc.perform(protectedPost("/api/v1/vendor/applications")
                .cookie(owner).contentType(MediaType.APPLICATION_JSON).content(application))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
            .andReturn();
        String applicationId = com.jayway.jsonpath.JsonPath.read(
            submitted.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/admin/vendor/applications").cookie(owner))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/vendor/stores/me").cookie(owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());

        String admin = createAdminAndLogin();
        mvc.perform(get("/api/v1/admin/vendor/applications").cookie(
                new Cookie("foodora_platform_session", admin)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("PENDING_REVIEW"));

        var approved = mvc.perform(protectedPost(
                "/api/v1/admin/vendor/applications/" + applicationId + "/approve")
                .cookie(new Cookie("foodora_platform_session", admin)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.membershipRole").value("OWNER"))
            .andExpect(jsonPath("$.status").value("ACTIVE"))
            .andReturn();
        String storeId = com.jayway.jsonpath.JsonPath.read(
            approved.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/vendor/stores/me").cookie(owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Chattogram Fresh"));

        Cookie other = register("01812345678", "Other Customer");
        mvc.perform(get("/api/v1/vendor/stores/me").cookie(other))
            .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());

        String update = """
            {"name":"Chattogram Fresh Plus","description":"Fresh local products",
             "phone":"01712345678","address":"GEC, Chattogram"}
            """;
        mvc.perform(protectedPut("/api/v1/vendor/stores/" + storeId).cookie(other)
                .contentType(MediaType.APPLICATION_JSON).content(update))
            .andExpect(status().isNotFound());
        mvc.perform(protectedPut("/api/v1/vendor/stores/" + storeId).cookie(owner)
                .contentType(MediaType.APPLICATION_JSON).content(update))
            .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Chattogram Fresh Plus"));
    }

    @Test
    void duplicateApplicationIsRejected() throws Exception {
        Cookie owner = register("01912345678", "Another Owner");
        String body = """
            {"businessName":"Another Shop","contactName":"Another Owner",
             "contactPhone":"01912345678","businessAddress":"Lalkhan Bazar, Chattogram"}
            """;
        mvc.perform(protectedPost("/api/v1/vendor/applications").cookie(owner)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated());
        mvc.perform(protectedPost("/api/v1/vendor/applications").cookie(owner)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict());
    }
}
