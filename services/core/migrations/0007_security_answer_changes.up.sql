-- Core account security notices contain no credentials or answer metadata.
ALTER TABLE core.notifications DROP CONSTRAINT notifications_event_type_check;
ALTER TABLE core.notifications ADD CONSTRAINT notifications_event_type_check
  CHECK (event_type IN ('password_reset', 'password_changed', 'security_answers_changed'));
