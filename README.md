# Cellar Ledger

A private, shared record of what's in the wine cellar: every bottle of Champagne and red, which shelf it's on, how it's coming along, and what to buy next. It's a website that only the people on its login list can open; anyone on the list can edit, and every change is saved for everyone straight away.

## Views

The tabs across the top switch between five views:

- **Full Cellar**: the Champagne and Red wine tables together, with shared Category and Maturity filters above them.
- **Champagne**: just the Champagne table, with filters by house, style, category and maturity. Each row shows the house, cuvée, style, vintage, disgorgement date, years on lees, category, maturity and drink-by window.
- **Reds**: just the red wine table: vineyard, bottle, style, category, maturity and drink-by.
- **Shelf map**: every bottle laid out by shelf, so you can see what's where. Click a category in the legend to highlight those bottles on every shelf. Bottles with no shelf set are listed separately.
- **Fillers**: the shopping side. *Next up* is the current order, *Premier Fillers* are the good bottles to keep an eye out for, and *Everyday stock fillers* are the reliable ones with links to where to buy them.
- **Ratings**: every wine you have drunk and scored, one row per wine, with Matt's score, Rachael's score and the combined score. Highest first.
- **Recycle bin**: the log of what was drunk and when, newest first, with both scores and any notes.

The Reds tab also has a **Red fillers** table under the cellar reds: red bottles to buy again.

Each table has its own filter bar; **Clear** resets it. The view you were last on is remembered on that device.

### Reading the tables

- **Style** on Champagne rows shows a small bar of the blend: Chardonnay, Pinot Noir and Meunier, left to right. A key sits above each Champagne table.
- **Category** is why the bottle is here: *Aging* (laid down deliberately), *Special* (for a proper occasion), *Wedding*, or *Everyday*.
- **Maturity** is a judgement, not a rule: *Youthful*, *Nearly there*, *At peak*.
- **est.** after a figure means it's an estimate rather than something from the producer.
- **Qty** is how many of that bottle are in the cellar. The group count and the shelf map add them up.
- **★ 4.2** next to a bottle is its latest combined score, from the last time you drank one. It shows in every table, so a rating from the cellar follows the wine into Fillers.
- A dash means the field isn't filled in.

## Editing

**Edit** in the header turns on edit mode; **Done editing** turns it off. In edit mode every table gains:

- **Edit** and **Remove** on each row. Editing opens a form; House and Cuvée (or Vineyard and Bottle for reds) are required, everything else is optional. Remove asks you to confirm.
  - For Champagne, the ageing fields (disgorgement, years on lees, maturity, drink by) sit behind **More details**. They open on their own when the bottle has a vintage year or any of them is filled in.
  - The form suggests the ageing fields as you type, and marks them as estimates. *Yrs on lees* = disgorgement year − vintage year − 1. *Drink by*: with a disgorgement date, disgorgement year + years on lees (if lees is blank, the vintage figure above, or 3 for NV); with no disgorgement date, vintage + 10 for vintage bottles and blank for NV. *Maturity* from the years left until drink-by: more than 5 → Youthful, 2 to 5 → Nearly there, 2 or fewer → At peak. A new bottle whose maturity comes out Youthful or Nearly there gets the *Aging* category.
  - Suggestions never overwrite something you typed or picked yourself, and they update if you change the inputs they came from.
  - A new bottle's shelf is suggested too: the shelf where the same wine already sits, else where most of that house sits, else the emptiest shelf whose tag fits the category (Everyday → Bottom, other Champagne → Champagne Reserve, reds → Aging Reds).
- **+ Add bottle** under each table.
- **− and +** next to the quantity on cellar rows.
- **Drank** on cellar rows: see below.
- **Add to cellar** on Next up rows: puts that bottle on the Add bottles list.
- **Edit note** on the Next up total line.

To move a bottle to another shelf, edit it and change its **Shelf**. The shelf map updates itself.

### Drinking a bottle

In edit mode, press **Drank** on a cellar row. Turn the two dials to set Matt's and Rachael's scores (0.0 to 5.0 in steps of 0.1; drag or tap the ring, or use the arrow keys; press *clear* to leave one blank if only one of you tried it), add the date and any notes, and save. Then:

- the bottle's quantity drops by one, and the row leaves the cellar and the shelf map when it reaches zero;
- the wine goes back to a fillers list so it can be bought again: Champagne with the *Everyday* category goes to Everyday stock, other Champagne to Premier Fillers, reds to Red fillers;
- the entry appears in the Recycle bin and the Ratings tab, and its combined score shows as a chip wherever that wine is listed.

Scores can be corrected later: in edit mode, use **Edit** on the Recycle bin row.

### Adding bottles

**Add bottles** in the header works in any view and takes several bottles in one go.

1. **Build the list.** Pick what you are adding and press *Add to list*:
   - *From the fillers lists*: a bottle from Next up, Premier, Everyday or Red fillers. Bottles from Next up are removed from the order when you save (untick *Remove from Next up* on the line to keep them).
   - *More of a bottle already in the cellar*: its count goes up by the quantity.
   - *A new bottle*: choose Champagne or Red and give its name.
   Each line has a quantity you can change, and a *Remove* button.
2. **Fill in the details.** Press *Next: details*. The cellar form opens for each bottle in turn ("Details 1 of 3"), pre-filled from the fillers row or the name you gave, with the shelf suggested. *Back* returns to the previous bottle or the list. Bottles already in the cellar skip this step.
3. **Save all** on the last form saves everything as one change.

**Add to cellar** on a Next up row puts that bottle on the list and opens the dialog.

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
