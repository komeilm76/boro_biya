-- Owner: core API. Phase 2 identity foundation (AUTH-09, AUTH-27, AUTH-39, ADM-06).
-- Applied by the existing administrative runner, never by the runtime role (OPS-18).
CREATE TABLE core.users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  username_normalized text NOT NULL UNIQUE,
  username_display text NOT NULL,
  username_normalization_version smallint NOT NULL DEFAULT 1 CHECK (username_normalization_version = 1),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  password_normalized_policy_version smallint NOT NULL DEFAULT 1 CHECK (password_normalized_policy_version > 0),
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'locked', 'banned', 'deactivated')),
  locked_until timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  failed_login_window_started_at timestamptz,
  password_setup_required boolean NOT NULL,
  security_setup_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  state_reason text,
  state_actor_id uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  CHECK (char_length(username_normalized) BETWEEN 3 AND 64),
  CHECK (char_length(username_display) BETWEEN 3 AND 64),
  CHECK (account_status <> 'locked' OR locked_until IS NOT NULL),
  CHECK (account_status NOT IN ('banned', 'deactivated') OR (state_reason IS NOT NULL AND char_length(trim(state_reason)) > 0))
);

CREATE TABLE core.roles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  name_key text NOT NULL,
  seeded boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.permissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  resource text NOT NULL,
  action text NOT NULL,
  description_key text NOT NULL,
  CHECK (key = resource || '.' || action)
);

CREATE TABLE core.role_permissions (
  role_id uuid NOT NULL REFERENCES core.roles(id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES core.permissions(id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE core.user_roles (
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES core.roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_id_idx ON core.user_roles(role_id);
CREATE INDEX role_permissions_permission_id_idx ON core.role_permissions(permission_id);

INSERT INTO core.roles(key, name_key, seeded) VALUES
  ('admin', 'roles.admin', true), ('user', 'roles.user', true);

-- Deactivation is not erasure (AUTH-34). There is no runtime account-deletion privilege.
REVOKE DELETE ON core.users FROM boro_core;
