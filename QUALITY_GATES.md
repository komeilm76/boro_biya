# Quality Gates, CI, Testing, and Release

## 1. Required gates

Run gates locally and in CI. A gate must return a non-zero exit status on failure and must not be bypassable through a normal commit or pull request without an explicitly approved, audited exception.

1. Formatting check.
2. ESLint or equivalent static lint.
3. Strict TypeScript type check for every workspace.
4. Unit tests.
5. Integration tests with isolated PostgreSQL.
6. API/OpenAPI validation and contract tests.
7. Security tests for auth, authorization, account states, recovery, plugin archive handling, and location privacy.
8. Dependency vulnerability audit and license policy check.
9. Secret scanning.
10. Production builds for web, API, and plugin services.
11. PWA checks and Android build where the environment supports it.
12. Docker image/configuration checks.
13. Database migration tests and backup/restore smoke test for release candidates.
14. Documentation/link/structure checks as appropriate.

Use current supported versions of CI actions and pin actions to immutable commit SHAs where practical. Apply least-privilege workflow permissions. Do not expose secrets to untrusted pull-request code. Protect release signing credentials.

## 2. Testing strategy

### Unit
Pure domain rules, validation schemas, account-state transitions, task state machine, permission policies, route/provider adapters, config parsing.

### Integration
PostgreSQL constraints and transactions, login throttling, reset challenges, follow-request lifecycle, location authorization, task claiming races, notification persistence, plugin install state transitions.

### End-to-end
Registration, first-login setup, login/logout, password change/reset, account lockout, admin user management, follower privacy, SOS creation/dispatch/claim/resolve, plugin install/disable/rollback, map permission-denied/manual-coordinate flows.

### Security/negative
- User A cannot access User B's private location, SOS attachment, notification, task, session, or settings.
- Unaccepted follow requests never grant access.
- Unfollow or disable sharing stops future access.
- Banned/deactivated/locked/pending-setup users cannot enter protected features.
- Parallel claim attempts produce exactly one successful claimant.
- Replayed recovery grants and idempotency keys cannot repeat forbidden actions.
- Malicious ZIP traversal, symlink, bomb, duplicate path, and oversized files are rejected.
- Plugin containers cannot read host secrets or access arbitrary networks.
- Invalid OpenAPI/Zod input is rejected consistently.

## 3. Performance tests

Define target hardware and traffic profiles before setting numeric SLOs. Benchmark:
- API p50/p95/p99 latency by endpoint.
- Database pool saturation and query plans.
- Login/recovery under abuse traffic.
- Map viewport query and nearby-user search.
- SSE/WebSocket connection count, memory, reconnect storms, and backpressure.
- Image upload limits and processing.
- SOS claim contention.
- Resource footprint at idle and under load.

Keep results and environment details in `/docs/performance/`. Do not publish benchmark claims without reproducible test setup.

## 4. Pull request checklist

- [ ] Requirements/acceptance criteria updated.
- [ ] No secrets or sensitive data in source/logs.
- [ ] Server-side authorization tested.
- [ ] Validation and error behavior tested.
- [ ] Migrations/indexes reviewed where applicable.
- [ ] OpenAPI contract updated.
- [ ] Docs and JSDoc updated.
- [ ] All required gates actually ran and passed.
- [ ] Resource/performance implications reviewed.
- [ ] No unapproved dependency or license change.
- [ ] Security-sensitive changes reviewed by a second reviewer where feasible.

## 5. Release process

- Use SemVer for released packages/services where appropriate.
- Maintain a changelog and release notes.
- Build reproducible versioned artifacts and tag the exact commit.
- Produce web/PWA artifacts, API/container images, plugin images/packages, and Android APK/AAB as applicable.
- Keep signing keys and production credentials outside source control and normal CI logs.
- Run migration/rollback and backup/restore checks before production deployment.
- Publish an SBOM and artifact checksums when practical.
- Promote the same tested artifact through environments; do not rebuild untracked changes at deployment.
- Document deployment, health verification, rollback, and incident contacts.
