-- Owner: core API. Persisted recovery proof/state; raw tokens and answers never stored here.
CREATE TABLE core.password_reset_challenges (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  account_key_hash text NOT NULL CHECK (account_key_hash ~ '^[0-9a-f]{64}$'),
  credential_fingerprint text,
  question_ids smallint[] NOT NULL CHECK (cardinality(question_ids) = 3),
  phase text NOT NULL DEFAULT 'challenge' CHECK (phase IN ('challenge', 'verified', 'consumed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 30),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  grant_hash text UNIQUE CHECK (grant_hash ~ '^[0-9a-f]{64}$'),
  grant_expires_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((phase = 'verified') = (grant_hash IS NOT NULL AND grant_expires_at IS NOT NULL))
);
CREATE INDEX password_reset_challenges_user_idx ON core.password_reset_challenges(user_id);
REVOKE DELETE ON core.password_reset_challenges FROM boro_core;

-- Core account-security notification slice; later phases extend payloads and delivery.
CREATE TABLE core.notifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recipient_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('password_reset', 'password_changed')),
  service_scope text NOT NULL DEFAULT 'core' CHECK (service_scope = 'core'),
  payload jsonb NOT NULL DEFAULT '{}' CHECK (payload = '{}'::jsonb),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '30 days'
);
CREATE INDEX notifications_recipient_idx ON core.notifications(recipient_id, created_at);
REVOKE DELETE ON core.notifications FROM boro_core;
