# Chameleon Arcade

Seven jungle-themed strategy games, now with private server-backed checkpoints, practice history and audio preferences—without adding accounts or changing the original game design.

**Live website:** https://chameleon-arcade.broad-hippodraco.workers.dev

The permanent deployment runs on Cloudflare Workers with a persistent D1 database. It does not depend on the development preview or this workspace staying awake. All seven games, guest saves, preferences and history are included. No paid plan or billing change was made; free-tier quotas still apply and this is not an uptime guarantee. Existing development-preview cookies and saves are separate and were not migrated.

## What changed

The original plain HTML/CSS/JavaScript frontend is preserved: balloon misère Nim, Hex, Network Saboteur, evolutionary Maze Runner, Labyrinth Architect, Cellular Outbreak and Spore Cipher all still run locally in the browser. A new **Your arcade trail** section saves one checkpoint per game and resumes it on a later visit from the same browser. Simulations resume paused; wait for AI moves to finish before saving Balloon Pop or Hex.

A small same-origin Express API stores guest sessions, checkpoints and completed practice results in SQLite. Results are **client-reported practice history**, not verified competitive scores. There is no leaderboard, payment, email service, registration, password recovery or public profile because none was required by the existing site.

See [the feature inventory](docs/FEATURE-INVENTORY.md) for the existing controls and their backend mapping, and [verification notes](docs/VERIFICATION.md) for executed checks and limitations.

## Run locally

Use Node.js 24 or later and npm. From this directory:

```sh
npm ci
cp .env.example .env
npm start
```

Open **http://localhost:3000**. Use that hostname, rather than a different origin such as `127.0.0.1`, because write requests enforce `APP_ORIGIN` exactly. Development auto-restart:

```sh
npm run dev
```

Configuration:

| Variable | Development default | Production requirement |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `PORT` | `3000` | Internal listening port |
| `APP_ORIGIN` | `http://localhost:3000` | Exact public HTTPS origin, no trailing slash |
| `DATA_DIR` | `./data` | Explicit directory on durable local storage |

The startup command loads `.env` when present. Never commit `.env`, database files, cookies or private claim files. No third-party API credentials are needed to run the application.

## Architecture and data

- `index.html`: original interface, SVG artwork, balloon game and versioned balloon checkpoint adapter.
- `games.js`, `games.css`: the six algorithm games and their versioned checkpoint adapters.
- `app.js`, `app.css`: private trail UI, API client, retry feedback and preferences.
- `server/app.js`: same-origin API, validation, access control and public-file allowlist.
- `server/db.js`, `migrations/001-initial.sql`: SQLite connection and idempotent initial schema.
- `server/index.js`: startup and graceful shutdown.
- `server/build.js`: allowlisted frontend asset build.

On startup, migrations create the schema in `DATA_DIR/arcade.sqlite`. Foreign keys are enabled, guest deletion cascades to saves/history, and WAL mode plus a busy timeout support normal single-instance use. SQL values are parameterized. No mock persistence or seed records are used.

Tables are `guests` (hashed bearer session token, CSRF token, expiry and mute), `saves` (guest/game primary key and JSON checkpoint), and `history` (guest/result-ID primary key, game, outcome, details and timestamp). Ownership queries always include the guest ID. History has owner/time indexes and bounded pagination.

The server validates JSON type, size, depth, game identifiers and outcome fields; each game adapter additionally validates checkpoint structure before restoring it. Saved state remains user-modifiable practice data, not authoritative game state.

## Guest identity and permissions

`GET /api/session` creates or retrieves a 30-day guest identity. The random bearer cookie is HttpOnly and SameSite=Strict, and is Secure in production. Only its hash is stored as the session credential. There are no passwords. Anyone possessing the cookie can access that guest's trail; it must be treated as a credential.

