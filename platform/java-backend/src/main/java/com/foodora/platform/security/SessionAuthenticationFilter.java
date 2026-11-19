package com.foodora.platform.security;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.security.*;
import java.util.*;
public class SessionAuthenticationFilter extends OncePerRequestFilter {
 private final JdbcTemplate jdbc; private final String cookieName;
 public SessionAuthenticationFilter(JdbcTemplate jdbc,String cookieName){this.jdbc=jdbc;this.cookieName=cookieName;}
 @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException{
  if(SecurityContextHolder.getContext().getAuthentication()==null){
   String token=null; Cookie[] cookies=req.getCookies();
   if(cookies!=null)for(Cookie c:cookies)if(cookieName.equals(c.getName())&&c.getValue().matches("[a-f0-9]{64}")){token=c.getValue();break;}
   if(token!=null)try{
    List<SessionPrincipal> rows=jdbc.query("""
      SELECT u.id,u.full_name,u.phone,u.role FROM platform_identity.sessions s
      JOIN platform_identity.users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=TRUE
      """,(rs,n)->new SessionPrincipal(rs.getObject("id",UUID.class),rs.getString("full_name"),rs.getString("phone"),rs.getString("role")),sha256(token));
    if(!rows.isEmpty()){var p=rows.getFirst();SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(p,null,List.of(new SimpleGrantedAuthority("ROLE_"+p.role()))));}
   }catch(RuntimeException ignored){SecurityContextHolder.clearContext();}
  }
  chain.doFilter(req,res);
 }
 static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 public record SessionPrincipal(UUID id,String fullName,String phone,String role){}
}
