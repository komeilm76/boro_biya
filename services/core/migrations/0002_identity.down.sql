-- Owner: core API. Explicit reversal of the Phase 2 identity foundation (QA-15).
-- Destructive rollback: development/test only once identities exist; production rollback
-- requires a reviewed backup/forward-fix decision, never automatic deletion of accounts.
DROP TABLE core.user_roles;
DROP TABLE core.role_permissions;
DROP TABLE core.permissions;
DROP TABLE core.roles;
DROP TABLE core.users;
