-- Reversal of 0001_core_bootstrap (QA-15). The cluster-level role intentionally survives:
-- role lifecycle belongs to the cluster bootstrap, not to a single service's migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM boro_core;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  REVOKE USAGE, SELECT ON SEQUENCES FROM boro_core;

REVOKE USAGE ON SCHEMA core FROM boro_core;

DROP SCHEMA IF EXISTS core CASCADE;
