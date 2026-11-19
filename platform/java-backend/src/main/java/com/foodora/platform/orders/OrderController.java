package com.foodora.platform.orders;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class OrderController {
    private final OrderService service;
    public OrderController(OrderService service) { this.service = service; }

    @PostMapping("/stores/{storeId}/carts")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDtos.CartResponse createCart(@PathVariable UUID storeId, Authentication auth) {
        return service.createCart(storeId, auth);
    }

    @GetMapping("/carts/{cartId}")
    public OrderDtos.CartResponse getCart(@PathVariable UUID cartId, Authentication auth) {
        return service.getCart(cartId, auth);
    }

    @PostMapping("/carts/{cartId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDtos.CartResponse addItem(@PathVariable UUID cartId, Authentication auth,
            @Valid @RequestBody OrderDtos.AddItemRequest request) {
        return service.addItem(cartId, auth, request);
    }

    @PutMapping("/carts/{cartId}/items/{itemId}")
    public OrderDtos.CartResponse updateItem(@PathVariable UUID cartId, @PathVariable UUID itemId,
            Authentication auth, @Valid @RequestBody OrderDtos.UpdateItemRequest request) {
        return service.updateItem(cartId, itemId, auth, request);
    }

    @DeleteMapping("/carts/{cartId}/items/{itemId}")
    public OrderDtos.CartResponse removeItem(@PathVariable UUID cartId, @PathVariable UUID itemId,
            Authentication auth) {
        return service.removeItem(cartId, itemId, auth);
    }

    @PostMapping("/carts/{cartId}/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDtos.OrderResponse checkout(@PathVariable UUID cartId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            Authentication auth, @Valid @RequestBody OrderDtos.CheckoutRequest request) {
        return service.checkout(cartId, idempotencyKey, auth, request);
    }

    @GetMapping("/orders/{orderId}")
    public OrderDtos.OrderResponse getOrder(@PathVariable UUID orderId, Authentication auth) {
        return service.getOrder(orderId, auth);
    }
}
