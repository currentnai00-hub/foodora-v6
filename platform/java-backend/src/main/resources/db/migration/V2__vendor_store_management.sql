-- Keep customer identity separate from vendor authorization.
-- ADMIN is a platform-level permission; vendor access is granted per store via memberships.
ALTER TABLE platform_identity.users DROP CONSTRAINT users_role_check;
ALTER TABLE platform_identity.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'ADMIN'));

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
);

CREATE INDEX vendor_applications_status_created_idx
  ON platform_identity.vendor_applications(status, created_at);

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
  CONSTRAINT stores_phone_format CHECK (CHAR_LENGTH(phone) = 11 AND phone LIKE '01%')
);

CREATE TABLE platform_identity.store_memberships (
  store_id UUID NOT NULL REFERENCES platform_identity.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES platform_identity.users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, user_id)
);

CREATE INDEX store_memberships_user_active_idx
  ON platform_identity.store_memberships(user_id, active);
