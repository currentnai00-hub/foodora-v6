package com.foodora.platform.vendor;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class VendorController {
    private final VendorService service;
    public VendorController(VendorService service) { this.service = service; }

    @PostMapping("/api/v1/vendor/applications")
    @ResponseStatus(HttpStatus.CREATED)
    public VendorDtos.ApplicationResponse apply(Authentication authentication,
            @Valid @RequestBody VendorDtos.ApplicationRequest request) {
        return service.submitApplication(authentication, request);
    }

    @GetMapping("/api/v1/vendor/applications/me")
    public VendorDtos.ApplicationResponse myApplication(Authentication authentication) {
        return service.myApplication(authentication);
    }

    @GetMapping("/api/v1/vendor/stores/me")
    public List<VendorDtos.StoreResponse> myStores(Authentication authentication) {
        return service.myStores(authentication);
    }

    @PutMapping("/api/v1/vendor/stores/{storeId}")
    public VendorDtos.StoreResponse updateStore(@PathVariable UUID storeId,
            Authentication authentication, @Valid @RequestBody VendorDtos.StoreUpdateRequest request) {
        return service.updateStore(storeId, authentication, request);
    }

    @GetMapping("/api/v1/admin/vendor/applications")
    @PreAuthorize("hasRole('ADMIN')")
    public List<VendorDtos.ApplicationResponse> pendingApplications() {
        return service.pendingApplications();
    }

    @PostMapping("/api/v1/admin/vendor/applications/{applicationId}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public VendorDtos.StoreResponse approve(@PathVariable UUID applicationId, Authentication authentication) {
        return service.approve(applicationId, authentication);
    }

    @PostMapping("/api/v1/admin/vendor/applications/{applicationId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void reject(@PathVariable UUID applicationId, Authentication authentication,
                       @Valid @RequestBody(required = false) VendorDtos.ReviewRequest request) {
        service.reject(applicationId, authentication, request == null ? null : request.note());
    }
}
