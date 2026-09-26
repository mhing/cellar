# Cellar Ledger

A private, editable version of the Cellar Ledger, hosted on **Cloudflare Workers** (static site + a small API), protected by **Cloudflare Access** (email login), with edits saved to **Cloudflare KV**. Everything used here is on Cloudflare's free plans.

```
public/                 the site (index.html, styles.css, app.js — vanilla JS, no build step)
src/index.js            Worker entry: routes /api/cellar to the handlers, serves public/ otherwise
functions/
├── api/cellar.js       GET/PUT the ledger (saves to KV, keeps 90-day backups)
└── _lib/access.js      verifies the Cloudflare Access login token
data/seed.json          starting data, exported from the current ledger
test/                   vitest tests (run with `npm test`)
wrangler.toml           Worker, assets and KV configuration
package.json
.dev.vars.example       local-only settings
```

## How it works

- On first load the site shows `data/seed.json`. The first time anyone saves, the ledger is written to KV and KV becomes the source of truth from then on.
- **Edit** in the header turns on edit mode. You get *Edit* / *Remove* on every row, *+ Add bottle* under each table, *Bought* on Next up rows (moves a bottle into the cellar tables), and *Edit note* for the Next up total line.
- Every change saves automatically. If someone else saved since you loaded the page, your change is rejected and you're asked to reload, so nobody overwrites anyone else.
- Each save keeps the previous version as `backup:<timestamp>` in KV for 90 days.
- The shelf map is built from each bottle's **Shelf** field. To move a bottle, edit it and change the shelf.

## Deploy (about 20–30 minutes, one time)

The repo is connected to Cloudflare **Workers Builds**: every push to `main` deploys production, and other branches get a preview URL. You need a free Cloudflare account and Node.js 22 or newer (Wrangler 4 requires it) on your computer for the one-off setup below.

### 1. Install and log in

```bash
npm install
npx wrangler login
```

### 2. The KV store

`wrangler.toml` already binds `CELLAR_KV` to the namespace in this account (`account_id` is set there too), so there's nothing to do here. Pushing to `main` deploys the site and Workers Builds prints its address, e.g. `https://cellar.<your-subdomain>.workers.dev`. **Don't share it yet.** Until step 4 is done the API refuses every request, so the page loads but won't show any data.

If you're setting this up in a *different* Cloudflare account (a fork, say), create your own namespace and swap in its id and your `account_id`:

```bash
npx wrangler kv namespace create CELLAR_KV
```

### 3. Put Cloudflare Access in front of the site

In the Cloudflare dashboard:

1. Open **Zero Trust**. If it's your first time, pick a team name (this becomes `yourteam.cloudflareaccess.com`) and choose the **Free** plan.
2. Go to **Access → Applications → Add an application → Self-hosted**.
3. Add a public hostname for your site's domain, e.g. `cellar.<your-subdomain>.workers.dev`. If you use preview deployments, add a second one for them: `*-cellar.<your-subdomain>.workers.dev`.
4. Add a policy: **Action: Allow**, **Include → Emails**, and list the email addresses that should get in.
5. For login methods, **One-time PIN** (a code sent by email) works with no extra setup. You can add Google login later if you prefer.
6. Save, then open the application's **Overview** and copy the **Application Audience (AUD) tag**.

### 4. Tell the site about Access

The `[vars]` block in `wrangler.toml` already holds this account's Access team domain and Application Audience (AUD) tag, so for this repo there's nothing to change. Neither value is a secret.

Deploying to a *different* account? Replace both values with your own team domain and the AUD tag from step 3 (in `[vars]` and again in `[previews.vars]`), then push to `main`. Visit the site: you should be asked for your email and a one-time code, and then the ledger appears.

Because `wrangler.toml` is committed, every deploy applies the bindings and vars from it; settings changed only in the dashboard are overwritten on the next build, so keep them in the file.

*Why two layers?* Access blocks anyone not on your list before they reach the site. The API also checks Access's signed login token itself, so it stays locked even if a URL is ever left uncovered by the Access policy.

### Deploying from your machine instead

`npx wrangler deploy` (or `npm run deploy`) deploys exactly what's on your machine. Use one method or the other for a given project — mixing them just means the latest push or deploy wins.

## Running it locally

```bash
cp .dev.vars.example .dev.vars   # sets DEV_ALLOW_UNAUTH=true, local only
npm run dev                      # http://localhost:8788
```

Local data is stored under `.wrangler/` and never touches your live ledger. **Never add `DEV_ALLOW_UNAUTH` to the live site's settings** — it disables the login check entirely.

## Tests

```bash
npm test
```

Vitest tests in `test/` cover the Access token verification and the `/api/cellar` handler (version conflicts, input validation, backups). They run in GitHub Actions on every push and pull request.

## Backups and restoring

List backups:

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
- **Preview deployments are sandboxed.** Workers Builds deploys other branches to preview URLs, and the `[previews]` block in `wrangler.toml` binds `CELLAR_KV` to a separate, empty namespace (titled `CELLAR_KV_PREVIEW`; it starts from `data/seed.json`), so nothing done on a preview reaches the live ledger. Preview URLs are only usable if the Access application also covers `*-cellar.<your-subdomain>.workers.dev`; otherwise their API returns 401.

## Customising

- Shelves live in `shelves` in the data (`id`, `name`, `tag`). Edit `data/seed.json` before your first save, or edit the `cellar` key in KV afterwards.
- Styles, categories and maturity labels are defined at the top of `public/app.js`.
- Colours are CSS variables at the top of `public/styles.css`, with dark-mode versions.
