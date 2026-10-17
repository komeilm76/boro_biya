// Typed API client for the frontend, validating every response against the shared contracts
// (OPS-35, API-23). Browser-safe: no server-only code, no secrets (OPS-41, OPS-43).
export * from './client.js';
export * from './auth-operation.js';
export * from './generated/auth.js';
