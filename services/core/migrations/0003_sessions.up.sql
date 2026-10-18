-- Owner: core API. Rotating, revocable refresh-token persistence (ADR-021, SEC-08, SEC-10).
-- A family is a login/device session. Consumed generations remain as replay evidence.
CREATE TABLE core.session_families (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  CHECK (expires_at > issued_at),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL)),
  UNIQUE (id, user_id)
);
CREATE INDEX session_families_user_id_idx ON core.session_families(user_id);

CREATE TABLE core.sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL,
  family_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
  rotation_generation integer NOT NULL DEFAULT 0 CHECK (rotation_generation >= 0),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz,
  FOREIGN KEY (family_id, user_id) REFERENCES core.session_families(id, user_id) ON DELETE RESTRICT,
  UNIQUE (family_id, rotation_generation),
  CHECK (expires_at > issued_at)
);
-- Exactly one live generation; rotation consumes the old row before inserting its successor.
CREATE UNIQUE INDEX sessions_live_generation_idx ON core.sessions(family_id) WHERE consumed_at IS NULL;
CREATE INDEX sessions_user_id_idx ON core.sessions(user_id);
-- Token history is required for replay detection; runtime code cannot erase it.
REVOKE DELETE ON core.sessions, core.session_families FROM boro_core;
