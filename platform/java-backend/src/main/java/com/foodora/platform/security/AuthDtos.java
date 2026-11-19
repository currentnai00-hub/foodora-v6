package com.foodora.platform.security;
import jakarta.validation.constraints.*;
public final class AuthDtos {
 private AuthDtos() {}
 public record RegisterRequest(@NotBlank @Size(max=80) String name,@NotBlank @Pattern(regexp="^01[0-9]{9}$") String phone,@NotBlank @Size(min=12,max=128) String password) {}
 public record LoginRequest(@NotBlank @Pattern(regexp="^01[0-9]{9}$") String phone,@NotBlank @Size(max=128) String password) {}
 public record UserResponse(String id,String name,String phone,String role) {}
 public record AuthResponse(UserResponse user) {}
}
