package com.foodora.platform.payments;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class PaymentController {
    private final PaymentService service;
    public PaymentController(PaymentService service) { this.service = service; }

    @PostMapping("/orders/{orderId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentDtos.PaymentResponse submit(@PathVariable UUID orderId, Authentication auth,
            @Valid @RequestBody PaymentDtos.SubmitPaymentRequest request) {
        return service.submit(orderId, auth, request);
    }

    @GetMapping("/admin/payments/pending")
    public List<PaymentDtos.PaymentQueueItem> pendingQueue(Authentication auth) {
        return service.pendingQueue(auth);
    }

    @PostMapping("/admin/payments/{paymentId}/review")
    public PaymentDtos.ReviewResponse review(@PathVariable UUID paymentId, Authentication auth,
            @Valid @RequestBody PaymentDtos.ReviewPaymentRequest request) {
        return service.review(paymentId, auth, request);
    }
}