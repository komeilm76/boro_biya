-- Reversal of 0001_relation_bootstrap (QA-15). The cluster-level role intentionally survives.
ALTER DEFAULT PRIVILEGES IN SCHEMA relation
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM boro_relation;

ALTER DEFAULT PRIVILEGES IN SCHEMA relation
  REVOKE USAGE, SELECT ON SEQUENCES FROM boro_relation;

REVOKE USAGE ON SCHEMA relation FROM boro_relation;

DROP SCHEMA IF EXISTS relation CASCADE;
