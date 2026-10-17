-- Self-hosted computational challenges. No user/profile references or raw network identifiers.
CREATE TABLE core.captcha_challenges (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  origin_hash text NOT NULL CHECK (origin_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('login','register','recovery','setup')),
  work_bits smallint NOT NULL CHECK (work_bits BETWEEN 12 AND 20),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  solved_at timestamptz,
  grant_hash text UNIQUE CHECK (grant_hash ~ '^[0-9a-f]{64}$'),
  grant_expires_at timestamptz,
  grant_consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((grant_hash IS NULL) = (grant_expires_at IS NULL)),
  CHECK (grant_expires_at IS NULL OR grant_expires_at <= expires_at)
);
CREATE INDEX captcha_challenges_expiry_idx ON core.captcha_challenges(expires_at);