Mutations require the exact configured `Origin`, `Content-Type: application/json`, and `X-CSRF-Token` from the session response. The browser sends these automatically through the client. No cross-origin API access is enabled. Missing/expired cookies return 401; refresh the trail to establish a new guest. Losing the cookie loses access to old records; there is no account-based recovery or cross-device sync.

**Delete all guest data** uses an in-page confirmation and removes the current guest's server records. Clearing browser storage alone does not delete server records. Local audio fallback and legacy balloon totals remain browser data and can be cleared separately with browser site-data controls. Backup retention and expired-guest cleanup are operator responsibilities.

## API

Responses are JSON. Errors use `{ "error": { "code": "...", "message": "..." } }` with an appropriate HTTP status. All private responses must not be cached.

| Method and path | Request / response |
| --- | --- |
| `GET /api/health` | `{ok:true}` after a database query |
| `GET /api/session` | `{csrfToken, preferences:{mute}}`; sets guest cookie when needed |
| `PATCH /api/preferences` | `{mute:boolean}` → `{preferences:{mute}}` |
| `GET /api/saves` | `{saves:[{game,updatedAt}]}` |
| `GET /api/saves/:game` | `{game,state,updatedAt}` or 404 |
| `PUT /api/saves/:game` | `{state:object}` → `{game,updatedAt}`; replaces this guest's checkpoint |
| `DELETE /api/saves/:game` | `{ok:true}` |
| `GET /api/history?limit=20&offset=0` | `{results:[{id,game,outcome,details,createdAt}],total}` |
| `POST /api/history` | `{id:UUID,game,outcome,details:object}` → `{result}`; same guest/UUID is idempotent |
| `DELETE /api/data` | `{ok:true}`; deletes guest and dependent records and clears cookie |

Game identifiers: `balloons`, `hex`, `network`, `evolution`, `architect`, `outbreak`, `cipher`. Outcomes: `win`, `loss`, `draw`, `completed`. Request bodies are capped at 128 KB; checkpoint state at 100 KB; result details at 4 KB. Session creation and mutations have rate limits; 429 means wait before retrying.

Completed results are queued in memory if a request fails, with a stable UUID for safe retry. The **Retry unsaved results** button resubmits them. This queue does **not** survive closing or reloading the page. Manual saves show success only after an API response; an interrupted request may have committed, so refresh before assuming it failed.

## Checks and build

```sh
npm test
npm run check
npm run build
npm audit
```

Tests use real temporary SQLite files for backend operations and a DOM/canvas-stub harness for frontend workflows. Browser checks supplement them; a passing harness does not prove every visual or accessibility state on every device.

`npm run build` copies only `index.html`, `games.js`, `games.css`, `app.js` and `app.css` into `dist/`. The application itself is plain JavaScript, with no TypeScript compilation step. Production Node serves the same approved public files, not the project directory.

## Deploy the working full-stack app

Use a **single Node.js 24 process with a durable local disk**, behind a TLS reverse proxy. A static upload alone cannot run this API or persist SQLite. Do not place the database on an ephemeral container filesystem or run independent replicas against divergent SQLite files.

1. Copy the application source and lockfile to the host, excluding private workspace files and development data.
2. Run `npm ci --omit=dev`.
3. Provision a writable durable directory accessible only to the application user; set `DATA_DIR` to its absolute path.
4. Set `NODE_ENV=production`, exact HTTPS `APP_ORIGIN`, and `PORT` in the hosting environment (or a protected `.env`).
5. Run `npm start`; initial migration runs automatically.
6. Terminate TLS at the reverse proxy and forward requests to the app. Keep the Node port private. Configure the proxy and firewall for abuse protection; the app's in-memory IP limiter sees the direct peer and intentionally does not trust arbitrary forwarded headers.
7. Verify `/api/health`, a save/refresh/resume flow, cookie flags, deletion, a process restart and a volume-backed redeploy before opening production traffic.
8. Set backup retention, expired-guest deletion, disk monitoring and alerting. Review the privacy notice/contact details for the actual operator and hosting environment.

