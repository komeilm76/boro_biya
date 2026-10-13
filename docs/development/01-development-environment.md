# Development Environment

Supported contributor environments, prerequisites, and the commands that exist at each phase. Commands are marked **available** (verified to work in this repository today) or **planned** (specified here, implemented in the named phase, and not yet runnable).

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
| Node.js | 24 LTS (primary CI baseline) | Repository tooling, gate scripts, and the tooling that must run on Node | `node --version` |
| Bun | 1.4.x (pinned in Phase 1) | Preferred package manager and script runner; candidate server runtime (see dependency policy, Q-16) | `bun --version` |
| Docker + Compose v2 | current stable | PostgreSQL and full-stack local run | `docker compose version` |
| Editor | VS Code (recommended) | `.editorconfig` and workspace recommendations are committed | — |

Node.js 26 becomes Active LTS on 2026-10-28; the CI matrix adds it once it is LTS, and the baseline moves after a green matrix run (see [dependency policy](02-dependency-policy.md) §4).

## 3. Getting started (available today)

```bash
git clone https://github.com/komeilm76/boro_biya.git
cd boro_biya
node scripts/gates/phase0.mjs      # documentation gate — no dependencies required
```

A package-manager script alias (`bun run gate`) is introduced in Phase 1 together with the workspace, so the gate command above stays the single source of truth today.

## 4. Getting started (planned — Phase 1)

These commands are the contract Phase 1 must satisfy. They are documented now so the phase has testable acceptance criteria; they do not exist yet.

```bash
bun install                        # install workspaces (pinned versions, lockfile committed)
cp .env.example .env               # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d db            # PostgreSQL 18 (container only)
bun run db:migrate                 # apply versioned migrations
bun run dev                        # web app + core API + both services
bun run gate                       # all gates that are active in the current phase
```

Docker-first alternative (no local Node required beyond the gate scripts):

```bash
docker compose up --build          # web, api, relation, sos, db
```

## 5. Environment variables

- **[OPS-67]** Configuration is supplied through environment variables, validated with Zod at process start, and fails fast on invalid or missing required values.
- **[OPS-68]** `.env.example` lists every variable with a placeholder and a one-line description; it contains no real credentials and is safe to commit.
- **[OPS-69]** `.env` is git-ignored and never committed, shared, or pasted into issues. Production secrets are injected by the deployment environment or a secret manager.
- **[OPS-70]** Development defaults must be safe: no seeded admin with a weak password, no permissive CORS, no disabled authentication, no debug endpoints exposed by default.

See [`.env.example`](../../.env.example) for the current placeholder list.

## 6. Editor and repository hygiene

- **[OPS-71]** `.editorconfig` — UTF-8, LF, final newline, 2-space indentation, space-based indentation everywhere.
- **[OPS-72]** `.gitattributes` — normalises line endings to LF on checkout and commit so Windows contributors cannot introduce CRLF churn.
- **[OPS-73]** Formatting and linting are automated in Phase 1 (Prettier + ESLint). Until then, follow [repository conventions](00-repository-conventions.md) §4.
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

## 8. Contribution flow

1. **[OPS-75]** Read [MASTER_PROJECT_PROMPT](../MASTER_PROJECT_PROMPT.md) and the documents relevant to your change.
2. **[OPS-76]** Create a branch per [repository conventions](00-repository-conventions.md) §3.
3. **[OPS-77]** Make the smallest change that satisfies the requirement; update the affected documents in the same commit.
4. **[OPS-78]** Run the gates that are active in the current phase, and report the real exit status (see [CI and gates](03-ci-and-gates.md)).
5. **[OPS-79]** Open a pull request using the repository template, listing requirement IDs and gate evidence.
