-- Owner: core API (OPS-20). Reversible bootstrap of the core schema (OPS-17).
-- Grants the least privilege the core service role needs; the migration ledger lives in this
-- schema and stays owned by the administrative migration role, because services never run
-- migrations with their own role (OPS-18).
CREATE SCHEMA IF NOT EXISTS core;

GRANT USAGE ON SCHEMA core TO boro_core;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boro_core;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT USAGE, SELECT ON SEQUENCES TO boro_core;
