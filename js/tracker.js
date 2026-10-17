/* Workbook metadata stays in the existing database, never in the public repository. */
const Tracker = (() => {
  const MARK = '\n\n[HCHS_TRACKER_V1]\n';
  const COLORS = {'DONE':'#C6E0B4','WORKING':'#F8CBAD','MASH SCHEDULED':'#BDD7EE','URGENT':'#FFF2CC','NOT STARTED':'#FFFFFF','Will Not Answer':'#E7E6E6','Unspecified':'#FFFFFF'};
  function decode(c) {
    const text = c.original_notes || '', at = text.indexOf(MARK);
    if (at >= 0) { try { c.tracker = JSON.parse(text.slice(at + MARK.length)); c.original_notes = text.slice(0, at); } catch(e) { console.error('Tracker metadata unreadable', c.id); } }
    return c;
  }
  function encode(c, meta) { return (c.original_notes || '').split(MARK)[0] + MARK + JSON.stringify(meta); }
  function positiveCount(value) { return /^\s*\d+(?:\s*[-–]\s*\d+)?\s*\+?\s*$/.test(String(value)) && (String(value).match(/\d+/g)||[]).some(n=>Number(n)>0); }
  function sourceStatus(c) { return c.tracker ? c.tracker.status || 'Unspecified' : ({complete:'DONE',in_progress:'WORKING',needs_tnvr:'NOT STARTED'}[c.status] || 'Unspecified'); }
  function partial(c) { return positiveCount(done(c)) && (positiveCount(todo(c)) || (sourceStatus(c)!=='DONE' && number(todo(c))!==0)); }
  function status(c) { if(partial(c)) return 'WORKING'; return sourceStatus(c); }
  function color(c) { return COLORS[status(c)] || '#FFFFFF'; }
  function number(s) { return /^\d+$/.test(String(s ?? '').trim()) ? Number(s) : null; }
  function estimate(c) { return c.tracker ? c.tracker.estimate || 'Unknown' : c.original_estimate_text || (c.est_total_cats ?? 'Unknown'); }
  function todo(c) { return c.tracker ? c.tracker.todo || 'Unknown' : c.est_remaining ?? 'Unknown'; }
  function done(c) { const recorded=c.known_fixed ?? (c.tracker?c.tracker.done:null); if(recorded!==null && recorded!==undefined && String(recorded).trim()!=='')return recorded; const history=typeof Completed!=='undefined'?Completed.countFor(c.id):null; return history>0?history:'Unknown'; }
  function badge(c) { return '<span class="tracker-status" style="background:'+color(c)+'">'+UI.esc(status(c))+'</span>'; }
  function panel(c) {
    if (!c.tracker) return '<div class="banner review">Previous map record retained. Not matched to the October 16 workbook.</div>';
    const t=c.tracker;
    const row=(label,val)=>val ? '<div class="kv"><dt>'+label+'</dt><dd>'+UI.esc(val)+'</dd></div>' : '';
    return '<div class="tracker-heading">'+badge(c)+(partial(c)?'<p class="tracker-note">Work remains or completion is unconfirmed. Original tracker status: '+UI.esc(sourceStatus(c))+'</p>':'')+'<small>Tracker updated '+UI.esc(t.as_of||'2026-10-16')+'</small></div>'+
      (status(c)==='DONE' && !t.todo ? '<p class="tracker-note">Done is the workbook status. Remaining cats are unknown unless confirmed below.</p>' : '')+
      (typeof Completed!=='undefined' && Completed.countFor(c.id)>0 ? '<p class="tracker-note">Historical clinic records: '+Completed.countFor(c.id)+'. Current tracker done count: '+UI.esc(c.known_fixed ?? t.done ?? 'unknown')+'. These counts may overlap and are not added together.</p>' : '')+
      '<div class="counts tracker-counts">'+[['Cats fixed',done(c)],['Still to fix',todo(c)],['Original estimate',estimate(c)]].map(([l,v])=>'<div class="c"><div class="n">'+UI.esc(v)+'</div><div class="l">'+l+'</div></div>').join('')+'</div>'+
      '<div class="block"><h3>Trapping &amp; clinic details</h3>'+row('Can they trap?',t.can_trap)+row('Trapper',t.trapper)+row('Caretaker',t.caretaker)+row('Clinic date(s)',t.clinic_dates)+row('City / county',t.jurisdiction)+row('Review note',t.review)+
      (t.additional_entries || []).map(a=>row('Additional tracker notes', [a.notes,a.trap_notes,a.caretaker,a.phone,a.estimate ? 'Original estimate: '+a.estimate : ''].filter(Boolean).join(' · '))).join('')+
      '</div>'+(t.previous_map_notes?'<details class="block"><summary>Previous map notes</summary><p>'+UI.esc(t.previous_map_notes)+'</p></details>':'');
  }
  function listDots(c) { const value=v=>UI.esc(String(v).length<=9 && /[0-9]/.test(String(v))?v:'?');return partial(c)?'<span class="list-pair"><i style="background:'+COLORS.DONE+'">'+value(done(c))+'</i><i style="background:'+COLORS.WORKING+'">'+value(todo(c))+'</i></span>':'<span class="tracker-dot" style="background:'+color(c)+'"></span>'; }
  function openList(list, title='Colony list') {
    list = list || Filters.apply(Store.all());
    const sorted=[...list].sort((a,b)=>(status(a)==='DONE')-(status(b)==='DONE') || (a.city_area||'').localeCompare(b.city_area||'') || (a.location_text||'').localeCompare(b.location_text||''));
    UI.openSheet({title,sub:sorted.length+' records · includes entries without a pin',body:'<ul class="tracker-list">'+sorted.map(c=>'<li><button type="button" data-record="'+UI.esc(c.id)+'">'+listDots(c)+'<span class="record-copy"><strong>'+UI.esc(c.location_text||c.name||'Location unknown')+'</strong><span>'+UI.esc(c.city_area||'Area unknown')+' · '+UI.esc(status(c))+'</span><span>Done: '+UI.esc(done(c))+' · To do: '+UI.esc(todo(c))+'</span><small>'+(c.latitude===null?'Needs a pin':'Mapped')+(c.tracker?'':' · Previous map record')+'</small></span></button></li>').join('')+'</ul>'});
    UI.$$('[data-record]').forEach(b=>b.addEventListener('click',()=>{const c=Store.byId(b.dataset.record);UI.closeSheet(true);if(c.latitude!==null){MapView.focus(c);MapView.select(c.id);}ColonyPanel.open(c.id);}));
  }
  function summary(list) {
    if (Store.isLive() && !Store.all().some(c=>c.tracker)) { const banner=document.getElementById('envBanner');banner.hidden=false;banner.textContent='Latest workbook import pending. Showing previous map records.'; }
    const pinned=list.filter(c=>c.latitude!==null && c.longitude!==null && !c.out_of_area).length;
    document.getElementById('summary').innerHTML='<span><b>'+list.length+'</b> records</span><span><b>'+pinned+'</b> mapped</span><button id="needsPinList">'+(list.length-pinned)+' without map pins</button>';
    document.getElementById('needsPinList').onclick=()=>openList(list.filter(c=>c.latitude===null||c.longitude===null||c.out_of_area),'Records without map pins');
    document.getElementById('summaryFull').classList.remove('open');
  }
  function edit(c) {
    if(!c.tracker) return Forms.quickUpdate(c.id);
    const t=c.tracker, field=(id,label,value)=>'<div class="field"><label for="'+id+'">'+label+'</label><input class="input" id="'+id+'" value="'+UI.esc(value||'')+'"></div>';
    UI.openSheet({title:'Update colony',sub:UI.esc(c.location_text),body:'<div class="field"><label for="trackerStatus">Status / dot color</label><select class="input" id="trackerStatus">'+Object.keys(COLORS).map(s=>'<option value="'+UI.esc(s==='Unspecified'?'':s)+'"'+(status(c)===s?' selected':'')+'>'+UI.esc(s)+'</option>').join('')+'</select></div>'+field('trackerDone','Cats done (blank means unknown)',t.done)+field('trackerTodo','Cats to do (number, range, or blank)',t.todo)+field('trackerTrapper','Trapper',t.trapper)+field('trackerEditor','Your name',UI.editorName())+'<div class="field"><label for="trackerNotes">Notes</label><textarea class="input" id="trackerNotes">'+UI.esc(c.notes||'')+'</textarea></div><p id="trackerError" role="alert"></p>',footer:'<button class="btn btn-primary" id="trackerSave">Save changes</button>'});
    document.getElementById('trackerSave').onclick=async()=>{
      const b=document.getElementById('trackerSave');b.disabled=true;
      try {
        const get=id=>document.getElementById(id).value.trim(),editor=get('trackerEditor');if(!editor)throw new Error('Please enter your name.');
        const meta={...t,status:get('trackerStatus'),done:get('trackerDone'),todo:get('trackerTodo'),trapper:get('trackerTrapper')};meta.color=COLORS[meta.status||'Unspecified'];
        await Store.updateColony(c.id,{original_notes:encode(c,meta),known_fixed:number(meta.done),status:meta.status==='DONE'?'complete':['WORKING','MASH SCHEDULED'].includes(meta.status)?'in_progress':'needs_tnvr',notes:get('trackerNotes'),status_locked:true,status_source:'manual'},editor);
        ColonyPanel.open(c.id);UI.toast('Changes saved');
      } catch(e) {document.getElementById('trackerError').textContent=e.message;b.disabled=false;}
    };
  }
  function init() {
    document.getElementById('colonyListBtn').onclick=()=>openList();
    document.getElementById('fitMapBtn').onclick=()=>MapView.fitAll([...Filters.apply(Store.all()).filter(c=>!c.out_of_area),...Completed.cityLocations().filter(g=>!Filters.state.city||Filters.state.city===g.area)]);
    document.getElementById('locateBtn').onclick=async()=>{try {const p=await MapView.locate();MapView.instance().setView([p.lat,p.lng],14);}catch(e){UI.toast(e.message,'err');}};
    document.getElementById('colorLegend').innerHTML=Object.entries(COLORS).filter(([s])=>s!=='Unspecified').map(([s,c])=>'<span><i style="background:'+c+'"></i>'+UI.esc(s)+'</span>').join('')+'<span><i style="background:#23734b"></i>DONE — city/town placeholder</span><p>Dark green counts represent city-only records at city halls or town centers, not colony locations. Green circles show cats done. Paired green and orange circles mean Working: done on green, still to do on orange. ? means the count is unknown. Other circles show estimated cats; tap for the count details. Green follows the tracker; a blank remaining count does not confirm the colony is finished.</p>';
  }
  return {decode,encode,partial,sourceStatus,status,color,number,estimate,todo,done,badge,panel,openList,summary,edit,init,COLORS};
})();
