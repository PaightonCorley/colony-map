/* =====================================================================
   Every form in the app. Built for a thumb, outdoors, one-handed:
   steppers instead of keyboards, big targets, short questions.
   ===================================================================== */

const Forms = (() => {

  /* ------------------------------------------------------- save helper */

  async function guard(fn) {
    try {
      await fn();
    } catch (err) {
      if (err && err.preview) {
        UI.toast('Preview mode — nothing was saved. Add your Supabase keys to switch the database on.', 'err');
      } else {
        console.error(err);
        UI.toast('Could not save: ' + (err.message || 'unknown error') +
                 '. Your entries are still on screen — try again.', 'err');
      }
      throw err;
    }
  }

  function requireEditor(root) {
    const el = UI.$('#editorName', root);
    const name = el ? el.value.trim() : '';
    if (!name) {
      if (el) el.focus();
      UI.toast('Please add your name or initials so the change can be traced.', 'err');
      return null;
    }
    UI.setEditorName(name);
    return name;
  }

  /* ================================================== RECORD TNVR VISIT */

  function recordVisit(colonyId) {
    const c = Store.byId(colonyId);
    if (!c) return;

    const orgs = window.CONFIG.ORGS;

    const body =
      '<div class="field"><label for="visitDate">Date of the visit</label>' +
        '<input class="input" type="date" id="visitDate" value="' + UI.today() + '" max="' + UI.today() + '">' +
      '</div>' +

      '<div class="field"><label>Who worked the colony</label>' +
        UI.segment('org', orgs.map(o => ({ value: o, label: o })).concat([{ value: '__other', label: 'Other' }]),
                   c.orgs_involved[0] || orgs[0]) +
        '<input class="input" id="orgOther" placeholder="Name of the person or group" hidden style="margin-top:8px">' +
      '</div>' +

      '<div class="field"><label>Counts</label>' +
        stepRow('Cats trapped', 'trapped', 0) +
        stepRow('Newly spayed / neutered', 'fixed', 0) +
        stepRow('Already ear-tipped', 'eartipped', 0) +
        stepRow('Kittens removed', 'kittens', 0) +
        stepRow('Friendly cats to adoption', 'friendly', 0) +
        stepRow('Returned to the colony', 'returned', 0) +
      '</div>' +

      '<div class="preview" id="visitPreview"></div>' +

      '<div class="field"><label for="visitNotes">Notes — optional</label>' +
        '<textarea class="input" id="visitNotes" placeholder="Anything worth remembering next time"></textarea>' +
      '</div>' +

      UI.editorField();

    UI.openSheet({
      title: 'Record TNVR Visit',
      sub: UI.esc(c.location_text || c.name),
      body: body,
      footer: '<button class="btn" id="cancelVisit" style="flex:none;width:110px">Cancel</button>' +
              '<button class="btn btn-primary" id="saveVisit" style="flex:1">SAVE VISIT</button>',
      push: true
    });

    const root = UI.$('#sheetBody');
    UI.bindSteppers(root);
    UI.bindSegments(root);

    UI.$('[data-seg="org"]').addEventListener('segchange', e => {
      UI.$('#orgOther').hidden = e.detail !== '__other';
    });

    root.addEventListener('stepchange', updatePreview);
    updatePreview();

    function updatePreview() {
      const fixed = UI.stepperValue(root, 'fixed') || 0;
      const before = c.known_fixed;
      const after = (before || 0) + fixed;
      const remBefore = c.est_remaining;
      const remAfter = c.est_total_cats === null ? null : Math.max(0, c.est_total_cats - after);

      let html = '';
      if (fixed === 0) {
        html = 'No newly fixed cats yet — the visit will still be recorded on the timeline.';
      } else {
        html = 'Known Fixed <b>' + (before === null ? 'unknown' : before) + ' → ' + after + '</b>';
        if (remBefore !== null) html += ' · Remaining <b>' + remBefore + ' → ' + remAfter + '</b>';
        else html += ' · Remaining stays <b>unknown</b> until an estimate is entered';

        if (c.est_total_cats !== null && after > c.est_total_cats) {
          html += '<br><b>More cats fixed than the estimate.</b> The estimate will be raised to ' +
                  after + ' so nothing goes negative.';
        } else {
          const sugg = remAfter === 0 && c.est_total_cats !== null ? 'complete' : 'in_progress';
          if (sugg !== c.status) {
            html += '<br>Status will be suggested as <b>' + UI.STATUS_LABEL[sugg] + '</b>.';
          }
        }
      }
      UI.$('#visitPreview').innerHTML = html;
    }

    UI.$('#cancelVisit').addEventListener('click', () => UI.closeSheet());

    UI.$('#saveVisit').addEventListener('click', () => {
      const editor = requireEditor(root);
      if (!editor) return;

      let org = UI.segmentValue(root, 'org');
      if (org === '__other') org = UI.$('#orgOther').value.trim() || null;

      const fixed = UI.stepperValue(root, 'fixed') || 0;
      const visit = {
        colony_id: colonyId,
        visit_date: UI.$('#visitDate').value || UI.today(),
        organization: org,
        worked_by: editor,
        num_trapped:           UI.stepperValue(root, 'trapped')   || 0,
        num_newly_fixed:       fixed,
        num_already_eartipped: UI.stepperValue(root, 'eartipped') || 0,
        kittens_removed:       UI.stepperValue(root, 'kittens')   || 0,
        friendly_removed:      UI.stepperValue(root, 'friendly')  || 0,
        num_returned:          UI.stepperValue(root, 'returned')  || 0,
        notes: UI.$('#visitNotes').value.trim() || null,
        recorded_by: editor,
        source: 'manual'
      };

      guard(async () => {
        // raise the estimate first so Remaining can never be forced negative
        const after = (c.known_fixed || 0) + fixed;
        if (c.est_total_cats !== null && after > c.est_total_cats) {
          await Store.updateColony(colonyId, { est_total_cats: after }, editor);
        }
        await Store.addVisit(visit);
        UI.closeSheet(true);
        UI.toast('Visit saved. ' + (fixed ? fixed + ' more cats fixed.' : 'Recorded on the timeline.'), 'ok');
        ColonyPanel.open(colonyId);
        App.refreshView();
      }).catch(() => {});
    });
  }

  function stepRow(label, name, value) {
    return '<div class="stepper-row"><span class="lbl">' + UI.esc(label) + '</span>' +
      UI.stepper(name, value) + '</div>';
  }

  /* ====================================================== QUICK UPDATE */

  function quickUpdate(colonyId) {
    const c = Store.byId(colonyId);
    if (!c) return;

    const body =
      '<div class="field"><label>Cat counts</label>' +
        stepRow('Estimated total cats', 'total', c.est_total_cats) +
        stepRow('Known fixed', 'fixed', c.known_fixed) +
        stepRow('Kittens', 'kittens', c.kitten_count) +
        '<div class="hint">Tap + or &minus;. Leave a count as Unknown if you genuinely do not know.</div>' +
      '</div>' +

      '<div class="preview" id="quickPreview"></div>' +

      '<div class="field"><label>Status</label>' +
        UI.segment('status', [
          { value: 'needs_tnvr',  label: 'Needs TNVR' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'complete',    label: 'Complete' }
        ], c.status, 'status') +
      '</div>' +

      '<div class="field"><label>Trapping help needed?</label>' +
        UI.segment('help', [
          { value: 'true',  label: 'Yes' },
          { value: 'false', label: 'No' },
          { value: '',      label: 'Unknown' }
        ], c.trapping_help_needed === null ? '' : String(c.trapping_help_needed)) +
      '</div>' +

      '<div class="field"><label>Kittens present?</label>' +
        UI.segment('kitpresent', [
          { value: 'true',  label: 'Yes' },
          { value: 'false', label: 'No' },
          { value: '',      label: 'Unknown' }
        ], c.kittens_present === null ? '' : String(c.kittens_present)) +
      '</div>' +

      UI.editorField();

    UI.openSheet({
      title: 'Quick Update',
      sub: UI.esc(c.location_text || c.name),
      body: body,
      footer: '<button class="btn" id="cancelQuick" style="flex:none;width:110px">Cancel</button>' +
              '<button class="btn btn-primary" id="saveQuick" style="flex:1">SAVE</button>',
      push: true
    });

    const root = UI.$('#sheetBody');
    UI.bindSteppers(root);
    UI.bindSegments(root);
    root.addEventListener('stepchange', updatePreview);
    updatePreview();

    function updatePreview() {
      const total = UI.stepperValue(root, 'total');
      const fixed = UI.stepperValue(root, 'fixed');
      const rem = total === null ? null : Math.max(0, total - (fixed || 0));
      let h = 'Remaining will be <b>' + (rem === null ? 'unknown' : rem) + '</b>';
      if (total !== null && fixed !== null && fixed > total) {
        h += '<br><b>Fixed is higher than the estimate.</b> Remaining will show 0 — consider raising the estimate.';
      }
      const sugg = ColonyPanel.suggestStatus({ est_total_cats: total, known_fixed: fixed });
      h += '<br>Counts suggest <b>' + UI.STATUS_LABEL[sugg] + '</b>. You can still set any status you want.';
      UI.$('#quickPreview').innerHTML = h;
    }

    UI.$('#cancelQuick').addEventListener('click', () => UI.closeSheet());

    UI.$('#saveQuick').addEventListener('click', () => {
      const editor = requireEditor(root);
      if (!editor) return;

      const help = UI.segmentValue(root, 'help');
      const kit  = UI.segmentValue(root, 'kitpresent');
      const status = UI.segmentValue(root, 'status');

      const patch = {
        est_total_cats: UI.stepperValue(root, 'total'),
        known_fixed:    UI.stepperValue(root, 'fixed'),
        kitten_count:   UI.stepperValue(root, 'kittens'),
        trapping_help_needed: help === '' ? null : help === 'true',
        kittens_present:      kit  === '' ? null : kit  === 'true'
      };
      if (status !== c.status) {
        patch.status = status;
        patch.status_source = 'manual';
        patch.status_locked = true;   // a person decided; stop second-guessing
      }

      guard(async () => {
        await Store.updateColony(colonyId, patch, editor);
        UI.closeSheet(true);
        UI.toast('Saved.', 'ok');
        ColonyPanel.open(colonyId);
        App.refreshView();
      }).catch(() => {});
    });
  }

  /* ====================================================== EDIT DETAILS */

  function editDetails(colonyId) {
    const c = Store.byId(colonyId);
    if (!c) return;

    const body =
      textField('Colony name (optional)', 'f_name', c.name) +
      textField('Location as written', 'f_location', c.location_text) +
      selectField('City / area', 'f_city', window.CONFIG.CITIES, c.city_area) +
      selectField('County', 'f_county', window.CONFIG.COUNTIES, c.county) +
      '<div class="block"><h3>Caretaker</h3>' +
        textField('Name', 'f_ctname', c.caretaker_name) +
        textField('Phone', 'f_ctphone', c.caretaker_phone, 'tel') +
        textField('Email', 'f_ctemail', c.caretaker_email, 'email') +
      '</div>' +
      '<div class="block"><h3>Who reported it</h3>' +
        textField('Name', 'f_rpname', c.reporter_name) +
        textField('Phone', 'f_rpphone', c.reporter_phone, 'tel') +
        textField('Email', 'f_rpemail', c.reporter_email, 'email') +
      '</div>' +
      '<div class="block"><h3>Other</h3>' +
        textField('Traps on site', 'f_traps', c.traps_on_site) +
        '<div class="field"><label>Priority</label>' +
          UI.segment('priority', [
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' }
          ], c.priority || 'normal') +
        '</div>' +
        '<div class="field"><label for="f_notes">Notes</label>' +
          '<textarea class="input" id="f_notes" placeholder="Working notes — the original spreadsheet note is kept separately">' +
          UI.esc(c.notes || '') + '</textarea>' +
        '</div>' +
      '</div>' +
      UI.editorField();

    UI.openSheet({
      title: 'Edit Details',
      sub: UI.esc(c.location_text || c.name),
      body: body,
      footer: '<button class="btn" id="cancelEdit" style="flex:none;width:110px">Cancel</button>' +
              '<button class="btn btn-primary" id="saveEdit" style="flex:1">SAVE CHANGES</button>',
      push: true
    });

    const root = UI.$('#sheetBody');
    UI.bindSegments(root);
    UI.$('#cancelEdit').addEventListener('click', () => UI.closeSheet());

    UI.$('#saveEdit').addEventListener('click', () => {
      const editor = requireEditor(root);
      if (!editor) return;
      const val = id => { const e = UI.$('#' + id); return e && e.value.trim() ? e.value.trim() : null; };

      const patch = {
        name: val('f_name'),
        location_text: val('f_location') || c.location_text,
        city_area: val('f_city'), county: val('f_county'),
        caretaker_name: val('f_ctname'), caretaker_phone: val('f_ctphone'), caretaker_email: val('f_ctemail'),
        reporter_name: val('f_rpname'), reporter_phone: val('f_rpphone'), reporter_email: val('f_rpemail'),
        traps_on_site: val('f_traps'),
        priority: UI.segmentValue(root, 'priority'),
        notes: val('f_notes')
      };
      patch.has_caretaker = patch.caretaker_name || patch.caretaker_phone ? true : c.has_caretaker;

      guard(async () => {
        await Store.updateColony(colonyId, patch, editor);
        UI.closeSheet(true);
        UI.toast('Changes saved.', 'ok');
        ColonyPanel.open(colonyId);
        App.refreshView();
      }).catch(() => {});
    });
  }

  function textField(label, id, value, type) {
    return '<div class="field"><label for="' + id + '">' + UI.esc(label) + '</label>' +
      '<input class="input" type="' + (type || 'text') + '" id="' + id + '" value="' +
      UI.esc(value || '') + '"></div>';
  }

  function selectField(label, id, options, value) {
    return '<div class="field"><label for="' + id + '">' + UI.esc(label) + '</label>' +
      '<select class="input" id="' + id + '"><option value="">Unknown</option>' +
      options.map(o => '<option' + (o === value ? ' selected' : '') + '>' + UI.esc(o) + '</option>').join('') +
      (value && options.indexOf(value) === -1
        ? '<option selected>' + UI.esc(value) + '</option>' : '') +
      '</select></div>';
  }

  /* ========================================================= ADD COLONY */

  let draft = null;

  function addColony() {
    draft = { lat: null, lng: null };

    UI.openSheet({
      title: 'Add a Colony',
      sub: 'Step 1 of 2 — where is it?',
      body:
        '<div class="field"><label>Put it on the map</label>' +
          '<button class="btn" id="useMyLocation" style="margin-bottom:8px">Use my current location</button>' +
          '<button class="btn" id="tapTheMap">Tap the map to place the pin</button>' +
          '<div class="hint">Either works. You can drag the pin afterwards to nudge it.</div>' +
        '</div>' +
        '<div class="field"><label for="addrSearch">Or search an address</label>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="input" id="addrSearch" placeholder="e.g. 214 Buttercup Street, Kingsland" style="flex:1">' +
            '<button class="btn" id="addrGo" style="flex:none;width:88px">Find</button>' +
          '</div>' +
          '<div id="addrResults"></div>' +
        '</div>' +
        '<div id="placedInfo"></div>',
      footer: '<button class="btn" id="cancelAdd" style="flex:none;width:110px">Cancel</button>' +
              '<button class="btn btn-primary" id="toStep2" style="flex:1" disabled>NEXT</button>'
    });

    UI.$('#cancelAdd').addEventListener('click', () => { MapView.stopPick(); UI.closeSheet(true); });

    UI.$('#useMyLocation').addEventListener('click', async () => {
      try {
        UI.toast('Finding your location…');
        const p = await MapView.locate();
        MapView.placePickMarker(p.lat, p.lng);
        MapView.instance().setView([p.lat, p.lng], 17);
        setPlaced(p.lat, p.lng);
      } catch (e) { UI.toast(e.message, 'err'); }
    });

    UI.$('#tapTheMap').addEventListener('click', () => {
      MapView.startPick((lat, lng) => setPlaced(lat, lng));
      UI.closeSheet(true);
      UI.toast('Tap the spot on the map.', null, {
        label: 'Cancel', fn: () => { MapView.stopPick(); }
      });
      // re-open the form as soon as a spot is chosen
      const wait = setInterval(() => {
        if (draft && draft.lat !== null) { clearInterval(wait); addColonyResume(); }
      }, 250);
      setTimeout(() => clearInterval(wait), 120000);
    });

    UI.$('#addrGo').addEventListener('click', doSearch);
    UI.$('#addrSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    UI.$('#toStep2').addEventListener('click', () => addColonyStep2());

    async function doSearch() {
      const q = UI.$('#addrSearch').value.trim();
      if (!q) return;
      const box = UI.$('#addrResults');
      box.innerHTML = '<div class="hint" style="padding:8px 0">Searching…</div>';
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=' +
                    encodeURIComponent(q + ', Texas');
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const rows = await res.json();
        if (!rows.length) {
          box.innerHTML = '<div class="hint" style="padding:8px 0">Nothing found. ' +
            'Tap the map instead — that always works.</div>';
          return;
        }
        box.innerHTML = '<ul class="list">' + rows.map((r, i) =>
          '<li data-i="' + i + '"><div class="main"><div class="t">' +
          UI.esc(r.display_name.split(',').slice(0, 2).join(',')) + '</div>' +
          '<div class="m">' + UI.esc(r.display_name.split(',').slice(2, 5).join(',')) + '</div></div></li>'
        ).join('') + '</ul>';
        UI.$$('#addrResults li').forEach(li => li.addEventListener('click', () => {
          const r = rows[Number(li.dataset.i)];
          const lat = Number(r.lat), lng = Number(r.lon);
          MapView.placePickMarker(lat, lng);
          MapView.instance().setView([lat, lng], 17);
          draft.address = r.display_name.split(',')[0];
          setPlaced(lat, lng);
        }));
      } catch (e) {
        box.innerHTML = '<div class="hint" style="padding:8px 0">Address search is unavailable right now. ' +
          'Tap the map instead.</div>';
      }
    }

    function setPlaced(lat, lng) {
      draft.lat = lat; draft.lng = lng;
      const near = Store.nearby(lat, lng);
      const info = UI.$('#placedInfo');
      if (!info) return;

      let html = '<div class="banner review"><b>Pin placed.</b> ' +
                 lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>';

      if (near.length) {
        html += '<div class="banner claim"><b>POSSIBLE EXISTING COLONY NEARBY</b><br>' +
          'There ' + (near.length === 1 ? 'is 1 colony' : 'are ' + near.length + ' colonies') +
          ' within ' + window.CONFIG.DUPLICATE_RADIUS_M + ' m of this spot. ' +
          'Please check before adding a new one.</div>' +
          '<ul class="list">' + near.map(n =>
            '<li data-open="' + UI.esc(n.id) + '">' +
            '<span class="dot" style="background:var(--' + UI.statusColor(n.status) + ')"></span>' +
            '<div class="main"><div class="t">' + UI.esc(n.location_text || n.name) + '</div>' +
            '<div class="m">' + UI.esc(UI.STATUS_LABEL[n.status]) + ' · ' +
            Math.round(n.distance_m) + ' m away · ' +
            (n.est_remaining === null ? 'population unknown' : n.est_remaining + ' cats remaining') +
            '</div></div>' +
            '<div class="r"><span class="lbl">Open</span></div></li>').join('') +
          '</ul>' +
          '<div class="hint" style="margin-top:8px">Tap one to open it instead, or carry on below if this is genuinely a separate colony.</div>';
      }
      info.innerHTML = html;

      UI.$$('#placedInfo [data-open]').forEach(li => li.addEventListener('click', () => {
        MapView.stopPick();
        UI.closeSheet(true);
        ColonyPanel.open(li.dataset.open);
      }));

      UI.$('#toStep2').disabled = false;
    }

    window.__setPlaced = setPlaced;
  }

  function addColonyResume() {
    // the user tapped the map; bring the form back with the pin recorded
    addColony();
    setTimeout(() => {
      if (window.__setPlaced && draft.lat !== null) window.__setPlaced(draft.lat, draft.lng);
    }, 30);
  }

  function addColonyStep2() {
    const body =
      textField('Location or place name', 'a_location', draft.address || '') +
      '<div class="hint" style="margin:-9px 0 15px">A street address, a business name, or a description — whatever you have.</div>' +
      selectField('City / area', 'a_city', window.CONFIG.CITIES, guessCity(draft.lat, draft.lng)) +
      '<div class="field"><label>Roughly how many cats?</label>' +
        stepRow('Estimated total', 'a_total', null) +
        '<div class="hint">Leave it Unknown if you have not counted. That is normal and it will still show on the map.</div>' +
      '</div>' +
      '<div class="field"><label>Status, if you know</label>' +
        UI.segment('a_status', [
          { value: 'needs_tnvr',  label: 'Needs TNVR' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'complete',    label: 'Complete' }
        ], 'needs_tnvr', 'status') +
      '</div>' +
      '<div class="field"><label>Is trapping help needed?</label>' +
        UI.segment('a_help', [
          { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }, { value: '', label: 'Unknown' }
        ], '') +
      '</div>' +
      textField('Who reported it', 'a_rpname') +
      textField('Their phone', 'a_rpphone', '', 'tel') +
      textField('Caretaker, if known', 'a_ctname') +
      textField('Caretaker phone', 'a_ctphone', '', 'tel') +
      '<div class="field"><label for="a_notes">Notes</label>' +
        '<textarea class="input" id="a_notes" placeholder="Anything useful — feeding times, access, temperament"></textarea>' +
      '</div>' +
      UI.editorField();

    UI.openSheet({
      title: 'Add a Colony',
      sub: 'Step 2 of 2 — the short version',
      body: body,
      footer: '<button class="btn" id="backAdd" style="flex:none;width:96px">Back</button>' +
              '<button class="btn btn-primary" id="saveAdd" style="flex:1">ADD COLONY</button>'
    });

    const root = UI.$('#sheetBody');
    UI.bindSteppers(root);
    UI.bindSegments(root);

    UI.$('#backAdd').addEventListener('click', () => addColony());

    UI.$('#saveAdd').addEventListener('click', () => {
      const editor = requireEditor(root);
      if (!editor) return;
      const val = id => { const e = UI.$('#' + id); return e && e.value.trim() ? e.value.trim() : null; };
      const loc = val('a_location');
      if (!loc) { UI.$('#a_location').focus(); UI.toast('Please give the colony a location or a name.', 'err'); return; }

      const help = UI.segmentValue(root, 'a_help');
      const city = val('a_city');

      const fields = {
        location_text: loc,
        address_line: /^\d/.test(loc) ? loc : null,
        name: /^\d/.test(loc) ? null : loc,
        city_area: city,
        county: countyFor(city),
        latitude: draft.lat, longitude: draft.lng,
        location_quality: 'exact', location_source: 'manual_pin',
        est_total_cats: UI.stepperValue(root, 'a_total'),
        status: UI.segmentValue(root, 'a_status'),
        status_source: 'manual',
        status_locked: UI.segmentValue(root, 'a_status') !== 'needs_tnvr',
        trapping_help_needed: help === '' ? null : help === 'true',
        reporter_name: val('a_rpname'), reporter_phone: val('a_rpphone'),
        caretaker_name: val('a_ctname'), caretaker_phone: val('a_ctphone'),
        has_caretaker: val('a_ctname') || val('a_ctphone') ? true : null,
        notes: val('a_notes'),
        date_reported: UI.today()
      };

      guard(async () => {
        const created = await Store.addColony(fields, editor);
        MapView.stopPick();
        UI.closeSheet(true);
        UI.toast('Colony added.', 'ok');
        App.refreshView();
        ColonyPanel.open(created.id);
      }).catch(() => {});
    });
  }

  const CITY_COUNTY = {
    'Burnet':'Burnet','Bertram':'Burnet','Granite Shoals':'Burnet','Marble Falls':'Burnet',
    'Cottonwood Shores':'Burnet','Spicewood':'Burnet',
    'Kingsland':'Llano','Llano':'Llano','Horseshoe Bay':'Llano','Lake Buchanan':'Llano','Tow':'Llano',
    'Lampasas':'Lampasas','Round Mountain':'Blanco'
  };
  function countyFor(city) { return CITY_COUNTY[city] || null; }

  function guessCity(lat, lng) {
    if (lat === null) return '';
    let best = '', bestD = Infinity;
    Store.mapped().forEach(c => {
      if (!c.city_area) return;
      const d = Store.metresBetween(lat, lng, c.latitude, c.longitude);
      if (d < bestD) { bestD = d; best = c.city_area; }
    });
    return bestD < 15000 ? best : '';
  }

  /* ============================================================ CLAIM */

  function claim(colonyId) {
    const c = Store.byId(colonyId);
    if (!c) return;
    const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    UI.openSheet({
      title: MapView.isClaimed(c) ? 'Update who is working here' : 'I&rsquo;m working this colony',
      sub: UI.esc(c.location_text || c.name),
      body:
        '<div class="banner review">This puts a note on the colony so another group does not turn up ' +
        'and trap the same cats. It clears itself automatically after the date you set.</div>' +
        textField('Who is trapping', 'cl_who', c.claimed_by || UI.editorName()) +
        '<div class="field"><label for="cl_until">Through what date</label>' +
          '<input class="input" type="date" id="cl_until" value="' +
          (c.claimed_until || inTwoWeeks) + '" min="' + UI.today() + '"></div>' +
        UI.editorField(),
      footer: (MapView.isClaimed(c)
          ? '<button class="btn" id="clearClaim" style="flex:none;width:120px">Release</button>' : '') +
        '<button class="btn btn-primary" id="saveClaim" style="flex:1">SAVE</button>',
      push: true
    });

    const root = UI.$('#sheetBody');
    const done = (msg) => { UI.closeSheet(true); UI.toast(msg, 'ok'); ColonyPanel.open(colonyId); App.refreshView(); };

    UI.$('#saveClaim').addEventListener('click', () => {
      const editor = requireEditor(root);
      if (!editor) return;
      const who = UI.$('#cl_who').value.trim() || editor;
      guard(async () => {
        await Store.updateColony(colonyId,
          { claimed_by: who, claimed_until: UI.$('#cl_until').value }, editor);
        done('Marked as being worked by ' + who + '.');
      }).catch(() => {});
    });

    const clear = UI.$('#clearClaim');
    if (clear) clear.addEventListener('click', () => {
      const editor = requireEditor(root); if (!editor) return;
      guard(async () => {
        await Store.updateColony(colonyId, { claimed_by: null, claimed_until: null }, editor);
        done('Released.');
      }).catch(() => {});
    });
  }

  /* ========================================================= DROP PIN */

  function dropPin(colonyId) {
    const c = Store.byId(colonyId);
    if (!c) return;
    UI.closeSheet(true);
    UI.toast('Tap the map where "' + (c.location_text || c.name) + '" is.', null, {
      label: 'Cancel', fn: () => MapView.stopPick()
    });

    MapView.startPick((lat, lng) => {
      MapView.stopPick();
      const editor = UI.editorName();
      UI.openSheet({
        title: 'Confirm the pin',
        sub: UI.esc(c.location_text || c.name),
        body:
          '<div class="banner review">Placing at <b>' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</b></div>' +
          (c.location_note ? '<div class="hint" style="margin-bottom:12px">' + UI.esc(c.location_note) + '</div>' : '') +
          UI.editorField(),
        footer: '<button class="btn" id="cancelPin" style="flex:none;width:110px">Cancel</button>' +
                '<button class="btn btn-primary" id="savePin" style="flex:1">SAVE PIN</button>'
      });
      const root = UI.$('#sheetBody');
      UI.$('#cancelPin').addEventListener('click', () => { MapView.stopPick(); UI.closeSheet(true); });
      UI.$('#savePin').addEventListener('click', () => {
        const ed = requireEditor(root); if (!ed) return;
        guard(async () => {
          await Store.updateColony(colonyId, {
            latitude: lat, longitude: lng,
            location_quality: 'exact', location_source: 'manual_pin', location_note: null
          }, ed);
          MapView.stopPick();
          UI.closeSheet(true);
          UI.toast('Pin saved.', 'ok');
          App.refreshView();
          ColonyPanel.open(colonyId);
        }).catch(() => {});
      });
    });
  }

  /* ================================================== MORE / PROTECTED */

  function moreActions(colonyId) {
    const c = Store.byId(colonyId);
    UI.openSheet({
      title: 'More actions',
      sub: UI.esc(c.location_text || c.name),
      body:
        '<ul class="list">' +
          '<li data-act="merge"><div class="main"><div class="t">Merge with another colony</div>' +
            '<div class="m">Keeps every note, visit and edit from both records</div></div></li>' +
          '<li data-act="archive"><div class="main"><div class="t">Archive this colony</div>' +
            '<div class="m">Hides it from the map. Nothing is ever deleted.</div></div></li>' +
        '</ul>' +
        '<div class="hint" style="margin-top:14px">Both need the shared code.</div>',
      push: true
    });
    UI.$$('#sheetBody [data-act]').forEach(li => li.addEventListener('click', () => {
      if (li.dataset.act === 'archive') confirmArchive(colonyId);
      else UI.toast('Merge is coming in the next stage.', null);
    }));
  }

  function codePrompt(title, message, onOk) {
    UI.openSheet({
      title: title,
      body: '<div class="banner review">' + message + '</div>' +
        '<div class="field"><label for="theCode">Shared code</label>' +
          '<input class="input" id="theCode" type="password" autocomplete="off" placeholder="Ask HCHS if you need it"></div>' +
        UI.editorField(),
      footer: '<button class="btn" id="codeCancel" style="flex:none;width:110px">Cancel</button>' +
              '<button class="btn btn-primary" id="codeOk" style="flex:1">CONTINUE</button>',
      push: true
    });
    const root = UI.$('#sheetBody');
    UI.$('#codeCancel').addEventListener('click', () => UI.closeSheet());
    UI.$('#codeOk').addEventListener('click', () => {
      const editor = requireEditor(root); if (!editor) return;
      const code = UI.$('#theCode').value;
      if (!code) { UI.toast('The shared code is needed for this.', 'err'); return; }
      onOk(code, editor);
    });
  }

  function confirmArchive(colonyId) {
    codePrompt('Archive colony',
      'Archiving hides the colony from the map. The record, its visits and its history all stay ' +
      'in the database and can be brought back.',
      (code, editor) => guard(async () => {
        await Store.archiveColony(colonyId, code, editor, 'Archived from the app');
        UI.closeSheet(true);
        UI.toast('Archived.', 'ok');
        App.refreshView();
      }).catch(() => {}));
  }

  function confirmRestore(batchId, colonyId) {
    codePrompt('Undo this change',
      'This puts every field from that save back the way it was. The undo is itself recorded, ' +
      'so it can be undone again.',
      (code, editor) => guard(async () => {
        await Store.restoreBatch(batchId, code, editor);
        UI.closeSheet(true);
        UI.toast('Change undone.', 'ok');
        ColonyPanel.open(colonyId);
        App.refreshView();
      }).catch(() => {}));
  }

  return { recordVisit, quickUpdate, editDetails, addColony, claim, dropPin,
           moreActions, confirmRestore, confirmArchive };
})();
