package com.foodora.platform.security;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AuthFlowIntegrationTests {
 @Autowired MockMvc mvc;
 @Autowired JdbcTemplate jdbc;
 @BeforeEach void cleanDatabase(){
  jdbc.update("DELETE FROM platform_identity.checkout_idempotency");
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
 private Cookie csrfCookie()throws Exception{return mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent()).andReturn().getResponse().getCookie("XSRF-TOKEN");}
 private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder protectedPost(String uri)throws Exception{Cookie token=csrfCookie();return post(uri).cookie(token).header("X-XSRF-TOKEN",token.getValue());}
 @Test void registerMeLogoutAndLogin()throws Exception{
  String body="{\"name\":\"Test Customer\",\"phone\":\"01712345678\",\"password\":\"a-strong-test-password\"}";
  var created=mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("CUSTOMER")).andReturn();
  var cookie=created.getResponse().getCookie("foodora_platform_session");
  mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isOk()).andExpect(jsonPath("$.user.phone").value("01712345678"));
  mvc.perform(protectedPost("/api/v1/auth/logout").cookie(cookie)).andExpect(status().isNoContent());
  mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isUnauthorized());
  mvc.perform(protectedPost("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
 }
 @Test void duplicatePhoneIsRejected()throws Exception{
  String body="{\"name\":\"Test Customer\",\"phone\":\"01812345678\",\"password\":\"a-strong-test-password\"}";
  mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
  mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
 }
 @Test void protectedProfileRequiresSession()throws Exception{mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());}
 @Test void csrfCookieEndpointIsAvailable()throws Exception{var result=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent()).andReturn();var cookie=result.getResponse().getCookie("XSRF-TOKEN");org.junit.jupiter.api.Assertions.assertNotNull(cookie);org.junit.jupiter.api.Assertions.assertFalse(cookie.getValue().isBlank());}
 @Test void stateChangingRequestWithoutCsrfIsRejected()throws Exception{String body="{\"name\":\"No CSRF\",\"phone\":\"01912345678\",\"password\":\"a-strong-test-password\"}";mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());}

 @Test void publicRegistrationCannotAssignOrEscalateAccountRole()throws Exception{
  String body="{\"name\":\"Role Probe\",\"phone\":\"01612345678\",\"password\":\"a-strong-test-password\",\"role\":\"ADMIN\"}";
  var created=mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("CUSTOMER")).andReturn();
  var cookie=created.getResponse().getCookie("foodora_platform_session");
  mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isOk()).andExpect(jsonPath("$.user.role").value("CUSTOMER"));
  org.junit.jupiter.api.Assertions.assertEquals("CUSTOMER",jdbc.queryForObject(
   "SELECT role FROM platform_identity.users WHERE phone = ?",String.class,"01612345678"));
 }

 @Test void inactiveAccountCannotStartANewSession()throws Exception{
  String phone="01512345678";
  String body="{\"name\":\"Inactive Customer\",\"phone\":\""+phone+"\",\"password\":\"a-strong-test-password\"}";
  mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
  jdbc.update("UPDATE platform_identity.users SET active = FALSE WHERE phone = ?",phone);
  mvc.perform(protectedPost("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isUnauthorized());
  org.junit.jupiter.api.Assertions.assertEquals(1,jdbc.queryForObject(
   "SELECT COUNT(*) FROM platform_identity.sessions s JOIN platform_identity.users u ON u.id=s.user_id WHERE u.phone = ?",Integer.class,phone));
 }
 @Test void expiredSessionCannotAccessProtectedProfile()throws Exception{
  String phone="01412345678";
  String body="{\"name\":\"Expired Customer\",\"phone\":\""+phone+"\",\"password\":\"a-strong-test-password\"}";
  var registered=mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isCreated()).andReturn();
  Cookie session=registered.getResponse().getCookie("foodora_platform_session");
  org.junit.jupiter.api.Assertions.assertNotNull(session);
  jdbc.update("UPDATE platform_identity.sessions SET expires_at = ? WHERE token_hash = ?",
   java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(1),SessionAuthenticationFilter.sha256(session.getValue()));
  mvc.perform(get("/api/v1/auth/me").cookie(session)).andExpect(status().isUnauthorized());
 }
 @Test void deactivatedAccountCannotReuseAnExistingSession()throws Exception{
  String phone="01312345678";
  String body="{\\"name\\":\\"Deactivated Customer\\",\\"phone\\":\\""+phone+"\\",\\"password\\":\\"a-strong-test-password\\"}";
  var registered=mvc.perform(protectedPost("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isCreated()).andReturn();
  Cookie session=registered.getResponse().getCookie("foodora_platform_session");
  org.junit.jupiter.api.Assertions.assertNotNull(session);
  mvc.perform(get("/api/v1/auth/me").cookie(session)).andExpect(status().isOk());
  jdbc.update("UPDATE platform_identity.users SET active = FALSE WHERE phone = ?",phone);
  mvc.perform(get("/api/v1/auth/me").cookie(session)).andExpect(status().isUnauthorized());
 }

}
