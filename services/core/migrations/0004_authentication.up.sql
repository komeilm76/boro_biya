-- Owner: core API. Phase 2 authentication, security answers, audit and shared abuse state.
CREATE TABLE core.security_questions (
  id smallint PRIMARY KEY,
  text_key text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL UNIQUE
);
INSERT INTO core.security_questions(id, text_key, sort_order) VALUES
 (1, 'questions.firstBook', 1), (2, 'questions.childhoodGame', 2),
 (3, 'questions.favoriteTeacher', 3), (4, 'questions.memorablePlace', 4),
 (5, 'questions.favoriteCharacter', 5), (6, 'questions.firstConcert', 6),
 (7, 'questions.favoriteMeal', 7), (8, 'questions.childhoodDream', 8);
REVOKE INSERT, UPDATE, DELETE ON core.security_questions FROM boro_core;

CREATE TABLE core.user_security_answers (
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  question_id smallint NOT NULL REFERENCES core.security_questions(id) ON DELETE RESTRICT,
  answer_hash text NOT NULL CHECK (answer_hash LIKE '$argon2id$%'),
  normalization_version smallint NOT NULL CHECK (normalization_version = 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE core.audit_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_id uuid REFERENCES core.users(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'anonymous', 'system')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_events_created_at_idx ON core.audit_events(created_at, id);
REVOKE UPDATE, DELETE ON core.audit_events FROM boro_core;

-- One short bounded rolling-window timestamp array per keyed account/origin; no raw address.
CREATE TABLE core.auth_buckets (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz[] NOT NULL DEFAULT '{}',
  CHECK (cardinality(attempted_at) <= 300)
);
