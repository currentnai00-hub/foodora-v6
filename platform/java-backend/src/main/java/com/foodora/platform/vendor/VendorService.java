package com.foodora.platform.vendor;

import com.foodora.platform.security.SessionAuthenticationFilter.SessionPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class VendorService {
    private final JdbcTemplate jdbc;

    public VendorService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public VendorDtos.ApplicationResponse submitApplication(Authentication authentication,
                                                              VendorDtos.ApplicationRequest request) {
        UUID userId = principal(authentication).id();
        UUID id = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO platform_identity.vendor_applications
                  (id, applicant_user_id, business_name, contact_name, contact_phone, business_address)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, userId, request.businessName().trim(), request.contactName().trim(),
                request.contactPhone(), request.businessAddress().trim());
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "আপনার একটি vendor application ইতিমধ্যে রয়েছে।");
        }
        return application(id);
    }

    public VendorDtos.ApplicationResponse myApplication(Authentication authentication) {
        UUID userId = principal(authentication).id();
        return jdbc.query("""
            SELECT id FROM platform_identity.vendor_applications WHERE applicant_user_id = ?
            """, rs -> rs.next() ? application(rs.getObject(1, UUID.class)) : null, userId) == null
            ? null : jdbc.queryForObject("""
                SELECT id, business_name, contact_name, contact_phone, business_address,
                       status, review_note, created_at
                FROM platform_identity.vendor_applications WHERE applicant_user_id = ?
                """, (rs, n) -> new VendorDtos.ApplicationResponse(
                    rs.getObject("id", UUID.class), rs.getString("business_name"),
                    rs.getString("contact_name"), rs.getString("contact_phone"),
                    rs.getString("business_address"), rs.getString("status"),
                    rs.getString("review_note"), rs.getObject("created_at", OffsetDateTime.class)),
                userId);
    }

    public List<VendorDtos.ApplicationResponse> pendingApplications() {
        return jdbc.query("""
            SELECT id, business_name, contact_name, contact_phone, business_address,
                   status, review_note, created_at
            FROM platform_identity.vendor_applications
            WHERE status = 'PENDING_REVIEW' ORDER BY created_at, id
            """, (rs, n) -> new VendorDtos.ApplicationResponse(
                rs.getObject("id", UUID.class), rs.getString("business_name"),
                rs.getString("contact_name"), rs.getString("contact_phone"),
                rs.getString("business_address"), rs.getString("status"),
                rs.getString("review_note"), rs.getObject("created_at", OffsetDateTime.class)));
    }

    @Transactional
    public VendorDtos.StoreResponse approve(UUID applicationId, Authentication authentication) {
        UUID reviewerId = principal(authentication).id();
        var rows = jdbc.query("""
            SELECT id, applicant_user_id, business_name, contact_phone, business_address, status
            FROM platform_identity.vendor_applications WHERE id = ? FOR UPDATE
            """, (rs, n) -> new ApplicationRow(
                rs.getObject("id", UUID.class), rs.getObject("applicant_user_id", UUID.class),
                rs.getString("business_name"), rs.getString("contact_phone"),
                rs.getString("business_address"), rs.getString("status")), applicationId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found.");
        ApplicationRow app = rows.getFirst();
        if (!"PENDING_REVIEW".equals(app.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Application has already been reviewed.");

        UUID storeId = UUID.randomUUID();
        String slug = slug(app.businessName()) + "-" + storeId.toString().substring(0, 8);
        jdbc.update("""
            INSERT INTO platform_identity.stores
              (id, application_id, owner_user_id, name, slug, phone, address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, storeId, applicationId, app.applicantId(), app.businessName(), slug,
            app.phone(), app.address());
        jdbc.update("""
            INSERT INTO platform_identity.store_memberships(store_id, user_id, role)
            VALUES (?, ?, 'OWNER')
            """, storeId, app.applicantId());
        jdbc.update("""
            UPDATE platform_identity.vendor_applications
            SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP, review_note = NULL
            WHERE id = ?
            """, reviewerId, applicationId);
        return storeForOwner(storeId, app.applicantId());
    }

    @Transactional
    public void reject(UUID applicationId, Authentication authentication, String note) {
        UUID reviewerId = principal(authentication).id();
        int changed = jdbc.update("""
            UPDATE platform_identity.vendor_applications
            SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP, review_note = ?
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """, reviewerId, note, applicationId);
        if (changed == 0) {
            boolean exists = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM platform_identity.vendor_applications WHERE id = ?)
                """, Boolean.class, applicationId));
            if (!exists) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found.");
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Application has already been reviewed.");
        }
    }

    public List<VendorDtos.StoreResponse> myStores(Authentication authentication) {
        UUID userId = principal(authentication).id();
        return jdbc.query("""
            SELECT s.id, s.application_id, s.name, s.slug, s.description, s.phone, s.address,
                   s.status, m.role AS membership_role, s.created_at
            FROM platform_identity.stores s
            JOIN platform_identity.store_memberships m ON m.store_id = s.id
            WHERE m.user_id = ? AND m.active = TRUE
            ORDER BY s.created_at, s.id
            """, (rs, n) -> storeRow(rs), userId);
    }

    @Transactional
    public VendorDtos.StoreResponse updateStore(UUID storeId, Authentication authentication,
                                                 VendorDtos.StoreUpdateRequest request) {
        UUID userId = principal(authentication).id();
        int changed = jdbc.update("""
            UPDATE platform_identity.stores s
            SET name = ?, description = ?, phone = ?, address = ?, updated_at = CURRENT_TIMESTAMP
            WHERE s.id = ? AND s.status = 'ACTIVE'
              AND EXISTS (
                SELECT 1 FROM platform_identity.store_memberships m
                WHERE m.store_id = s.id AND m.user_id = ? AND m.active = TRUE
                  AND m.role IN ('OWNER', 'MANAGER')
              )
            """, request.name().trim(), request.description() == null ? "" : request.description().trim(),
            request.phone(), request.address().trim(), storeId, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Store not found.");
        return storeForOwner(storeId, userId);
    }

    private VendorDtos.ApplicationResponse application(UUID id) {
        return jdbc.queryForObject("""
            SELECT id, business_name, contact_name, contact_phone, business_address,
                   status, review_note, created_at
            FROM platform_identity.vendor_applications WHERE id = ?
            """, (rs, n) -> new VendorDtos.ApplicationResponse(
                rs.getObject("id", UUID.class), rs.getString("business_name"),
                rs.getString("contact_name"), rs.getString("contact_phone"),
                rs.getString("business_address"), rs.getString("status"),
                rs.getString("review_note"), rs.getObject("created_at", OffsetDateTime.class)), id);
    }

    private VendorDtos.StoreResponse storeForOwner(UUID storeId, UUID userId) {
        return jdbc.queryForObject("""
            SELECT s.id, s.application_id, s.name, s.slug, s.description, s.phone, s.address,
                   s.status, m.role AS membership_role, s.created_at
            FROM platform_identity.stores s
            JOIN platform_identity.store_memberships m ON m.store_id = s.id
            WHERE s.id = ? AND m.user_id = ? AND m.active = TRUE
            """, (rs, n) -> storeRow(rs), storeId, userId);
    }

    private VendorDtos.StoreResponse storeRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new VendorDtos.StoreResponse(
            rs.getObject("id", UUID.class), rs.getObject("application_id", UUID.class),
            rs.getString("name"), rs.getString("slug"), rs.getString("description"),
            rs.getString("phone"), rs.getString("address"), rs.getString("status"),
            rs.getString("membership_role"), rs.getObject("created_at", OffsetDateTime.class));
    }

    private SessionPrincipal principal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionPrincipal p))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "লগইন করুন।");
        return p;
    }

    private String slug(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKD)
            .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "store" : normalized.substring(0, Math.min(130, normalized.length()));
    }

    private record ApplicationRow(UUID id, UUID applicantId, String businessName,
                                  String phone, String address, String status) {}
}
