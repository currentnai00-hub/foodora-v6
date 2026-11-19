package com.foodora.platform.payments;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class PaymentDtos {
    private PaymentDtos() {}
    public record SubmitPaymentRequest(
        @NotBlank @Pattern(regexp="bKash|Nagad") String paymentMethod,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{4,80}") String transactionId
    ) {}
    public record ReviewPaymentRequest(
        @NotBlank @Pattern(regexp="approve|reject") String action,
        @Size(max=300) String note
    ) {}
    public record PaymentResponse(UUID paymentId, UUID orderId, String paymentMethod,
        String status, String transactionId, String message, OffsetDateTime submittedAt) {}
    public record PaymentQueueItem(UUID paymentId, UUID orderId, String orderNumber,
        String customerName, String customerPhone, long amountMinor, String currency,
        String paymentMethod, String transactionId, OffsetDateTime submittedAt) {}
    public record ReviewResponse(UUID paymentId, UUID orderId, String paymentStatus,
        String orderStatus, OffsetDateTime reviewedAt) {}
}