-- Application audit integrity, not logging infrastructure. Existing records form a trusted
-- migration baseline, not a claim that pre-migration history was independently verified.
ALTER TABLE core.audit_events
 ADD COLUMN chain_index bigint,
 ADD COLUMN previous_hash text,
 ADD COLUMN event_hash text;

CREATE FUNCTION core.audit_payload(event core.audit_events) RETURNS text
 LANGUAGE sql STABLE STRICT SET search_path = pg_catalog AS $$
 SELECT jsonb_build_array('boro-audit-v1', event.chain_index::text, event.previous_hash,
   event.id::text, event.actor_id::text, event.actor_type, event.action, event.target_type,
   event.target_id::text, event.request_id,
   to_char(event.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), event.details)::text
$$;
REVOKE ALL ON FUNCTION core.audit_payload(core.audit_events) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.audit_payload(core.audit_events) TO boro_core;

CREATE TABLE core.audit_chain_head (
 singleton boolean PRIMARY KEY CHECK (singleton),
 last_index bigint NOT NULL CHECK (last_index >= 0),
 last_hash text NOT NULL CHECK (last_hash ~ '^[0-9a-f]{64}$')
);
REVOKE ALL ON core.audit_chain_head FROM boro_core;
GRANT SELECT ON core.audit_chain_head TO boro_core;
INSERT INTO core.audit_chain_head VALUES (true, 0, repeat('0',64));

DO $$
DECLARE event core.audit_events; position bigint := 0; previous text := repeat('0',64);
BEGIN
 FOR event IN SELECT * FROM core.audit_events ORDER BY created_at,id LOOP
   position := position + 1;
   event.chain_index := position;
   event.previous_hash := previous;
   event.event_hash := encode(sha256(convert_to(core.audit_payload(event),'UTF8')),'hex');
   UPDATE core.audit_events SET chain_index = event.chain_index,
     previous_hash = event.previous_hash, event_hash = event.event_hash WHERE id = event.id;
   previous := event.event_hash;
 END LOOP;
 UPDATE core.audit_chain_head SET last_index = position, last_hash = previous WHERE singleton;
END $$;
ALTER TABLE core.audit_events
 ALTER COLUMN chain_index SET NOT NULL,
 ALTER COLUMN previous_hash SET NOT NULL,
 ALTER COLUMN event_hash SET NOT NULL,
 ADD CONSTRAINT audit_chain_index_unique UNIQUE(chain_index),
 ADD CONSTRAINT audit_chain_index_positive CHECK (chain_index > 0),
 ADD CONSTRAINT audit_previous_hash_shape CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT audit_event_hash_shape CHECK (event_hash ~ '^[0-9a-f]{64}$');

CREATE FUNCTION core.append_audit_chain() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE head core.audit_chain_head;
BEGIN
 SELECT * INTO head FROM core.audit_chain_head WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'audit chain unavailable'; END IF;
 -- Caller-supplied chain fields are always replaced. The lock is held through commit.
 NEW.chain_index := head.last_index + 1;
 NEW.previous_hash := head.last_hash;
 NEW.event_hash := encode(sha256(convert_to(core.audit_payload(NEW),'UTF8')),'hex');
 UPDATE core.audit_chain_head SET last_index = NEW.chain_index,last_hash = NEW.event_hash WHERE singleton;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION core.append_audit_chain() FROM PUBLIC;
CREATE TRIGGER audit_integrity BEFORE INSERT ON core.audit_events
 FOR EACH ROW EXECUTE FUNCTION core.append_audit_chain();
