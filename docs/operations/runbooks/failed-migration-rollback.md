# Failed Migration and Rollback Runbook

Owner: Engineering. Reviewed: 2026-10-14.

## Purpose and limits

This runbook covers a failed database migration during Phase 1 and the controlled rollback of the first, additive core-metadata migration. The migration runner executes each SQL file and its ledger update in one PostgreSQL transaction. A failed `up` file therefore rolls back its partial DDL and leaves no applied ledger row; an explicit rollback uses the matching `.down.sql` file and removes the ledger row in the same transaction.

The automated exercise uses a newly generated, isolated schema inside a database whose name is explicitly limited to `boro_biya_dev`, `boro_biya_ci`, or `boro_biya_test`. It creates and drops only that schema. It does not prove backup restoration, production rollback safety, or rollback of future data-bearing migrations. For a production incident, do not run the exercise command against a production database.

## Detection

- Migration process exits non-zero and reports a stable migration error code such as `MIGRATION_APPLY_FAILED`, `MIGRATION_ROLLBACK_FAILED`, or `MIGRATION_CHECKSUM_MISMATCH`.
- API `/readyz` is unavailable while the database cannot satisfy `SELECT 1`.
- Check the deployment or CI log for the migration ID and error class. Do not copy connection strings, SQL values, row data, or full environment dumps into an incident ticket.

## Containment

1. Stop the deployment or migration job. Do not repeatedly retry an unknown migration failure.
2. Pause application writes and any other migration runner pointed at the same database. Keep the existing service version in place if it remains safe to do so.
3. Record the commit SHA, migration ID, migration command, exit status, UTC time, database name, and the relevant redacted log excerpt.
4. Confirm the target database and schema with the database owner. Confirm that a current backup exists before considering a rollback outside a disposable development/test database.
5. Notify the engineering incident owner and the database operator. Escalate to the project owner before any rollback that could discard data.

## Recovery procedure

### Disposable Phase 1 development/test database

Use the scripted exercise to verify the installed migration pair end to end. It refuses production mode, requires an explicit confirmation, checks the database name, works in a random schema, and removes that schema on success or failure.

```bash
bun run build:server
ROLLBACK_EXERCISE_CONFIRM=disposable bun run ops:exercise-rollback
```

PowerShell 7 equivalent:

```powershell
bun run build:server
$env:ROLLBACK_EXERCISE_CONFIRM = 'disposable'
bun run ops:exercise-rollback
Remove-Item Env:ROLLBACK_EXERCISE_CONFIRM
```

The command also requires `DATABASE_URL` to point to a disposable database with an allowed name. It prints no connection string or password. Do not set the confirmation variable for a production process.

### An interrupted migration on a real development database

1. Inspect migration state with `bun run db:status`; preserve its output with the incident record.
2. If the `up` migration failed, the transaction should have left no partial DDL or ledger entry. Verify both before proceeding. Fix the cause with a new migration or a reviewed correction; never edit an already-applied migration file because its checksum is part of the ledger.
3. If the migration applied but the release must be reversed, review the matching `.down.sql` and its data-loss effect with the database owner. Take and verify a backup first if the database contains data that matters.
4. Run `bun run db:rollback` only after the target database, migration order, backup, and rollback effect have been approved. The default reverses one latest migration; an optional positive count reverses that many latest migrations.
5. Run `bun run db:status`, verify the expected schema and application readiness, then deploy or restore the previously approved service version.
6. If the rollback fails, the transaction leaves the migration and ledger unchanged. Stop; do not edit the production ledger or run hand-written compensating SQL without an approved incident plan.

The Phase 1 `0001_core_metadata.down.sql` drops `service_metadata`. It is safe only while that table is still the empty foundation table. If it contains data or later migrations depend on it, stop and use a reviewed forward-fix or a separately approved recovery plan instead of applying the down file.

## Verification

- Migration status matches the expected set and checksums.
- The schema contains exactly the expected objects; the first down migration removes `service_metadata` only when it is empty and dependency-free.
- The API `/readyz` returns `200` after PostgreSQL is available and the application is restarted.
- No request or user data, credentials, or connection strings appear in logs or the exercise transcript.
- The exercise schema was removed; no application schema was changed by the scripted test.

## Notification and follow-up

Notify the incident owner, database operator, and project owner of the outcome. Attach the sanitized command transcript and test/CI run reference. Record the failure cause, any data-loss assessment, the commit SHA, the migration/checksum state, and the follow-up action. Update this runbook only alongside a tested migration or recovery behaviour change; keep the exercise record in `docs/operations/`.

## Phase 1 exercise status

The runbook is written; an actual exercise is not claimed until the disposable-database command has completed with exit status 0 and its timestamp, commit, environment, transcript, and CI/local run reference have been recorded separately. The exercise covers the empty Phase 1 metadata migration, not backup restoration or production data recovery.
