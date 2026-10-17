-- Development reversal destroys restricted setup state; never a production recovery path.
DELETE FROM core.role_permissions WHERE permission_id IN (SELECT id FROM core.permissions WHERE key = 'users.create');
DELETE FROM core.permissions WHERE key = 'users.create';
DROP TABLE core.account_setup_flows;
ALTER TABLE core.users DROP COLUMN setup_credential_consumed_at;
ALTER TABLE core.users DROP COLUMN setup_credential_expires_at;
