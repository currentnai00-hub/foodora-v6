package com.foodora.platform.security;
import org.junit.jupiter.api.Test;
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
 @Test void registerMeLogoutAndLogin()throws Exception{
  String body="{\"name\":\"Test Customer\",\"phone\":\"01712345678\",\"password\":\"a-strong-test-password\"}";
  var created=mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("CUSTOMER")).andReturn();
  var cookie=created.getResponse().getCookie("foodora_platform_session");
  mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isOk()).andExpect(jsonPath("$.user.phone").value("01712345678"));
  mvc.perform(post("/api/v1/auth/logout").cookie(cookie)).andExpect(status().isNoContent());
  mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
 }
 @Test void duplicatePhoneIsRejected()throws Exception{
  String body="{\"name\":\"Test Customer\",\"phone\":\"01812345678\",\"password\":\"a-strong-test-password\"}";
  mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
  mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
 }
 @Test void protectedProfileRequiresSession()throws Exception{mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());}
}
