/* Completed clinic snapshot. Independent of live colony estimates and visits. */
const Completed = (() => {
  let data = null, error = '', active = false, layer, halls = {};
  function hydrate() {
    if (!data) return;
    data.locations.forEach(g => {
      const c = Store.byId(g.colonyId);
      g.address = c ? c.location_text : g.pendingAddressImport ? 'Recorded address awaiting import' : 'Linked colony unavailable';
      g.latitude = c && !c.out_of_area ? c.latitude : null; g.longitude = c && !c.out_of_area ? c.longitude : null;
      g.locationSource = 'existing colony map';
    });
    data.unlocated.forEach(g=>{const hall=halls[g.area];g.cityOnly=!!hall;g.latitude=hall?hall.latitude:null;g.longitude=hall?hall.longitude:null;g.address=hall?g.area+' — city-only completed cats':g.reason;g.locationSource=hall?hall.address:'';});
  }
  function countFor(id) { return data ? sum(data.locations.filter(g=>g.colonyId===id)) : null; }
  function overview() {
    hydrate();
    const el=document.getElementById('historyOverview');
    if(!data){el.textContent=error||'Loading completed cats…';return;}
    const pinned=sum(data.locations.filter(mapped)), addressed=sum(data.locations), missing=sum(data.unlocated), cityCats=sum(data.unlocated.filter(mapped));
    el.innerHTML='<button id="historyOpen"><strong>'+fmt(data.total)+' completed cat records</strong><span>'+fmt(pinned)+' at colony pins · '+fmt(cityCats)+' at city/town placeholders · '+fmt(addressed-pinned)+' addressed, need pins · '+fmt(missing-cityCats)+' unplaced</span></button>';
    document.getElementById('historyOpen').onclick=()=>{document.getElementById('search').value='';document.getElementById('completedFilter').value='all';openList();};
  }
  const mapped = g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude);
  const sum = rows => rows.reduce((n, g) => n + g.cats, 0);
  const fmt = n => n.toLocaleString();
  async function init() {
    layer = L.layerGroup().addTo(MapView.instance());
    try {
      const response = await fetch('data/completed-cats.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Completed list could not be loaded.');
      data = await response.json();
      try { const h=await fetch('data/city-halls.json',{cache:'no-store'});if(h.ok)halls=await h.json(); } catch(e){console.warn('City hall markers unavailable',e);}
      if (sum(data.locations) + sum(data.unlocated) !== data.total) throw new Error('Completed list totals do not reconcile.');
    } catch (e) { error = e.message; data = null; }
    document.getElementById('viewMode').addEventListener('change', e => {
      active = e.target.value === 'completed';
      UI.closeSheet(true); layer.clearLayers(); App.refreshView();
      if (active && data) fit(); else MapView.fitAll([...Store.mapped(),...cityLocations()]);
    });
    document.getElementById('completedFilter').addEventListener('change', () => App.refreshView());
    document.getElementById('doneListBtn').addEventListener('click', openList);
  }
  function rows() {
    if (!data) return [];
    const q = document.getElementById('search').value.trim().toLowerCase();
    const filter = document.getElementById('completedFilter').value;
    return [...data.locations, ...data.unlocated.map((g, i) => ({...g, id:'unknown-'+i, address:g.address || g.reason || 'Source has no street address'}))]
      .filter(g => (!q || (g.address+' '+g.area).toLowerCase().includes(q)) &&
        (filter === 'all' || (filter === 'mapped' ? mapped(g) : !mapped(g))))
      .sort((a, b) => b.cats-a.cats || a.area.localeCompare(b.area));
  }
  function render() {
    hydrate(); overview();
    ['filterBtn','chips','attentionBtn','addBtn','colonyListBtn','fitMapBtn','locateBtn'].forEach(id => document.getElementById(id).hidden = active);
    ['completedFilter','doneListBtn','completedNote'].forEach(id => document.getElementById(id).hidden = !active);
    document.getElementById('search').placeholder = active ? 'Search completed addresses or areas…' : 'Search address, caretaker, notes…';
    document.getElementById('envBanner').hidden = active || Store.isLive();
    if (!active) { layer.clearLayers();
      if(data) rows().filter(g=>g.cityOnly).filter(g=>!Filters.state.city || Filters.state.city===g.area).filter(()=>!Filters.state.status.length || Filters.state.status.includes('DONE')).forEach(drawMarker);
      return false; }
    MapView.render([], () => {}); layer.clearLayers();
    document.getElementById('summaryFull').classList.remove('open');
    if (!data) {
      document.getElementById('summary').textContent = error;
      document.getElementById('completedNote').textContent = 'Reload to try again, or choose All colonies to view the existing tracker.';
      return true;
    }
    const visible = rows(), pinned = [...data.locations,...data.unlocated].filter(mapped), mappedCats = sum(pinned);
    document.getElementById('summary').innerHTML =
      '<span class="s-item done-total"><b>'+fmt(data.total)+'</b> cats completed</span><span class="sep">|</span>'+
      '<span class="s-item"><b>'+fmt(mappedCats)+'</b> on map</span><span class="sep">|</span>'+
      '<span class="s-item"><b>'+fmt(data.total-mappedCats)+'</b> need a location</span>';
    document.getElementById('completedNote').textContent = 'All unique source entries through Oct 14, 2026 · '+data.dateUnclear+' entries have unclear dates. '+
      'Tracker counts are not added again. Missing addresses remain in the total. '+
      fmt(sum(visible))+' cats match your search and filter.';
    visible.filter(mapped).forEach(drawMarker);
    return true;
  }
  function drawMarker(g) {
    const marker=L.marker([g.latitude,g.longitude],{bubblingMouseEvents:false,title:g.address+' — '+g.cats+' completed cats'+(g.cityOnly?' — City/town placeholder, not a colony location':''),keyboard:true,
      icon:L.divIcon({className:g.cityOnly?'done-marker city-only-marker':'done-marker',html:'<div class="cat-marker"><span class="cat-circle" style="background:'+(g.cityOnly?'#23734b;color:white':'#C6E0B4')+'">'+g.cats+'</span></div>',iconSize:[44,44],iconAnchor:[22,22]})}).addTo(layer);
    marker.on('click',e=>{L.DomEvent.stopPropagation(e);openLocation(g);});
  }
  function fit() {
    if (!data) return;
    hydrate();
    const pts = [...data.locations,...data.unlocated].filter(mapped).map(g => [g.latitude,g.longitude]);
    if (pts.length) MapView.instance().fitBounds(pts,{padding:[45,45],maxZoom:11});
  }
  function clinicPanel(id) {
    if (!data) return '<div class="block"><h3>Clinic records</h3><p>Historical clinic records are not loaded yet.</p></div>';
    const groups=data.locations.filter(g=>g.colonyId===id), dates={};
    groups.forEach(g=>Object.entries(g.dates||{}).forEach(([date,n])=>{dates[date]=(dates[date]||0)+n;}));
    return '<div class="block"><h3>Clinic records</h3>'+(groups.length ?
      '<p><b>'+sum(groups)+' cats recorded as fixed in the historical clinic workbook.</b></p>'+Object.entries(dates).sort().map(([date,n])=>'<div class="kv"><dt>'+UI.esc(date==='Date uncle'?'Date unclear':date)+'</dt><dd><b>'+n+' fixed</b></dd></div>').join('')+
      '<p class="hint">These records may already be included in Cats fixed above. Do not add them again. Individual cat identities are not available in this history.</p>' :
      '<p>No historical clinic records linked to this location.</p>')+'<p class="hint">New visits appear in Activity &amp; history below. Use Add fixed cats only for newly spayed or neutered cats.</p></div>';
  }
  function openLocation(g) {
    UI.openSheet({title:UI.esc(g.address),sub:UI.esc(g.area),body:
      '<div class="done-detail-count">'+g.cats+' <small>cats recorded as fixed</small></div>'+
      '<p>'+UI.esc(g.cityOnly ? 'CITY-ONLY RECORD — NOT A COLONY LOCATION. This dark green dot represents completed cats recorded in '+g.area+' without street addresses. This is a city hall or town-center display placeholder only: '+g.locationSource+'.' : mapped(g) ? 'Location: '+g.locationSource+'. Street-level coordinates may be approximate; confirm the site before visiting.' : (g.pendingAddressImport ? 'The workbook has an address for these cats. Its import is pending approval; the cats are included in the total.' : g.colonyId ? 'Recorded address retained; this location needs a confirmed map pin.' : 'The source has no street address for these cats. They remain included in the total.'))+'</p>'+
      '<p>Included once in the 1,754 source entries. '+UI.esc(g.match||g.reason||'')+'</p>'+
      (g.colonyId?'<button class="btn" id="historyColony">View current fixed / remaining counts</button><button class="btn btn-primary btn-big" id="historyAddFixed">ADD FIXED CATS</button>':'<p class="hint">To add newly fixed cats, open their actual colony from the List. This historical group is not a colony record.</p>')+
      '<p class="hint">Historical counts and tracker counts may overlap; they are not added together. A historical clinic entry does not confirm that the whole colony is finished.</p>'+
      (g.dates ? '<div class="block"><h3>Clinic records</h3>'+Object.entries(g.dates).sort().map(([date,n]) =>
        '<div class="kv"><dt>'+UI.esc(date === 'Date uncle' ? 'Date unclear' : date)+'</dt><dd>'+n+' cats</dd></div>').join('')+'</div>' : '')+
      '<details class="block"><summary>Source records ('+(g.records||[]).length+')</summary>'+ (g.records||[]).map(r=>'<p>'+UI.esc(r.date||'Date unclear')+' · '+UI.esc(r.source)+' · '+UI.esc(r.id)+'</p>').join('')+'</details>'+
      '<p class="hint">Source: HCHS_Completed_Cats.xlsx. Historical clinic entries are treated as completed, not independently verified surgery outcomes. Unique source IDs prevent repeated imports; individual cat identities are not available to verify repeat visits.</p>'});
    if(g.colonyId){document.getElementById('historyColony').onclick=()=>ColonyPanel.open(g.colonyId);document.getElementById('historyAddFixed').onclick=()=>{ColonyPanel.open(g.colonyId);Forms.recordVisit(g.colonyId);};}
  }
  function openList() {
    hydrate(); const visible = rows();
    UI.openSheet({title:'Completed cats',sub:fmt(sum(visible))+' cats in this view',body:
      '<p class="hint">Light green: colony pins. Dark green: city/town placeholders, not colony locations. Unplaced records remain included in the total.</p>'+
      (visible.length ? visible.map(g => '<button class="done-row" data-done="'+g.id+'"><span><strong>'+UI.esc(g.address)+'</strong><small>'+UI.esc(g.area)+' · '+(g.cityOnly?'City/town placeholder':mapped(g)?'Colony pin':'Needs a location')+'</small></span><b>'+g.cats+'</b></button>').join('') : '<p>No matching records.</p>')});
    document.querySelectorAll('[data-done]').forEach(el => el.addEventListener('click', () => {
      const g=visible.find(g => g.id === el.dataset.done);
      if(mapped(g)) MapView.instance().setView([g.latitude,g.longitude],15);
      openLocation(g);
    }));
  }
  function cityLocations(){hydrate();return data?data.unlocated.filter(mapped):[];}
  return {init,render,fit,countFor,clinicPanel,cityLocations,isActive:()=>active};
})();

