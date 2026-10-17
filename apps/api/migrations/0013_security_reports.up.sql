-- Anonymous operator intake: no user foreign key, network identifier, credential or public read route.
CREATE TABLE core.security_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  category text NOT NULL CHECK (category IN ('account_compromise','abuse','vulnerability')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 20 AND 4000 AND octet_length(message) <= 16000),
  locale text NOT NULL CHECK (locale IN ('en','fa')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Default-off retention: reports are not erased or edited through the application.
REVOKE UPDATE, DELETE ON core.security_reports FROM boro_core;
