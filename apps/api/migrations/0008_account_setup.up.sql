-- Owner: core API. Restricted first-login proofs never authorize normal features.
ALTER TABLE core.users ADD COLUMN setup_credential_expires_at timestamptz;
ALTER TABLE core.users ADD COLUMN setup_credential_consumed_at timestamptz;
CREATE TABLE core.account_setup_flows (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  credential_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX account_setup_flows_user_idx ON core.account_setup_flows(user_id);
REVOKE DELETE ON core.account_setup_flows FROM boro_core;
INSERT INTO core.permissions(key, resource, action, description_key)
VALUES ('users.create', 'users', 'create', 'permissions.usersCreate');
INSERT INTO core.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p WHERE r.key = 'admin' AND p.key = 'users.create';
