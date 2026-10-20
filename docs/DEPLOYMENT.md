# Deployment and operations

How the Cellar Ledger is hosted, configured and maintained. For what the app does and how to use it, see the [README](../README.md).

## Architecture

- **Cloudflare Worker** (`src/index.js`) serves the static site from `public/` and routes `/api/cellar` to the handlers in `functions/api/cellar.js`.
- **Cloudflare KV** (binding `CELLAR_KV`) stores the ledger as one JSON document under the key `cellar`, with the previous version of every save kept as `backup:<timestamp>` for 90 days.
- **Cloudflare Access** (Zero Trust) sits in front of the site and only admits the email addresses on its policy. The API also verifies Access's signed login token itself (`functions/_lib/access.js`), so it stays locked even if a URL is ever left uncovered by the Access policy.
- **Workers Builds** deploys the repo: every push to `main` goes to production, and every other branch gets a preview URL with its own sandboxed KV namespace.

Everything runs on Cloudflare's free plans.

```
public/                 the site (index.html, styles.css, app.js — vanilla JS, no build step)
src/index.js            Worker entry: routes /api/cellar to the handlers, serves public/ otherwise
functions/
├── api/cellar.js       GET/PUT the ledger (saves to KV, keeps 90-day backups)
└── _lib/access.js      verifies the Cloudflare Access login token
data/seed.json          starting data; shown until the first save writes to KV
test/                   vitest tests (run with `npm test`)
wrangler.toml           Worker, assets, KV and Access configuration
.dev.vars.example       local-only settings
```

## Configuration

Everything lives in `wrangler.toml`, which is committed. Because Workers Builds reads bindings and vars from it on every deploy, settings changed only in the dashboard are overwritten on the next build: keep them in the file. None of these values are secrets.

| Setting | Where | Notes |
|---|---|---|
| `account_id` | top level | The Cloudflare account. Lets `wrangler` commands run without an account picker. |
| `CELLAR_KV` | `[[kv_namespaces]]` | The production namespace id. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `[vars]` | The Zero Trust team domain and the Access application's Audience (AUD) tag. |
| `[previews]` | | Branch previews bind `CELLAR_KV` to a separate namespace (`CELLAR_KV_PREVIEW`) and reuse the Access vars. Workers Builds refuses to deploy a preview without this block. |

## Setting it up in a new account

Only needed for a fork or a move to another Cloudflare account; this repo is already configured. You need Node.js 22 or newer (Wrangler 4 requires it).

1. **Log in**: `npm install && npx wrangler login`. On the consent page leave every permission ticked; a token with only `user:read` cannot list accounts and every command fails with "Failed to automatically retrieve account IDs".
2. **KV**: `npx wrangler kv namespace create CELLAR_KV` and `npx wrangler kv namespace create CELLAR_KV_PREVIEW`. Put the ids in `wrangler.toml` (`[[kv_namespaces]]` and `[[previews.kv_namespaces]]`) and set `account_id`.
3. **Access**: in the dashboard open **Zero Trust** (pick a team name and the Free plan if it's new), then **Access → Applications → Add an application → Self-hosted**. Hostnames: `cellar.<your-subdomain>.workers.dev` and, for previews, `*-cellar.<your-subdomain>.workers.dev`. Policy: Allow → Include → Emails. One-time PIN needs no extra setup. Save, then copy the **Application Audience (AUD) tag** from the application's Overview.
4. Put the team domain and AUD in `[vars]` and `[previews.vars]`.
5. **Connect the repo**: Workers & Pages → Create → Worker → Import a repository. Build command empty, deploy command `npx wrangler deploy`. The Worker's name must match `name` in `wrangler.toml`.
6. Push to `main`. Visit the site: you should be asked for your email and a one-time code, and then the ledger appears. Until step 4 is deployed the API returns 500 and the page shows no data.

### Deploying from your machine instead

`npx wrangler deploy` (or `npm run deploy`) deploys exactly what's on your machine. Use one method or the other for a project; mixing them just means the latest push or deploy wins.

## Running it locally

```bash
cp .dev.vars.example .dev.vars   # sets DEV_ALLOW_UNAUTH=true, local only
npm run dev                      # http://localhost:8787
```

Local data is stored under `.wrangler/` and never touches the live ledger. **Never add `DEV_ALLOW_UNAUTH` to the live site's settings**: it disables the login check entirely.

## Tests

```bash
npm test
```

Vitest tests in `test/` cover the Access token verification, the `/api/cellar` handler (version conflicts, input validation, backups) and the Worker's routing. GitHub Actions runs them on every push and pull request.

## Backups and restoring

Every save writes the previous document to `backup:<timestamp>`, kept for 90 days. List them:

```bash
npx wrangler kv key list --binding CELLAR_KV --remote
```

Restore one, e.g. to undo a mistake:

```bash
npx wrangler kv key get "backup:2026-09-26T09:15:38.094Z" --binding CELLAR_KV --remote > restore.json
npx wrangler kv key put cellar --path restore.json --binding CELLAR_KV --remote
```

To start again from the original seed, delete the `cellar` key. The site falls back to `data/seed.json` until the next save.

## Limits worth knowing

- **KV free tier** (as of September 2026): 100,000 reads and 1,000 writes per day. Each save uses 2 writes, so that's roughly 500 edits a day, far more than a cellar needs.
- **KV is eventually consistent.** Changes can take up to a minute to appear everywhere. If two people edit within that window from different places, the conflict check is best-effort. For a household that's fine. If it ever matters, the same API can be moved to Cloudflare D1, a database with immediate consistency.
- **Access free plan**: up to 50 users.
- **Preview deployments are sandboxed.** They use their own empty KV namespace (seeded from `data/seed.json`), so nothing done on a preview reaches the live ledger. Preview URLs only work if the Access application covers `*-cellar.<your-subdomain>.workers.dev`; otherwise their API returns 401.
