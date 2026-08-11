/* =====================================================================
   Shared helpers: the sheet, toasts, formatting, small form controls.
   ===================================================================== */

const UI = (() => {

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---- values that may legitimately be unknown ---------------------- */

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function showNum(v, unknownLabel) {
    const n = num(v);
    if (n === null) return '<span class="unknown">' + esc(unknownLabel || 'Unknown') + '</span>';
    return String(n);
  }

  function showText(v, unknownLabel) {
    if (v === null || v === undefined || String(v).trim() === '') {
      return '<span class="unknown">' + esc(unknownLabel || 'Unknown') + '</span>';
    }
    return esc(v);
  }

  /* ---- dates -------------------------------------------------------- */

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  function parseDate(v) {
    if (!v) return null;
    const d = new Date(v.length <= 10 ? v + 'T12:00:00' : v);
    return isNaN(d.getTime()) ? null : d;
  }

  function longDate(v) {
    const d = parseDate(v);
    if (!d) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function shortDate(v) {
    const d = parseDate(v);
    if (!d) return '';
    return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function dateTime(v) {
    const d = parseDate(v);
    if (!d) return '';
    let h = d.getHours(), ap = h < 12 ? 'am' : 'pm';
    h = h % 12; if (h === 0) h = 12;
    return longDate(v) + ' · ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }

  function daysSince(v) {
    const d = parseDate(v);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function agoLabel(v) {
    const n = daysSince(v);
    if (n === null) return 'never';
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 31) return n + ' days ago';
    if (n < 365) return Math.round(n / 30) + ' months ago';
    return Math.round(n / 365) + ' years ago';
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  /* ---- status ------------------------------------------------------- */

  const STATUS_LABEL = {
    needs_tnvr:  'Needs TNVR',
    in_progress: 'In Progress',
    complete:    'Complete'
  };

  function statusPill(status) {
    const s = status || 'needs_tnvr';
    return '<span class="status-pill st-' + s + '">' + esc(STATUS_LABEL[s] || s) + '</span>';
  }

  function statusColor(status) {
    return status === 'complete' ? 'green' : status === 'in_progress' ? 'amber' : 'red';
  }

  /* ---- phone -------------------------------------------------------- */

  function telHref(phone) {
    return 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
  }

  /* ---- the sheet ---------------------------------------------------- */

  const sheet     = () => $('#sheet');
  const scrim     = () => $('#scrim');
  let   onCloseCb = null;
  const stack     = [];

  function openSheet(opts) {
    const { title, sub, body, footer, onClose, push } = opts;
    if (push && sheet().classList.contains('open')) {
      stack.push({
        title:  $('#sheetTitle').innerHTML,
        sub:    $('#sheetSub').innerHTML,
        body:   $('#sheetBody').innerHTML,
        footer: $('#sheetFoot').innerHTML,
        footerHidden: $('#sheetFoot').hidden,
        onClose: onCloseCb
      });
    }
    $('#sheetTitle').innerHTML = title || '';
    $('#sheetSub').innerHTML   = sub || '';
    $('#sheetBody').innerHTML  = body || '';
    const foot = $('#sheetFoot');
    if (footer) { foot.innerHTML = footer; foot.hidden = false; }
    else        { foot.innerHTML = '';     foot.hidden = true;  }
    $('#sheetBody').scrollTop = 0;
    onCloseCb = onClose || null;
    sheet().classList.add('open');
    scrim().classList.add('open');
  }

  function closeSheet(force) {
    if (!force && stack.length) {
      const prev = stack.pop();
      $('#sheetTitle').innerHTML = prev.title;
      $('#sheetSub').innerHTML   = prev.sub;
      $('#sheetBody').innerHTML  = prev.body;
      $('#sheetFoot').innerHTML  = prev.footer;
      $('#sheetFoot').hidden     = prev.footerHidden;
      onCloseCb = prev.onClose;
      if (typeof window.__rebindSheet === 'function') window.__rebindSheet();
      return;
    }
    stack.length = 0;
    sheet().classList.remove('open');
    scrim().classList.remove('open');
    const cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
  }

  function sheetIsOpen() { return sheet().classList.contains('open'); }

  /* ---- toasts ------------------------------------------------------- */

  function toast(msg, kind, action) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.addEventListener('click', () => { el.remove(); action.fn(); });
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), action ? 9000 : 4200);
  }

  /* ---- number stepper ----------------------------------------------- */

  /* Renders a stepper that can hold "unknown" as a real value rather than
     pretending an unknown count is zero. */
  function stepper(name, value, opts) {
    const o = opts || {};
    const v = num(value);
    const shown = v === null ? (o.unknownLabel || 'Unknown') : v;
    return '' +
      '<div class="stepper" data-stepper="' + esc(name) + '" data-min="' + (o.min || 0) + '">' +
        '<button type="button" data-step="-1" aria-label="Decrease">&minus;</button>' +
        '<div class="val' + (v === null ? ' unknown' : '') + '" data-val="' +
          (v === null ? '' : v) + '">' + esc(shown) + '</div>' +
        '<button type="button" data-step="1" aria-label="Increase">+</button>' +
      '</div>';
  }

  function bindSteppers(root) {
    $$('[data-stepper]', root).forEach(st => {
      const min = Number(st.dataset.min || 0);
      st.addEventListener('click', e => {
        const btn = e.target.closest('[data-step]');
        if (!btn) return;
        const cell = $('.val', st);
        const cur = cell.dataset.val === '' ? null : Number(cell.dataset.val);
        let next;
        if (cur === null) next = Number(btn.dataset.step) > 0 ? min + 1 : min;
        else next = Math.max(min, cur + Number(btn.dataset.step));
        cell.dataset.val = next;
        cell.textContent = next;
        cell.classList.remove('unknown');
        st.dispatchEvent(new CustomEvent('stepchange', { bubbles: true }));
      });
    });
  }

  function stepperValue(root, name) {
    const st = $('[data-stepper="' + name + '"]', root);
    if (!st) return null;
    const raw = $('.val', st).dataset.val;
    return raw === '' ? null : Number(raw);
  }

  /* ---- segmented control -------------------------------------------- */

  function segment(name, options, current, extraClass) {
    return '<div class="seg ' + (extraClass || '') + '" data-seg="' + esc(name) + '">' +
      options.map(o =>
        '<button type="button" data-v="' + esc(o.value) + '"' +
        (String(o.value) === String(current) ? ' class="on"' : '') + '>' +
        esc(o.label) + '</button>'
      ).join('') + '</div>';
  }

  function bindSegments(root) {
    $$('[data-seg]', root).forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        $$('button', seg).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        seg.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: b.dataset.v }));
      });
    });
  }

  function segmentValue(root, name) {
    const on = $('[data-seg="' + name + '"] button.on', root);
    return on ? on.dataset.v : null;
  }

  /* ---- who is editing ----------------------------------------------- */

  function editorName() {
    return localStorage.getItem('colony_editor') || '';
  }
  function setEditorName(n) {
    if (n && n.trim()) localStorage.setItem('colony_editor', n.trim());
  }

  /* Asks once, then remembers. Field work should not mean typing your
     name forty times in an afternoon. */
  function editorField() {
    const saved = editorName();
    return '<div class="field">' +
      '<label for="editorName">Your name or initials</label>' +
      '<input class="input" id="editorName" name="editorName" autocomplete="name" ' +
        'value="' + esc(saved) + '" placeholder="e.g. Paighton">' +
      '<div class="hint">Saved on this phone so you only type it once. No account needed.</div>' +
    '</div>';
  }

  return {
    $, $$, esc, num, showNum, showText,
    longDate, shortDate, dateTime, daysSince, agoLabel, today, parseDate,
    statusPill, statusColor, STATUS_LABEL, telHref,
    openSheet, closeSheet, sheetIsOpen, toast,
    stepper, bindSteppers, stepperValue,
    segment, bindSegments, segmentValue,
    editorName, setEditorName, editorField
  };
})();
