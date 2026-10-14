# Development Environment

Supported contributor environments, prerequisites, and the commands implemented for each phase. Platform/runtime completion is claimed only when the corresponding command has run and its evidence is recorded in the phase report.

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
| Bun | 1.4.3 (exact pin in `package.json`) | Preferred package manager and development-tool runner; **not** an API/service runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | `bun --version` |
| Docker + Compose v2 | current stable | PostgreSQL and full-stack local run | `docker compose version` |
| Editor | VS Code (recommended) | `.editorconfig` and workspace recommendations are committed | — |

Node.js 26 becomes Active LTS on 2026-10-28; the CI matrix adds it once it is LTS, and the baseline moves after a green matrix run (see [dependency policy](02-dependency-policy.md) §4).

## 3. Getting started (available today)

```bash
git clone https://github.com/komeilm76/boro_biya.git
cd boro_biya
node scripts/gates/phase0.mjs      # documentation gate — no dependencies required
```

The Phase 0 documentation command remains available. The Phase 1 workspace and `bun run gate` are now present; use the commands in §4 when working on application code.

## 4. Getting started (Phase 1 workspace)

The Phase 1 commands are implemented. Cross-platform completion is claimed only after the Linux and Windows CI runs recorded in the Phase 1 report; the local sandbox does not provide Docker or Node 24.

```bash
bun install --frozen-lockfile       # exact workspace install from the committed lockfile
bun run setup:dev                   # create a local .env with a fresh, unprinted dev-only database password

docker compose up -d db             # PostgreSQL 18 (container only)
bun run db:migrate                  # compile with Node 24 and apply versioned migrations
bun run dev                         # Node 24 API/services + Vite web dev server; TypeScript rebuilds on change
bun run gate                        # active formatting, lint, types, tests, audits, build, runtime and load gates
bun run check:runtime               # portability source scan (QA-123)
bun run check:runtime:smoke         # built-artifact smoke on Node 24 (QA-123)
```

`bun run setup:dev` is cross-platform and never overwrites an existing `.env`; it creates a unique local-only database credential without printing it. It does not replace the committed placeholder-only `.env.example`. The generated development database is named `boro_biya_dev`, and the local service ports are API `3000`, Relation `3001`, SOS `3002`, web `5173`, and PostgreSQL `5432`. Change `API_PORT`, `RELATION_PORT`, `SOS_PORT`, or `WEB_PORT` for the host-run stack; change the corresponding `*_PUBLISHED_PORT` or `POSTGRES_PUBLISHED_PORT` for the Compose host bindings.

**Node.js 24 LTS runs every API and service process**, including the local development processes and production artefacts. Bun 1.4.3 is the package manager and script runner, and runs the Vite development tool; it is not an application-server runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)). The `dev` command compiles TypeScript with the Node-invoked compiler, starts the built API/services with Node watch mode, and watches for rebuilds. Database commands also compile and execute their CLI on Node 24.

The full-stack Compose path is a separate smoke command. It builds and starts the stack under a unique Compose project name, checks service health, and removes only that smoke project's containers and database volume when finished. It reads published-port overrides from `.env`; it does not stop or delete the normal development project's data:

```bash
node scripts/compose/ci-smoke.mjs
```

To leave the full stack running for local work instead:

```bash
docker compose up -d --build          # web, api, relation, sos, db
docker compose ps
docker compose down                   # add --volumes only when the local database may be deleted
```

The Compose smoke has run in CI only; no local Docker run is claimed for this sandbox.

## 5. Environment variables

- **[OPS-67]** Configuration is supplied through environment variables, validated with Zod at process start, and fails fast on invalid or missing required values.
- **[OPS-68]** `.env.example` lists every variable with a placeholder and a one-line description; it contains no real credentials and is safe to commit.
- **[OPS-69]** `.env` is git-ignored and never committed, shared, or pasted into issues. Production secrets are injected by the deployment environment or a secret manager.
- **[OPS-70]** Development defaults must be safe: no seeded admin with a weak password, no permissive CORS, no disabled authentication, no debug endpoints exposed by default.

See [`.env.example`](../../.env.example) for the current placeholder list.

## 6. Editor and repository hygiene

- **[OPS-71]** `.editorconfig` — UTF-8, LF, final newline, 2-space indentation, space indentation everywhere except where a file format requires tabs (the `Makefile` rule sets tabs, because make does not accept spaces).
- **[OPS-72]** `.gitattributes` — normalizes line endings to LF on checkout and commit so Windows contributors cannot introduce CRLF churn.
- **[OPS-73]** Formatting and linting are automated in Phase 1 (Prettier + ESLint); `bun run format:check` and `bun run lint` are the canonical commands.
- **[OPS-74]** Recommended VS Code extensions are recorded in Phase 1 as `.vscode/extensions.json` (Vue, ESLint, Prettier, Tailwind IntelliSense, Docker, EditorConfig).

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
