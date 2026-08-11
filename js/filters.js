/* =====================================================================
   Search and filters. Everything combines; nothing is hidden by default.
   ===================================================================== */

const Filters = (() => {

  const state = {
    q: '',
    status: [],          // needs_tnvr | in_progress | complete
    help: false,         // trapping help needed
    kittens: false,
    unmapped: false,
    review: false,
    stale: false,        // no visit in STALE_DAYS
    recent: false,       // updated in the last 30 days
    city: '',
    county: '',
    org: ''
  };

  /* ------------------------------------------------------------ search */

  /* Tolerant of the small mistakes people make typing on a phone with
     cold hands: case, punctuation, and one or two wrong letters. */
  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function fuzzyHit(haystack, term) {
    if (haystack.includes(term)) return true;
    if (term.length < 4) return false;
    const allowed = term.length >= 7 ? 2 : 1;
    return haystack.split(' ').some(w =>
      Math.abs(w.length - term.length) <= allowed && editDistance(w, term) <= allowed);
  }

  function searchBlob(c) {
    if (c.__blob) return c.__blob;
    c.__blob = normalize([
      c.location_text, c.name, c.address_line, c.city_area, c.county, c.colony_code,
      c.caretaker_name, c.reporter_name, c.notes, c.original_notes,
      c.original_estimate_text, (c.orgs_involved || []).join(' ')
    ].join(' '));
    return c.__blob;
  }

  /* ------------------------------------------------------------- apply */

  function apply(list) {
    const staleDays = window.CONFIG.STALE_DAYS;

    return list.filter(c => {
      if (state.q) {
        const blob = searchBlob(c);
        const terms = normalize(state.q).split(' ').filter(Boolean);
        if (!terms.every(t => fuzzyHit(blob, t))) return false;
      }
      if (state.status.length && !state.status.includes(c.status)) return false;
      if (state.help && c.trapping_help_needed !== true) return false;
      if (state.kittens && !(c.kittens_present === true || (c.kitten_count || 0) > 0)) return false;
      if (state.unmapped && c.latitude !== null) return false;
      if (state.review && !c.needs_review) return false;
      if (state.city && c.city_area !== state.city) return false;
      if (state.county && c.county !== state.county) return false;
      if (state.org && !(c.orgs_involved || []).includes(state.org)) return false;

      if (state.stale) {
        const d = UI.daysSince(c.date_last_worked);
        const quiet = d === null || d >= staleDays;
        if (!quiet || c.status === 'complete') return false;
      }
      if (state.recent) {
        const d = UI.daysSince(c.updated_at || c.date_last_worked);
        if (d === null || d > 30) return false;
      }
      return true;
    });
  }

  function activeCount() {
    let n = 0;
    if (state.status.length) n += state.status.length;
    ['help','kittens','unmapped','review','stale','recent'].forEach(k => { if (state[k]) n++; });
    ['city','county','org'].forEach(k => { if (state[k]) n++; });
    return n;
  }

  function isFiltered() { return activeCount() > 0 || !!state.q; }

  /* ------------------------------------------------------------- chips */

  function renderChips(onChange) {
    const box = UI.$('#chips');
    const chips = [];

    state.status.forEach(s => chips.push({ k: 'status:' + s, label: UI.STATUS_LABEL[s] }));
    if (state.help)     chips.push({ k: 'help',     label: 'Trapping help needed' });
    if (state.kittens)  chips.push({ k: 'kittens',  label: 'Kittens present' });
    if (state.unmapped) chips.push({ k: 'unmapped', label: 'Needs a pin' });
    if (state.review)   chips.push({ k: 'review',   label: 'Needs review' });
    if (state.stale)    chips.push({ k: 'stale',    label: 'No recent activity' });
    if (state.recent)   chips.push({ k: 'recent',   label: 'Updated recently' });
    if (state.city)     chips.push({ k: 'city',     label: state.city });
    if (state.county)   chips.push({ k: 'county',   label: state.county + ' County' });
    if (state.org)      chips.push({ k: 'org',      label: state.org });

    box.innerHTML = chips.map(c =>
      '<button class="chip" data-chip="' + UI.esc(c.k) + '">' + UI.esc(c.label) +
      '<span class="x">&times;</span></button>').join('') +
      (chips.length > 1 ? '<button class="chip" data-chip="__all" style="background:var(--ground);color:var(--ink-2)">Clear all</button>' : '');

    UI.$$('[data-chip]', box).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.chip;
      if (k === '__all') reset();
      else if (k.startsWith('status:')) state.status = state.status.filter(s => s !== k.slice(7));
      else if (['city','county','org'].includes(k)) state[k] = '';
      else state[k] = false;
      onChange();
    }));
  }

  function reset() {
    state.status = []; state.help = false; state.kittens = false;
    state.unmapped = false; state.review = false; state.stale = false; state.recent = false;
    state.city = ''; state.county = ''; state.org = '';
  }

  /* ------------------------------------------------------- filter sheet */

  function openSheet(onChange) {
    const counts = {};
    Store.all().forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

    const toggle = (key, label, sub) =>
      '<li data-toggle="' + key + '"><div class="main"><div class="t">' + UI.esc(label) + '</div>' +
      (sub ? '<div class="m">' + UI.esc(sub) + '</div>' : '') + '</div>' +
      '<div class="r"><span class="big">' + (state[key] ? '✓' : '') + '</span></div></li>';

    const body =
      '<div class="field"><label>Status — tap to combine</label>' +
        '<div class="seg status" data-multi="status">' +
        ['needs_tnvr','in_progress','complete'].map(s =>
          '<button type="button" data-v="' + s + '"' +
          (state.status.includes(s) ? ' class="on"' : '') + '>' +
          UI.STATUS_LABEL[s] + ' (' + (counts[s] || 0) + ')</button>').join('') +
        '</div></div>' +

      '<div class="block"><h3>Operational</h3><ul class="list">' +
        toggle('help',     'Trapping help needed',  'Someone has asked for traps or hands') +
        toggle('kittens',  'Kittens present',       'Time-sensitive') +
        toggle('stale',    'No recent activity',    'Nothing recorded in ' + window.CONFIG.STALE_DAYS + '+ days') +
        toggle('recent',   'Updated recently',      'Changed in the last 30 days') +
      '</ul></div>' +

      '<div class="block"><h3>Data quality</h3><ul class="list">' +
        toggle('unmapped', 'Needs a pin dropped', 'Not on the map yet') +
        toggle('review',   'Needs review',        'Imported with something uncertain') +
      '</ul></div>' +

      '<div class="block"><h3>Place</h3>' +
        selectRow('City / area', 'f_city', window.CONFIG.CITIES, state.city) +
        selectRow('County', 'f_county', window.CONFIG.COUNTIES, state.county) +
        selectRow('Organization involved', 'f_org', window.CONFIG.ORGS, state.org) +
      '</div>';

    UI.openSheet({
      title: 'Filters',
      sub: 'Combine as many as you like',
      body: body,
      footer: '<button class="btn" id="fReset" style="flex:none;width:120px">Clear all</button>' +
              '<button class="btn btn-primary" id="fApply" style="flex:1">SHOW RESULTS</button>'
    });

    const root = UI.$('#sheetBody');

    UI.$('[data-multi="status"]', root).addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const v = b.dataset.v;
      if (state.status.includes(v)) { state.status = state.status.filter(s => s !== v); b.classList.remove('on'); }
      else { state.status.push(v); b.classList.add('on'); }
    });

    UI.$$('[data-toggle]', root).forEach(li => li.addEventListener('click', () => {
      const k = li.dataset.toggle;
      state[k] = !state[k];
      UI.$('.r .big', li).textContent = state[k] ? '✓' : '';
    }));

    ['city','county','org'].forEach(k => {
      const el = UI.$('#f_' + k, root);
      if (el) el.addEventListener('change', () => { state[k] = el.value; });
    });

    UI.$('#fReset').addEventListener('click', () => { reset(); UI.closeSheet(true); onChange(); });
    UI.$('#fApply').addEventListener('click', () => { UI.closeSheet(true); onChange(); });
  }

  function selectRow(label, id, options, value) {
    return '<div class="field"><label for="' + id + '">' + UI.esc(label) + '</label>' +
      '<select class="input" id="' + id + '"><option value="">Any</option>' +
      options.map(o => '<option' + (o === value ? ' selected' : '') + '>' + UI.esc(o) + '</option>').join('') +
      '</select></div>';
  }

  function setSearch(q) { state.q = q; }
  function setStatus(list) { state.status = list; }
  function set(key, val) { state[key] = val; }

  return { state, apply, activeCount, isFiltered, renderChips, reset, openSheet, setSearch, setStatus, set };
})();
