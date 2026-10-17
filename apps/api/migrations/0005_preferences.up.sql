-- Owner: core API. Phase 2 explicit account locale (UI-28); later phases extend preferences.
CREATE TABLE core.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE RESTRICT,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fa')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
