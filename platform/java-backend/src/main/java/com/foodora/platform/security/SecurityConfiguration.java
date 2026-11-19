package com.foodora.platform.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.*;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder(12);}

 @Bean CookieCsrfTokenRepository csrfTokenRepository(){
  var repository=CookieCsrfTokenRepository.withHttpOnlyFalse();
  repository.setCookiePath("/");
  repository.setCookieName("XSRF-TOKEN");
  repository.setHeaderName("X-XSRF-TOKEN");
  return repository;
 }

 @Bean SessionAuthenticationFilter sessionAuthenticationFilter(
   JdbcTemplate jdbc,@Value("${foodora.auth.cookie-name}") String name){
  return new SessionAuthenticationFilter(jdbc,name);
 }

 @Bean SecurityFilterChain securityFilterChain(
   HttpSecurity http,SessionAuthenticationFilter filter,
   CsrfTokenRepository csrfTokenRepository)throws Exception{
  return http
   .csrf(c->c
     .csrfTokenRepository(csrfTokenRepository)
     // Browser clients copy the raw XSRF-TOKEN cookie into X-XSRF-TOKEN.
     // The default XOR handler expects an encoded value and rejects that raw header.
     // This handler validates the submitted header against the cookie repository.
     .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
   .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .exceptionHandling(e->e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
   .authorizeHttpRequests(a->a
     .requestMatchers("/actuator/health/**","/actuator/info",
       "/api/v1/stores/*/products",
       "/api/v1/auth/register","/api/v1/auth/login",
       "/api/v1/auth/logout","/api/v1/auth/csrf").permitAll()
     .anyRequest().authenticated())
   .addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class)
   .httpBasic(b->b.disable()).formLogin(f->f.disable()).build();
 }
}
