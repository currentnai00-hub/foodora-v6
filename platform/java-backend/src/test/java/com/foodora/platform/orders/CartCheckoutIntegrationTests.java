package com.foodora.platform.orders;

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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CartCheckoutIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("DELETE FROM platform_identity.checkout_idempotency");
        jdbc.update("DELETE FROM platform_identity.payment_review_events");
        jdbc.update("DELETE FROM platform_identity.order_payments");
        jdbc.update("DELETE FROM platform_identity.order_status_events");
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

    private Cookie csrf() throws Exception {
        return mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent())
            .andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postCsrf(String path)
            throws Exception {
        Cookie token = csrf();
        return post(path).cookie(token).header("X-XSRF-TOKEN", token.getValue());
    }

    private String register(String phone) throws Exception {
        String body = """
            {"name":"Checkout Customer","phone":"%s","password":"a-strong-test-password"}
            """.formatted(phone);
        return mvc.perform(postCsrf("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated()).andReturn().getResponse()
            .getCookie("foodora_platform_session").getValue();
    }

    private Fixture fixture(String ownerSession) {
        UUID customerId = jdbc.queryForObject("""
            SELECT user_id FROM platform_identity.sessions WHERE token_hash = ?
            """, UUID.class, sha256(ownerSession));
        UUID applicationId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.vendor_applications
              (id, applicant_user_id, business_name, contact_name, contact_phone, business_address, status)
            VALUES (?, ?, 'Checkout Store', 'Store Owner', '01712345678', 'Agrabad, Chattogram', 'APPROVED')
            """, applicationId, customerId);
        UUID storeId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.stores
              (id, application_id, owner_user_id, name, slug, phone, address, status)
            VALUES (?, ?, ?, 'Checkout Store', ?, '01712345678', 'Agrabad, Chattogram', 'ACTIVE')
            """, storeId, applicationId, customerId, "checkout-" + storeId.toString().substring(0, 8));
        jdbc.update("""
            INSERT INTO platform_identity.store_memberships(store_id, user_id, role)
            VALUES (?, ?, 'OWNER')
            """, storeId, customerId);
        UUID productId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.products(id, store_id, name, status)
            VALUES (?, ?, 'Wireless Mouse', 'ACTIVE')
            """, productId, storeId);
        UUID variantId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.product_variants
              (id, store_id, product_id, sku, label, price_minor, currency)
            VALUES (?, ?, ?, 'MOUSE-001', 'Black', 12500, 'BDT')
            """, variantId, storeId, productId);
        jdbc.update("""
            INSERT INTO platform_identity.inventory_balances(variant_id, store_id, on_hand, reserved)
            VALUES (?, ?, 5, 0)
            """, variantId, storeId);
        return new Fixture(storeId, variantId);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) { throw new IllegalStateException(ex); }
    }

    @Test
    void checkoutReservesStockSnapshotsPriceAndIsIdempotent() throws Exception {
        String session = register("01712345678");
        Fixture f = fixture(session);
        String cartBody = "";
        var cartResult = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", session)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("OPEN"))
            .andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cartResult.getResponse().getContentAsString(), "$.cartId");

        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/items")
                .cookie(new Cookie("foodora_platform_session", session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variantId\":\"" + f.variantId() + "\",\"quantity\":2}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.subtotalMinor").value(25000));

        String key = UUID.randomUUID().toString();
        String checkout = """
            {"recipientName":"Checkout Customer","recipientPhone":"01812345678",
             "deliveryAddress":"Agrabad, Chattogram","customerNote":"Call on arrival"}
            """;
        var placed = mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", session))
                .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
            .andExpect(jsonPath("$.subtotalMinor").value(25000))
            .andExpect(jsonPath("$.totalMinor").value(25000))
            .andExpect(jsonPath("$.items[0].unitPriceMinor").value(12500))
            .andReturn();
        String orderId = com.jayway.jsonpath.JsonPath.read(placed.getResponse().getContentAsString(), "$.orderId");

        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", session))
                .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.orderId").value(orderId));

        org.junit.jupiter.api.Assertions.assertEquals(2L, jdbc.queryForObject("""
            SELECT reserved FROM platform_identity.inventory_balances WHERE variant_id = ?
            """, Long.class, f.variantId()));
        org.junit.jupiter.api.Assertions.assertEquals(1L, jdbc.queryForObject("""
            SELECT COUNT(*) FROM platform_identity.orders WHERE customer_id = (
              SELECT user_id FROM platform_identity.sessions WHERE token_hash = ?)
            """, Long.class, sha256(session)));
        org.junit.jupiter.api.Assertions.assertEquals("CHECKED_OUT", jdbc.queryForObject("""
            SELECT status FROM platform_identity.carts WHERE id = ?
            """, String.class, UUID.fromString(cartId)));
    }

    @Test
    void customerCannotReadAnotherCustomersCartOrOrder() throws Exception {
        String first = register("01712345678");
        Fixture f = fixture(first);
        var cart = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", first)))
            .andExpect(status().isCreated()).andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cart.getResponse().getContentAsString(), "$.cartId");
        String second = register("01812345678");
        mvc.perform(get("/api/v1/carts/" + cartId)
                .cookie(new Cookie("foodora_platform_session", second)))
            .andExpect(status().isNotFound());
    }

    @Test
    void checkoutRejectsInsufficientStockWithoutCreatingOrder() throws Exception {
        String session = register("01712345678");
        Fixture f = fixture(session);
        var cart = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", session)))
            .andExpect(status().isCreated()).andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cart.getResponse().getContentAsString(), "$.cartId");
        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/items")
                .cookie(new Cookie("foodora_platform_session", session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variantId\":\"" + f.variantId() + "\",\"quantity\":5}"))
            .andExpect(status().isCreated());
        jdbc.update("UPDATE platform_identity.inventory_balances SET reserved = 2 WHERE variant_id = ?", f.variantId());
        String checkout = """
            {"recipientName":"Checkout Customer","recipientPhone":"01812345678",
             "deliveryAddress":"Agrabad, Chattogram"}
            """;
        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", session))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isConflict());
        org.junit.jupiter.api.Assertions.assertEquals(0L, jdbc.queryForObject(
            "SELECT COUNT(*) FROM platform_identity.orders", Long.class));
    }

    @Test
    void customerCancellationReleasesReservedStockExactlyOnceAndAuditsTransition() throws Exception {
        String session = register("01712345678");
        Fixture f = fixture(session);
        var cart = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", session)))
            .andExpect(status().isCreated()).andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cart.getResponse().getContentAsString(), "$.cartId");
        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/items")
                .cookie(new Cookie("foodora_platform_session", session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variantId\":\"" + f.variantId() + "\",\"quantity\":2}"))
            .andExpect(status().isCreated());
        String checkout = """
            {"recipientName":"Checkout Customer","recipientPhone":"01812345678",
             "deliveryAddress":"Agrabad, Chattogram"}
            """;
        var placed = mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", session))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isCreated()).andReturn();
        String orderId = com.jayway.jsonpath.JsonPath.read(
            placed.getResponse().getContentAsString(), "$.orderId");
        org.junit.jupiter.api.Assertions.assertEquals(2L, jdbc.queryForObject(
            "SELECT reserved FROM platform_identity.inventory_balances WHERE variant_id = ?",
            Long.class, f.variantId()));

        mvc.perform(postCsrf("/api/v1/orders/" + orderId + "/cancel")
                .cookie(new Cookie("foodora_platform_session", session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Customer changed delivery plan\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));

        org.junit.jupiter.api.Assertions.assertEquals(0L, jdbc.queryForObject(
            "SELECT reserved FROM platform_identity.inventory_balances WHERE variant_id = ?",
            Long.class, f.variantId()));
        org.junit.jupiter.api.Assertions.assertEquals(2L, jdbc.queryForObject(
            "SELECT COUNT(*) FROM platform_identity.order_status_events WHERE order_id = ?",
            Long.class, UUID.fromString(orderId)));
        mvc.perform(postCsrf("/api/v1/orders/" + orderId + "/cancel")
                .cookie(new Cookie("foodora_platform_session", session)))
            .andExpect(status().isConflict());
        org.junit.jupiter.api.Assertions.assertEquals(0L, jdbc.queryForObject(
            "SELECT reserved FROM platform_identity.inventory_balances WHERE variant_id = ?",
            Long.class, f.variantId()));
    }

    private String adminSession() {
        UUID adminId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO platform_identity.users(id, full_name, phone, password_hash, role)
            VALUES (?, 'Payment Reviewer', '01912345678', 'test-only-hash', 'ADMIN')
            """, adminId);
        String token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        jdbc.update("""
            INSERT INTO platform_identity.sessions(token_hash, user_id, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '1' DAY)
            """, sha256(token), adminId);
        return token;
    }

    @Test
    void manualPaymentRequiresAdminReviewBeforeOrderConfirmation() throws Exception {
        String customer = register("01712345678");
        Fixture f = fixture(customer);
        var cart = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", customer)))
            .andExpect(status().isCreated()).andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cart.getResponse().getContentAsString(), "$.cartId");
        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/items")
                .cookie(new Cookie("foodora_platform_session", customer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variantId\":\"" + f.variantId() + "\",\"quantity\":1}"))
            .andExpect(status().isCreated());
        String checkout = """
            {"recipientName":"Checkout Customer","recipientPhone":"01812345678",
             "deliveryAddress":"Agrabad, Chattogram"}
            """;
        var placed = mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", customer))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
            .andReturn();
        String orderId = com.jayway.jsonpath.JsonPath.read(
            placed.getResponse().getContentAsString(), "$.orderId");

        var submitted = mvc.perform(postCsrf("/api/v1/orders/" + orderId + "/payments")
                .cookie(new Cookie("foodora_platform_session", customer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentMethod\":\"bKash\",\"transactionId\":\"TXN-ABC-1234\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andReturn();
        String paymentId = com.jayway.jsonpath.JsonPath.read(
            submitted.getResponse().getContentAsString(), "$.paymentId");
        org.junit.jupiter.api.Assertions.assertEquals("PAYMENT_REVIEW", jdbc.queryForObject(
            "SELECT status FROM platform_identity.orders WHERE id = ?", String.class, UUID.fromString(orderId)));

        mvc.perform(get("/api/v1/admin/payments/pending")
                .cookie(new Cookie("foodora_platform_session", customer)))
            .andExpect(status().isForbidden());

        String admin = adminSession();
        mvc.perform(get("/api/v1/admin/payments/pending")
                .cookie(new Cookie("foodora_platform_session", admin)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].transactionId").value("TXN-ABC-1234"));

        mvc.perform(postCsrf("/api/v1/admin/payments/" + paymentId + "/review")
                .cookie(new Cookie("foodora_platform_session", admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"approve\",\"note\":\"Verified against provider statement\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.paymentStatus").value("APPROVED"))
            .andExpect(jsonPath("$.orderStatus").value("CONFIRMED"));

        org.junit.jupiter.api.Assertions.assertEquals("CONFIRMED", jdbc.queryForObject(
            "SELECT status FROM platform_identity.orders WHERE id = ?", String.class, UUID.fromString(orderId)));
        org.junit.jupiter.api.Assertions.assertEquals(3L, jdbc.queryForObject(
            "SELECT COUNT(*) FROM platform_identity.order_status_events WHERE order_id = ?",
            Long.class, UUID.fromString(orderId)));
        mvc.perform(postCsrf("/api/v1/admin/payments/" + paymentId + "/review")
                .cookie(new Cookie("foodora_platform_session", admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"approve\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void rejectedPaymentCanBeResubmittedWithNewTransactionReference() throws Exception {
        String customer = register("01712345678");
        Fixture f = fixture(customer);
        var cart = mvc.perform(postCsrf("/api/v1/stores/" + f.storeId() + "/carts")
                .cookie(new Cookie("foodora_platform_session", customer)))
            .andExpect(status().isCreated()).andReturn();
        String cartId = com.jayway.jsonpath.JsonPath.read(cart.getResponse().getContentAsString(), "$.cartId");
        mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/items")
                .cookie(new Cookie("foodora_platform_session", customer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"variantId\":\"" + f.variantId() + "\",\"quantity\":1}"))
            .andExpect(status().isCreated());
        String checkout = """
            {"recipientName":"Checkout Customer","recipientPhone":"01812345678",
             "deliveryAddress":"Agrabad, Chattogram"}
            """;
        var placed = mvc.perform(postCsrf("/api/v1/carts/" + cartId + "/checkout")
                .cookie(new Cookie("foodora_platform_session", customer))
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(checkout))
            .andExpect(status().isCreated()).andReturn();
        String orderId = com.jayway.jsonpath.JsonPath.read(
            placed.getResponse().getContentAsString(), "$.orderId");

        var first = mvc.perform(postCsrf("/api/v1/orders/" + orderId + "/payments")
                .cookie(new Cookie("foodora_platform_session", customer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentMethod\":\"bKash\",\"transactionId\":\"TXN-REJECT-1001\"}"))
            .andExpect(status().isCreated()).andReturn();
        String firstPaymentId = com.jayway.jsonpath.JsonPath.read(
            first.getResponse().getContentAsString(), "$.paymentId");

        String admin = adminSession();
        mvc.perform(postCsrf("/api/v1/admin/payments/" + firstPaymentId + "/review")
                .cookie(new Cookie("foodora_platform_session", admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"reject\",\"note\":\"Reference not found in provider record\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.paymentStatus").value("REJECTED"))
            .andExpect(jsonPath("$.orderStatus").value("AWAITING_PAYMENT"));

        var second = mvc.perform(postCsrf("/api/v1/orders/" + orderId + "/payments")
                .cookie(new Cookie("foodora_platform_session", customer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentMethod\":\"Nagad\",\"transactionId\":\"NGD-RESUBMIT-2002\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andReturn();
        String secondPaymentId = com.jayway.jsonpath.JsonPath.read(
            second.getResponse().getContentAsString(), "$.paymentId");

        org.junit.jupiter.api.Assertions.assertNotEquals(firstPaymentId, secondPaymentId);
        org.junit.jupiter.api.Assertions.assertEquals("REJECTED", jdbc.queryForObject(
            "SELECT status FROM platform_identity.order_payments WHERE id = ?",
            String.class, UUID.fromString(firstPaymentId)));
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", jdbc.queryForObject(
            "SELECT status FROM platform_identity.order_payments WHERE id = ?",
            String.class, UUID.fromString(secondPaymentId)));
        org.junit.jupiter.api.Assertions.assertEquals("PAYMENT_REVIEW", jdbc.queryForObject(
            "SELECT status FROM platform_identity.orders WHERE id = ?",
            String.class, UUID.fromString(orderId)));
        org.junit.jupiter.api.Assertions.assertEquals(4L, jdbc.queryForObject(
            "SELECT COUNT(*) FROM platform_identity.order_status_events WHERE order_id = ?",
            Long.class, UUID.fromString(orderId)));
    }

    private record Fixture(UUID storeId, UUID variantId) {}
}
