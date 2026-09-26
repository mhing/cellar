# Cellar Ledger

A private, editable version of the Cellar Ledger, hosted on **Cloudflare Pages**, protected by **Cloudflare Access** (email login), with edits saved to **Cloudflare KV**. Everything used here is on Cloudflare's free plans.

```
public/                 the site (index.html, styles.css, app.js — vanilla JS, no build step)
functions/
├── api/cellar.js       GET/PUT the ledger (saves to KV, keeps 90-day backups)
└── _lib/access.js      verifies the Cloudflare Access login token
data/seed.json          starting data, exported from the current ledger
test/                   vitest tests for the two Functions (run with `npm test`)
wrangler.toml           Pages + KV configuration
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

You need a free Cloudflare account and Node.js 18 or newer on your computer.

### 1. Install and log in

```bash
npm install
npx wrangler login
```

### 2. Create the KV store

```bash
npx wrangler kv namespace create CELLAR_KV
```

Copy the `id` it prints into `wrangler.toml` in place of `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

### 3. Create the Pages project and deploy

```bash
npx wrangler pages project create cellar-ledger --production-branch main
npx wrangler pages deploy
```

Wrangler prints your site address, e.g. `https://cellar-ledger.pages.dev`. **Don't share it yet.** Until step 5 is done the API refuses every request, so the page loads but won't show any data.

### 4. Put Cloudflare Access in front of the site

In the Cloudflare dashboard:

1. Open **Zero Trust**. If it's your first time, pick a team name (this becomes `yourteam.cloudflareaccess.com`) and choose the **Free** plan.
2. Go to **Access → Applications → Add an application → Self-hosted**.
3. Add a public hostname for your site's domain, e.g. `cellar-ledger.pages.dev`. Add a second one for preview deployments: `*.cellar-ledger.pages.dev`.
4. Add a policy: **Action: Allow**, **Include → Emails**, and list the email addresses that should get in.
5. For login methods, **One-time PIN** (a code sent by email) works with no extra setup. You can add Google login later if you prefer.
6. Save, then open the application's **Overview** and copy the **Application Audience (AUD) tag**.

### 5. Tell the site about Access, then redeploy

Add this to the bottom of `wrangler.toml`, using your own values:

```toml
[vars]
ACCESS_TEAM_DOMAIN = "yourteam.cloudflareaccess.com"
ACCESS_AUD = "paste-the-AUD-tag-here"
```

Then redeploy:

```bash
npx wrangler pages deploy
```

Visit the site. You should be asked for your email and a one-time code, and then the ledger appears.

*Why two layers?* Access blocks anyone not on your list before they reach the site. The API also checks Access's signed login token itself, so it stays locked even if a URL is ever left uncovered by the Access policy.

## Running it locally

```bash
cp .dev.vars.example .dev.vars   # sets DEV_ALLOW_UNAUTH=true, local only
npm run dev                      # http://localhost:8788
```

Local data is stored under `.wrangler/` and never touches your live ledger. **Never add `DEV_ALLOW_UNAUTH` to the live site's settings.**

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

## Customising

- Shelves live in `shelves` in the data (`id`, `name`, `tag`). Edit `data/seed.json` before your first save, or edit the `cellar` key in KV afterwards.
- Styles, categories and maturity labels are defined at the top of `public/app.js`.
- Colours are CSS variables at the top of `public/styles.css`, with dark-mode versions.
