-- Destructive development reversal; the existing administrative runner owns this operation.
ALTER TABLE core.audit_events DROP COLUMN details;
DELETE FROM core.role_permissions WHERE permission_id IN (SELECT id FROM core.permissions WHERE key IN ('users.read','users.state','users.roles','roles.read','roles.manage','audit.read'));
DELETE FROM core.permissions WHERE key IN ('users.read','users.state','users.roles','roles.read','roles.manage','audit.read');
