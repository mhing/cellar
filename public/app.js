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
      ],
      filters: [
        { key: 'house', label: 'House', value: (r) => r.house },
        { key: 'style', label: 'Style', value: (r) => (STYLES[r.style] || {}).label || '' },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '', local: true },
        { key: 'maturity', label: 'Maturity', value: (r) => MATURITY[r.maturity] || '', order: MATURITY_ORDER, local: true },
      ],
      form: 'champagne',
      emptyRow: () => ({ id: uid('c'), house: '', cuvee: '', style: '', vintage: 'NV', disgorged: '', lees: '', leesEst: false, category: 'everyday', maturity: '', drinkBy: '', drinkByEst: false, shelf: '' }),
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
      ],
      filters: [
        { key: 'style', label: 'Style', value: (r) => r.style },
        { key: 'category', label: 'Category', value: (r) => CATEGORIES[r.category] || '', local: true },
        { key: 'maturity', label: 'Maturity', value: (r) => MATURITY[r.maturity] || '', order: MATURITY_ORDER, local: true },
      ],
      form: 'red',
      emptyRow: () => ({ id: uid('r'), vineyard: '', bottle: '', style: '', category: 'aging', maturity: '', drinkBy: '', shelf: '' }),
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
  };

  // ---------------------------------------------------------------- filtering
  function sortedRows(def) {
    const rows = [...(state.doc[def.list] || [])];
    if (def.sorted) rows.sort((a, b) => norm(a.house).localeCompare(norm(b.house)) || norm(a.cuvee).localeCompare(norm(b.cuvee)));
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
      const cells = def.columns.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ''}>${c.html(r)}</td>`).join('');
      const actions = `<td class="col-actions">
          ${def.bought ? `<button type="button" class="btn small" data-act="bought" data-table="${id}" data-id="${esc(r.id)}">Bought</button>` : ''}
          <button type="button" class="btn small" data-act="edit" data-table="${id}" data-id="${esc(r.id)}">Edit</button>
          <button type="button" class="btn small danger" data-act="remove" data-table="${id}" data-id="${esc(r.id)}">Remove</button>
        </td>`;
      return `<tr>${cells}${actions}</tr>`;
    }).join('') || `<tr><td colspan="${def.columns.length + 1}" class="blank">${rows.length ? 'No matches' : 'Nothing here yet'}</td></tr>`;

    const count = def.filters.length || (state.view === 'all' && (id === 'champagne' || id === 'reds'))
      ? (shown.length ? `${shown.length} of ${rows.length} shown` : 'No matches') : '';

    const heading = def.group === 'fillers'
      ? `<div class="section-head"><h2>${esc(def.title)}</h2></div>`
      : `<div class="group-label">${esc(def.title)} <span class="count">${rows.length} bottles</span></div>`;
    const note = def.note ? `<p class="section-note">${esc(state.doc[def.note] || '')}${state.editing ? ` <button type="button" class="btn small" data-act="note" data-note="${def.note}">Edit note</button>` : ''}</p>` : '';
    return `<div class="table-block" data-group="${def.group}" id="tbl-${id}">
      ${heading}
      ${renderFilterBar(id, def, rows)}
      ${def.grapeKey ? grapeKey() : ''}
      <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <button type="button" class="btn add-row" data-act="add" data-table="${id}">+ Add bottle</button>
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
        return `<span class="bottle-chip${cls}"><span class="dot cat-${esc(b.category)}"></span>${esc(b.label)}</span>`;
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

  function render() {
    if (!state.doc) return;
    const app = $('#app');
    const scrollY = window.scrollY;
    app.innerHTML = `
      ${renderShared()}
      <section data-group="cellar">${renderTable('champagne')}${renderTable('reds')}</section>
      ${renderShelves()}
      <section data-group="fillers">${renderTable('nextUp')}${renderTable('premier')}${renderTable('everyday')}</section>`;
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
      state.doc.version = saved.version;
      state.doc.updatedAt = saved.updatedAt;
      state.doc.updatedBy = saved.updatedBy;
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
  const select = (name, label, html, extra = '') => `<label class="${extra}">${label}<select name="${name}">${html}</select></label>`;

  const FORMS = {
    champagne: (r) => [
      text('house', 'House *', r.house), text('cuvee', 'Cuvée *', r.cuvee),
      select('style', 'Style', opts(styleMap(), r.style, '—')), select('category', 'Category', opts(CATEGORIES, r.category)),
      text('vintage', 'Vintage', r.vintage), text('disgorged', 'Disgorged', r.disgorged),
      text('lees', 'Yrs on lees', r.lees), check('leesEst', 'Lees figure is an estimate', r.leesEst),
      select('maturity', 'Maturity', opts(MATURITY, r.maturity, '—')), text('drinkBy', 'Drink by', r.drinkBy),
      check('drinkByEst', 'Drink-by is an estimate', r.drinkByEst), select('shelf', 'Shelf', opts(shelfMap(), r.shelf, 'No shelf')),
    ],
    red: (r) => [
      text('vineyard', 'Vineyard *', r.vineyard), text('bottle', 'Bottle *', r.bottle),
      text('style', 'Style (e.g. Shiraz)', r.style), select('category', 'Category', opts(CATEGORIES, r.category)),
      select('maturity', 'Maturity', opts(MATURITY, r.maturity, '—')), text('drinkBy', 'Drink by (~ if estimated)', r.drinkBy),
      select('shelf', 'Shelf', opts(shelfMap(), r.shelf, 'No shelf'), 'full'),
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
    $('#editor-fields').innerHTML = FORMS[def.form](row).join('') + extras;
    syncWineToggle();
    dialog.showModal();
    const first = $('#editor-fields input, #editor-fields select');
    if (first) first.focus();
  }

  function readForm(form, base) {
    const out = { ...base };
    for (const el of form.querySelectorAll('input, select, textarea')) {
      if (!el.name || el.name.startsWith('_')) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value.trim();
    }
    if ('styleChamp' in out) {
      out.style = out.wine === 'red' ? out.styleRed : out.styleChamp;
      delete out.styleChamp; delete out.styleRed;
    }
    return out;
  }

  $('#editor-fields').addEventListener('change', (e) => { if (e.target.name === 'wine') syncWineToggle(); });
  $('#editor-cancel').addEventListener('click', () => dialog.close());
  $('#editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editorCtx) return;
    const def = TABLES[editorCtx.tableId];
    const updated = readForm(e.target, editorCtx.row);
    const required = def.form === 'red' ? ['vineyard', 'bottle'] : ['house', 'cuvee'];
    const missing = required.filter((k) => !updated[k]);
    if (missing.length) { alert('Please fill in the required fields (marked *).'); return; }
    const list = state.doc[def.list];
    if (editorCtx.isNew) list.push(updated);
    else list[list.findIndex((r) => r.id === updated.id)] = updated;
    const extra = e.target.querySelector('[name="_removeFromNextUp"]');
    if (editorCtx.onSave) editorCtx.onSave(extra ? extra.checked : false);
    dialog.close();
    commit();
  });

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
      case 'bought': {
        if (!row) break;
        const isRed = row.wine === 'red';
        const target = isRed ? 'reds' : 'champagne';
        const base = TABLES[target].emptyRow();
        const prefill = isRed
          ? { ...base, vineyard: row.house, bottle: row.cuvee, style: row.style, category: row.category || 'aging' }
          : { ...base, house: row.house, cuvee: row.cuvee, style: row.style, category: row.category || 'everyday', vintage: (String(row.cuvee || '').match(/\b(19|20)\d{2}\b/) || ['NV'])[0] };
        openEditor({
          tableId: target, row: prefill, isNew: true,
          title: `Add ${row.house} to ${TABLES[target].title}`,
          extras: '<label class="check full"><input type="checkbox" name="_removeFromNextUp" checked> Remove from Next up</label>',
          onSave: (remove) => { if (remove) state.doc.nextUp = state.doc.nextUp.filter((r) => r.id !== row.id); },
        });
        break;
      }
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
    if (['all', 'champagne', 'red', 'shelves', 'fillers'].includes(saved)) state.view = saved;
  } catch {}
  applyView();
  load();
})();
