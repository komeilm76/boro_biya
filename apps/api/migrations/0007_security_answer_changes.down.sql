-- Development reversal cannot retain the new event under the older event constraint.
DELETE FROM core.notifications WHERE event_type = 'security_answers_changed';
ALTER TABLE core.notifications DROP CONSTRAINT notifications_event_type_check;
ALTER TABLE core.notifications ADD CONSTRAINT notifications_event_type_check
  CHECK (event_type IN ('password_reset', 'password_changed'));
