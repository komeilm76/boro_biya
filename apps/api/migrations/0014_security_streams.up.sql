-- Persisted one-shot SSE admission; no raw ticket is retained or logged.
CREATE TABLE core.security_stream_tickets (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES core.sessions(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  access_expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= access_expires_at)
);
REVOKE DELETE ON core.security_stream_tickets FROM boro_core;
