# Development Environment

Supported contributor environments, prerequisites, and the commands that exist at each phase. Commands are marked **available** (verified to work in this repository today) or **planned** (specified here, implemented in the named phase, and not yet runnable).

Owner: Engineering. Reviewed: 2026-10-14.

## 1. Supported platforms

| Platform | Support level | Notes |
| --- | --- | --- |
| Linux (Ubuntu 24.04+, Debian 12+) | Primary | Reference environment for CI and release builds. |
| Windows 10/11 + Docker Desktop | Primary | Native PowerShell 7 workflow; WSL2 optional for speed. No shell-only scripts may be required. |
| Windows 10/11 + WSL2 | Supported | Treat as Linux; keep the repository inside the WSL filesystem for performance. |
| macOS | Best effort | Must not require macOS-specific tooling in `main`. |
| Android build host | Linux or Windows | Requires JDK 21+ and Android SDK once Phase 8 starts. |

- **[OPS-65]** Every documented development command must work on both Windows (PowerShell 7) and Linux without modification, or be wrapped in a cross-platform Node script.
- **[OPS-66]** Docker Compose is the single source of truth for service versions (PostgreSQL, and any service added later). Contributors are not required to install PostgreSQL on the host.

## 2. Prerequisites

| Tool | Version policy | Purpose | Verify with |
| --- | --- | --- | --- |
| Git | current stable | Source control, LF enforcement via `.gitattributes` | `git --version` |
| Node.js | 24 LTS (primary CI baseline; **production runtime**, [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | Repository tooling, gate scripts, the tooling that must run on Node, and the runtime every production artefact runs on | `node --version` |
| Bun | 1.4.3 (exact pin; verified 2026-10-14) | Preferred package manager and script runner; **not** a server runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | `bun --version` |
| Docker + Compose v2 | current stable | PostgreSQL and full-stack local run | `docker compose version` |
| Editor | VS Code (recommended) | `.editorconfig` and workspace recommendations are committed | — |

Node.js 26 becomes Active LTS on 2026-10-28; the CI matrix adds it once it is LTS, and the baseline moves after a green matrix run (see [dependency policy](02-dependency-policy.md) §4).

Where Docker is unavailable (restricted machines, Windows without WSL2, sandboxed CI), `bun run dev:db` provides the same PostgreSQL 18 from the embedded server binaries the integration tests use (QA-06); the data persists under the git-ignored `var/pg-dev`, and the cluster bootstrap it runs is the same code path `bun run db:migrate` uses. Compose remains the single source of truth for service versions (OPS-66).

## 3. Getting started (available today)

```bash
git clone https://github.com/komeilm76/boro_biya.git
cd boro_biya
node scripts/gates/phase0.mjs      # documentation gate — no dependencies required
```

The workspace gate suite (`bun run gate`, §4) includes this gate as its first step; the documentation gate itself stays dependency-free, so the command above works on a fresh clone before any install.

## 4. Getting started (workspace)

These commands are the Phase 1 contract, and they exist. Each behaves identically on Windows PowerShell 7 and Linux (OPS-65); the CI matrix proves it (QA-70).

```bash
bun install                        # install workspaces (pinned versions, lockfile committed)
bun run env:create                 # create .env from .env.example with development-safe values
docker compose up -d db            # PostgreSQL 18 (container only)
bun run db:migrate                 # ensure roles and schemas, apply versioned migrations
bun run dev                        # web app + core API + both services (watch mode)
bun run gate                       # all gates that are active in the current phase
bun run check:runtime              # runtime compatibility and portability check (QA-123)
```

`bun run env:create` replaces the bare `cp .env.example .env` step of the original contract, and the change is deliberate: the template's `<placeholder>` values are designed to fail startup (OPS-53), so a copied-but-unfilled `.env` is a broken environment by construction. `env:create` fills development-safe values — loopback binds (OPS-70), explicit CORS origins, and cryptographically random secrets that exist only on this machine — refuses to overwrite an existing `.env` without `--force`, and fails loudly if `.env.example` grows a variable it does not know, so the two files cannot drift apart silently.

Without Docker, replace the two database steps with `bun run dev:db` (see §2); it stays running in its own terminal and serves the same roles and schemas.

Production runs these artefacts on **Node 24 LTS** (`node dist/…`), not on Bun: Bun is the development toolchain and package manager ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)). The Docker path below builds and starts the same artefacts on the pinned Node version, which is what the compatibility check verifies.

