package com.foodora.platform.orders;

import jakarta.validation.constraints.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {
    private OrderDtos() {}

    public record AddItemRequest(@NotNull UUID variantId,
                                 @Min(1) @Max(99) int quantity) {}

    public record UpdateItemRequest(@Min(1) @Max(99) int quantity) {}

    public record CancelOrderRequest(@Size(max=300) String reason) {}

    public record CheckoutRequest(@NotBlank @Size(max=80) String recipientName,
                                  @NotBlank @Pattern(regexp="01[0-9]{9}") String recipientPhone,
                                  @NotBlank @Size(max=500) String deliveryAddress,
                                  @Size(max=500) String customerNote) {}

    public record CartItem(UUID itemId, UUID variantId, String productName,
                           String variantLabel, String sku, long unitPriceMinor,
                           int quantity, long lineTotalMinor, long availableQuantity) {}

    public record CartResponse(UUID cartId, UUID storeId, String status,
                               List<CartItem> items, long subtotalMinor,
                               String currency, OffsetDateTime updatedAt) {}

    public record OrderItem(UUID variantId, String productName, String variantLabel,
                            String sku, long unitPriceMinor, int quantity,
                            long lineTotalMinor) {}

    public record OrderResponse(UUID orderId, String orderNumber, String status,
                                UUID storeId, long subtotalMinor, long deliveryFeeMinor,
                                long totalMinor, String currency, String recipientName,
                                String recipientPhone, String deliveryAddress,
                                List<OrderItem> items, OffsetDateTime createdAt) {}
}
