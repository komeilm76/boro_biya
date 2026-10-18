# Developer Onboarding

Owner: Engineering. Reviewed: 2026-10-18.

This guide takes a new contributor from a clean checkout to a working Phase 0–1 local environment. Read commands from top to bottom and choose one database/run mode where indicated. Commands are shown for the repository root unless a step says otherwise.

## 1. What this checkout contains

Phase 0 and Phase 1 are marked complete and owner-approved in the [roadmap](../ROADMAP.md). The current code is a development foundation: a Vue route shell, a core Fastify API skeleton, Relation and SOS service skeletons, shared TypeScript packages, PostgreSQL migration/bootstrap tooling, and a local/CI Compose stack. There are no authentication, map, navigation, location-sharing, SOS business workflows, service-installation, or native Android features in this build. See the [implementation-status guide](17-implementation-status.md) before treating a roadmap item as implemented.

## 2. Prerequisites

| Tool | Required for | Supported version in this repository | Authoritative installation source |
| --- | --- | --- | --- |
| Git | Checkout and contribution workflow | Current stable; no exact version is pinned | [git-scm downloads](https://git-scm.com/downloads) |
| Node.js | Repository scripts and all application runtimes | Node 24 LTS; manifest range `>=24 <25`; CI selects 24 and the Docker images pin `24.22.0` | [Node.js downloads](https://nodejs.org/en/download) |
| Bun | Workspace package manager and script runner | **1.4.3** exactly; the manifest accepts `>=1.4 <1.5` | [Bun installation](https://bun.sh/docs/installation) |
| Docker Engine or Docker Desktop with Compose v2 | The Compose database or full stack | Current supported stable release; this repository does not pin a Docker Engine version | [Docker installation](https://docs.docker.com/get-started/get-docker/) |
| Editor | Optional | VS Code is recommended; repository editor settings and extension recommendations are committed | [VS Code](https://code.visualstudio.com/download) |

The repository's primary contributor platforms are Linux (Ubuntu 24.04+ or Debian 12+), Windows 10/11 with PowerShell 7, and Windows with WSL2. macOS is best-effort. Keep a WSL2 checkout inside the Linux filesystem for better file performance. A local PostgreSQL installation is not required: Compose supplies PostgreSQL 18.6, and an embedded PostgreSQL 18 fallback is available when Docker is not. JDK and Android SDK installation is not needed for the Phase 1 Capacitor configuration; native Android work is planned for Phase 8.

For the Compose loopback host-port protections, Docker Engine before `28.0.0` is affected by the documented loopback-publishing limitation. On hosts using firewalld, Engine `28.2.0` through `28.3.2` is also affected after a firewalld reload; use `28.3.3` or later for both documented fixes and retain raw-table filtering. Review the full [Docker Engine and firewalld caveats](../operations/README.md#compose-port-binding-and-docker-engine-limitations); Docker Desktop and Rootless Mode have different applicability as described there.

### 2.1 Verify the toolchain

1. Open a fresh PowerShell 7, WSL2, or Linux/macOS terminal.
2. Run the following from any directory:

   ```text
   node --version
   bun --version
   git --version
   docker compose version
   ```

3. Confirm Node reports `v24.x`, Bun reports `1.4.3`, Git is available, and `docker compose version` reports Compose v2 if Docker will be used. The Docker check is optional for the embedded-database path. If Node or Bun does not match, install the version above and open a new terminal before continuing.

## 3. Checkout and install

1. Choose a parent directory where you keep source checkouts. Run the clone command from that parent directory:

   ```text
   git clone https://github.com/komeilm76/boro_biya.git
   ```

2. Enter the new repository directory (`cd boro_biya` in a POSIX shell; `Set-Location boro_biya` in PowerShell 7). All remaining commands in this section run from the repository root, `boro_biya/`.
3. Confirm the checkout and the dependency-free documentation gate before installing packages:

   ```text
   git status --short --branch
   node scripts/gates/phase0.mjs
   ```

   A fresh checkout should have no tracked changes, and the documentation gate should exit 0. It does not need Bun or installed workspace dependencies.
4. Install the committed workspace dependency set without changing the lockfile:

   ```text
   bun install --frozen-lockfile
   ```

   Expected result: Bun installs the exact versions in `bun.lock`. Do not delete or regenerate the lockfile to work around an install error; use [troubleshooting](16-troubleshooting.md).

## 4. Prepare local environment values

1. From the repository root, generate a local `.env`:

   ```text
   bun run env:create
   ```

2. The script creates `.env` from `.env.example` with development-safe loopback binds, local database role passwords, and random local-only secret values. It refuses to overwrite an existing `.env` unless `--force` is passed. Do not paste, commit, or share `.env`; its values are not production credentials.
3. Verify that the file exists and is ignored without printing its contents:

   ```text
   git check-ignore .env
   ```

   Expected result: `.env` is reported as ignored. If it is not, stop and fix the local repository ignore state before proceeding.
4. Do not copy `.env.example` directly to `.env`: it contains placeholders, not usable credentials. Many entries describe future-phase settings and are not read by Phase 1. The [configuration reference](14-environment-and-configuration.md) identifies which values currently affect the running code.

## 5. Choose and initialize a local database

Use **one** of the following paths. Do not run them against production or a database containing data you need to keep.

### 5.1 Docker Compose database (recommended)

1. Start Docker Engine or Docker Desktop.
2. From the repository root, start PostgreSQL only:

   ```text
   docker compose up -d db
   ```

   This creates or reuses the named `db-data` volume. The host publication is loopback-only by default; the internal container port is `5432/tcp`.
3. Check that the database is healthy:

   ```text
   docker compose ps db
   docker compose logs --tail 40 db
   ```

   Wait for `db` to report `healthy`. If it exits or remains unhealthy, see [troubleshooting](16-troubleshooting.md).
4. Initialize the service roles, schemas, and versioned migrations from the repository root:

   ```text
   bun run db:migrate
   bun run db:status
   ```

   The migration command uses the local administrative connection from `.env`; the status command should report the current ledger for the `core`, `relation`, and `sos` schemas.

### 5.2 Embedded PostgreSQL when Docker is unavailable

1. From the repository root, build the workspaces first because the fallback database runner uses the built database and test-utils packages:

   ```text
   bun run build
   ```

2. Start the persistent embedded PostgreSQL 18 development server from the repository root:

   ```text
   bun run dev:db
   ```

3. Leave that terminal open. The runner binds to `127.0.0.1` on `DB_PORT` (default `5432`), bootstraps the same service roles, schemas, and migrations, and stores local database files in the ignored `var/pg-dev/` directory. Its ready log includes the PostgreSQL version and confirms that migrations were applied; no separate `bun run db:migrate` is needed for this path.
4. On Windows, run this command from a **non-elevated** PowerShell 7 session. PostgreSQL refuses to run its postmaster as an administrator. Stop it with Ctrl+C when finished; the data remains in `var/pg-dev/` until deliberately reset.

## 6. Start the application

Choose either the Compose stack or host-run development servers. If using the embedded database from step 5.2, its terminal must remain running.

### 6.1 Full Docker Compose stack

1. From the repository root, start the complete local stack in the foreground:

   ```text
   docker compose up --build
   ```

2. Wait for `db`, the one-shot `migrate` job, `api`, `relation`, `sos`, and `web` to complete their health/startup steps. The `migrate` job exits successfully after preparing the database. Keep this terminal open to see logs.
3. Open `http://127.0.0.1:8080/` in a browser on the same host. The web edge proxies `/api/*` to `api:3000` on the private Compose network. No host-published API, Relation, SOS, or metrics port is created.

### 6.2 Host-run development servers

1. Ensure the database is running and its schemas have been initialized as in step 5.1 or 5.2.
2. From the repository root, start the web dev server and three Node backend processes with watchers:

   ```text
   bun run dev
   ```

3. Keep this terminal open. The script builds the backend workspaces, starts the core API, Relation Service, SOS Service, and Vite web dev server, prefixes their logs, and stops the children together when you press Ctrl+C. The default web address is `http://localhost:5173/`; host-run backends use ports 3000, 3001, and 3002 on loopback by default.
4. For a single process in a separate terminal, first run `bun run build` from the repository root, then run **one** of the following from the repository root. Each targeted process expects the local database to be ready; the web-only process does not start a backend.

   ```text
   node scripts/dev.mjs --only=api
   node scripts/dev.mjs --only=relation
   node scripts/dev.mjs --only=sos
   node scripts/dev.mjs --only=web
   ```

   Start the API before opening the Vite proxy path if you selected `web` separately. These development processes are distinct from the production-style Compose web edge.

## 7. Confirm the environment is working

1. For the host-run development mode, run the following from the repository root in a second terminal. Each request should return HTTP 200 with JSON; the backend readiness bodies should say `ready` and `checks.database` should be `true`.

   ```text
   node -e "fetch('http://127.0.0.1:3000/healthz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   node -e "fetch('http://127.0.0.1:3000/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   node -e "fetch('http://127.0.0.1:3001/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   node -e "fetch('http://127.0.0.1:3002/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   node -e "fetch('http://127.0.0.1:5173/').then(async (r) => { console.log(r.status, r.headers.get('content-type')); if (!r.ok) process.exitCode = 1; })"
   ```

2. For Compose mode, open another terminal at the repository root. Verify the browser-facing edge from the host:

   ```text
   node -e "fetch('http://127.0.0.1:8080/healthz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   ```

3. Verify the three backend readiness endpoints **inside** Compose. The `exec` calls use container loopback and do not publish those ports to the host:

   ```text
   docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   docker compose exec -T relation node -e "fetch('http://127.0.0.1:3001/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   docker compose exec -T sos node -e "fetch('http://127.0.0.1:3002/readyz').then(async (r) => { console.log(r.status, await r.text()); if (!r.ok) process.exitCode = 1; })"
   ```

4. In Compose mode, check service state and the migration job:

   ```text
   docker compose ps --all
   docker compose logs --tail 80 migrate api relation sos web
   ```

5. Remember that `/healthz` is process liveness and can remain HTTP 200 when PostgreSQL is unavailable. `/readyz` is the database readiness signal and returns HTTP 503 when its database check fails. Unknown `/api/v1/*` requests are expected to return the shared 404 error envelope; no business API endpoint exists in Phase 1.

## 8. Stop the local services

1. For `bun run dev` or `docker compose up --build` running in the foreground, press Ctrl+C in that terminal and wait for the shutdown messages.
2. If Compose was started in detached mode, stop and remove its containers and network from the repository root:

   ```text
   docker compose down
   ```

   This preserves the named PostgreSQL `db-data` volume. To stop without removing containers, use `docker compose stop`; neither command deletes the database volume.
3. If `bun run dev:db` is running, press Ctrl+C in its terminal. Its persistent files remain in `var/pg-dev/`.

## 9. Reset the local environment — destructive operations

**These steps delete local development data. Confirm the data is disposable before continuing. They do not reset any external database.**

1. Stop all host-run services and the embedded database. For Compose, stop the stack from the repository root:

   ```text
   docker compose down
   ```

2. To reset a Compose database, remove its named volume. **Destructive:** this permanently deletes the local PostgreSQL database and all rows stored in that Compose volume.

   ```text
   docker compose down --volumes
   ```

3. To reset an embedded development database instead, first stop `bun run dev:db`, then remove the ignored database directory from the repository root. **Destructive:** this permanently deletes the local embedded cluster and all its data.

   ```text
   node -e "require('node:fs').rmSync('var/pg-dev', { recursive: true, force: true })"
   ```

4. If you also need new local database passwords and signing values, regenerate `.env` only after choosing to reset the database. **This overwrites `.env` and changes local credentials; it does not itself erase database data.**

   ```text
   bun run env:create --force
   ```

5. Re-run the selected database initialization procedure in step 5 before starting host-run application services. The full Compose startup in step 6.1 performs its one-shot migration job automatically.

## 10. Startup diagnosis

1. Check the [troubleshooting guide](16-troubleshooting.md) for version, install, environment, port, database, Docker, and test failures.
2. For Compose, inspect `docker compose ps --all` and `docker compose logs --tail 80 <service>` from the repository root; use service names `db`, `migrate`, `api`, `relation`, `sos`, or `web`.
3. For `bun run dev`, inspect the prefixed output in the terminal that launched it. The runner stops the remaining processes if a child exits non-zero.
4. Never print `.env`, publish internal service ports, or widen a host binding as a debugging shortcut. The [networking reference](14-environment-and-configuration.md) explains the protected port layout.
