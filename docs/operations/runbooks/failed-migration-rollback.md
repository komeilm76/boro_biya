# Runbook: failed migration and rollback

Owner: Engineering. Reviewed: 2026-10-14.

First runbook of the register in [operations/README.md](../README.md) — the `OPS-81` slice
declared as a pull-forward into Phase 1 under `GOV-88`, because the first migration needs a
rollback procedure before any data can be lost. It covers the migration framework of
`packages/db` (versioned, transactional, checksummed; `OPS-20`, `QA-15`, `QA-49`) against the
schema-per-service cluster (`OPS-17`, `OPS-18`).

## When to use this runbook

- `bun run db:migrate` (or the Compose `migrate` job) exits non-zero.
- `bun run db:status` shows an unexpected pending or applied migration, or a checksum mismatch.
- A deployed migration produced a schema state that must be reversed while the fix is prepared.

## 1. Detection

The runner fails loudly and never partially applies:

- every migration runs inside a transaction with its ledger row, so a failed migration leaves
  **no partial state** — the transaction rolls back and the ledger is unchanged;
- an applied migration whose file changed afterwards is rejected as a checksum mismatch
  (`QA-49`): applied migrations are immutable, fixes go into a **new** migration;
- the exit code is non-zero and the failing migration is named (`NNNN_name`) with the
  PostgreSQL error.

Check the current state at any time:

```sh
bun run db:status                          # all three services
node scripts/db/run.mjs status --service core
```

Connection strings are printed redacted; a password never appears in this output (`SEC-13`).

## 2. Containment

1. **Stop deploying.** A failed migration blocks the release pipeline by design (non-zero exit);
   do not retry blindly against production — retries are safe (the runner is idempotent) but the
   cause must be read first.
2. **Keep the previous application version running.** Migrations are applied by the one-shot
   `migrate` job before services start; when it fails, the old services keep serving the old
   schema, which every migration must remain compatible with for at least one step back.
3. If the failure happened **mid-deployment** in Compose: `docker compose ps` shows `migrate`
   exited; `api`, `relation`, `sos` never restarted (they wait for `service_completed_successfully`).

## 3. Procedure

### 3a. The migration failed and left no state (most common)

Fix forward: correct the migration file (or replace it with a new version), then re-apply.

```sh
# edit or add apps/api/migrations/NNNN_name.{up,down}.sql (or the service's own directory)
bun run db:migrate          # re-runs; already-applied migrations are skipped by the ledger
bun run db:status           # confirm the fix applied
```

### 3b. An applied migration must be reversed

```sh
node scripts/db/run.mjs down --service core --steps 1   # reverse the newest applied migration
node scripts/db/run.mjs down --service core --to 1      # or: reverse everything above version 1
bun run db:status                                       # verify the ledger
```

Each reversal runs in one transaction with its ledger delete: either the schema change and the
ledger row both go, or neither does. The bootstrap migrations reverse completely (their `down`
drops the service schema, ledger included); roles survive by design — role lifecycle belongs to
the cluster bootstrap, not to a single service's migrations.

### 3c. Checksum mismatch

Never edit an applied migration to "match". Either restore the applied file (deployments carry
the exact commit — `git show <deployed-sha>:apps/api/migrations/NNNN_name.up.sql`), or reverse
the migration (3b) and apply the corrected version as a new one. The runner refuses both `up`
and `down` on a mismatched file until the discrepancy is resolved — this is fail-closed, not a
bug to route around.

## 4. Verification

After any procedure above:

```sh
bun run db:status                                   # ledger matches the files on disk
curl -fsS http://localhost:3000/readyz              # {"status":"ready",...,"checks":{"database":true}}
curl -fsS http://localhost:3001/readyz              # relation service
curl -fsS http://localhost:3002/readyz              # sos service
bun run test:integration                            # migration + permission tests against disposable PostgreSQL 18
```

In Compose: `docker compose ps` shows `migrate` exited 0 and all services healthy.

## 5. Notification

- Development: record the incident and resolution in the pull request that introduced the
  migration; the gate transcript shows the failure and the recovery.
- Any deployment beyond a developer machine: notify the repository owner before reversing an
  applied migration, and again after verification. Reversal of a migration that ever touched
  real user data additionally requires the owner's explicit approval — this runbook's Phase 1
  exercise ran against a disposable development database with no user data in existence.

## 6. Follow-up

Every use of section 3b or 3c produces:

1. a regression test reproducing the original failure (the integration suite runs against
   disposable PostgreSQL 18 on Linux **and** Windows — `QA-06`, `QA-70`);
2. an entry in the register row of [operations/README.md](../README.md) updating "Last
   exercised";
3. where the cause was a reviewed migration that still failed, a note in the phase report's
   residual-risk section.

## Exercise record

Exercised once on 2026-10-14 against the disposable development database (embedded PostgreSQL
18.4, `var/pg-dev`, no Docker): a deliberately broken migration was applied and left no partial
state (transaction rollback proven by inspecting the schema and ledger), a valid migration was
applied and reversed with `--steps 1` (table gone, ledger back to `0001`), and all three
services reported `ready` afterwards. The full transcript is in the
[Phase 1 report](../../development/09-phase-1-report.md).
