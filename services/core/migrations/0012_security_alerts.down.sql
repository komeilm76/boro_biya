-- Explicit administrative development reversal, never an application deletion endpoint.
DROP TRIGGER security_alert_detection ON core.audit_events;
DROP FUNCTION core.detect_security_alert();
DROP TABLE core.security_alerts;
DROP TABLE core.security_signal_state;
DROP TABLE core.security_alert_rules;
