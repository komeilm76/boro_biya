// Pure fixtures and builders, safe for every workspace including the frontend (OPS-38).
// The PostgreSQL harness lives behind the `@boro-biya/test-utils/pg` subpath so browser-facing
// workspaces never resolve a database dependency.
export * from './builders.js';
