package com.foodora.platform.catalog;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class ProductReviewController {
    private final ProductReviewService service;

    public ProductReviewController(ProductReviewService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/vendor/stores/{storeId}/products/{productId}/submit-for-review")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void submit(@PathVariable UUID storeId, @PathVariable UUID productId,
                       Authentication authentication) {
        service.submit(storeId, productId, authentication);
    }

    @GetMapping("/api/v1/admin/products/pending-review")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ProductReviewDtos.QueueItem> pending() {
        return service.pending();
    }

    @PostMapping("/api/v1/admin/products/{productId}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void approve(@PathVariable UUID productId, Authentication authentication) {
        service.approve(productId, authentication);
    }

    @PostMapping("/api/v1/admin/products/{productId}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable UUID productId, Authentication authentication,
                       @Valid @RequestBody ProductReviewDtos.RejectionRequest request) {
        service.reject(productId, authentication, request.note());
    }
}
