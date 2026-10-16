# Security Policy

Owner: Security. Reviewed: 2026-10-16.

This document defines how to report security vulnerabilities in `komeilm76/boro_biya`, what response to expect, and how reports are handled while the project is in pre-release development.

GitHub serves `.github/SECURITY.md` as the repository's security policy. The engineering security requirements baseline lives in [`docs/SECURITY.md`](../docs/SECURITY.md), the system and abuse threat model lives in [`docs/security/threat-model.md`](../docs/security/threat-model.md), and the data classification policy lives in [`docs/security/data-classification.md`](../docs/security/data-classification.md).

## 1. Reporting vulnerabilities

- **Reporting channel:** Report suspected security vulnerabilities privately through **GitHub Private Vulnerability Reporting** for this repository:
  - Open the repository's **Security** tab on GitHub and select **Report a vulnerability**, or go directly to `https://github.com/komeilm76/boro_biya/security/advisories/new` (also linked from `https://github.com/komeilm76/boro_biya/security/policy`).
  - GitHub Private Vulnerability Reporting is the **only supported vulnerability-reporting channel** for this repository. Do not rely on any email address, external reporting portal, or third-party contact channel; none is operated for this repository ([ADR-019](../docs/DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number)).
- **Account requirement:** Submitting a private report through GitHub Private Vulnerability Reporting requires signing in with a **GitHub account** and having access to this repository on GitHub. (The unauthenticated in-application reporting route for end users and suspected account compromise in a running product deployment is tracked separately under [SEC-74](../docs/SECURITY.md#9-observability-and-incident-response) for Phase 2 and is not present in the Phase 1 skeleton.)
- **Coordinated disclosure:** Do **not** disclose vulnerability details publicly — in GitHub issues, pull requests, discussions, commit comments, or external channels — before the report has been triaged and coordinated disclosure is agreed.
- **What to include in a report:** Provide enough actionable detail to reproduce and assess the issue without guesswork:
  1. **Affected version or commit:** the exact commit SHA on `main`, branch name, or non-production tag (such as `v0.1.0`), and the affected workspace or file path (`apps/api`, `apps/web`, `services/relation`, `services/sos`, `packages/*`, `docker/*`, `scripts/*`, or `.github/workflows/*`).
  2. **Impact:** what an attacker could achieve, which security control or asset in [`docs/SECURITY.md`](../docs/SECURITY.md) or [`docs/security/threat-model.md`](../docs/security/threat-model.md) is bypassed or threatened, and the realistic scope of exposure.
  3. **Reproduction steps:** minimal, deterministic steps, commands, HTTP requests, or proof-of-concept code that demonstrate the issue.
  4. **Prerequisites:** required runtime, environment configuration, account or role state, network conditions, or container setup.
  5. **Suggested mitigation:** a proposed fix, configuration change, or workaround when available.
- **What must never be included:** Do **not** include credentials, private keys, tokens, production secrets, real user data, real location coordinates, or unrelated sensitive information in a vulnerability report ([GOV-47](../docs/development/00-repository-conventions.md#2-repository-layout), [GOV-48](../docs/development/00-repository-conventions.md#2-repository-layout)). Use synthetic data and redacted placeholders only.
- **No bug bounty or guaranteed outcome:** This project does **not** offer a bug bounty or financial reward, and submitting a report does not guarantee a fix, a release schedule, or a response beyond the target commitments in §2.

## 2. Response commitments

For reports submitted through GitHub Private Vulnerability Reporting with actionable reproduction details, the repository owner has set the following target response commitments:

| Stage | Target commitment | What it covers |
| --- | --- | --- |
| **Acknowledgement** | Within **7 working days** | Confirmation inside the private GitHub security advisory that the report was received |
| **Triage and initial decision** | Within **21 working days** | Initial accept/reject decision on the report, including an initial severity assessment where applicable |

Important distinctions and limitations:

- **Triage is not remediation:** The **21-working-day** target applies to **triage and the initial accept/reject decision** (together with an initial severity assessment where applicable). It is **not** a commitment that a fix, mitigation, or release will be completed within 21 working days.
- **Definition of working days:** In this policy, **working days** mean **Monday through Friday**, excluding Saturdays and Sundays. The repository defines no single operating jurisdiction ([ADR-027](../docs/DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction)), no staffed 24/7 support schedule, no operational timezone, and no fixed holiday calendar; public holidays observed by the repository owner may therefore delay handling.
- **Target response times:** Both windows are target response times for a pre-release project maintained by its owner, not contractual service-level agreements. Investigation complexity, multi-service interactions, upstream dependency behaviour, or missing reproduction information may affect progress.

## 3. Supported versions and remediation

- **Pre-release status:** **Boro_biya** is currently in pre-release development (Phase 1 — skeleton and developer experience — is complete and owner-approved; Phase 2 has not started; see [`docs/ROADMAP.md`](../docs/ROADMAP.md)). No production release (`1.0.0`) exists, no deployment is operated for end users, and no project licence has been selected yet ([Q-25](../docs/DECISIONS.md#open-questions)).
- **No supported-version window or patch SLA:** Because the project is pre-release, there is **no established supported-version table, support window, patch SLA, or guaranteed remediation date** ([`docs/development/06-release-plan.md`](../docs/development/06-release-plan.md)). The `v0.1.0` tag recorded in [`CHANGELOG.md`](../CHANGELOG.md) is a non-production tag used only to exercise Phase 1 release mechanics (`QA-48 … QA-54`) and carries no deployment or maintenance promise.
- **How development commits and tags are assessed:**
  - Vulnerability reports are evaluated against the current head of `main` and, where relevant, the latest non-production tag (`v0.1.0`) or active container and build definitions.
  - Accepted fixes are applied forward on `main` through reviewed pull requests and the repository's active quality gates ([`docs/QUALITY_GATES.md`](../docs/QUALITY_GATES.md)); fixes are not backported to historical commits or non-production mechanics tags.
- **Triage and remediation priority:** During triage, reports are assessed for **severity**, **exploitability**, **affected scope** (for example shipped runtime code, container definitions, or development-only scripts and dependencies), and **remediation priority** against [`docs/SECURITY.md`](../docs/SECURITY.md) §10 and [`docs/security/threat-model.md`](../docs/security/threat-model.md).
- **Disclosure hygiene:** Sensitive vulnerability details, exploit steps, and unmitigated attack paths are not published in public issues, pull requests, commit messages, or release notes before a remediation is in place or coordinated disclosure is appropriate.

## 4. Scope and limitations

- **Repository reporting channel only:** GitHub Private Vulnerability Reporting on `komeilm76/boro_biya` (`https://github.com/komeilm76/boro_biya/security/advisories/new`) is the project's actual vulnerability-reporting channel.
- **Confidentiality scope:** Private reporting relies on GitHub's Private Vulnerability Reporting feature. Confidentiality is limited to GitHub's actual platform functionality and the repository's permissions on GitHub (advisories are visible to the repository owner and any accounts granted repository administration or security-advisory access); this policy makes no confidentiality guarantee beyond those platform controls.
- **Not emergency or legal response:** GitHub Private Vulnerability Reporting is an asynchronous software-vulnerability coordination channel. It does **not** replace emergency incident response, operational on-call handling, emergency-service dispatch ([SOS-23](../docs/PRODUCT_REQUIREMENTS.md#notifications-and-realtime)), or any legal, regulatory, or breach-notification obligation, which remain the responsibility of the operator of a given deployment ([ADR-027](../docs/DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction), [OPS-85](../docs/operations/README.md#rules)).
