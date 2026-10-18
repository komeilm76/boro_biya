-- Application-owned authentication alerts, independent of the accepted logger/metrics.
CREATE TABLE core.security_alert_rules (
 key text PRIMARY KEY,
 action text NOT NULL UNIQUE,
 threshold smallint NOT NULL CHECK (threshold BETWEEN 1 AND 30),
 window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 3600),
 cooldown_seconds integer NOT NULL CHECK (cooldown_seconds BETWEEN 1 AND 3600)
);
INSERT INTO core.security_alert_rules VALUES
 ('authentication_failure_rate','login_failed',10,300,300),
 ('rate_limit_saturation','rate_limit_denied',5,300,300),
 ('authorization_failure_rate','authorization_denied',5,300,300);
CREATE TABLE core.security_signal_state (
 rule_key text PRIMARY KEY REFERENCES core.security_alert_rules(key),
 attempted_at timestamptz[] NOT NULL DEFAULT '{}' CHECK (cardinality(attempted_at) <= 30),
 next_alert_at timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE TABLE core.security_alerts (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 rule_key text NOT NULL REFERENCES core.security_alert_rules(key),
 created_at timestamptz NOT NULL,
 window_started_at timestamptz NOT NULL,
 minimum_signals smallint NOT NULL CHECK (minimum_signals BETWEEN 1 AND 30),
 source_chain_index bigint NOT NULL CHECK (source_chain_index > 0),
 source_event_hash text NOT NULL CHECK (source_event_hash ~ '^[0-9a-f]{64}$')
);
REVOKE ALL ON core.security_alert_rules,core.security_signal_state,core.security_alerts FROM boro_core;
GRANT SELECT ON core.security_alert_rules,core.security_alerts TO boro_core;

CREATE FUNCTION core.detect_security_alert() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE rule core.security_alert_rules; signal_time timestamptz; state core.security_signal_state; alert_id uuid;
BEGIN
 SELECT * INTO rule FROM core.security_alert_rules WHERE action = NEW.action;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- INSERT audit already holds the global chain lock, serializing these signal decisions.
 signal_time := clock_timestamp();
 INSERT INTO core.security_signal_state(rule_key) VALUES (rule.key) ON CONFLICT DO NOTHING;
 SELECT * INTO state FROM core.security_signal_state WHERE rule_key = rule.key FOR UPDATE;
 state.attempted_at := ARRAY(SELECT t FROM unnest(state.attempted_at) t
   WHERE t > signal_time - rule.window_seconds * interval '1 second'
   ORDER BY t DESC LIMIT (rule.threshold - 1));
 state.attempted_at := array_append(state.attempted_at,signal_time);
 IF cardinality(state.attempted_at) >= rule.threshold AND state.next_alert_at <= signal_time THEN
   INSERT INTO core.security_alerts(rule_key,created_at,window_started_at,minimum_signals,source_chain_index,source_event_hash)
    VALUES (rule.key,signal_time,signal_time - rule.window_seconds * interval '1 second',rule.threshold,NEW.chain_index,NEW.event_hash)
    RETURNING id INTO alert_id;
   state.next_alert_at := signal_time + rule.cooldown_seconds * interval '1 second';
   INSERT INTO core.audit_events(actor_type,action,target_type,target_id,request_id,details)
    VALUES ('system','security_alert_raised','security_alert',alert_id,NEW.request_id,
     jsonb_build_object('rule',rule.key,'minimumSignals',rule.threshold,'windowSeconds',rule.window_seconds));
   -- Transactional wake-up hint only: durable records are authoritative after reconnect.
   PERFORM pg_notify('boro_security_alerts_v1',json_build_object('id',alert_id,'rule',rule.key)::text);
 END IF;
 UPDATE core.security_signal_state SET attempted_at = state.attempted_at,next_alert_at = state.next_alert_at WHERE rule_key = rule.key;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION core.detect_security_alert() FROM PUBLIC;
CREATE TRIGGER security_alert_detection AFTER INSERT ON core.audit_events
 FOR EACH ROW EXECUTE FUNCTION core.detect_security_alert();
