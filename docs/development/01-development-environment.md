# Development Environment

Supported contributor environments, prerequisites, and the commands that exist at each phase. Commands are marked **available** (verified to work in this repository today) or **planned** (specified here, implemented in the named phase, and not yet runnable).

Owner: Engineering. Reviewed: 2026-10-16.

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

One Windows constraint: the PostgreSQL postmaster refuses to run under an elevated administrator token (the same rule that forbids root on Unix). `bun run dev:db` therefore starts only from a standard — non-elevated — PowerShell session; an elevated Windows session runs the stack against a PostgreSQL service instead, exactly like the Windows CI matrix does (§4 of [CI and gate design](03-ci-and-gates.md), QA-06).

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
bun install --frozen-lockfile      # install exactly the committed workspace versions
bun run env:create                 # create .env from .env.example with development-safe values
docker compose up -d db            # PostgreSQL 18 (container only)
bun run db:migrate                 # ensure roles and schemas, apply versioned migrations
bun run dev                        # web app + core API + both services (watch mode)
bun run gate                       # all gates that are active in the current phase
bun run check:runtime              # runtime compatibility and portability check (QA-123)
```

`bun run env:create` replaces the bare `cp .env.example .env` step of the original contract, and the change is deliberate: the template's `<placeholder>` values are designed to fail startup (OPS-53), so a copied-but-unfilled `.env` is a broken environment by construction. `env:create` fills development-safe values — loopback binds (OPS-70), explicit CORS origins, and cryptographically random secrets that exist only on this machine — refuses to overwrite an existing `.env` without `--force`, and fails loudly if `.env.example` grows a variable it does not know, so the two files cannot drift apart silently.

Without Docker, replace the two database steps with `bun run dev:db` (see §2); it stays running in its own terminal and serves the same roles and schemas.

Any future production release is specified to run these artefacts on **Node 24 LTS** (`node dist/…`), not on Bun: Bun is the development toolchain and package manager ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)). This runtime decision is not evidence of an existing production deployment. The Docker path below builds and starts the same artefacts on the pinned Node version, which is what the compatibility check verifies.

Docker-first alternative (application builds run in containers; local Node 24 and Bun are still needed for repository tooling and environment creation):

```bash
bun run env:create                 # once, so Compose has its variables
docker compose up --build          # db, one-shot migrate job, api, relation, sos, web
```

The Compose stack runs the one-shot `migrate` job before the services start (`service_completed_successfully`), declares resource limits per container (OPS-52), and pins every image version (QA-14). Only PostgreSQL and the web edge are host-published; both bind to loopback by default. API, relation, SOS, and all metrics ports remain available only over Docker networking.

### Compose host-published ports

| Service | Container port/protocol | Default host binding/protocol | Required and intended audience | Role |
| --- | --- | --- | --- | --- |
| `db` (PostgreSQL) | `5432/tcp` | `127.0.0.1:${DB_PORT:-5432} → 5432/tcp` | Yes, for host-run `bun run dev`, migration, and database tooling; local developer only | Database; never publish it to non-loopback interfaces |
| `web` | `8080/tcp` | `127.0.0.1:${WEB_PORT:-8080} → 8080/tcp` | Yes, for the developer's browser on the host | Web edge; proxies `/api/*` to `api:3000` |
| `api` | `3000/tcp` | Not published | No host binding required | Internal API; reachable by Compose services and the web edge on the Compose network |
| `relation` | `3001/tcp` | Not published | No host binding required | Internal service; reachable through Docker networking only |
| `sos` | `3002/tcp` | Not published | No host binding required | Internal service; reachable through Docker networking only |
| `api`, `relation`, `sos` metrics | `9000/tcp`, `9001/tcp`, `9002/tcp` | Not published | No | Internal metrics endpoints |

`migrate` is a one-shot job and publishes no listener. Container listeners bind inside the container network; that does not itself publish a host port. In Compose, service-to-service calls use Docker DNS names and container ports, not host-published ports.

`WEB_PUBLISH_ADDRESS` is optional and defaults to `127.0.0.1`. Set it explicitly in `.env` only when a wider web-edge bind is intended. Widening it also exposes the web edge's forwarded `/api/*` requests to that interface; the API is not private from clients that can reach the web edge merely because `api:3000` is unpublished. Do not use `0.0.0.0` as a default or casual convenience setting. A broader bind requires an explicit network exposure review, host/network firewall allowlisting, and a properly configured TLS-terminating reverse proxy; the current web edge itself is plain HTTP and is not an internet-facing production edge. Docker Engine loopback limitations and version caveats are documented in [operations](../operations/README.md#compose-port-binding-and-docker-engine-limitations).

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
| `docker compose` cannot reach the database | Container still starting, or port conflict on loopback port 5432 | `docker compose ps`, wait for healthy, then change `DB_PORT` if a local PostgreSQL is already bound. PostgreSQL stays bound to `127.0.0.1`. |
| Web edge port already in use | Another local service holds port 8080 | Stop the conflicting service or change `WEB_PORT`; keep `WEB_PUBLISH_ADDRESS` at `127.0.0.1` unless broader exposure is explicitly intended. |
| Host-run service port already in use | Another process holds an API/relation/SOS development port | Change `API_PORT`, `RELATION_PORT`, or `SOS_PORT` for `bun run dev`; these are not Compose host publications. |
| Slow file operations under WSL2 | Repository on the Windows filesystem | Clone into the WSL filesystem (`~/boro_biya`). |
| Slow installs on Windows | Real-time antivirus scanning `node_modules` | Exclude the repository directory from real-time scanning. |
| `bun run …` fails but `node` works (or the reverse) | A script reached a runtime-specific API, or Bun is incompatible with a pinned tool | Run the same script under Node 24 with `node`; if that passes, the script is relying on a Bun-only behaviour and must not be used from application code ([GOV-82](02-dependency-policy.md#4-runtime-baseline)). |

## 8. Contribution flow

1. **[OPS-75]** Read [MASTER_PROJECT_PROMPT](../MASTER_PROJECT_PROMPT.md) and the documents relevant to your change.
2. **[OPS-76]** Create a branch per [repository conventions](00-repository-conventions.md) §3.
3. **[OPS-77]** Make the smallest change that satisfies the requirement; update the affected documents in the same commit.
4. **[OPS-78]** Run the gates that are active in the current phase, and report the real exit status (see [CI and gates](03-ci-and-gates.md)).
5. **[OPS-79]** Open a pull request using the repository template, listing requirement IDs and gate evidence.
