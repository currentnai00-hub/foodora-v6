package com.foodora.platform.security;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.security.SecureRandom;
import java.util.*;
@Service
public class AuthService {
 private final JdbcTemplate jdbc;private final PasswordEncoder encoder;private final SecureRandom random=new SecureRandom();
 public AuthService(JdbcTemplate jdbc,PasswordEncoder encoder){this.jdbc=jdbc;this.encoder=encoder;}
 @Transactional public IssuedSession register(AuthDtos.RegisterRequest r){
  UUID id=UUID.randomUUID();
  try{jdbc.update("INSERT INTO platform_identity.users(id,full_name,phone,password_hash,role) VALUES(?,?,?,?,'CUSTOMER')",id,r.name().trim(),r.phone(),encoder.encode(r.password()));}
  catch(DuplicateKeyException e){throw new ResponseStatusException(HttpStatus.CONFLICT,"এই মোবাইল নম্বরে ইতিমধ্যে অ্যাকাউন্ট আছে।");}
  return issue(id,r.name().trim(),r.phone(),"CUSTOMER");
 }
 @Transactional public IssuedSession login(String phone,String password){
  var rows=jdbc.query("SELECT id,full_name,phone,password_hash,role,active FROM platform_identity.users WHERE phone=?",(rs,n)->new UserRow(rs.getObject("id",UUID.class),rs.getString("full_name"),rs.getString("phone"),rs.getString("password_hash"),rs.getString("role"),rs.getBoolean("active")),phone);
  if(rows.isEmpty()||!rows.getFirst().active()||!encoder.matches(password,rows.getFirst().hash()))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।");
  var u=rows.getFirst();return issue(u.id(),u.name(),u.phone(),u.role());
 }
 @Transactional public void logout(String token){if(token!=null&&token.matches("[a-f0-9]{64}"))jdbc.update("DELETE FROM platform_identity.sessions WHERE token_hash=?",SessionAuthenticationFilter.sha256(token));}
 private IssuedSession issue(UUID id,String name,String phone,String role){
  byte[] bytes=new byte[32];random.nextBytes(bytes);String token=HexFormat.of().formatHex(bytes);
  jdbc.update("INSERT INTO platform_identity.sessions(token_hash,user_id,expires_at) VALUES(?,?,CURRENT_TIMESTAMP + INTERVAL '30 days')",SessionAuthenticationFilter.sha256(token),id);
  return new IssuedSession(token,new AuthDtos.UserResponse(id.toString(),name,phone,role));
 }
 public record IssuedSession(String token,AuthDtos.UserResponse user){}
 private record UserRow(UUID id,String name,String phone,String hash,String role,boolean active){}
}
