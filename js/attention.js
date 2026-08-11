/* =====================================================================
   Needs Attention — where should we work next?

   A ranked list, not a dashboard. Colonies with an unknown population
   are kept in their own band near the top: a missing number is a reason
   to go and look, not a reason to disappear.
   ===================================================================== */

const Attention = (() => {

  function score(c) {
    let s = 0;
    const rem = c.est_remaining;

    if (c.status === 'needs_tnvr')  s += 40;
    if (c.status === 'in_progress') s += 18;
    if (c.status === 'complete')    s -= 100;

    if (rem !== null) s += Math.min(rem, 60);          // big colonies matter, but do not swamp everything
    if (c.kittens_present === true || (c.kitten_count || 0) > 0) s += 35;
    if (c.trapping_help_needed === true) s += 30;

    const quiet = UI.daysSince(c.date_last_worked);
    if (quiet === null) s += 10;
    else if (quiet >= window.CONFIG.STALE_DAYS) s += 15;

    if (c.priority === 'high') s += 25;
    if (c.priority === 'low')  s -= 15;

    if (MapView.isClaimed(c)) s -= 45;                 // someone is already on it
    return s;
  }

  function reasons(c) {
    const out = [];
    if (c.kittens_present === true || (c.kitten_count || 0) > 0) out.push({ cls: 'kit',  txt: 'Kittens' });
    if (c.trapping_help_needed === true)                          out.push({ cls: 'help', txt: 'Needs traps' });
    if (c.latitude === null)                                      out.push({ cls: 'pin',  txt: 'No pin' });
    const quiet = UI.daysSince(c.date_last_worked);
    if (c.status !== 'complete' && (quiet === null || quiet >= window.CONFIG.STALE_DAYS)) {
      out.push({ cls: '', txt: quiet === null ? 'Never worked' : 'Quiet ' + Math.round(quiet / 30) + ' mo' });
    }
    if (MapView.isClaimed(c)) out.push({ cls: 'kit', txt: 'Being worked' });
    return out;
  }

  function ranked(sortBy) {
    const list = Store.all().filter(c => !c.archived && !c.out_of_area && c.status !== 'complete');

    if (sortBy === 'remaining') {
      // unknown population sits in its own band above the known-small ones
      const known   = list.filter(c => c.est_remaining !== null).sort((a, b) => b.est_remaining - a.est_remaining);
      const unknown = list.filter(c => c.est_remaining === null).sort((a, b) => score(b) - score(a));
      const big     = known.filter(c => c.est_remaining >= 10);
      const small   = known.filter(c => c.est_remaining < 10);
      return big.concat(unknown, small);
    }
    return list.sort((a, b) => score(b) - score(a));
  }

  function count() {
    return Store.all().filter(c =>
      !c.archived && !c.out_of_area && c.status !== 'complete' &&
      (c.trapping_help_needed === true ||
       c.kittens_present === true ||
       (c.est_remaining !== null && c.est_remaining >= 10)) &&
      !MapView.isClaimed(c)
    ).length;
  }

  let sortBy = 'priority';

  function open() {
    render();
  }

  function render() {
    const list = ranked(sortBy);

    const body =
      '<div class="field"><label>Sort by</label>' +
        UI.segment('sortBy', [
          { value: 'priority',  label: 'Where to work next' },
          { value: 'remaining', label: 'Cats remaining' }
        ], sortBy) +
      '</div>' +
      (list.length
        ? '<ul class="list">' + list.map(c => row(c)).join('') + '</ul>'
        : '<div class="empty">Nothing outstanding. Every colony is marked Complete.</div>');

    UI.openSheet({
      title: 'Needs Attention',
      sub: list.length + ' colonies still need work',
      body: body
    });

    const root = UI.$('#sheetBody');
    UI.bindSegments(root);
    root.addEventListener('segchange', e => { sortBy = e.detail; render(); });

    UI.$$('[data-colony]', root).forEach(li => li.addEventListener('click', () => {
      const c = Store.byId(li.dataset.colony);
      UI.closeSheet(true);
      if (c && c.latitude !== null) { MapView.focus(c); MapView.select(c.id); }
      ColonyPanel.open(li.dataset.colony);
    }));
  }

  function row(c) {
    const rem = c.est_remaining;
    return '<li data-colony="' + UI.esc(c.id) + '">' +
      '<span class="dot" style="background:var(--' + UI.statusColor(c.status) + ')"></span>' +
      '<div class="main">' +
        '<div class="t">' + UI.esc(c.location_text || c.name || c.colony_code) + '</div>' +
        '<div class="m">' + UI.esc(c.city_area || 'Area unknown') +
          reasons(c).map(r => '<span class="tag ' + r.cls + '">' + UI.esc(r.txt) + '</span>').join('') +
        '</div>' +
      '</div>' +
      '<div class="r">' +
        '<div class="big' + (rem === null ? '" style="font-size:12px;color:var(--ink-3);font-style:italic' : '') + '">' +
          (rem === null ? 'unknown' : rem) + '</div>' +
        '<div class="lbl">remaining</div>' +
      '</div></li>';
  }

  return { open, count, ranked, score };
})();
