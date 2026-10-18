-- Explicit destructive development reversal only; no runtime deletion or rewriting path.
DROP TRIGGER audit_integrity ON core.audit_events;
DROP FUNCTION core.append_audit_chain();
DROP FUNCTION core.audit_payload(core.audit_events);
DROP TABLE core.audit_chain_head;
ALTER TABLE core.audit_events DROP COLUMN chain_index,DROP COLUMN previous_hash,DROP COLUMN event_hash;