A restrictive `Dockerfile` and `.dockerignore` are provided. Build and run, replacing the origin and persistent volume as appropriate:

```sh
docker build -t chameleon-arcade .
docker volume create chameleon-data
docker run -d --name chameleon-arcade \
  -p 127.0.0.1:3000:3000 \
  -e APP_ORIGIN=https://arcade.example.com \
  -v chameleon-data:/data \
  chameleon-arcade
```

Terminate HTTPS in front of `127.0.0.1:3000`. Container builds are provided as deployment configuration, not a claim of a tested Docker deployment.

### Permanent Cloudflare deployment

`worker/index.js` implements the same API with asynchronous, parameterized D1 queries. `wrangler.jsonc` binds the persistent `chameleon-arcade-production` database and only the allowlisted frontend build. The initial deployment bundles those five static assets into the Worker; it has no runtime dependency on GitHub or this workspace. `scripts/build-cloudflare-payload.mjs` produces an equivalent connector-upload payload in the ignored `.deploy/` directory, never in public `dist/`.

To redeploy with an appropriately authorized Cloudflare CLI session:

```sh
npm ci
npm run check
npm run build
npx wrangler d1 migrations apply chameleon-arcade-production --remote
npx wrangler deploy
```

Review the selected Cloudflare account before deploying. Do not recreate or delete the existing database during a code deployment. The source repository is a backup of the full application; GitHub push alone does not automatically redeploy the site.

The custom domain `chameleon-archade.com` is still pending and unresolvable in Cloudflare. No registrar nameservers or DNS records were changed. Connecting it requires confirming the actual registrar portal and owner approval of the exact nameserver change to `clyde.ns.cloudflare.com` and `val.ns.cloudflare.com`. Until then use the permanent workers.dev address above. A future custom-domain rollout must also update the exact `APP_ORIGIN` for CSRF checks.

## Backups and recovery

For the hosted D1 database, use Cloudflare D1 export/recovery tools; the local Node backup script does not back up D1. Independent offsite backup scheduling and retention have not been configured. For the optional Node deployment, Node's [SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackup-source-path-options) creates a consistent backup while the app is running:

```sh
DATA_DIR=/absolute/durable/data node scripts/backup.mjs /private/backups/arcade-001.sqlite
```

Choose a new destination filename each time. Keep backups private, encrypted by the storage layer where possible, off the application volume and subject to a defined retention window. The file contains private guest state and session material. Do not copy only an active WAL database file with ordinary `cp`.

To recover: stop the app, preserve the current database and its `-wal`/`-shm` companions, replace the database with a tested backup, remove stale companions only while the app is stopped, fix owner/permissions, restart, then check health and restored records. Restoration can resurrect previously deleted records, so apply deletion/retention policy to backups too. Test this procedure on a separate restore directory before relying on it.

## Security and remaining limits

Implemented controls include parameterized SQL, guest ownership, CSRF/origin checks, cookie flags, request limits, rate limiting, safe errors, public-file allowlisting and security headers. They follow the relevant [Express security guidance](https://expressjs.com/en/advanced/best-practice-security.html), but this is not a penetration-test certification.

The original inline script/styles require CSP `unsafe-inline`; extracting them and using hashes/nonces is future hardening. Worker rate counters are isolate-local and best-effort, not a globally coordinated abuse control. The optional Node backend uses synchronous SQLite and process-local counters. Guest records can grow until deleted; expired cookies do not delete database records. No scheduled cleanup, offsite backup job, load testing or monitoring service was added.

The visual branding, hand-authored SVG assets and existing game motion were retained. New save controls use subtle finite feedback and honor reduced motion. The permanent HTTPS site and live D1 API were checked, including all seven save types, guest isolation, history idempotency, CSRF/origin protection and test-data deletion. Operator privacy/contact details, backup policies and ongoing capacity monitoring remain owner responsibilities.
