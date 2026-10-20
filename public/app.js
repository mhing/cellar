(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const API = '/api/cellar';
  const VIEW_KEY = 'cellar-ledger-view';

  const CATEGORIES = { aging: 'Aging', special: 'Special', wedding: 'Wedding', everyday: 'Everyday' };
  const MATURITY = { young: 'Youthful', near: 'Nearly there', peak: 'At peak' };
  const MATURITY_ORDER = ['Youthful', 'Nearly there', 'At peak'];
  const STYLES = {
    all: { label: 'All-rounder', mix: [34, 33, 33] },
    bdb: { label: 'Blanc de Blancs', mix: [100, 0, 0] },
    bdm: { label: 'Blanc de Meunier', mix: [0, 0, 100] },
    bdn: { label: 'Blanc de Noirs', mix: [0, 80, 20] },
    chard: { label: 'Chardonnay-leaning', mix: [55, 30, 15] },
    meunier: { label: 'Meunier-leaning', mix: [10, 15, 75] },
    pinot: { label: 'Pinot-leaning', mix: [30, 55, 15] },
  };
  const PRICE_BANDS = ['Under £40', '£40–50', '£50–70', '£70–100', '£100–150', '£150+', 'Price TBC'];

  // ---------------------------------------------------------------- state
  const state = {
    doc: null,
    view: 'all',
    editing: false,
    saving: false,
    pending: false,
    filters: {},       // { tableId: { key: value } }
    shared: { category: 'all', maturity: 'all' },
    shelfCat: null,
  };

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = (p) => `${p}-${(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 8)}`;
  const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/["“”]/g, '').trim().toLowerCase();
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const today = () => new Date().toISOString().slice(0, 10);
  // Cellar rows use house/cuvee (champagne) or vineyard/bottle (reds); filler and rating rows always use house/cuvee.
  const wineKey = (r) => `${norm(r.house || r.vineyard)}|${norm(r.cuvee || r.bottle)}`;
  const qtyOf = (r) => (Number.isInteger(r.qty) && r.qty > 0 ? r.qty : 1);
  const scoreOf = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
  const avgOf = (e) => {
    const given = [scoreOf(e.matt), scoreOf(e.rachael)].filter((v) => v !== null);
    return given.length ? given.reduce((a, b) => a + b, 0) / given.length : null;
  };
  const fmtScore = (v) => (scoreOf(v) === null ? '—' : v.toFixed(1));
  const fmtDate = (d) => { if (!d) return ''; const t = new Date(d); return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  const byNewest = (a, b) => String(b.drankAt || '').localeCompare(String(a.drankAt || ''));
  function latestRating(row) {
    const k = wineKey(row);
    return state.doc.ratings.filter((e) => wineKey(e) === k).sort(byNewest)[0] || null;
  }

  function priceBand(text) {
    const n = (String(text || '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!n.length) return 'Price TBC';
    const m = n.length > 1 ? (n[0] + n[1]) / 2 : n[0];
    return m < 40 ? 'Under £40' : m < 50 ? '£40–50' : m < 70 ? '£50–70' : m < 100 ? '£70–100' : m < 150 ? '£100–150' : '£150+';
  }

  // ---------------------------------------------------------------- tokens
  const catPill = (k) => (k && CATEGORIES[k] ? `<span class="pill cat-${k}">${CATEGORIES[k]}</span>` : '');
  const matPill = (k) => (k && MATURITY[k] ? `<span class="chip mat-${k}">${MATURITY[k]}</span>` : '');
  function styleChip(row) {
    if (row.wine === 'red') return row.style ? `<span class="chip style">${esc(row.style)}</span>` : '';
    const s = STYLES[row.style];
    if (!s) return '';
    const [c, pn] = s.mix;
    const bar = `linear-gradient(90deg, var(--g-ch) 0 ${c}%, var(--g-pn) ${c}% ${c + pn}%, var(--g-pm) ${c + pn}% 100%)`;
    return `<span class="chip style"><span class="bar" style="background:${bar}"></span>${s.label}</span>`;
  }
  const redStyleChip = (r) => (r.style ? `<span class="chip style">${esc(r.style)}</span>` : '');
  const mono = (v) => (v ? `<span class="mono">${esc(v)}</span>` : '<span class="blank">—</span>');
  const withEst = (v, est) => (v ? `<span class="mono">${esc(v)}</span>${est ? '<span class="est">est.</span>' : ''}` : '');
  const ratingChip = (row) => {
    const e = latestRating(row);
    const avg = e ? avgOf(e) : null;
    if (avg === null) return '';
    return `<span class="chip rating" title="Matt ${fmtScore(e.matt)} · Rachael ${fmtScore(e.rachael)}">★ ${fmtScore(avg)}</span>`;
  };
  const scoreCell = (v) => (scoreOf(v) === null ? '<span class="blank">—</span>' : `<span class="mono">${fmtScore(v)}</span>`);
  const qtyCell = (r, id) =>
    `<span class="qty"><button type="button" class="btn small edit-only" data-act="qty" data-delta="-1" data-table="${id}" data-id="${esc(r.id)}" aria-label="One fewer">−</button><span class="mono">${qtyOf(r)}</span><button type="button" class="btn small edit-only" data-act="qty" data-delta="1" data-table="${id}" data-id="${esc(r.id)}" aria-label="One more">+</button></span>`;
  const grapeKey = () =>
    '<div class="grape-key"><span>Style bar:</span><span><i style="background:var(--g-ch)"></i>Chardonnay</span><span><i style="background:var(--g-pn)"></i>Pinot Noir</span><span><i style="background:var(--g-pm)"></i>Meunier</span></div>';

  // ---------------------------------------------------------------- table definitions
  const TABLES = {
    champagne: {
      list: 'champagne', title: 'Champagne', group: 'champagne', grapeKey: true,
      columns: [
        { label: 'House', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Cuvée', html: (r) => esc(r.cuvee) },
        { label: 'Style', html: styleChip },
        { label: 'Vintage', html: (r) => mono(r.vintage) },
        { label: 'Disgorged', html: (r) => mono(r.disgorged) },
        { label: 'Yrs on lees', html: (r) => (r.lees ? withEst(r.lees, r.leesEst) : '<span class="blank">—</span>') },
        { label: 'Category', html: (r) => catPill(r.category) },
        { label: 'Maturity', html: (r) => matPill(r.maturity) },
        { label: 'Drink by', html: (r) => withEst(r.drinkBy, r.drinkByEst) },
        { label: 'Qty', html: qtyCell },
        { label: 'Rating', html: ratingChip },
      ],
      filters: [
        { key: 'house', label: 'House', value: (r) => r.house },
        { key: 'style', label: 'Style', value: (r) => (STYLES[r.style] || {}).label || '' },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '', local: true },
        { key: 'maturity', label: 'Maturity', value: (r) => MATURITY[r.maturity] || '', order: MATURITY_ORDER, local: true },
      ],
      form: 'champagne', qty: true, drank: true,
      emptyRow: () => ({ id: uid('c'), house: '', cuvee: '', style: '', vintage: 'NV', disgorged: '', lees: '', leesEst: false, category: 'everyday', maturity: '', drinkBy: '', drinkByEst: false, shelf: '', qty: 1 }),
    },
    reds: {
      list: 'reds', title: 'Red wine', group: 'red',
      columns: [
        { label: 'Vineyard', html: (r) => `<span class="house">${esc(r.vineyard)}</span>` },
        { label: 'Bottle', html: (r) => esc(r.bottle) },
        { label: 'Style', html: redStyleChip },
        { label: 'Category', html: (r) => catPill(r.category) },
        { label: 'Maturity', html: (r) => matPill(r.maturity) },
        { label: 'Drink by', html: (r) => mono(r.drinkBy) },
        { label: 'Qty', html: qtyCell },
        { label: 'Rating', html: ratingChip },
      ],
      filters: [
        { key: 'style', label: 'Style', value: (r) => r.style },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '', local: true },
        { key: 'maturity', label: 'Maturity', value: (r) => MATURITY[r.maturity] || '', order: MATURITY_ORDER, local: true },
      ],
      form: 'red', qty: true, drank: true,
      emptyRow: () => ({ id: uid('r'), vineyard: '', bottle: '', style: '', category: 'aging', maturity: '', drinkBy: '', shelf: '', qty: 1 }),
    },
    redFillers: {
      list: 'redFillers', title: 'Red fillers', group: 'redfillers', sorted: true,
      columns: [
        { label: 'Vineyard', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Bottle', html: (r) => esc(r.cuvee) },
        { label: 'Price', html: (r) => mono(r.price) },
        { label: 'Style', html: redStyleChip },
        { label: 'Category', html: (r) => catPill(r.category) },
        { label: 'Est. window', html: (r) => mono(r.window) },
        { label: 'Rating', html: ratingChip },
        { label: 'Notes', cls: 'notes', html: (r) => esc(r.notes) },
      ],
      filters: [
        { key: 'style', label: 'Style', value: (r) => r.style },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '' },
        { key: 'price', label: 'Price', value: (r) => priceBand(r.price), order: PRICE_BANDS },
      ],
      form: 'redFiller',
      emptyRow: () => ({ id: uid('rf'), house: '', cuvee: '', price: '', wine: 'red', style: '', category: 'aging', window: '', notes: '' }),
    },
    nextUp: {
      list: 'nextUp', title: 'Next up — Majestic Mix Six', group: 'fillers', grapeKey: true, note: 'nextUpNote',
      columns: [
        { label: 'House / Vineyard', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Cuvée / Bottle', html: (r) => esc(r.cuvee) },
        { label: 'Price', html: (r) => mono(r.price) },
        { label: 'Style', html: styleChip },
        { label: 'Category', html: (r) => catPill(r.category) },
        { label: 'Est. window', html: (r) => mono(r.window) },
        { label: 'Rating', html: ratingChip },
        { label: 'Notes', cls: 'notes', html: (r) => esc(r.notes) },
      ],
      filters: [],
      form: 'filler', bought: true,
      emptyRow: () => ({ id: uid('n'), house: '', cuvee: '', price: '', wine: 'champagne', style: '', category: 'special', window: '', notes: '' }),
    },
    premier: {
      list: 'premier', title: 'Premier Fillers', group: 'fillers', grapeKey: true, sorted: true,
      columns: [
        { label: 'House', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Cuvée', html: (r) => esc(r.cuvee) },
        { label: 'Price', html: (r) => mono(r.price) },
        { label: 'Style', html: styleChip },
        { label: 'Category', html: (r) => catPill(r.category) },
        { label: 'Est. window', html: (r) => mono(r.window) },
        { label: 'Rating', html: ratingChip },
        { label: 'Notes', cls: 'notes', html: (r) => esc(r.notes) },
      ],
      filters: [
        { key: 'house', label: 'House', value: (r) => r.house },
        { key: 'style', label: 'Style', value: (r) => (r.wine === 'red' ? r.style : (STYLES[r.style] || {}).label || '') },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '' },
        { key: 'price', label: 'Price', value: (r) => priceBand(r.price), order: PRICE_BANDS },
      ],
      form: 'filler',
      emptyRow: () => ({ id: uid('p'), house: '', cuvee: '', price: '', wine: 'champagne', style: '', category: 'special', window: '', notes: '' }),
    },
    everyday: {
      list: 'everyday', title: 'Everyday stock fillers', group: 'fillers', grapeKey: true, sorted: true,
      columns: [
        { label: 'House', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Cuvée', html: (r) => esc(r.cuvee) },
        { label: 'Price', html: (r) => mono(r.price) },
        { label: 'Style', html: styleChip },
        { label: 'Where to buy', html: (r) => { const u = safeUrl(r.link); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(r.where || 'Link')}</a>` : esc(r.where); } },
        { label: 'Rating', html: ratingChip },
        { label: 'Notes', cls: 'notes', html: (r) => esc(r.notes) },
      ],
      filters: [
        { key: 'house', label: 'House', value: (r) => r.house },
        { key: 'style', label: 'Style', value: (r) => (STYLES[r.style] || {}).label || '' },
        { key: 'price', label: 'Price', value: (r) => priceBand(r.price), order: PRICE_BANDS },
      ],
      form: 'everyday',
      emptyRow: () => ({ id: uid('e'), house: '', cuvee: '', price: '', style: '', where: '', link: '', notes: '' }),
    },
    recycle: {
      list: 'ratings', title: 'Recycle bin', group: 'recycle', newest: true, noAdd: true,
      columns: [
        { label: 'Drunk', html: (r) => mono(fmtDate(r.drankAt)) },
        { label: 'House / Vineyard', html: (r) => `<span class="house">${esc(r.house)}</span>` },
        { label: 'Cuvée / Bottle', html: (r) => esc(r.cuvee) },
        { label: 'Vintage', html: (r) => mono(r.vintage) },
        { label: 'Wine', html: (r) => esc(r.wine === 'red' ? 'Red' : 'Champagne') },
        { label: 'Style', html: styleChip },
        { label: 'Matt', html: (r) => scoreCell(r.matt) },
        { label: 'Rachael', html: (r) => scoreCell(r.rachael) },
        { label: 'Average', html: (r) => `<span class="chip rating">★ ${fmtScore(avgOf(r))}</span>` },
        { label: 'Notes', cls: 'notes', html: (r) => esc(r.notes) },
      ],
      filters: [
        { key: 'house', label: 'House', value: (r) => r.house },
        { key: 'wine', label: 'Wine', value: (r) => (r.wine === 'red' ? 'Red' : 'Champagne') },
        { key: 'style', label: 'Style', value: (r) => (r.wine === 'red' ? r.style : (STYLES[r.style] || {}).label || '') },
      ],
      form: 'rating',
      emptyRow: () => ({ id: uid('d'), house: '', cuvee: '', vintage: '', wine: 'champagne', style: '', drankAt: today(), matt: null, rachael: null, notes: '' }),
    },
  };

  // ---------------------------------------------------------------- filtering
  function sortedRows(def) {
    const rows = [...(state.doc[def.list] || [])];
    if (def.sorted) rows.sort((a, b) => norm(a.house).localeCompare(norm(b.house)) || norm(a.cuvee).localeCompare(norm(b.cuvee)));
    if (def.newest) rows.sort(byNewest);
    return rows;
  }

  function activeFilters(id, def) {
    const f = state.filters[id] || {};
    const out = [];
    const shared = state.view === 'all' && (id === 'champagne' || id === 'reds');
    for (const flt of def.filters) {
      if (shared && flt.local) continue;
      const v = f[flt.key] || 'all';
      if (v !== 'all') out.push([flt, v]);
    }
    if (shared) {
      if (state.shared.category !== 'all') out.push([{ value: (r) => CATEGORIES[r.category] || '' }, state.shared.category]);
      if (state.shared.maturity !== 'all') out.push([{ value: (r) => MATURITY[r.maturity] || '' }, state.shared.maturity]);
    }
    return out;
  }

  const rowMatches = (row, active) => active.every(([flt, v]) => flt.value(row) === v);

  function optionsFor(rows, flt) {
    const vals = [...new Set(rows.map(flt.value).filter(Boolean))];
    return flt.order ? vals.sort((a, b) => flt.order.indexOf(a) - flt.order.indexOf(b)) : vals.sort((a, b) => a.localeCompare(b));
  }

  // ---------------------------------------------------------------- rendering
  function renderFilterBar(id, def, rows) {
    if (!def.filters.length) return '';
    const f = state.filters[id] || {};
    const fields = def.filters.map((flt) => {
      const opts = optionsFor(rows, flt).map((o) => `<option value="${esc(o)}"${f[flt.key] === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
      const allLabel = { house: 'All houses', style: 'All styles', category: 'All categories', maturity: 'All maturity', price: 'All prices' }[flt.key] || 'All';
      return `<label class="filter-field${flt.local ? ' local-cm' : ''}">${flt.label}
        <select data-table="${id}" data-key="${flt.key}"><option value="all">${allLabel}</option>${opts}</select></label>`;
    }).join('');
    return `<div class="filter-bar">${fields}
      <button type="button" class="filter-clear" data-clear="${id}">Clear</button>
      <span class="filter-count" data-count="${id}"></span></div>`;
  }

  function renderTable(id) {
    const def = TABLES[id];
    const rows = sortedRows(def);
    const active = activeFilters(id, def);
    const shown = rows.filter((r) => rowMatches(r, active));
    const head = def.columns.map((c) => `<th>${c.label}</th>`).join('') + '<th class="col-actions">Actions</th>';
    const body = shown.map((r) => {
      const cells = def.columns.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ''}>${c.html(r, id)}</td>`).join('');
      const actions = `<td class="col-actions">
          ${def.bought ? `<button type="button" class="btn small" data-act="bought" data-table="${id}" data-id="${esc(r.id)}">Add to cellar</button>` : ''}
          ${def.drank ? `<button type="button" class="btn small" data-act="drank" data-table="${id}" data-id="${esc(r.id)}">Drank</button>` : ''}
          <button type="button" class="btn small" data-act="edit" data-table="${id}" data-id="${esc(r.id)}">Edit</button>
          <button type="button" class="btn small danger" data-act="remove" data-table="${id}" data-id="${esc(r.id)}">Remove</button>
        </td>`;
      return `<tr>${cells}${actions}</tr>`;
    }).join('') || `<tr><td colspan="${def.columns.length + 1}" class="blank">${rows.length ? 'No matches' : 'Nothing here yet'}</td></tr>`;

    const count = def.filters.length || (state.view === 'all' && (id === 'champagne' || id === 'reds'))
      ? (shown.length ? `${shown.length} of ${rows.length} shown` : 'No matches') : '';

    const bottles = rows.reduce((n, r) => n + (def.qty ? qtyOf(r) : 1), 0);
    const heading = def.group === 'fillers' || def.group === 'recycle'
      ? `<div class="section-head"><h2>${esc(def.title)}</h2></div>`
      : `<div class="group-label">${esc(def.title)} <span class="count">${bottles} bottles</span></div>`;
    const note = def.note ? `<p class="section-note">${esc(state.doc[def.note] || '')}${state.editing ? ` <button type="button" class="btn small" data-act="note" data-note="${def.note}">Edit note</button>` : ''}</p>` : '';
    return `<div class="table-block" data-group="${def.group}" id="tbl-${id}">
      ${heading}
      ${renderFilterBar(id, def, rows)}
      ${def.grapeKey ? grapeKey() : ''}
      <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      ${def.noAdd ? '' : `<button type="button" class="btn add-row" data-act="add" data-table="${id}">+ Add bottle</button>`}
      ${note}
    </div>`.replace('<span class="filter-count" data-count="' + id + '"></span>', `<span class="filter-count">${count}</span>`);
  }

  function renderShared() {
    const rows = [...state.doc.champagne, ...state.doc.reds];
    const cats = optionsFor(rows, { value: (r) => CATEGORIES[r.category] || '' });
    const mats = optionsFor(rows, { value: (r) => MATURITY[r.maturity] || '', order: MATURITY_ORDER });
    const opt = (list, cur) => list.map((o) => `<option value="${esc(o)}"${cur === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
    return `<div class="filter-bar" data-group="allonly">
      <label class="filter-field">Category<select data-shared="category"><option value="all">All categories</option>${opt(cats, state.shared.category)}</select></label>
      <label class="filter-field">Maturity<select data-shared="maturity"><option value="all">All maturity</option>${opt(mats, state.shared.maturity)}</select></label>
      <button type="button" class="filter-clear" data-clear-shared>Clear</button></div>`;
  }

  function renderShelves() {
    const bottles = [
      ...state.doc.champagne.map((b) => ({ ...b, label: `${b.house} ${b.cuvee}` })),
      ...state.doc.reds.map((b) => ({ ...b, label: `${b.vineyard} ${b.bottle}` })),
    ];
    const legend = Object.entries(CATEGORIES).map(([k, v]) =>
      `<button type="button" class="pill cat-${k} legend-btn" data-cat="${k}" aria-pressed="${state.shelfCat === k}">${v}</button>`).join('');
    const shelves = [...state.doc.shelves];
    const unassigned = bottles.filter((b) => !shelves.some((s) => s.id === b.shelf));
    if (unassigned.length) shelves.push({ id: '__none', name: 'No shelf set', tag: 'Assign in Edit' });
    const blocks = shelves.map((s) => {
      const list = s.id === '__none' ? unassigned : bottles.filter((b) => b.shelf === s.id);
      const hits = state.shelfCat ? list.filter((b) => b.category === state.shelfCat).length : 0;
      const chips = list.map((b) => {
        const cls = state.shelfCat ? (b.category === state.shelfCat ? ' is-hit' : ' is-dim') : '';
        const times = qtyOf(b) > 1 ? ` <span class="qty-x">×${qtyOf(b)}</span>` : '';
        return `<span class="bottle-chip${cls}"><span class="dot cat-${esc(b.category)}"></span>${esc(b.label)}${times}</span>`;
      }).join('') || '<span class="empty-shelf">Empty</span>';
      const match = state.shelfCat ? (hits ? `${hits} match` : 'none') : '';
      return `<div class="shelf-block${state.shelfCat && !hits ? ' is-empty' : ''}">
        <div class="shelf-title"><h3>${esc(s.name)}</h3><span class="shelf-tag">${esc(s.tag)}</span><span class="shelf-match">${match}</span></div>
        <div class="chip-row">${chips}</div></div>`;
    }).join('');
    return `<section data-group="shelves">
      <div class="section-head"><h2>Shelf map</h2></div>
      <div class="legend${state.shelfCat ? ' has-active' : ''}" role="group" aria-label="Highlight by category">${legend}
        <button type="button" class="filter-clear" data-shelf-clear${state.shelfCat ? '' : ' hidden'}>Clear</button></div>
      ${blocks}</section>`;
  }

  function renderRatings() {
    // One row per wine, using its latest drank entry; combined score first.
    const latest = new Map();
    for (const e of [...state.doc.ratings].sort(byNewest)) {
      const k = wineKey(e);
      if (!latest.has(k)) latest.set(k, { entry: e, times: 0 });
      latest.get(k).times += 1;
    }
    const rows = [...latest.values()].sort((a, b) => (avgOf(b.entry) ?? -1) - (avgOf(a.entry) ?? -1) || byNewest(a.entry, b.entry));
    const body = rows.map(({ entry: e, times }) => `<tr>
        <td><span class="house">${esc(e.house)}</span></td><td>${esc(e.cuvee)}</td><td>${mono(e.vintage)}</td>
        <td>${esc(e.wine === 'red' ? 'Red' : 'Champagne')}</td>
        <td>${scoreCell(e.matt)}</td><td>${scoreCell(e.rachael)}</td>
        <td><span class="chip rating">★ ${fmtScore(avgOf(e))}</span></td>
        <td>${mono(fmtDate(e.drankAt))}${times > 1 ? `<span class="est">×${times}</span>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="blank">Nothing rated yet. Use Drank on a cellar bottle.</td></tr>';
    return `<section data-group="ratings">
      <div class="section-head"><h2>Ratings</h2><span class="filter-count">${rows.length} wines</span></div>
      <div class="table-wrap"><table><thead><tr><th>House / Vineyard</th><th>Cuvée / Bottle</th><th>Vintage</th><th>Wine</th><th>Matt</th><th>Rachael</th><th>Combined</th><th>Last drunk</th></tr></thead><tbody>${body}</tbody></table></div>
    </section>`;
  }

  function render() {
    if (!state.doc) return;
    const app = $('#app');
    const scrollY = window.scrollY;
    app.innerHTML = `
      ${renderShared()}
      <section data-group="cellar">${renderTable('champagne')}${renderTable('reds')}</section>
      <section data-group="redfillers">${renderTable('redFillers')}</section>
      ${renderShelves()}
      <section data-group="fillers">${renderTable('nextUp')}${renderTable('premier')}${renderTable('everyday')}</section>
      <section data-group="recycle">${renderTable('recycle')}</section>
      ${renderRatings()}`;
    applyView();
    window.scrollTo(0, scrollY);
  }

  function applyView() {
    const v = state.view;
    document.body.dataset.view = v;
    document.querySelectorAll('.view-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
    document.querySelectorAll('#app [data-group]').forEach((el) => {
      const g = el.dataset.group;
      let show;
      if (g === 'allonly') show = v === 'all';
      else if (g === 'cellar') show = v === 'all' || v === 'champagne' || v === 'red';
      else if (g === 'champagne') show = v === 'all' || v === 'champagne';
      else if (g === 'red') show = v === 'all' || v === 'red';
      else if (g === 'redfillers') show = v === 'red';
      else show = g === v;
      el.hidden = !show;
    });
  }

  // ---------------------------------------------------------------- saving
  function setStatus(text, isError) {
    const el = $('#save-status');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  function showBanner(html) {
    const b = $('#banner');
    b.innerHTML = html;
    b.hidden = !html;
  }

  async function load() {
    try {
      const res = await fetch(API, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        showBanner('You are signed out. <button type="button" class="btn small" onclick="location.reload()">Sign in again</button>');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.doc = await res.json();
      for (const list of ['ratings', 'redFillers']) if (!Array.isArray(state.doc[list])) state.doc[list] = [];
      setStatus(state.doc.updatedAt && state.doc.updatedBy !== 'seed' ? `Last saved ${new Date(state.doc.updatedAt).toLocaleString()}` : '');
      render();
    } catch (err) {
      $('#app').innerHTML = `<p class="loading">Couldn't load the ledger (${esc(err.message)}). Try reloading the page.</p>`;
    }
  }

  async function save() {
    if (state.saving) { state.pending = true; return; }
    state.saving = true;
    setStatus('Saving…');
    try {
      const { viewer, ...data } = state.doc;
      const res = await fetch(API, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: state.doc.version, data }),
      });
      if (res.status === 409) {
        setStatus('Not saved', true);
        showBanner('Someone else changed the ledger since you loaded it, so your last change wasn\'t saved. <button type="button" class="btn small" onclick="location.reload()">Reload latest</button>');
        state.pending = false;
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setStatus('Not saved', true);
        showBanner('Your session has expired, so the last change wasn\'t saved. <button type="button" class="btn small" onclick="location.reload()">Sign in again</button>');
        state.pending = false;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      if (state.pending) {
        // Another edit is queued; it will resubmit the local doc, so only take the version.
        state.doc.version = saved.version;
        state.doc.updatedAt = saved.updatedAt;
        state.doc.updatedBy = saved.updatedBy;
      } else {
        // Adopt the server's copy: it may have trimmed or normalised what we sent.
        state.doc = saved;
        for (const list of ['ratings', 'redFillers']) if (!Array.isArray(state.doc[list])) state.doc[list] = [];
        render();
      }
      setStatus(`Saved ${new Date(saved.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      setStatus('Save failed — check connection', true);
    } finally {
      state.saving = false;
      if (state.pending) { state.pending = false; save(); }
    }
  }

  function commit() { render(); save(); }

  // ---------------------------------------------------------------- editor dialog
  const dialog = $('#editor');
  let editorCtx = null;

  const opts = (map, cur, blank) =>
    (blank ? `<option value=""${!cur ? ' selected' : ''}>${blank}</option>` : '') +
    Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const styleMap = () => Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label]));
  const shelfMap = () => Object.fromEntries(state.doc.shelves.map((s) => [s.id, `${s.name} — ${s.tag}`]));
  const text = (name, label, v, extra = '') => `<label class="${extra}">${label}<input type="text" name="${name}" value="${esc(v)}"></label>`;
  const check = (name, label, v) => `<label class="check"><input type="checkbox" name="${name}"${v ? ' checked' : ''}> ${label}</label>`;
  const withCheck = (field, checkbox) => `<div class="field-group">${field}${checkbox}</div>`;
  const num = (name, label, v, attrs = '') => `<label>${label}<input type="number" name="${name}" value="${scoreOf(v) === null ? '' : esc(v)}" ${attrs}></label>`;
  const select = (name, label, html, extra = '') => `<label class="${extra}">${label}<select name="${name}">${html}</select></label>`;

  const FORMS = {
    champagne: (r) => [
      text('house', 'House *', r.house), text('cuvee', 'Cuvée *', r.cuvee),
      select('style', 'Style', opts(styleMap(), r.style, '—')), select('category', 'Category', opts(CATEGORIES, r.category)),
      text('vintage', 'Vintage', r.vintage), select('shelf', 'Shelf', opts(shelfMap(), r.shelf, 'No shelf')),
      num('qty', 'Quantity', qtyOf(r), 'min="1" step="1"'),
      // Ageing details matter for vintage bottles; for NV they stay folded unless filled in.
      `<button type="button" class="more-toggle full" data-more-toggle aria-expanded="false">More details: disgorgement, lees, maturity, drink by</button>`,
      `<div class="more" data-more hidden>
        ${text('disgorged', 'Disgorged', r.disgorged)}
        ${withCheck(text('lees', 'Yrs on lees', r.lees), check('leesEst', 'Lees figure is an estimate', r.leesEst))}
        ${select('maturity', 'Maturity', opts(MATURITY, r.maturity, '—'))}
        ${withCheck(text('drinkBy', 'Drink by', r.drinkBy), check('drinkByEst', 'Drink-by is an estimate', r.drinkByEst))}
      </div>`,
    ],
    red: (r) => [
      text('vineyard', 'Vineyard *', r.vineyard), text('bottle', 'Bottle *', r.bottle),
      text('style', 'Style (e.g. Shiraz)', r.style), select('category', 'Category', opts(CATEGORIES, r.category)),
      select('maturity', 'Maturity', opts(MATURITY, r.maturity, '—')), text('drinkBy', 'Drink by (~ if estimated)', r.drinkBy),
      select('shelf', 'Shelf', opts(shelfMap(), r.shelf, 'No shelf')), num('qty', 'Quantity', qtyOf(r), 'min="1" step="1"'),
    ],
    redFiller: (r) => [
      text('house', 'Vineyard *', r.house), text('cuvee', 'Bottle *', r.cuvee),
      text('price', 'Price', r.price), text('style', 'Style (e.g. Shiraz)', r.style),
      select('category', 'Category', opts(CATEGORIES, r.category)), text('window', 'Est. window', r.window),
      `<label class="full">Notes<textarea name="notes">${esc(r.notes)}</textarea></label>`,
    ],
    rating: (r) => [
      text('house', 'House / Vineyard *', r.house), text('cuvee', 'Cuvée / Bottle *', r.cuvee),
      text('vintage', 'Vintage', r.vintage), `<label>Drunk on<input type="date" name="drankAt" value="${esc(r.drankAt)}"></label>`,
      num('matt', 'Matt (0–5)', r.matt, 'min="0" max="5" step="0.1"'), num('rachael', 'Rachael (0–5)', r.rachael, 'min="0" max="5" step="0.1"'),
      `<label class="full">Notes<textarea name="notes">${esc(r.notes)}</textarea></label>`,
    ],
    filler: (r) => [
      text('house', 'House / Vineyard *', r.house), text('cuvee', 'Cuvée / Bottle *', r.cuvee),
      text('price', 'Price', r.price), select('wine', 'Wine', opts({ champagne: 'Champagne', red: 'Red' }, r.wine || 'champagne')),
      `<label data-for="champagne">Style<select name="styleChamp">${opts(styleMap(), r.wine === 'red' ? '' : r.style, '—')}</select></label>`,
      `<label data-for="red">Style<input type="text" name="styleRed" value="${esc(r.wine === 'red' ? r.style : '')}"></label>`,
      select('category', 'Category', opts(CATEGORIES, r.category)), text('window', 'Est. window', r.window),
      `<label class="full">Notes<textarea name="notes">${esc(r.notes)}</textarea></label>`,
    ],
    everyday: (r) => [
      text('house', 'House *', r.house), text('cuvee', 'Cuvée *', r.cuvee),
      text('price', 'Price', r.price), select('style', 'Style', opts(styleMap(), r.style, '—')),
      text('where', 'Where to buy', r.where), `<label>Link<input type="url" name="link" value="${esc(r.link)}" placeholder="https://"></label>`,
      `<label class="full">Notes<textarea name="notes">${esc(r.notes)}</textarea></label>`,
    ],
  };

  const vintageYear = (v) => { const m = String(v || '').match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null; };
  // First shelf whose tag fits the bottle, by the tag words used in the cellar.
  function defaultShelf(tableId, row) {
    const want = tableId === 'reds' ? /red/i : row.category === 'everyday' ? /everyday/i : /champagne/i;
    const hit = state.doc.shelves.find((s) => want.test(s.tag || ''));
    return hit ? hit.id : '';
  }
  function syncMoreDetails(force) {
    const more = $('#editor-fields [data-more]'), toggle = $('#editor-fields [data-more-toggle]');
    if (!more || !toggle) return;
    const hasValue = [...more.querySelectorAll('input[type="text"], select')].some((el) => el.value.trim());
    const vintage = vintageYear($('#editor-fields [name="vintage"]').value);
    const open = force !== undefined ? force : (more.hidden ? hasValue || vintage !== null : true);
    more.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Fewer details' : 'More details: disgorgement, lees, maturity, drink by';
  }
  // Vintage Champagne gets a suggested drink-by (vintage + 10, marked as an estimate) when the field is empty.
  function suggestDrinkBy() {
    const year = vintageYear($('#editor-fields [name="vintage"]').value);
    const drinkBy = $('#editor-fields [name="drinkBy"]'), est = $('#editor-fields [name="drinkByEst"]');
    if (!year || !drinkBy || drinkBy.value.trim()) return;
    drinkBy.value = `~${year + 10}`; if (est) est.checked = true;
  }

  function syncWineToggle() {
    const wine = $('#editor-fields [name="wine"]');
    if (!wine) return;
    $('#editor-fields [data-for="champagne"]').hidden = wine.value !== 'champagne';
    $('#editor-fields [data-for="red"]').hidden = wine.value !== 'red';
  }

  function openEditor({ tableId, row, isNew, title, extras = '', onSave }) {
    const def = TABLES[tableId];
    editorCtx = { tableId, row, isNew, onSave };
    $('#editor-title').textContent = title || (isNew ? `Add to ${def.title}` : `Edit ${def.title} bottle`);
    if (isNew && !row.shelf && (tableId === 'champagne' || tableId === 'reds')) row.shelf = defaultShelf(tableId, row);
    $('#editor-fields').innerHTML = FORMS[def.form](row).join('') + extras;
    syncWineToggle();
    syncMoreDetails();
    dialog.showModal();
    const first = $('#editor-fields input, #editor-fields select');
    if (first) first.focus();
  }

  function readForm(form, base) {
    const out = { ...base };
    for (const el of form.querySelectorAll('input, select, textarea')) {
      if (!el.name || el.name.startsWith('_')) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
      else out[el.name] = el.value.trim();
    }
    if ('styleChamp' in out) {
      out.style = out.wine === 'red' ? out.styleRed : out.styleChamp;
      delete out.styleChamp; delete out.styleRed;
    }
    return out;
  }

  $('#editor-fields').addEventListener('change', (e) => {
    if (e.target.name === 'wine') syncWineToggle();
    if (e.target.name === 'vintage') { if (vintageYear(e.target.value) !== null) syncMoreDetails(true); suggestDrinkBy(); }
    if (e.target.name === 'category' && editorCtx && editorCtx.isNew) {
      const shelf = $('#editor-fields [name="shelf"]');
      if (shelf) shelf.value = defaultShelf(editorCtx.tableId, { category: e.target.value });
    }
  });
  $('#editor-fields').addEventListener('click', (e) => {
    const t = e.target.closest('[data-more-toggle]'); if (!t) return;
    syncMoreDetails(t.getAttribute('aria-expanded') !== 'true');
  });
  $('#editor-cancel').addEventListener('click', () => dialog.close());
  $('#editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editorCtx) return;
    const def = TABLES[editorCtx.tableId];
    const updated = readForm(e.target, editorCtx.row);
    const required = def.form === 'red' ? ['vineyard', 'bottle'] : ['house', 'cuvee'];
    const missing = required.filter((k) => !updated[k]);
    if (missing.length) { alert('Please fill in the required fields (marked *).'); return; }
    if ('qty' in updated) updated.qty = Math.max(1, Math.round(updated.qty || 1));
    if (def.form === 'rating') {
      for (const k of ['matt', 'rachael']) if (scoreOf(updated[k]) !== null) updated[k] = Math.min(5, Math.max(0, Math.round(updated[k] * 10) / 10));
      if (scoreOf(updated.matt) === null && scoreOf(updated.rachael) === null) { alert('Give at least one score.'); return; }
    }
    const list = state.doc[def.list];
    if (editorCtx.isNew) list.push(updated);
    else list[list.findIndex((r) => r.id === updated.id)] = updated;
    const extra = e.target.querySelector('[name="_removeFromNextUp"]');
    if (editorCtx.onSave) editorCtx.onSave(extra ? extra.checked : false);
    dialog.close();
    commit();
  });

  // ---------------------------------------------------------------- rating dial
  // A round dial: a 270° arc from 0.0 (bottom-left) to 5.0 (bottom-right), turned by
  // dragging or tapping, with arrow keys for 0.1 steps. The value is kept on the element.
  const DIAL = { size: 128, r: 52, sweep: 270 };
  const dialAngle = (v) => -DIAL.sweep / 2 + (DIAL.sweep * v) / 5; // degrees clockwise from 12 o'clock
  const dialPoint = (deg) => { const t = (deg * Math.PI) / 180, c = DIAL.size / 2; return [c + DIAL.r * Math.sin(t), c - DIAL.r * Math.cos(t)]; };
  function arcPath(from, to) {
    const [x1, y1] = dialPoint(from), [x2, y2] = dialPoint(to);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${DIAL.r} ${DIAL.r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function buildDial(el) {
    const c = DIAL.size / 2;
    el.innerHTML = `<svg viewBox="0 0 ${DIAL.size} ${DIAL.size}" aria-hidden="true">
        <path class="dial-track" d="${arcPath(dialAngle(0), dialAngle(5))}"/>
        <path class="dial-value" d=""/>
        <circle class="dial-knob" cx="${c}" cy="${c}" r="7"/>
      </svg><div class="dial-readout">—</div><button type="button" class="dial-clear" tabindex="-1">clear</button>`;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '5');
    el._value = null;
    const fromPointer = (e) => {
      const box = el.querySelector('svg').getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;           // -180..180, 0 = up
      deg = Math.max(-DIAL.sweep / 2, Math.min(DIAL.sweep / 2, deg)); // the gap at the bottom snaps to the nearer end
      setDial(el, Math.round(((deg + DIAL.sweep / 2) / DIAL.sweep) * 50) / 10);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.dial-clear')) return;
      e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); el.classList.add('is-turning'); fromPointer(e);
    });
    el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) fromPointer(e); });
    const release = (e) => { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); el.classList.remove('is-turning'); };
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
    el.addEventListener('keydown', (e) => {
      const v = el._value ?? 0;
      const step = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }[e.key];
      if (step !== undefined) setDial(el, Math.round((v + step) * 10) / 10);
      else if (e.key === 'Home') setDial(el, 0);
      else if (e.key === 'End') setDial(el, 5);
      else if (e.key === 'Backspace' || e.key === 'Delete') setDial(el, null);
      else return;
      e.preventDefault();
    });
    el.querySelector('.dial-clear').addEventListener('click', () => { setDial(el, null); el.focus(); });
  }
  function setDial(el, v) {
    v = scoreOf(v) === null ? null : Math.min(5, Math.max(0, v));
    el._value = v;
    const [kx, ky] = dialPoint(dialAngle(v ?? 0));
    el.querySelector('.dial-value').setAttribute('d', v === null || v === 0 ? '' : arcPath(dialAngle(0), dialAngle(v)));
    const knob = el.querySelector('.dial-knob');
    knob.setAttribute('cx', kx.toFixed(2)); knob.setAttribute('cy', ky.toFixed(2));
    knob.classList.toggle('is-blank', v === null);
    el.querySelector('.dial-readout').textContent = v === null ? '—' : v.toFixed(1);
    el.querySelector('.dial-clear').hidden = v === null;
    el.setAttribute('aria-valuenow', v === null ? '' : v.toFixed(1));
    el.setAttribute('aria-valuetext', v === null ? 'no score' : `${v.toFixed(1)} out of 5`);
    el.dispatchEvent(new CustomEvent('dialchange', { bubbles: true }));
  }
  const dialValue = (el) => el._value;

  // ---------------------------------------------------------------- drank dialog
  const drankDlg = $('#drank');
  let drankCtx = null;
  document.querySelectorAll('#drank .dial').forEach(buildDial);

  // Where a drunk bottle goes back to, so it can be bought again.
  function fillerTarget(tableId, row) {
    if (tableId === 'reds') return 'redFillers';
    return row.category === 'everyday' ? 'everyday' : 'premier';
  }
  function fillerRowFor(tableId, row) {
    const target = fillerTarget(tableId, row);
    const base = TABLES[target].emptyRow();
    if (target === 'redFillers') return { ...base, house: row.vineyard, cuvee: row.bottle, style: row.style, category: row.category || 'aging', window: row.drinkBy || '' };
    if (target === 'everyday') return { ...base, house: row.house, cuvee: row.cuvee, style: row.style };
    return { ...base, house: row.house, cuvee: row.cuvee, style: row.style, category: row.category || 'special', window: row.drinkBy || '' };
  }

  function openDrank(tableId, row) {
    drankCtx = { tableId, row };
    const name = `${row.house || row.vineyard} ${row.cuvee || row.bottle}`;
    $('#drank-title').textContent = `Drank ${name}`;
    $('#drank-date').value = today();
    $('#drank-notes').value = '';
    const target = fillerTarget(tableId, row);
    const left = qtyOf(row) - 1;
    $('#drank-hint').textContent = (left > 0 ? `${left} left in the cellar. ` : 'Last one: it leaves the cellar. ') + `It goes back to ${TABLES[target].title} so it can be bought again.`;
    drankDlg.querySelectorAll('.dial').forEach((d) => setDial(d, null));
    drankDlg.showModal();
    updateDrankAvg();
  }
  function updateDrankAvg() {
    const matt = dialValue($('#dial-matt')), rachael = dialValue($('#dial-rachael'));
    const avg = avgOf({ matt, rachael });
    $('#drank-avg').textContent = avg === null ? '—' : avg.toFixed(1);
    $('#drank-save').disabled = avg === null;
  }
  drankDlg.addEventListener('dialchange', updateDrankAvg);
  $('#drank-cancel').addEventListener('click', () => drankDlg.close());
  $('#drank-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!drankCtx) return;
    const { tableId, row } = drankCtx;
    const matt = dialValue($('#dial-matt')), rachael = dialValue($('#dial-rachael'));
    if (matt === null && rachael === null) return;
    const list = state.doc[TABLES[tableId].list];
    const live = list.find((r) => r.id === row.id);
    if (!live) { drankDlg.close(); return; }
    const isRed = tableId === 'reds';
    state.doc.ratings.unshift({
      id: uid('d'),
      house: isRed ? live.vineyard : live.house,
      cuvee: isRed ? live.bottle : live.cuvee,
      vintage: isRed ? (String(live.bottle || '').match(/\b(19|20)\d{2}\b/) || [''])[0] : live.vintage || '',
      wine: isRed ? 'red' : 'champagne',
      style: live.style || '', category: live.category || '', shelf: live.shelf || '',
      drankAt: $('#drank-date').value || today(),
      matt, rachael,
      notes: $('#drank-notes').value.trim(),
    });
    if (qtyOf(live) > 1) live.qty = qtyOf(live) - 1;
    else state.doc[TABLES[tableId].list] = list.filter((r) => r.id !== live.id);
    const target = fillerTarget(tableId, live);
    const filler = fillerRowFor(tableId, live);
    if (!state.doc[target].some((r) => wineKey(r) === wineKey(filler))) state.doc[target].push(filler);
    drankDlg.close();
    commit();
  });

  // ---------------------------------------------------------------- bought dialog
  const boughtDlg = $('#bought');
  const FILLER_SOURCES = ['nextUp', 'premier', 'everyday', 'redFillers'];

  // Opens the cellar editor pre-filled from a filler row, with the quantity set.
  function buyFromFiller(sourceId, row, qty) {
    const isRed = sourceId === 'redFillers' || row.wine === 'red';
    const target = isRed ? 'reds' : 'champagne';
    const base = TABLES[target].emptyRow();
    const prefill = isRed
      ? { ...base, vineyard: row.house, bottle: row.cuvee, style: row.style, category: row.category || 'aging', qty }
      : { ...base, house: row.house, cuvee: row.cuvee, style: row.style, category: row.category || 'everyday', vintage: (String(row.cuvee || '').match(/\b(19|20)\d{2}\b/) || ['NV'])[0], qty };
    openEditor({
      tableId: target, row: prefill, isNew: true,
      title: `Add ${row.house} to ${TABLES[target].title}`,
      extras: sourceId === 'nextUp' ? '<label class="check full"><input type="checkbox" name="_removeFromNextUp" checked> Remove from Next up</label>' : '',
      onSave: (remove) => { if (remove) state.doc.nextUp = state.doc.nextUp.filter((r) => r.id !== row.id); },
    });
  }

  function openBought() {
    const fillers = FILLER_SOURCES.map((id) => {
      const rows = sortedRows(TABLES[id]);
      if (!rows.length) return '';
      return `<optgroup label="${esc(TABLES[id].title)}">${rows.map((r) => `<option value="${id}:${esc(r.id)}">${esc(`${r.house} ${r.cuvee}`)}</option>`).join('')}</optgroup>`;
    }).join('');
    const cellar = ['champagne', 'reds'].map((id) => {
      const rows = sortedRows(TABLES[id]);
      if (!rows.length) return '';
      return `<optgroup label="${esc(TABLES[id].title)}">${rows.map((r) => `<option value="${id}:${esc(r.id)}">${esc(`${r.house || r.vineyard} ${r.cuvee || r.bottle}`)} (${qtyOf(r)} in cellar)</option>`).join('')}</optgroup>`;
    }).join('');
    $('#bought-filler').innerHTML = fillers || '<option value="">Nothing in the fillers lists</option>';
    $('#bought-existing').innerHTML = cellar || '<option value="">Nothing in the cellar</option>';
    $('#bought-qty').value = 1;
    boughtDlg.querySelector('[name="mode"][value="filler"]').checked = true;
    syncBoughtMode();
    boughtDlg.showModal();
  }
  function syncBoughtMode() {
    const mode = boughtDlg.querySelector('[name="mode"]:checked').value;
    boughtDlg.querySelectorAll('[data-mode]').forEach((el) => { el.hidden = el.dataset.mode !== mode; });
  }
  boughtDlg.addEventListener('change', (e) => { if (e.target.name === 'mode') syncBoughtMode(); });
  $('#bought-cancel').addEventListener('click', () => boughtDlg.close());
  $('#bought-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = boughtDlg.querySelector('[name="mode"]:checked').value;
    const qty = Math.max(1, Math.round(Number($('#bought-qty').value) || 1));
    const pick = (sel) => { const [tableId, id] = String(sel.value).split(':'); const def = TABLES[tableId]; return def ? { tableId, row: state.doc[def.list].find((r) => r.id === id) } : {}; };
    if (mode === 'filler') {
      const { tableId, row } = pick($('#bought-filler'));
      if (!row) return;
      boughtDlg.close();
      buyFromFiller(tableId, row, qty);
    } else if (mode === 'existing') {
      const { row } = pick($('#bought-existing'));
      if (!row) return;
      row.qty = qtyOf(row) + qty;
      boughtDlg.close();
      commit();
    } else {
      const tableId = boughtDlg.querySelector('[name="newWine"]:checked').value;
      boughtDlg.close();
      openEditor({ tableId, row: { ...TABLES[tableId].emptyRow(), qty }, isNew: true });
    }
  });
  $('#bought-toggle').addEventListener('click', openBought);

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.view-tab');
    if (tab) {
      state.view = tab.dataset.view;
      try { localStorage.setItem(VIEW_KEY, state.view); } catch {}
      render();
      return;
    }
    const clear = e.target.closest('[data-clear]');
    if (clear) { state.filters[clear.dataset.clear] = {}; render(); return; }
    if (e.target.closest('[data-clear-shared]')) { state.shared = { category: 'all', maturity: 'all' }; render(); return; }
    const leg = e.target.closest('.legend-btn');
    if (leg) { state.shelfCat = state.shelfCat === leg.dataset.cat ? null : leg.dataset.cat; render(); return; }
    if (e.target.closest('[data-shelf-clear]')) { state.shelfCat = null; render(); return; }

    const act = e.target.closest('[data-act]');
    if (!act) return;
    const tableId = act.dataset.table;
    const def = TABLES[tableId];
    const list = def ? state.doc[def.list] : null;
    const row = list ? list.find((r) => r.id === act.dataset.id) : null;

    switch (act.dataset.act) {
      case 'qty': {
        if (!row) break;
        row.qty = Math.max(1, qtyOf(row) + Number(act.dataset.delta));
        commit();
        break;
      }
      case 'drank':
        if (row) openDrank(tableId, row);
        break;
      case 'add':
        openEditor({ tableId, row: def.emptyRow(), isNew: true });
        break;
      case 'edit':
        if (row) openEditor({ tableId, row: { ...row }, isNew: false });
        break;
      case 'remove': {
        if (!row) break;
        const name = row.house || row.vineyard || '';
        const cuv = row.cuvee || row.bottle || '';
        if (confirm(`Remove ${name} ${cuv} from ${def.title}?`)) {
          state.doc[def.list] = list.filter((r) => r.id !== row.id);
          commit();
        }
        break;
      }
      case 'bought':
        if (row) buyFromFiller(tableId, row, 1);
        break;
      case 'note': {
        const key = act.dataset.note;
        const val = prompt('Edit note', state.doc[key] || '');
        if (val !== null) { state.doc[key] = val.trim(); commit(); }
        break;
      }
    }
  });

  document.addEventListener('change', (e) => {
    const sel = e.target;
    if (sel.matches('select[data-table]')) {
      const t = sel.dataset.table;
      state.filters[t] = { ...(state.filters[t] || {}), [sel.dataset.key]: sel.value };
      render();
    } else if (sel.matches('select[data-shared]')) {
      state.shared[sel.dataset.shared] = sel.value;
      render();
    }
  });

  $('#edit-toggle').addEventListener('click', (e) => {
    state.editing = !state.editing;
    e.currentTarget.setAttribute('aria-pressed', String(state.editing));
    e.currentTarget.textContent = state.editing ? 'Done editing' : 'Edit';
    document.body.classList.toggle('editing', state.editing);
    render();
  });

  // ---------------------------------------------------------------- start
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (['all', 'champagne', 'red', 'shelves', 'fillers', 'ratings', 'recycle'].includes(saved)) state.view = saved;
  } catch {}
  applyView();
  load();
})();
