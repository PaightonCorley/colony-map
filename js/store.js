/* =====================================================================
   Data layer.

   Talks to Supabase when config.js has been filled in. Until then it
   loads the imported spreadsheet from data/preview.json so the map can
   be looked at — and refuses to pretend a save worked.

   All 137 colonies are held in memory. At this size, searching and
   filtering on the phone is instant and works with a bad signal.
   ===================================================================== */

const Store = (() => {

  let sb = null;
  let live = false;
  let colonies = [];
  let visitsByColony = {};
  let historyByColony = {};
  const listeners = [];

  function isLive() { return live; }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => fn()); }

  /* ---------------------------------------------------------- startup */

  async function init() {
    const url = (window.CONFIG.SUPABASE_URL || '').trim();
    const key = (window.CONFIG.SUPABASE_ANON_KEY || '').trim();

    if (url && key && window.supabase) {
      try {
        sb = window.supabase.createClient(url, key);
        await loadFromSupabase();
        live = true;
        return { mode: 'live' };
      } catch (err) {
        console.error('Supabase connection failed', err);
        await loadPreview();
        return { mode: 'preview', error: err.message || String(err) };
      }
    }
    await loadPreview();
    return { mode: 'preview' };
  }

  async function loadPreview() {
    const res = await fetch('data/preview.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load the preview data file.');
    const data = await res.json();
    colonies = data.colonies.map(normalize);
    visitsByColony = {};
    (data.visits || []).forEach(v => {
      if (!v.colony_id) return;
      (visitsByColony[v.colony_id] = visitsByColony[v.colony_id] || []).push(v);
    });
    historyByColony = {};
    live = false;
  }

  async function loadFromSupabase() {
    const { data, error } = await sb
      .from('colonies').select('*').eq('archived', false)
      .order('colony_code');
    if (error) throw error;
    colonies = data.map(normalize);
    visitsByColony = {};
    historyByColony = {};
  }

  async function refresh() {
    if (live) await loadFromSupabase();
    emit();
  }

  /* -------------------------------------------------------- normalize */

  /* CSV gives everything back as strings. Make the types real, and keep
     unknown as null rather than letting it collapse into zero. */
  function normalize(r) {
    const c = Tracker.decode(Object.assign({}, r));
    ['est_total_cats','est_total_min','est_total_max','known_fixed','kitten_count','source_row']
      .forEach(k => { c[k] = UI.num(c[k]); });
    ['latitude','longitude'].forEach(k => {
      const n = c[k] === '' || c[k] === null || c[k] === undefined ? null : Number(c[k]);
      c[k] = Number.isFinite(n) ? n : null;
    });
    ['out_of_area','needs_review','status_locked','archived'].forEach(k => {
      c[k] = c[k] === true || c[k] === 'true' || c[k] === 't';
    });
    ['kittens_present','trapping_help_needed','has_caretaker'].forEach(k => {
      const v = c[k];
      c[k] = (v === true || v === 'true' || v === 't') ? true
           : (v === false || v === 'false' || v === 'f') ? false
           : null;   // genuinely unknown
    });
    if (typeof c.orgs_involved === 'string') {
      c.orgs_involved = c.orgs_involved ? c.orgs_involved.split('|').filter(Boolean) : [];
    }
    c.orgs_involved = c.orgs_involved || [];
    if (typeof c.review_reasons === 'string') {
      c.review_reasons = c.review_reasons ? c.review_reasons.split(' | ').filter(Boolean) : [];
    }
    c.review_reasons = c.review_reasons || [];
    c.est_remaining = remaining(c);
    return c;
  }

  /* Remaining is unknown when the total is unknown — not zero.
     It can never be negative. */
  function remaining(c) {
    if (c.tracker) return Tracker.number(c.tracker.todo);
    if (c.est_total_cats === null) return null;
    return Math.max(0, c.est_total_cats - (c.known_fixed || 0));
  }

  /* ------------------------------------------------------------ reads */

  const all       = () => colonies;
  const mapped    = () => colonies.filter(c => !c.out_of_area && c.latitude !== null && c.longitude !== null);
  const unmapped  = () => colonies.filter(c => c.latitude === null || c.longitude === null);
  const byId      = id => colonies.find(c => c.id === id) || null;

  function summary() {
    const inArea = colonies.filter(c => !c.out_of_area && !c.archived);
    const sum = (f) => inArea.reduce((t, c) => t + (f(c) || 0), 0);
    return {
      known_colonies:      inArea.length,
      complete:            inArea.filter(c => c.status === 'complete').length,
      in_progress:         inArea.filter(c => c.status === 'in_progress').length,
      needs_tnvr:          inArea.filter(c => c.status === 'needs_tnvr').length,
      estimated_cats:      sum(c => c.est_total_cats),
      known_fixed:         sum(c => c.known_fixed),
      estimated_remaining: sum(c => c.est_remaining),
      trapping_help:       inArea.filter(c => c.trapping_help_needed === true).length,
      needs_pin:           inArea.filter(c => c.latitude === null).length,
      needs_review:        inArea.filter(c => c.needs_review).length
    };
  }

  async function visits(colonyId) {
    if (visitsByColony[colonyId]) return visitsByColony[colonyId];
    if (!live) return [];
    const { data, error } = await sb.from('tnvr_visits')
      .select('*').eq('colony_id', colonyId).order('visit_date', { ascending: false });
    if (error) { console.error(error); return []; }
    visitsByColony[colonyId] = data;
    return data;
  }

  async function history(colonyId) {
    if (historyByColony[colonyId]) return historyByColony[colonyId];
    if (!live) return [];
    const { data, error } = await sb.from('edit_history')
      .select('*').eq('colony_id', colonyId)
      .order('changed_at', { ascending: false }).limit(200);
    if (error) { console.error(error); return []; }
    historyByColony[colonyId] = data;
    return data;
  }

  /* ----------------------------------------------------------- writes */

  function requireLive() {
    if (!live) {
      const e = new Error(
        'Preview mode — nothing is saved yet. Add your Supabase keys to config.js to switch the database on.');
      e.preview = true;
      throw e;
    }
  }

  async function updateColony(id, patch, editor) {
    requireLive();
    UI.setEditorName(editor);
    const current = byId(id);
    if (current && current.tracker && !Object.prototype.hasOwnProperty.call(patch, 'original_notes')) {
      const meta = {...current.tracker};
      if ('known_fixed' in patch) meta.done = patch.known_fixed === null ? '' : String(patch.known_fixed);
      if ('est_total_cats' in patch) meta.estimate = patch.est_total_cats === null ? '' : String(patch.est_total_cats);
      if ('status' in patch) { meta.status = ({complete:'DONE',in_progress:'WORKING',needs_tnvr:'NOT STARTED'})[patch.status]; meta.color = Tracker.COLORS[meta.status]; }
      patch = {...patch, original_notes: Tracker.encode(current, meta)};
    }
    const body = Object.assign({}, patch, { last_editor: editor || null });
    const { data, error } = await sb.from('colonies').update(body).eq('id', id).select().single();
    if (error) throw error;
    const i = colonies.findIndex(c => c.id === id);
    if (i >= 0) colonies[i] = normalize(data);
    delete historyByColony[id];
    emit();
    return colonies[i];
  }

  async function addColony(fields, editor) {
    requireLive();
    UI.setEditorName(editor);
    const body = Object.assign({
      status: 'needs_tnvr',
      status_source: 'manual',
      location_quality: 'exact',
      location_source: 'manual_pin'
    }, fields, { last_editor: editor || null });
    const { data, error } = await sb.from('colonies').insert(body).select().single();
    if (error) throw error;
    colonies.push(normalize(data));
    emit();
    return normalize(data);
  }

  async function addVisit(visit) {
    requireLive();
    UI.setEditorName(visit.recorded_by);
    const { data, error } = await sb.from('tnvr_visits').insert(visit).select().single();
    if (error) throw error;
    if (visit.colony_id) {
      delete visitsByColony[visit.colony_id];
      delete historyByColony[visit.colony_id];
      const { data: fresh } = await sb.from('colonies').select('*').eq('id', visit.colony_id).single();
      if (fresh) {
        const prior = byId(visit.colony_id);
        if (prior && prior.tracker) {
          const meta = {...prior.tracker, done: fresh.known_fixed === null ? '' : String(fresh.known_fixed)};
          const left = Tracker.number(meta.todo);
          if (left !== null) meta.todo = String(Math.max(0, left - (Number(visit.num_newly_fixed) || 0)));
          const raw = Tracker.encode(prior, meta);
          const {error: metaError} = await sb.from('colonies').update({original_notes:raw}).eq('id',visit.colony_id);
          if (metaError) UI.toast('Visit saved; tracker details need review.', 'err');
          else fresh.original_notes = raw;
        }
        const i = colonies.findIndex(c => c.id === visit.colony_id);
        if (i >= 0) colonies[i] = normalize(fresh);
      }
    }
    emit();
    return data;
  }

  async function restoreBatch(batchId, code, editor) {
    requireLive();
    const { error } = await sb.rpc('restore_batch', {
      p_batch_id: batchId, p_code: code, p_editor: editor
    });
    if (error) throw error;
    await loadFromSupabase();
    emit();
  }

  async function archiveColony(id, code, editor, reason) {
    requireLive();
    const { error } = await sb.rpc('archive_colony', {
      p_colony_id: id, p_code: code, p_editor: editor, p_reason: reason || null
    });
    if (error) throw error;
    await loadFromSupabase();
    emit();
  }

  async function mergeColonies(survivorId, absorbedId, code, editor) {
    requireLive();
    const { error } = await sb.rpc('merge_colonies', {
      p_survivor: survivorId, p_absorbed: absorbedId, p_code: code, p_editor: editor
    });
    if (error) throw error;
    await loadFromSupabase();
    emit();
  }

  /* ------------------------------------------------- nearby / distance */

  function metresBetween(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearby(lat, lng, metres) {
    const r = metres || window.CONFIG.DUPLICATE_RADIUS_M;
    return colonies
      .filter(c => c.latitude !== null && c.longitude !== null && !c.archived)
      .map(c => Object.assign({ distance_m: metresBetween(lat, lng, c.latitude, c.longitude) }, c))
      .filter(c => c.distance_m <= r)
      .sort((a, b) => a.distance_m - b.distance_m);
  }

  return {
    init, refresh, onChange, isLive,
    all, mapped, unmapped, byId, summary, visits, history,
    updateColony, addColony, addVisit, restoreBatch, archiveColony, mergeColonies,
    nearby, metresBetween, remaining
  };
})();

