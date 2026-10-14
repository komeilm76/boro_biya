## What and why

<!-- One paragraph: what changes, and which requirement(s) it satisfies. -->

Requirement IDs: <!-- e.g. AUTH-13, SEC-22 — see docs/development/07-traceability.md -->

## Scope

- Phase (see `docs/ROADMAP.md`):
- Areas touched:
- Out of scope for this pull request:

## Gates actually run

| Gate                  | Command                         | Result                                               |
| --------------------- | ------------------------------- | ---------------------------------------------------- |
| Documentation (QA-01) | `node scripts/gates/phase0.mjs` | <!-- passed / failed / not run, with exit status --> |
| <!-- gate -->         | <!-- command -->                | <!-- exit status -->                                 |

<!-- A gate that was not run is written as "not run" with the reason. Do not claim a gate passed without an exit status. -->

## Checklist

- [ ] Requirement IDs listed above, and affected acceptance criteria updated.
- [ ] No secrets, tokens, or real user data in source, logs, fixtures, screenshots, or commit messages.
- [ ] Server-side authorization implemented and tested for every affected operation.
- [ ] Validation and error behaviour tested, including a negative case.
- [ ] Migrations and indexes reviewed (if the database changed).
- [ ] OpenAPI contract and generated client updated (if the API changed).
- [ ] Documentation and JSDoc updated in the same change.
- [ ] Traceability regenerated (`node scripts/gates/traceability.mjs --write`) if requirements changed.
- [ ] Resource and performance implications reviewed against current budgets.
- [ ] No unapproved dependency or licence change.
- [ ] Security-sensitive change reviewed by a second reviewer, or self-reviewed with that stated.

## Known risks and follow-ups

<!-- Include anything deferred, with the issue or decision that tracks it. -->
