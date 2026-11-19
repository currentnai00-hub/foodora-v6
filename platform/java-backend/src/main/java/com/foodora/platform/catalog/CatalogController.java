package com.foodora.platform.catalog;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class CatalogController {
    private final CatalogService service;

    public CatalogController(CatalogService service) { this.service = service; }

    @PostMapping("/api/v1/vendor/stores/{storeId}/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogDtos.CategoryResponse createCategory(@PathVariable UUID storeId,
            Authentication authentication, @Valid @RequestBody CatalogDtos.CategoryRequest request) {
        return service.createCategory(storeId, authentication, request);
    }

    @PostMapping("/api/v1/vendor/stores/{storeId}/products")
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogDtos.ProductResponse createProduct(@PathVariable UUID storeId,
            Authentication authentication, @Valid @RequestBody CatalogDtos.ProductCreateRequest request) {
        return service.createProduct(storeId, authentication, request);
    }

    @GetMapping("/api/v1/vendor/stores/{storeId}/products")
    public List<CatalogDtos.ProductResponse> listProducts(@PathVariable UUID storeId,
            Authentication authentication) {
        return service.listProducts(storeId, authentication);
    }

    @PostMapping("/api/v1/vendor/stores/{storeId}/variants/{variantId}/stock-adjustments")
    public CatalogDtos.StockAdjustmentResponse adjustStock(@PathVariable UUID storeId,
            @PathVariable UUID variantId, @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            Authentication authentication, @Valid @RequestBody CatalogDtos.StockAdjustmentRequest request) {
        return service.adjustStock(storeId, variantId, authentication, idempotencyKey, request);
    }
}
