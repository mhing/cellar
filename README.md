# Cellar Ledger

A private, shared record of what's in the wine cellar: every bottle of Champagne and red, which shelf it's on, how it's coming along, and what to buy next. It's a website that only the people on its login list can open; anyone on the list can edit, and every change is saved for everyone straight away.

## Views

The tabs across the top switch between five views:

- **Full Cellar**: the Champagne and Red wine tables together, with shared Category and Maturity filters above them.
- **Champagne**: just the Champagne table, with filters by house, style, category and maturity. Each row shows the house, cuvée, style, vintage, disgorgement date, years on lees, category, maturity and drink-by window.
- **Reds**: just the red wine table: vineyard, bottle, style, category, maturity and drink-by.
- **Shelf map**: every bottle laid out by shelf, so you can see what's where. Click a category in the legend to highlight those bottles on every shelf. Bottles with no shelf set are listed separately.
- **Fillers**: the shopping side. *Next up* is the current order, *Premier Fillers* are the good bottles to keep an eye out for, and *Everyday stock fillers* are the reliable ones with links to where to buy them.

Each table has its own filter bar; **Clear** resets it. The view you were last on is remembered on that device.

### Reading the tables

- **Style** on Champagne rows shows a small bar of the blend: Chardonnay, Pinot Noir and Meunier, left to right. A key sits above each Champagne table.
- **Category** is why the bottle is here: *Aging* (laid down deliberately), *Special* (for a proper occasion), *Wedding*, or *Everyday*.
- **Maturity** is a judgement, not a rule: *Youthful*, *Nearly there*, *At peak*.
- **est.** after a figure means it's an estimate rather than something from the producer.
- A dash means the field isn't filled in.

## Editing

**Edit** in the header turns on edit mode; **Done editing** turns it off. In edit mode every table gains:

- **Edit** and **Remove** on each row. Editing opens a form; House and Cuvée (or Vineyard and Bottle for reds) are required, everything else is optional. Remove asks you to confirm.
- **+ Add bottle** under each table.
- **Bought** on Next up rows: it opens the form for the cellar table the bottle belongs in, pre-filled from the order, with a tick box to remove it from Next up at the same time. The vintage is picked out of the cuvée name if there is one.
- **Edit note** on the Next up total line.

To move a bottle to another shelf, edit it and change its **Shelf**. The shelf map updates itself.

### Saving

Every change saves on its own; there's no save button. The header shows *Saving…*, then *Saved* with the time, and *Last saved* with the date when you open the page.

If someone else saved a change after you loaded the page, your change is refused rather than overwriting theirs. You'll see a banner asking you to reload; do that, then make the change again. If your login has expired you'll be asked to sign in again, and the last change won't have been saved.

## Signing in

The site is protected by Cloudflare Access. Open it, enter your email address, and paste the one-time code that arrives. Only addresses on the access list get a code.

## For the household

- **Shelves** are part of the data: each has an id, a name and a tag (the label shown under its name). They're edited in the data itself rather than the page; see the deployment guide.
- **Categories, styles and maturity labels** are defined at the top of `public/app.js`.
- **Colours** are CSS variables at the top of `public/styles.css`, with dark-mode versions. Dark mode follows the device setting.

## For developers

The site is plain HTML, CSS and JavaScript in `public/` with a small API in `functions/`, deployed as a Cloudflare Worker. There's no build step.

```bash
npm install
npm run dev     # local copy at http://localhost:8787, with its own data
npm test        # vitest
```

Hosting, configuration, Access setup, backups and limits are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
