# Verification and handover

## Live result

The full seven-game arcade is deployed at https://chameleon-arcade.broad-hippodraco.workers.dev with Cloudflare Workers and persistent D1 storage. Hosting does not depend on the temporary development preview or this workspace. The original Express/SQLite implementation remains available for local use.

No paid plan, billing change, registrar nameserver change or DNS-record change was made. The custom domain `chameleon-archade.com` remains pending in Cloudflare, with activation failure `unresolvable`. Its intended nameservers are `clyde.ns.cloudflare.com` and `val.ns.cloudflare.com`; the registrar portal must be confirmed and the exact change approved before switching.

## Checks completed

- `npm run check`: 35 tests passed, zero failed. This includes existing backend/frontend/integration coverage and seven Worker/D1 tests using a local SQLite-backed D1 adapter.
- The Worker tests cover secure HttpOnly/SameSite cookies, all seven save types, guest isolation, CSRF/origin rejection, history idempotency and pagination, malformed/oversized streamed request bodies, persistence across environment wrappers, deletion cascade and static security headers.
- Live HTTPS checks matched all five deployed public assets byte-for-byte with the project source.
- Live `/api/health` returned `{ok:true}`.
- Live D1 checks created two test guests, saved and read all seven game state types, verified one guest could not read the other's saves, rejected hostile Origin and incorrect CSRF, inserted history idempotently and deleted both test guests.
- Live requests for server source, `.env`, the database path and deployment payload returned 404.
- The deployment staging table and authenticated transfer Worker were removed after successful deployment.
- Earlier local integration coverage saved and restored every actual frontend checkpoint, recorded practice results and deleted guest data. Frontend rendering tests use jsdom/canvas stubs, not a complete browser/device matrix.

## Source and redeployment

The public source repository is https://github.com/Ahmad6807/chameleon-arcade-site. It contains the full Node application, Worker adapter, migration, tests and deployment configuration rather than only the earlier static version. GitHub push is not an automatic deployment trigger. See the main README for redeployment commands.

The current release bundles only `index.html`, `games.js`, `games.css`, `app.js` and `app.css` into the Worker. It has no runtime dependency on GitHub or this workspace. The normal Wrangler configuration can alternatively deploy the allowlisted `dist/` assets through an ASSETS binding. D1 stays separate from code versions and must not be recreated for updates.

## Important limits

Free-tier service quotas still apply; no uptime guarantee is made. There was no load test, penetration test, full accessibility audit, exhaustive mobile/cross-browser matrix or disaster-recovery rehearsal. Worker rate limits are isolate-local best-effort controls. CSP retains `unsafe-inline` for the existing inline scripts and styles.

Saves and results are private, client-supplied practice data, not authoritative competitive scores. Guest access lasts 30 days; losing the cookie loses access because there are no user accounts or recovery flow. Development-preview sessions/saves were not migrated to the new origin. Expiry does not delete database records, and scheduled retention, external monitoring and independent offsite backups have not been configured. The local backup script applies to local SQLite, not hosted D1.
