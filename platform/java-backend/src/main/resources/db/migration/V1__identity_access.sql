CREATE SCHEMA IF NOT EXISTS platform_identity;

CREATE TABLE platform_identity.users (
 id UUID PRIMARY KEY,
 full_name VARCHAR(80) NOT NULL,
 phone VARCHAR(11) NOT NULL UNIQUE,
 password_hash VARCHAR(100) NOT NULL,
 role VARCHAR(24) NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER')),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT users_phone_format CHECK (CHAR_LENGTH(phone) = 11 AND phone LIKE '01%')
);

CREATE TABLE platform_identity.sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES platform_identity.users(id) ON DELETE CASCADE,
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_user_expiry_idx ON platform_identity.sessions(user_id, expires_at);
CREATE INDEX sessions_expiry_idx ON platform_identity.sessions(expires_at);
