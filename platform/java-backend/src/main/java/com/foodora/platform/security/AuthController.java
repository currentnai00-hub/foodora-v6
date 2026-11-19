package com.foodora.platform.security;
import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.time.Duration;
@RestController @RequestMapping("/api/v1/auth")
public class AuthController {
 private final AuthService service;private final String cookieName;private final Duration ttl;private final boolean secure;
 public AuthController(AuthService service,@Value("${foodora.auth.cookie-name}")String cookieName,@Value("${foodora.auth.session-ttl}")Duration ttl,@Value("${foodora.auth.cookie-secure}")boolean secure){this.service=service;this.cookieName=cookieName;this.ttl=ttl;this.secure=secure;}
 @PostMapping("/register") public ResponseEntity<AuthDtos.AuthResponse> register(@Valid @RequestBody AuthDtos.RegisterRequest r,HttpServletRequest req,HttpServletResponse res){checkOrigin(req);var issued=service.register(r);setCookie(res,issued.token(),ttl);return ResponseEntity.status(201).body(new AuthDtos.AuthResponse(issued.user()));}
 @PostMapping("/login") public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest r,HttpServletRequest req,HttpServletResponse res){checkOrigin(req);var issued=service.login(r.phone(),r.password());setCookie(res,issued.token(),ttl);return new AuthDtos.AuthResponse(issued.user());}
 @PostMapping("/logout") public ResponseEntity<Void> logout(HttpServletRequest req,HttpServletResponse res){checkOrigin(req);service.logout(readToken(req));res.addHeader("Set-Cookie",ResponseCookie.from(cookieName,"").httpOnly(true).secure(secure).sameSite("Lax").path("/").maxAge(Duration.ZERO).build().toString());return ResponseEntity.noContent().build();}
 @GetMapping("/me") public AuthDtos.AuthResponse me(Authentication auth){if(auth==null||!(auth.getPrincipal() instanceof SessionPrincipal p))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED,"লগইন করুন।");return new AuthDtos.AuthResponse(new AuthDtos.UserResponse(p.id().toString(),p.fullName(),p.phone(),p.role()));}
 private void setCookie(HttpServletResponse res,String token,Duration age){res.addHeader("Set-Cookie",ResponseCookie.from(cookieName,token).httpOnly(true).secure(secure).sameSite("Lax").path("/").maxAge(age).build().toString());}
 private String readToken(HttpServletRequest req){if(req.getCookies()!=null)for(Cookie c:req.getCookies())if(cookieName.equals(c.getName()))return c.getValue();return null;}
 private void checkOrigin(HttpServletRequest req){String origin=req.getHeader("Origin");if(origin==null||origin.isBlank())return;String expected=req.getScheme()+"://"+req.getServerName()+((req.getServerPort()==80&&"http".equals(req.getScheme()))||(req.getServerPort()==443&&"https".equals(req.getScheme()))?"":":"+req.getServerPort());try{URI a=URI.create(origin),b=URI.create(expected);if(!a.getScheme().equalsIgnoreCase(b.getScheme())||!a.getAuthority().equalsIgnoreCase(b.getAuthority()))throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN,"Request origin not allowed.");}}
}
