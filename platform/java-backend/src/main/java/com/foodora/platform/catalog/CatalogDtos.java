package com.foodora.platform.catalog;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class CatalogDtos {
    private CatalogDtos() {}

    public record CategoryRequest(
        @NotBlank @Size(min = 2, max = 100) String name
    ) {}

    public record CategoryResponse(
        UUID id, String name, String slug, boolean active, OffsetDateTime createdAt
    ) {}

    public record ProductCreateRequest(
        UUID categoryId,
        @NotBlank @Size(min = 2, max = 160) String name,
        @Size(max = 2000) String description,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$") String sku,
        @NotBlank @Size(min = 1, max = 120) String variantLabel,
        @NotNull @Positive Long priceMinor
    ) {}

    public record ProductResponse(
        UUID id, UUID categoryId, String name, String description, String status,
        UUID variantId, String sku, String variantLabel, long priceMinor,
        String currency, long onHand, long reserved, long available,
        OffsetDateTime createdAt
    ) {}

    public record StockAdjustmentRequest(
        @NotNull @Min(-1000000) @Max(1000000) Long quantityDelta,
        @NotBlank @Size(min = 3, max = 240) String reason
    ) {}

    public record StockAdjustmentResponse(
        UUID variantId, long onHand, long reserved, long available,
        UUID movementId, UUID idempotencyKey
    ) {}
}
