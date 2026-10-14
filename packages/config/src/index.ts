// Validated environment configuration (OPS-36). Startup fails on missing or invalid variables
// with clear, non-secret diagnostics (OPS-53). Server-only: this package reads process.env and
// must never be imported by the frontend (OPS-41).
export * from './env-file.js';
export * from './errors.js';
export * from './placeholders.js';
export * from './server-config.js';
