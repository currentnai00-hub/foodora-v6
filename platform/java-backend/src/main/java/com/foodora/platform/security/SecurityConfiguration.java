package com.foodora.platform.security;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.*;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
@Configuration public class SecurityConfiguration {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder(12);}
 @Bean SessionAuthenticationFilter sessionAuthenticationFilter(JdbcTemplate jdbc,@Value("${foodora.auth.cookie-name}")String name){return new SessionAuthenticationFilter(jdbc,name);}
 @Bean SecurityFilterChain securityFilterChain(HttpSecurity http,SessionAuthenticationFilter filter)throws Exception{return http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).authorizeHttpRequests(a->a.requestMatchers("/actuator/health/**","/actuator/info","/api/v1/auth/register","/api/v1/auth/login","/api/v1/auth/logout").permitAll().anyRequest().authenticated()).addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class).httpBasic(b->b.disable()).formLogin(f->f.disable()).build();}
}
