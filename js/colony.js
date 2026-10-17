/* =====================================================================
   The colony record — bottom sheet on a phone, side panel on a desktop.
   ===================================================================== */

const ColonyPanel = (() => {

  let currentId = null;

  function open(id) {
    const c = Store.byId(id);
    if (!c) { UI.toast('That colony could not be found.', 'err'); return; }
    currentId = id;

    UI.openSheet({
      title: UI.esc(title(c)),
      sub: UI.esc(subtitle(c)),
      body: '<div id="colonyBody">' + skeleton(c) + '</div>',
      footer: footer(),
      onClose: () => { currentId = null; MapView.select(null); }
    });

    bind(c);
    loadTimeline(c);
  }

  function title(c) {
    return c.name || c.location_text || c.colony_code || 'Colony';
  }

  function subtitle(c) {
    const bits = [];
    if (c.name && c.location_text && c.name !== c.location_text) bits.push(c.location_text);
    if (c.city_area) bits.push(c.city_area);
    if (c.county) bits.push(c.county + ' County');
    if (c.colony_code) bits.push(c.colony_code);
    return bits.join(' · ');
  }

  /* --------------------------------------------------------- rendering */

  function skeleton(c) {
    return [
      banners(c),
      c.tracker ? Tracker.panel(c) : Tracker.panel(c) + countTiles(c),
      Completed.clinicPanel(c.id),
      '<button class="btn btn-primary btn-big" id="recordVisit">ADD FIXED CATS</button>',
      '<div class="btn-row">' +
        '<button class="btn" id="quickUpdate">Quick Update</button>' +
        '<button class="btn" id="editDetails">Edit Details</button>' +
        (c.latitude !== null
          ? '<button class="btn" id="directions">Directions</button>'
          : '<button class="btn" id="dropPin">Drop Pin</button>') +
      '</div>',
      locationBlock(c),
      contactsBlock(c),
      trappingBlock(c),
      notesBlock(c),
      originalBlock(c),
      '<div class="block"><h3>Activity &amp; history</h3><div id="timeline">' +
        '<div class="empty">Loading…</div></div></div>'
    ].join('');
  }

  function banners(c) {
    let h = '';

    if (MapView.isClaimed(c)) {
      h += '<div class="banner claim"><b>' + UI.esc(c.claimed_by) + '</b> is working this colony ' +
           'through ' + UI.esc(UI.shortDate(c.claimed_until)) + '. ' +
           'Check in before you set traps.</div>';
    }

    if (c.latitude === null) {
      h += '<div class="banner review"><b>No pin yet.</b> ' +
           UI.esc(c.location_note || 'This location could not be placed automatically.') +
           ' Tap <b>Drop Pin</b> to put it on the map.</div>';
    }

    if (c.needs_review && c.review_reasons.length) {
      h += '<div class="banner review"><b>Needs a look:</b> ' +
           c.review_reasons.map(r => UI.esc(r)).join('<br>') + '</div>';
    }

    if (c.status_locked !== true && c.est_total_cats !== null) {
      const sugg = suggestStatus(c);
      if (sugg !== c.status) {
        h += '<div class="banner review">The counts suggest <b>' +
             UI.esc(UI.STATUS_LABEL[sugg]) + '</b>. Status is set to <b>' +
             UI.esc(UI.STATUS_LABEL[c.status]) + '</b> — change it in Quick Update if that is wrong.</div>';
      }
    }
    return h;
  }

  function suggestStatus(c) {
    const fixed = c.known_fixed || 0;
    if (c.est_total_cats !== null && fixed >= c.est_total_cats && c.est_total_cats > 0) return 'complete';
    if (fixed > 0) return 'in_progress';
    return 'needs_tnvr';
  }

  function countTiles(c) {
    const rem = c.est_remaining;
    const remClass = rem === 0 ? ' zero' : '';
    return '<div class="counts">' +
      tile('Cats fixed', Tracker.done(c)) +
      tile('Original estimate', c.est_total_cats) +
      '<div class="c rem"><div class="n' + (rem === null ? ' unknown' : remClass) + '">' +
        (rem === null ? 'Unknown' : rem) + '</div><div class="l">Still to fix</div></div>' +
      tile('Kittens', c.kitten_count) +
    '</div>';
  }

  function tile(label, value) {
    const v = UI.num(value);
    return '<div class="c"><div class="n' + (v === null ? ' unknown' : '') + '">' +
      (v === null ? 'Unknown' : v) + '</div><div class="l">' + UI.esc(label) + '</div></div>';
  }

  function locationBlock(c) {
    const rows = [
      ['Location', UI.showText(c.location_text)],
      ['City / area', UI.showText(c.city_area)],
      ['County', UI.showText(c.county)]
    ];
    if (c.latitude !== null) {
      rows.push(['Coordinates',
        '<span style="font-family:var(--mono);font-size:13px">' +
        c.latitude.toFixed(5) + ', ' + c.longitude.toFixed(5) + '</span>' +
        (c.location_quality === 'approximate'
          ? '<div class="hint" style="font-size:12px;color:var(--ink-3)">Approximate — matched the road, not the house.</div>'
          : '')]);
    }
    if (c.out_of_area) {
      rows.push(['Map', '<span class="unknown">Outside the service area — kept on record, not shown on the map</span>']);
    }
    return block('Location', rows);
  }

  function contactsBlock(c) {
    const hasReporter  = c.reporter_name || c.reporter_phone || c.reporter_email;
    const hasCaretaker = c.caretaker_name || c.caretaker_phone || c.caretaker_email;

    if (!hasReporter && !hasCaretaker && c.has_caretaker === null) {
      return block('People', [['Caretaker', '<span class="unknown">Unknown</span>']]);
    }

    let inner = '';
    if (c.has_caretaker === true && !hasCaretaker) {
      inner += '<div class="kv"><dt>Caretaker</dt><dd>Yes — name not recorded</dd></div>';
    }
    if (c.caretaker_name) inner += '<div class="kv"><dt>Caretaker</dt><dd>' + UI.esc(c.caretaker_name) + '</dd></div>';
    if (c.reporter_name)  inner += '<div class="kv"><dt>Reported by</dt><dd>' + UI.esc(c.reporter_name) + '</dd></div>';

    const priv = [];
    if (c.caretaker_phone) priv.push(['Caretaker', c.caretaker_phone, 'tel']);
    if (c.caretaker_email) priv.push(['Caretaker', c.caretaker_email, 'mail']);
    if (c.reporter_phone)  priv.push(['Reporter', c.reporter_phone, 'tel']);
    if (c.reporter_email)  priv.push(['Reporter', c.reporter_email, 'mail']);

    // Shown outright, at HCHS's instruction — trappers need to call the
    // caretaker before they set traps, and the caretakers have agreed to
    // their details being shared. Phone numbers are tap-to-dial.
    if (priv.length) {
      inner += '<div id="contactList">' +
        priv.map(p =>
          '<div class="contact-line"><span style="color:var(--ink-3);font-size:13px;min-width:74px">' +
          UI.esc(p[0]) + '</span>' +
          (p[2] === 'tel'
            ? '<a href="' + UI.telHref(p[1]) + '">' + UI.esc(p[1]) + '</a>'
            : '<a href="mailto:' + UI.esc(p[1]) + '">' + UI.esc(p[1]) + '</a>') +
          '</div>').join('') +
        '</div>';
    }
    return '<div class="block"><h3>People</h3>' + inner + '</div>';
  }

  function trappingBlock(c) {
    const yn = v => v === true ? 'Yes' : v === false ? 'No' : '<span class="unknown">Unknown</span>';
    const rows = [
      ['Trapping help', yn(c.trapping_help_needed)],
      ['Kittens present', yn(c.kittens_present)],
      ['Traps on site', UI.showText(c.traps_on_site, 'None recorded')],
      ['Organizations', c.orgs_involved.length
          ? c.orgs_involved.map(o => UI.esc(o)).join(', ')
          : '<span class="unknown">None recorded</span>'],
      ['Priority', UI.esc((c.priority || 'normal').replace(/^./, s => s.toUpperCase()))],
      ['First reported', c.date_reported ? UI.longDate(c.date_reported) : '<span class="unknown">Unknown</span>'],
      ['Last worked', c.date_last_worked
          ? UI.longDate(c.date_last_worked) + ' <span style="color:var(--ink-3);font-size:12.5px">(' + UI.agoLabel(c.date_last_worked) + ')</span>'
          : '<span class="unknown">No visit recorded</span>']
    ];
    if (c.scheduled_clinic_date) {
      rows.splice(1, 0, ['Clinic booked', UI.esc(c.scheduled_clinic_date)]);
    }
    return block('Status &amp; trapping', rows);
  }

  function notesBlock(c) {
    if (!c.notes) return '';
    return '<div class="block"><h3>Notes</h3><div style="font-size:14.5px;white-space:pre-wrap">' +
      UI.esc(c.notes) + '</div></div>';
  }

  function originalBlock(c) {
    const bits = [];
    if (c.original_estimate_text) bits.push('Estimated Cats: "' + c.original_estimate_text + '"');
    if (c.original_notes)         bits.push('Notes: "' + c.original_notes + '"');
    if (c.source_sheet)           bits.push('Sheet ' + c.source_sheet + ', row ' + c.source_row);
    if (!bits.length) return '';
    return '<div class="block"><h3>Original spreadsheet entry</h3>' +
      '<div class="orig">' + UI.esc(bits.join('\n')) + '</div>' +
      '<div style="font-size:12px;color:var(--ink-3);margin-top:7px">Kept exactly as it was written. Preserved from the source record.</div>' +
      '</div>';
  }

  function block(heading, rows) {
    return '<div class="block"><h3>' + heading + '</h3>' +
      rows.map(r => '<div class="kv"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') +
      '</div>';
  }

  function footer() {
    return '<button class="btn" id="claimBtn" style="flex:1">I&rsquo;m working this</button>' +
           '<button class="btn" id="moreBtn" style="flex:none;width:56px" aria-label="More actions">···</button>';
  }

  /* ---------------------------------------------------------- timeline */

  async function loadTimeline(c) {
    const [visits, hist] = await Promise.all([Store.visits(c.id), Store.history(c.id)]);
    const el = document.getElementById('timeline');
    if (!el) return;

    const events = [];

    visits.forEach(v => events.push({
      when: v.visit_date,
      kind: 'visit',
      html: '<span class="when">' + UI.esc(UI.longDate(v.visit_date)) + ' · TNVR visit</span>' +
            '<div class="what"><b>' + UI.esc(v.organization || 'Organization not recorded') + '</b><br>' +
            visitLine(v) + '</div>' +
            (v.notes ? '<div class="what" style="color:var(--ink-3);font-size:13px">' + UI.esc(v.notes) + '</div>' : '')
    }));

    // group field edits so one save reads as one line, not six
    const batches = {};
    hist.filter(h => h.change_type === 'edit').forEach(h => {
      (batches[h.batch_id] = batches[h.batch_id] || []).push(h);
    });
    Object.keys(batches).forEach(bid => {
      const rows = batches[bid];
      const first = rows[0];
      const who = first.editor_name || 'Someone';
      const desc = rows.map(r =>
        UI.esc(fieldLabel(r.field_name)) + ' from <b>' + UI.esc(valLabel(r.field_name, r.old_value)) +
        '</b> to <b>' + UI.esc(valLabel(r.field_name, r.new_value)) + '</b>').join(', ');
      events.push({
        when: first.changed_at,
        kind: 'edit',
        html: '<span class="when">' + UI.esc(UI.dateTime(first.changed_at)) + '</span>' +
              '<div class="what"><b>' + UI.esc(who) + '</b> changed ' + desc + '.</div>' +
              (first.reverted
                ? '<div class="undo" style="color:var(--ink-3)">Already undone</div>'
                : '<button class="undo" data-restore="' + UI.esc(bid) + '">Undo this change</button>')
      });
    });

    hist.filter(h => h.change_type === 'import' || h.change_type === 'create').forEach(h => {
      events.push({
        when: h.changed_at,
        kind: 'edit',
        html: '<span class="when">' + UI.esc(UI.dateTime(h.changed_at)) + '</span>' +
              '<div class="what">' + (h.change_type === 'import'
                ? 'Imported from COLONY TRACKER.xlsx'
                : 'Colony added by <b>' + UI.esc(h.editor_name || 'someone') + '</b>') + '</div>'
      });
    });

    if (!events.length) {
      el.innerHTML = '<div class="empty">No activity recorded yet.<br>' +
        'Recording a TNVR visit will start the timeline.</div>';
      return;
    }

    events.sort((a, b) => String(b.when).localeCompare(String(a.when)));
    el.innerHTML = '<ul class="tl">' +
      events.map(e => '<li class="' + e.kind + '">' + e.html + '</li>').join('') + '</ul>';

    UI.$$('[data-restore]', el).forEach(b => {
      b.addEventListener('click', () => Forms.confirmRestore(b.dataset.restore, c.id));
    });
  }

  function visitLine(v) {
    const parts = [];
    if (v.num_trapped)           parts.push(v.num_trapped + ' trapped');
    if (v.num_newly_fixed)       parts.push(v.num_newly_fixed + ' newly fixed');
    if (v.num_already_eartipped) parts.push(v.num_already_eartipped + ' already ear-tipped');
    if (v.kittens_removed)       parts.push(v.kittens_removed + ' kittens removed');
    if (v.friendly_removed)      parts.push(v.friendly_removed + ' to adoption');
    if (v.num_returned)          parts.push(v.num_returned + ' returned');
    return parts.length ? UI.esc(parts.join(' · ')) : '<span class="unknown">No counts recorded</span>';
  }

  const FIELD_LABELS = {
    est_total_cats: 'Estimated Cats', known_fixed: 'Known Fixed', kitten_count: 'Kittens',
    status: 'Status', trapping_help_needed: 'Trapping Help Needed', priority: 'Priority',
    caretaker_name: 'Caretaker', caretaker_phone: 'Caretaker Phone',
    reporter_name: 'Reporter', reporter_phone: 'Reporter Phone',
    notes: 'Notes', latitude: 'Pin location', longitude: 'Pin location',
    location_text: 'Location', city_area: 'City', county: 'County',
    kittens_present: 'Kittens Present', claimed_by: 'Claimed by', claimed_until: 'Claimed until'
  };
  function fieldLabel(f) { return FIELD_LABELS[f] || f; }

  function valLabel(field, v) {
    if (v === null || v === undefined || v === '') return 'unknown';
    if (field === 'status') return UI.STATUS_LABEL[v] || v;
    if (v === 'true')  return 'Yes';
    if (v === 'false') return 'No';
    return v;
  }

  /* ----------------------------------------------------------- binding */

  function bind(c) {
    const on = (sel, fn) => { const el = UI.$(sel); if (el) el.addEventListener('click', fn); };

    on('#recordVisit', () => Forms.recordVisit(c.id));
    on('#quickUpdate', () => Tracker.edit(c));
    on('#editDetails', () => Forms.editDetails(c.id));
    on('#claimBtn',    () => Forms.claim(c.id));
    on('#moreBtn',     () => Forms.moreActions(c.id));
    on('#dropPin',     () => Forms.dropPin(c.id));

    on('#directions', () => {
      window.open('https://www.google.com/maps/dir/?api=1&destination=' +
        c.latitude + ',' + c.longitude, '_blank', 'noopener');
    });

    on('#showContacts', () => {
      const list = UI.$('#contactList');
      const btn  = UI.$('#showContacts');
      if (list) { list.hidden = false; }
      if (btn)  { btn.remove(); }
    });
  }

  function reopen() { if (currentId) open(currentId); }
  const current = () => currentId;

  // lets the sheet's back-stack re-attach handlers after popping
  window.__rebindSheet = () => { if (currentId) { const c = Store.byId(currentId); if (c) { bind(c); loadTimeline(c); } } };

  return { open, reopen, current, suggestStatus };
})();

