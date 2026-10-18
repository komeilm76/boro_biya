-- Owner: core API. Central administrative capability vocabulary, not hard-coded role names.
INSERT INTO core.permissions(key, resource, action, description_key) VALUES
 ('users.read', 'users', 'read', 'permissions.usersRead'),
 ('users.state', 'users', 'state', 'permissions.usersState'),
 ('users.roles', 'users', 'roles', 'permissions.usersRoles'),
 ('roles.read', 'roles', 'read', 'permissions.rolesRead'),
 ('roles.manage', 'roles', 'manage', 'permissions.rolesManage'),
 ('audit.read', 'audit', 'read', 'permissions.auditRead');
INSERT INTO core.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM core.roles r CROSS JOIN core.permissions p
WHERE r.key = 'admin' AND p.key IN ('users.read','users.state','users.roles','roles.read','roles.manage','audit.read');
ALTER TABLE core.audit_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}'
 CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 16384);
