/* =====================================================================
   Wiring. Starts the map, keeps the summary and pins in step with the
   filters, and handles the top bar.
   ===================================================================== */

const App = (() => {

  let mode = 'preview';

  async function start() {
    MapView.init();
    await Completed.init();

    let res;
    try {
      res = await Store.init();
    } catch (err) {
      res = {mode: 'preview', error: err.message};
    }
    mode = res.mode;
    showEnvBanner(res);

    Store.onChange(refreshView);
    bindChrome();
    Tracker.init();
    refreshView();
    if (Completed.isActive()) Completed.fit();
    else MapView.fitAll([...Store.mapped(),...Completed.cityLocations()]);
  }

  function showEnvBanner(res) {
    const el = document.getElementById('envBanner');
    if (res.mode === 'live') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = res.error
      ? '<b>Could not reach the database.</b> Showing the imported spreadsheet. Nothing you change will be saved.'
      : '<b>Preview.</b> Showing the imported spreadsheet — editing is switched off until the database is connected.';
  }

  /* ------------------------------------------------------------ render */

  function refreshView() {
    if (Completed.render()) return;
    const visible = Filters.apply(Store.all());
    const onMap = visible.filter(c => !c.out_of_area && c.latitude !== null);

    MapView.render(onMap, id => ColonyPanel.open(id));
    Tracker.summary(visible);
    Filters.renderChips(refreshView);

    const fc = document.getElementById('filterCount');
    const n = Filters.activeCount();
    fc.hidden = n === 0;
    fc.textContent = n;
    document.getElementById('filterBtn').classList.toggle('on', n > 0);

    document.getElementById('attentionCount').textContent = Attention.count();
    document.getElementById('colonyListBtn').textContent = 'List (' + visible.length + ')';
  }

  function renderSummary(visible) {
    const s = Store.summary();
    const filtered = Filters.isFiltered();
    const shown = visible.length;

    const by = st => visible.filter(c => c.status === st).length;

    document.getElementById('summary').innerHTML =
      (filtered
        ? '<span class="s-item"><b>' + shown + '</b> of ' + s.known_colonies + ' shown</span><span class="sep">|</span>'
        : '<span class="s-item"><b>' + s.known_colonies + '</b> colonies</span><span class="sep">|</span>') +
      '<span class="s-item"><span class="dot" style="background:var(--red)"></span><b>' + by('needs_tnvr') + '</b></span>' +
      '<span class="s-item"><span class="dot" style="background:var(--amber)"></span><b>' + by('in_progress') + '</b></span>' +
      '<span class="s-item"><span class="dot" style="background:var(--green)"></span><b>' + by('complete') + '</b></span>' +
      '<span class="sep">|</span>' +
      '<span class="s-item">~<b>' + s.estimated_remaining + '</b> cats to fix</span>' +
      '<button class="summary-toggle" id="sumToggle">More</button>';

    document.getElementById('sumToggle').addEventListener('click', () => {
      const full = document.getElementById('summaryFull');
      full.classList.toggle('open');
      document.getElementById('sumToggle').textContent = full.classList.contains('open') ? 'Less' : 'More';
      if (full.classList.contains('open')) renderFullSummary(s);
      setTimeout(() => MapView.instance().invalidateSize(), 60);
    });
  }

  function renderFullSummary(s) {
    const cell = (v, k) => '<div class="cell"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
    document.getElementById('summaryFull').innerHTML =
      cell(s.known_colonies, 'Known colonies') +
      cell(s.complete, 'Complete') +
      cell(s.in_progress, 'In progress') +
      cell(s.needs_tnvr, 'Needing TNVR') +
      cell(s.estimated_cats, 'Estimated cats') +
      cell(s.known_fixed, 'Known fixed') +
      cell(s.estimated_remaining, 'Cats remaining') +
      cell(s.trapping_help, 'Want trapping help') +
      cell(s.needs_pin, 'Awaiting a pin') +
      cell(s.needs_review, 'Needing review');
  }

  /* ------------------------------------------------------------- chrome */

  function bindChrome() {
    const search = document.getElementById('search');
    const clear  = document.getElementById('searchClear');
    let t = null;

    search.addEventListener('input', () => {
      clear.hidden = !search.value;
      clearTimeout(t);
      t = setTimeout(() => { Filters.setSearch(search.value); refreshView(); }, 180);
    });
    search.addEventListener('search', () => {
      Filters.setSearch(search.value); refreshView();
    });
    clear.addEventListener('click', () => {
      search.value = ''; clear.hidden = true; Filters.setSearch(''); refreshView(); search.focus();
    });

    document.getElementById('filterBtn').addEventListener('click', () => Filters.openSheet(refreshView));
    document.getElementById('addBtn').addEventListener('click', () => Forms.addColony());
    document.getElementById('attentionBtn').addEventListener('click', () => Attention.open());

    document.getElementById('sheetClose').addEventListener('click', () => UI.closeSheet());
    document.getElementById('scrim').addEventListener('click', () => { MapView.stopPick(); UI.closeSheet(true); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && UI.sheetIsOpen()) { MapView.stopPick(); UI.closeSheet(); }
    });

    bindGrabber();
    window.addEventListener('resize', () => MapView.instance().invalidateSize());
  }

  /* Drag the sheet down to dismiss — the gesture people expect. */
  function bindGrabber() {
    const grab = document.getElementById('grabber');
    const sheet = document.getElementById('sheet');
    let y0 = null, dy = 0;

    const start = e => { y0 = (e.touches ? e.touches[0] : e).clientY; dy = 0; sheet.style.transition = 'none'; };
    const move = e => {
      if (y0 === null) return;
      dy = Math.max(0, (e.touches ? e.touches[0] : e).clientY - y0);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    };
    const end = () => {
      if (y0 === null) return;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) UI.closeSheet();
      y0 = null;
    };

    grab.addEventListener('touchstart', start, { passive: true });
    grab.addEventListener('touchmove', move, { passive: true });
    grab.addEventListener('touchend', end);
    grab.addEventListener('mousedown', e => {
      start(e);
      const mm = ev => move(ev);
      const mu = () => { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  }

  return { start, refreshView, mode: () => mode };
})();

document.addEventListener('DOMContentLoaded', () => App.start());