Docker-first alternative (no local Node required beyond the gate scripts):

```bash
bun run env:create                 # once, so Compose has its variables
docker compose up --build          # db, one-shot migrate job, api, relation, sos, web
```

The Compose stack runs the one-shot `migrate` job before the services start (`service_completed_successfully`), publishes no metrics port (OPS-63), declares resource limits per container (OPS-52), and pins every image version (QA-14).

## 5. Environment variables

- **[OPS-67]** Configuration is supplied through environment variables, validated with Zod at process start, and fails fast on invalid or missing required values.
- **[OPS-68]** `.env.example` lists every variable with a placeholder and a one-line description; it contains no real credentials and is safe to commit.
- **[OPS-69]** `.env` is git-ignored and never committed, shared, or pasted into issues. Production secrets are injected by the deployment environment or a secret manager.
- **[OPS-70]** Development defaults must be safe: no seeded admin with a weak password, no permissive CORS, no disabled authentication, no debug endpoints exposed by default.

See [`.env.example`](../../.env.example) for the current placeholder list.

## 6. Editor and repository hygiene

- **[OPS-71]** `.editorconfig` — UTF-8, LF, final newline, 2-space indentation, space indentation everywhere except where a file format requires tabs (the `Makefile` rule sets tabs, because make does not accept spaces).
- **[OPS-72]** `.gitattributes` — normalizes line endings to LF on checkout and commit so Windows contributors cannot introduce CRLF churn.
- **[OPS-73]** Formatting and linting are automated: Prettier (`bun run format`) and ESLint (`bun run lint`) run in the gate suite and CI; the conventions they enforce are [repository conventions](00-repository-conventions.md) §4. Markdown is exempt from Prettier — the documentation gate owns its structure.
- **[OPS-74]** Recommended VS Code extensions are recorded in `.vscode/extensions.json` (Vue, ESLint, Prettier, Tailwind IntelliSense, Docker, EditorConfig).

## 7. Troubleshooting

| Symptom | Cause | Resolution |
| --- | --- | --- |
| `node: command not found` / wrong version | Node not installed or older than 24 | Install Node 24 LTS (nvm, fnm, or the official installer) and re-open the terminal. |
| Gate script fails with `CRLF`-related link errors | Files checked out with CRLF before `.gitattributes` existed | Re-clone, or run `git add --renormalize .`. |
| `docker compose` cannot reach the database | Container still starting, or port conflict on 5432 | `docker compose ps`, wait for healthy, then change the host port if a local PostgreSQL is already bound. |
| Ports already in use on Windows | WSL2 or another service holds the port | Stop the conflicting service or change the host port mapping; application ports are configurable. |
| Slow file operations under WSL2 | Repository on the Windows filesystem | Clone into the WSL filesystem (`~/boro_biya`). |
| Slow installs on Windows | Real-time antivirus scanning `node_modules` | Exclude the repository directory from real-time scanning. |
| `bun run …` fails but `node` works (or the reverse) | A script reached a runtime-specific API, or Bun is incompatible with a pinned tool | Run the same script under Node 24 with `node`; if that passes, the script is relying on a Bun-only behaviour and must not be used from application code ([GOV-82](02-dependency-policy.md#4-runtime-baseline)). |

## 8. Contribution flow

1. **[OPS-75]** Read [MASTER_PROJECT_PROMPT](../MASTER_PROJECT_PROMPT.md) and the documents relevant to your change.
2. **[OPS-76]** Create a branch per [repository conventions](00-repository-conventions.md) §3.
3. **[OPS-77]** Make the smallest change that satisfies the requirement; update the affected documents in the same commit.
4. **[OPS-78]** Run the gates that are active in the current phase, and report the real exit status (see [CI and gates](03-ci-and-gates.md)).
5. **[OPS-79]** Open a pull request using the repository template, listing requirement IDs and gate evidence.
