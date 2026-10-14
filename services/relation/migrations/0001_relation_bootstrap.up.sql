-- Owner: Relation Service (OPS-20). Reversible bootstrap of the relation schema (OPS-17).
CREATE SCHEMA IF NOT EXISTS relation;

GRANT USAGE ON SCHEMA relation TO boro_relation;

ALTER DEFAULT PRIVILEGES IN SCHEMA relation
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boro_relation;

ALTER DEFAULT PRIVILEGES IN SCHEMA relation
  GRANT USAGE, SELECT ON SEQUENCES TO boro_relation;
