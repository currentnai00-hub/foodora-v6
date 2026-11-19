package com.foodora.platform.vendor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class VendorDtos {
    private VendorDtos() {}

    public record ApplicationRequest(
        @NotBlank @Size(min = 2, max = 120) String businessName,
        @NotBlank @Size(min = 2, max = 80) String contactName,
        @NotBlank @Pattern(regexp = "^01[0-9]{9}$") String contactPhone,
        @NotBlank @Size(min = 8, max = 300) String businessAddress
    ) {}

    public record ApplicationResponse(
        UUID id, String businessName, String contactName, String contactPhone,
        String businessAddress, String status, String reviewNote, OffsetDateTime createdAt
    ) {}

    public record StoreUpdateRequest(
        @NotBlank @Size(min = 2, max = 120) String name,
        @Size(max = 500) String description,
        @NotBlank @Pattern(regexp = "^01[0-9]{9}$") String phone,
        @NotBlank @Size(min = 8, max = 300) String address
    ) {}

    public record StoreResponse(
        UUID id, UUID applicationId, String name, String slug, String description,
        String phone, String address, String status, String membershipRole,
        OffsetDateTime createdAt
    ) {}

    public record ReviewRequest(@Size(max = 500) String note) {}
}
