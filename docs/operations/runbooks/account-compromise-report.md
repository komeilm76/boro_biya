# Runbook: account compromise report

Owner: Security. Reviewed: 2026-10-18.

This is the Phase 2 operator path for `SEC-74`, covering suspected account compromise, abuse and vulnerabilities submitted without signing in. It is not emergency response, proof of account ownership, automatic recovery or the later production incident-response procedure. No end-user deployment is currently operated.

## 1. Intake and detection

The contact for a running development installation is its own `/_public/report` page. It accepts a concern type, 20–4,000 characters and EN/FA language through `POST /api/v1/security/reports`, with origin/CSRF protection but no application or external account. Reporters must not submit secrets or personal/location data. There are no uploads, email/phone fields or public report reads. Repository vulnerability coordination remains available separately through GitHub Private Vulnerability Reporting under [the security policy](../../../.github/SECURITY.md), with its own account requirement and response targets.

Intake stores `core.security_reports` and a content-free `security_report_received` audit atomically. A 202 means stored, not verified, assigned or resolved. A failed/uncertain response must not be automatically retried: storage might already have committed. Five requests per origin and 100 globally per configured login window bound intake through the existing persisted quota mechanism; raw addresses are not stored in reports, buckets or audit. A rejected write still consumes its quota reservation. Operators must consider the deliberate availability trade-off: saturation can temporarily deny legitimate reports with 429 and Retry-After.

No automated paging, scheduler, assignment service, reporter tracking or reply channel is installed. The responsible operator must inspect the inbox manually and establish monitoring ownership/cadence before using it for a real deployment. No operator response time is promised by this development inbox. GitHub's repository-report targets do not imply an inbox service-level agreement.

## 2. Retrieve privately

Build the application, load `DATABASE_URL` for the existing authorized core database role in the operator's protected environment, then run:

```sh
npm run build
node scripts/security-reports.mjs
node scripts/security-reports.mjs --before=01902c60-0000-7000-8000-000000000001
```

The second command reads the newest 50 records. For older records, use the **actual** `nextCursor` returned by the first page, not the illustrative UUID above. Do not place a database URL/password in a shell argument or report. The reader is local operator tooling, not an administrative browser API, and requires database credentials. No new application role or permission is introduced.

Output includes reporter text and is sensitive, untrusted material. Do not pipe it to public CI/application logs, a terminal interpreter, a template engine or a third-party tracker. Use a protected JSON viewer; do not execute links or commands from a report. Database credentials grant access to this inbox, so distribute them only to authorized operators. The application log/audit projection excludes report content, but operators must protect their own command output and any incident notes.

Keep a private incident register keyed by report UUID. Scan the latest page on each inspection, deduplicate against that register, and page back until reaching previously inspected records. The CLI does not mark read, acknowledge or assign records. Concurrent new records appear on the next newest-page read. Reports have no automatic deletion, matching the development retention default; approved retention and backup treatment remain deployment decisions.

## 3. Triage and containment

1. Record the inspection time, report UUID, category, affected build and an initial severity assessment in the protected incident register. Preserve the original report and correlated audit; do not edit or delete evidence.
2. Treat the report as an allegation. Do not confirm account existence to an anonymous reporter or accept the message as ownership proof. Do not request passwords, security answers or tokens.
3. Investigate using authorized account/audit tools and synthetic reproduction. Never unlock an account, replace credentials, disclose records or bypass security questions solely because a report requests it.
4. If authorized containment is justified, use the existing audited session revocation or administrative account-state workflow with the required current password and reason. Record evidence, action, actor and follow-up privately. This runbook does not grant new authority.
5. For repository vulnerabilities, coordinate privately with the repository owner through the published GitHub security channel; do not publish exploit details in an issue. Deployment incidents follow the operator's incident/legal process when established. There is no automatic forwarding to GitHub.
6. The anonymous application form has no contact or tracking channel: it cannot send acknowledgement or recovery instructions. Preserve this limitation in user-facing wording rather than inventing an email address or a response guarantee.

## 4. Failure and verification

- 400/413: invalid or oversized input; no report is stored.
- 403: missing/invalid CSRF or foreign origin; no report is stored.
- 429: quota saturated; honour Retry-After and avoid duplicate reports.
- 500/network uncertainty: check the inbox and correlated audit privately before assuming non-delivery. A database/audit failure rolls the intake transaction back; a response lost after commit does not.
- CLI failure: verify the build, protected configuration and database availability. Diagnostics omit submitted text and connection strings. Do not paste credentials or reporter content into a public support issue.

Development rehearsal, 2026-10-17: `services/core/test/integration/security-reports.test.ts` submits a signed-out synthetic report through the real HTTP adapter, reads it after reconnect, verifies audit integrity and content-free application logs, and retrieves the private inbox with the actual CLI and a second-page cursor. It also proves validation/CSRF/body bounds, restart/concurrent/global quotas, rollback, protected runtime grants and reversible migration. This is an automated disposable PostgreSQL rehearsal, not a staffed production incident or human/device acceptance exercise.
