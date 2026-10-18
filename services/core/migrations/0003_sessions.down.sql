-- Owner: core API. Development reversal (QA-15); destroys sessions and signs everyone out.
DROP TABLE core.sessions;
DROP TABLE core.session_families;
