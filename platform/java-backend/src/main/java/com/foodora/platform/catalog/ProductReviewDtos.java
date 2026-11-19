package com.foodora.platform.catalog;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class ProductReviewDtos {
    private ProductReviewDtos() {}

    public record RejectionRequest(
        @NotBlank @Size(min = 3, max = 500) String note
    ) {}

    public record QueueItem(
        UUID productId,
        UUID storeId,
        String storeName,
        String productName,
        String sku,
        String status,
        OffsetDateTime submittedAt,
        OffsetDateTime createdAt
    ) {}
}
