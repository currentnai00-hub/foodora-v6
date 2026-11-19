package db.migration;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Vendor/store schema migration.
 *
 * V1 intentionally remains immutable. The original inline role CHECK constraint
 * receives a database-generated name, which differs between PostgreSQL and H2.
 * Resolve that name from database metadata before replacing the allowed roles.
 */
public class V2__VendorStoreManagement extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        String constraint = findCustomerOnlyRoleConstraint(connection);
        if (constraint == null || constraint.isBlank()) {
            throw new FlywayException("Could not locate the CUSTOMER-only role constraint on platform_identity.users");
        }

        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE platform_identity.users DROP CONSTRAINT " + quoteIdentifier(constraint));
            statement.execute("""
                ALTER TABLE platform_identity.users
                ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'ADMIN'))
                """);

            statement.execute("""
                CREATE TABLE platform_identity.vendor_applications (
                  id UUID PRIMARY KEY,
                  applicant_user_id UUID NOT NULL UNIQUE REFERENCES platform_identity.users(id),
                  business_name VARCHAR(120) NOT NULL,
                  contact_name VARCHAR(80) NOT NULL,
                  contact_phone VARCHAR(11) NOT NULL,
                  business_address VARCHAR(300) NOT NULL,
                  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW'
                    CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
                  review_note VARCHAR(500),
                  reviewed_by UUID REFERENCES platform_identity.users(id),
                  reviewed_at TIMESTAMP WITH TIME ZONE,
                  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT vendor_application_phone_format
                    CHECK (CHAR_LENGTH(contact_phone) = 11 AND contact_phone LIKE '01%')
                )
                """);
            statement.execute("""
                CREATE INDEX vendor_applications_status_created_idx
                ON platform_identity.vendor_applications(status, created_at)
                """);
            statement.execute("""
                CREATE TABLE platform_identity.stores (
                  id UUID PRIMARY KEY,
                  application_id UUID NOT NULL UNIQUE
                    REFERENCES platform_identity.vendor_applications(id),
                  owner_user_id UUID NOT NULL REFERENCES platform_identity.users(id),
                  name VARCHAR(120) NOT NULL,
                  slug VARCHAR(150) NOT NULL UNIQUE,
                  description VARCHAR(500) NOT NULL DEFAULT '',
                  phone VARCHAR(11) NOT NULL,
                  address VARCHAR(300) NOT NULL,
                  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'SUSPENDED')),
                  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  CONSTRAINT stores_phone_format
                    CHECK (CHAR_LENGTH(phone) = 11 AND phone LIKE '01%')
                )
                """);
            statement.execute("""
                CREATE TABLE platform_identity.store_memberships (
                  store_id UUID NOT NULL REFERENCES platform_identity.stores(id) ON DELETE CASCADE,
                  user_id UUID NOT NULL REFERENCES platform_identity.users(id) ON DELETE CASCADE,
                  role VARCHAR(16) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
                  active BOOLEAN NOT NULL DEFAULT TRUE,
                  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (store_id, user_id)
                )
                """);
            statement.execute("""
                CREATE INDEX store_memberships_user_active_idx
                ON platform_identity.store_memberships(user_id, active)
                """);
        }
    }

    private String findCustomerOnlyRoleConstraint(Connection connection) throws SQLException {
        String product = connection.getMetaData().getDatabaseProductName().toLowerCase();
        String sql;
        if (product.contains("h2")) {
            sql = """
                SELECT tc.CONSTRAINT_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                  ON cc.CONSTRAINT_CATALOG = tc.CONSTRAINT_CATALOG
                 AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                 AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                WHERE tc.CONSTRAINT_SCHEMA = 'PLATFORM_IDENTITY'
                  AND tc.TABLE_NAME = 'USERS'
                  AND tc.CONSTRAINT_TYPE = 'CHECK'
                  AND UPPER(cc.CHECK_CLAUSE) LIKE '%ROLE%'
                  AND UPPER(cc.CHECK_CLAUSE) LIKE '%CUSTOMER%'
                """;
        } else {
            sql = """
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = 'platform_identity'
                  AND t.relname = 'users'
                  AND c.contype = 'c'
                  AND pg_get_constraintdef(c.oid) ILIKE '%role%'
                  AND pg_get_constraintdef(c.oid) ILIKE '%CUSTOMER%'
                """;
        }
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {
            if (!result.next()) return null;
            String name = result.getString(1);
            if (result.next()) {
                throw new FlywayException("Found multiple CUSTOMER-only role constraints; refusing ambiguous migration");
            }
            return name;
        }
    }

    private String quoteIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }
}
