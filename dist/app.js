"use strict";
const $ = id => document.getElementById(id);
const paths = {
  map:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5H5v5m7-5h7v5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/>',
  chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  crown:'<path d="m2 7 5 4 5-7 5 7 5-4-3 13H5L2 7Z"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  model:'<circle cx="12" cy="12" r="9"/><path d="m12 3 8 13-16-2L12 3Zm0 18L4 8l16 2-8 11Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  window:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16m4-11 3 3-3 3"/>'
};
function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;}
function escapeHtml(text){return String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function storageRead(){try{return JSON.parse(localStorage.getItem('openmausbot-team-map-layout-v1')||'{}');}catch{return {};}}
function storageSave(){try{localStorage.setItem('openmausbot-team-map-layout-v1',JSON.stringify(positions));}catch{}}
let positions=storageRead(), bots=[], sections=[], tiles=[], view={x:0,y:0,scale:1}, selected=null, loaded=false, refreshing=false, live=false, gesture=null, moved=false;
const pointers=new Map(), detailCache=new Map(), skillCache=new Map();
let query='', searchIndex=new Map(), searchView=null, detailData=null, detailTab='soul', detailError='', detailRequest=null;
const featureUrl='https://github.com/milind-soni/OpenMausBot/issues/2383';
function normalize(text){return String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function matches(bot){return !query||query.split(/\s+/).every(term=>searchIndex.get(bot.id)?.includes(term));}
function avatar(bot){const body=['cursor','blob','circle','squircle','capsule','drop','shield','hexagon','diamond','star'].includes(bot.mascotBody)?bot.mascotBody:'cursor';const color=['blue','orange','yellow','red','green','purple','pink','teal','gray'].includes(bot.color)?bot.color:'blue';return `avatars/${body}-${color}.svg`;}
function modelName(bot){const id=bot.modelSelection?.model||'';if(id==='openai/gpt-oss-120b')return 'GPT OSS 120B';return id.replace(/^openai\//,'').replace(/^gpt-/,'GPT-').replace(/-sol$/,'-Sol').replace(/-luna$/,'-Luna').replace('gpt-oss-120b','GPT OSS 120B')||'Default model';}
function status(bot){if(bot.demo)return 'Demo bot';if(!live)return 'Offline';if(bot.activity==='waiting-on-you')return 'Waiting for you';if(['dead','no-signal'].includes(bot.activity))return 'No signal';return bot.busy||bot.activity==='working'?'Working':'Ready';}
function card(bot){return `<article class="bot-card${selected===bot.id?' selected':''}"><button class="card-main" data-bot-id="${escapeHtml(bot.id)}" aria-label="View ${escapeHtml(bot.name)}" title="${escapeHtml(bot.name)}"><img class="avatar" src="${avatar(bot)}" alt=""><span class="card-copy"><span class="bot-name"><span>${escapeHtml(bot.name)}</span>${bot.chiefOfStaff?'<i class="crown">'+icon('crown')+'</i>':''}</span><span class="bot-title">${escapeHtml(bot.title||(bot.chiefOfStaff?'Chief of Staff':'Bot'))}</span></span></button><div class="card-footer"><button class="chat-button" data-chat-id="${escapeHtml(bot.id)}" aria-label="Chat routing for ${escapeHtml(bot.name)}" title="Direct chat routing requested — #2383">${icon('chat')}</button>${live&&(bot.busy||bot.activity==='working')?'<span class="working">Working</span>':''}<span class="model">${icon('model')}<span>${escapeHtml(modelName(bot))}</span></span></div></article>`;}
function render(){
  const keys=[...new Set(['',...sections,...bots.map(b=>b.section?.trim()||'')])].filter(key=>key||bots.some(b=>!b.section));
  const shown=bots.filter(matches);
  tiles=keys.map((key,baseIndex)=>{
    const teamBots=shown.filter(b=>(b.section?.trim()||'')===key),chiefs=teamBots.filter(b=>b.chiefOfStaff),members=teamBots.filter(b=>!b.chiefOfStaff),hierarchy=chiefs.length&&members.length;
    if(query&&!teamBots.length)return null;
    const height=64+20+Math.max(1,hierarchy?Math.max(chiefs.length,members.length):teamBots.length)*142-16,width=hierarchy?552:276;
    const saved=positions[key];const valid=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&Math.abs(saved.x)<100000&&Math.abs(saved.y)<100000;
    return {key,chiefs,members,hierarchy,width,height,x:valid?saved.x:baseIndex*584,y:valid?saved.y:baseIndex===0?0:300};
  }).filter(Boolean).map((t,index)=>({...t,index}));
  $('world').innerHTML=tiles.map(t=>`<section class="team" data-team-index="${t.index}" aria-label="${escapeHtml(t.key||'General')} team" style="left:${t.x}px;top:${t.y}px;width:${t.width}px;min-height:${t.height}px"><div class="team-header" data-drag-team="${t.index}" tabindex="0" title="Drag to arrange this team. Arrow keys move it."><span class="team-title">${escapeHtml(t.key||'General')}</span><span class="team-count">${t.chiefs.length+t.members.length}<span aria-hidden="true">···</span></span></div><div class="lanes">${t.chiefs.length?'<div class="lane">'+t.chiefs.map(card).join('')+'</div>':''}${t.hierarchy?'<div class="hierarchy">'+icon('arrow')+'</div>':''}${t.members.length?'<div class="lane">'+t.members.map(card).join('')+'</div>':''}${!t.chiefs.length&&!t.members.length?'<span class="bot-title">No bots in this team</span>':''}</div></section>`).join('');
  $('count').textContent=query?`${shown.length} of ${bots.length} bots`:`${bots.length} ${bots.length===1?'bot':'bots'}`;
  $('empty').hidden=shown.length>0;
  if(!shown.length)$('empty').textContent=query?'No matching bots. Try another name, team, or model.':'No bots yet. Add a bot in OpenMausBot, then refresh.';
  transform();
}
function search(){const next=normalize($('search').value.trim());if(!query&&next)searchView={...view};query=next;render();if(query)fit();else if(searchView){view=searchView;searchView=null;transform();}}
function transform(){$('world').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;$('fit').textContent=Math.round(view.scale*100)+'%';}
function fit(){if(!tiles.length)return;const bounds=$('viewport').getBoundingClientRect(),left=Math.min(...tiles.map(t=>t.x)),top=Math.min(...tiles.map(t=>t.y)),width=Math.max(...tiles.map(t=>t.x+t.width))-left,height=Math.max(...tiles.map(t=>t.y+t.height))-top;view.scale=Math.max(.12,Math.min(1,(bounds.width-90)/width,(bounds.height-90)/height));view.x=(bounds.width-width*view.scale)/2-left*view.scale;view.y=(bounds.height-height*view.scale)/2-top*view.scale;transform();}
function zoom(scale,x,y){scale=Math.min(1.7,Math.max(.12,scale));const ratio=scale/view.scale;view={x:x-(x-view.x)*ratio,y:y-(y-view.y)*ratio,scale};transform();}
function zoomCenter(factor){const b=$('viewport').getBoundingClientRect();zoom(view.scale*factor,b.width/2,b.height/2);}
function notify(text){$('notice').textContent=text;$('notice').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('notice').style.display='none',3500);}
async function refresh(manual=false){if(refreshing||gesture)return;refreshing=true;try{
  let data;try{const r=await fetch('/api/map',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();data=await r.json();if(!Array.isArray(data.bots))throw Error();live=data.live===true;}
  catch{const r=await fetch('demo.json',{cache:'no-store'});if(!r.ok)throw Error('Your map could not be loaded.');data=await r.json();live=false;}
  const previous=JSON.stringify(bots.map(b=>[b.id,b.section,b.chiefOfStaff]));bots=data.bots.filter(b=>!b.hidden);sections=data.sections||[];searchIndex=new Map(bots.map(b=>[b.id,normalize([b.name,b.title,b.section||'General',modelName(b),b.modelSelection?.model,b.chiefOfStaff?'Chief of Staff':'Team member'].join(' '))]));
  $('connection').textContent=live?'Live on your Mac':'Demo · fictional bots';$('connection').classList.toggle('live',live);
  render();if(!loaded||previous!==JSON.stringify(bots.map(b=>[b.id,b.section,b.chiefOfStaff])))fit();if(!loaded&&viewport.clientWidth<850&&tiles.length){const t=tiles[0];view.scale=Math.max(view.scale,.65);view.x=(viewport.clientWidth-t.width*view.scale)/2-t.x*view.scale;view.y=32-t.y*view.scale;transform();}loaded=true;
  if(manual)notify(live?'Map refreshed from OpenMausBot':'Showing fictional demo bots. Open OpenMausBot for your live map.');
}catch(error){if(!loaded){$('empty').hidden=false;$('empty').textContent=error.message;}$('connection').textContent='Map unavailable';if(manual)notify('Could not refresh. Your current map is still available.');}finally{refreshing=false;}}
async function readJson(path,signal){const response=await fetch(path,{cache:'no-store',signal:signal||AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load bot details.');return data;}
function detailHeader(bot){$('bot-detail').innerHTML=`<div class="detail-head"><img class="detail-avatar" src="${avatar(bot)}" alt=""><div><h2 class="detail-name">${escapeHtml(bot.name)}</h2><div class="detail-meta">${escapeHtml(bot.section||'General')} · ${escapeHtml(modelName(bot))} · ${escapeHtml(status(bot))}</div></div></div><p class="detail-description">${escapeHtml(detailData?.configuration?.description||bot.title||(bot.chiefOfStaff?'Chief of Staff':'Bot'))}</p><p id="chat-note" class="panel-caption" hidden>Opening a bot chat from this dashboard needs support in OpenMausBot. <a href="${featureUrl}" target="_blank" rel="noopener">View feature request #2383</a>.</p>`;}
async function detail(id,chat=false){
  const bot=bots.find(b=>b.id===id);if(!bot)return;
  detailRequest?.abort();detailRequest=new AbortController();const request=detailRequest;
  selected=id;detailTab='soul';detailError='';detailData=null;
  const cached=detailCache.get(id);if(cached&&Date.now()-cached.at<15000)detailData=cached.data;
  render();detailHeader(bot);$('chat-note').hidden=!chat;renderPanel();
  if(!$('bot-dialog').open)$('bot-dialog').showModal();
  if(detailData)return;
  try{const data=bot.demo?(await readJson('demo.json',request.signal)).details[id]:await readJson(`/api/bots/${encodeURIComponent(id)}/details`,request.signal);if(request.signal.aborted||selected!==id)return;detailData=data;detailCache.set(id,{data,at:Date.now()});detailHeader(bot);$('chat-note').hidden=!chat;renderPanel();}
  catch(error){if(request.signal.aborted)return;detailError=error.message;renderPanel();}
}
function displayValue(value){if(value===undefined)return 'Default';if(typeof value==='boolean')return value?'On':'Off';return typeof value==='object'?JSON.stringify(value):String(value);}
function renderPanel(){
  document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===detailTab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  const panel=$('detail-panel');panel.setAttribute('aria-labelledby',`tab-${detailTab}`);
  if(detailError){panel.innerHTML=`<p class="detail-error">${escapeHtml(detailError)}</p><button class="retry-button" id="retry-details">Try again</button>`;$('retry-details').onclick=()=>{detailCache.delete(selected);detail(selected);};return;}
  if(!detailData){panel.innerHTML='<p class="panel-empty" role="status">Loading bot details…</p>';return;}
  if(detailTab==='soul'){panel.innerHTML=detailData.soul?`<pre class="soul-text">${escapeHtml(detailData.soul)}</pre>`:'<p class="panel-empty">This bot has no soul instructions.</p>';return;}
  if(detailTab==='skills'){
    const skills=detailData.skills||[];
    panel.innerHTML=skills.length?`<p class="panel-caption">${skills.length} ${skills.length===1?'skill':'skills'} · Select a skill to read its instructions.</p>`+skills.map((skill,index)=>`<div class="skill-item"><button class="skill-summary" data-skill-index="${index}" aria-expanded="false" aria-controls="skill-body-${index}"><span class="skill-label"><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description||'')} · ${skill.origin==='library'?'Shared library':'Bot skill'}</small></span><span class="skill-state${skill.enabled?' enabled':''}">${skill.enabled?'Enabled':'Disabled'}</span></button><div class="skill-body" id="skill-body-${index}" hidden></div></div>`).join(''):'<p class="panel-empty">No skills assigned to this bot.</p>';
    return;
  }
  const c=detailData.configuration;
  const rows=[['Team',c.section||'General'],['Role',c.chiefOfStaff?'Chief of Staff':'Team member'],['Default model',modelName(c)],['Works on',c.computer||'Auto'],['Working folder',c.cwd||'Private bot workspace'],['Approval mode',c.approvalMode||(c.autoApprove?'Auto':'Ask')],['Tool scope',displayValue(c.toolScope)],['Memory',c.memoryEnabled===false?'Off':'On'],['Browser',c.browser===false?'Off':'On'],['Notifications',displayValue(c.notifications)],['Bot ID',c.id],['Current chat',c.threadId||'None']];
  const groups=[['Profile & team',['id','name','title','description','section','chiefOfStaff','managedSections','peers','color','mascotBody','avatarCrop','avatarZoom','avatarFocusX','avatarFocusY','visibility','installedPackage']],['Model & computer',['modelSelection','fallback','computer','cloudBackend','autoStartVps','cwd','browser','browserProfile']],['Access & approvals',['approvalMode','autoApprove','alwaysAllow','toolScope','approvePeerComms','composio','connectorTools','connectorScopes','outbound','mcpServers']],['Memory, voice & notifications',['memoryEnabled','memoryUpkeep','speakReplies','voice','voiceNotes','notifications','assignedSkills']]];
  panel.innerHTML='<div class="detail-fields">'+rows.map(([key,value])=>`<div class="detail-row"><span>${escapeHtml(key)}</span><span>${escapeHtml(value)}</span></div>`).join('')+'</div><p class="panel-caption">Bot defaults above. Expand a section for saved settings and conversation overrides. Edit settings in OpenMausBot.</p>'+groups.map(([label,fields])=>{const values=Object.fromEntries(fields.filter(key=>key in c).map(key=>[key,c[key]]));return `<details class="config-section"><summary>${label}</summary><pre class="config-json">${escapeHtml(JSON.stringify(values,null,2))}</pre></details>`;}).join('')+`<details class="config-section"><summary>Conversations (${detailData.conversations?.length||0})</summary><pre class="config-json">${escapeHtml(JSON.stringify(detailData.conversations||[],null,2))}</pre></details>`;
}
async function toggleSkill(button){
  const skill=detailData?.skills?.[Number(button.dataset.skillIndex)],botId=selected;if(!skill)return;
  const body=$(button.getAttribute('aria-controls')),expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));body.hidden=expanded;if(expanded||(body.childElementCount&&!body.dataset.retry))return;delete body.dataset.retry;
  body.innerHTML='<p class="panel-caption" role="status">Loading skill…</p>';
  const key=botId+':'+skill.name;
  try{const cached=skillCache.get(key);const text=skill.text!==undefined?skill.text:cached&&Date.now()-cached.at<15000?cached.text:(await readJson(`/api/bots/${encodeURIComponent(botId)}/skills/${encodeURIComponent(skill.name)}`)).text;skillCache.set(key,{text,at:Date.now()});if(!body.isConnected)return;body.innerHTML=`<pre class="skill-text">${escapeHtml(text||'This skill has no instructions.')}</pre>`;}
  catch(error){if(body.isConnected){body.innerHTML=`<p class="detail-error">${escapeHtml(error.message)} Select the skill again to retry.</p>`;body.dataset.retry='true';}button.setAttribute('aria-expanded','false');}
}
document.addEventListener('click',event=>{
  const chat=event.target.closest('[data-chat-id]');if(chat&&!moved){detail(chat.dataset.chatId,true);return;}
  const bot=event.target.closest('[data-bot-id]');if(bot&&!moved)detail(bot.dataset.botId);
  const tab=event.target.closest('[data-tab]');if(tab){detailTab=tab.dataset.tab;renderPanel();}
  const skill=event.target.closest('[data-skill-index]');if(skill)toggleSkill(skill);
});
$('search').addEventListener('input',search);
$('search').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('search').value='';search();}if(event.key==='Enter'){const first=bots.find(matches);if(first)detail(first.id);}});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!$('bot-dialog').open){event.preventDefault();$('search').focus();$('search').select();}});
document.querySelector('.detail-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const names=['soul','skills','config'],index=names.indexOf(detailTab);detailTab=event.key==='Home'?'soul':event.key==='End'?'config':names[(index+(event.key==='ArrowRight'?1:2))%3];renderPanel();$('tab-'+detailTab).focus();});
$('bot-dialog').addEventListener('close',()=>{detailRequest?.abort();selected=null;render();});
$('close').onclick=()=>$('bot-dialog').close();$('bot-dialog').addEventListener('click',e=>{if(e.target===$('bot-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('refresh').onclick=()=>refresh(true);$('plus').onclick=()=>zoomCenter(1.2);$('minus').onclick=()=>zoomCenter(1/1.2);$('fit').onclick=fit;
const viewport=$('viewport');
viewport.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button'))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});viewport.setPointerCapture(event.pointerId);moved=false;
  if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),view:{...view},mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};return;}
  const header=event.target.closest('[data-drag-team]'),tile=header?tiles[Number(header.dataset.dragTeam)]:null;gesture={kind:tile?'team':'pan',start:{x:event.clientX,y:event.clientY},view:{...view},tile:tile?{...tile}:null};viewport.classList.add('panning');
});
viewport.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!gesture)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(gesture.kind==='pinch'){const [a,b]=[...pointers.values()];if(!b)return;const r=viewport.getBoundingClientRect();view={...gesture.view};zoom(gesture.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance),gesture.mid.x-r.left,gesture.mid.y-r.top);view.x+=(a.x+b.x)/2-gesture.mid.x;view.y+=(a.y+b.y)/2-gesture.mid.y;transform();return;}
  const dx=event.clientX-gesture.start.x,dy=event.clientY-gesture.start.y;if(Math.hypot(dx,dy)>4)moved=true;
  if(gesture.kind==='pan'){view.x=gesture.view.x+dx;view.y=gesture.view.y+dy;transform();}
  else{const tile=tiles[gesture.tile.index];tile.x=gesture.tile.x+dx/view.scale;tile.y=gesture.tile.y+dy/view.scale;const node=viewport.querySelector(`[data-team-index="${tile.index}"]`);node.style.left=tile.x+'px';node.style.top=tile.y+'px';positions[tile.key]={x:tile.x,y:tile.y};}
});
function end(event){pointers.delete(event.pointerId);if(gesture?.kind==='team')storageSave();gesture=null;viewport.classList.remove('panning');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);setTimeout(()=>moved=false,0);}
viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
viewport.addEventListener('wheel',event=>{event.preventDefault();if(gesture)return;if(event.ctrlKey||event.metaKey){const r=viewport.getBoundingClientRect();zoom(view.scale*Math.exp(-event.deltaY*.006),event.clientX-r.left,event.clientY-r.top);}else{const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;view.x-=event.deltaX*unit;view.y-=event.deltaY*unit;transform();}},{passive:false});
viewport.addEventListener('keydown',event=>{
  const header=event.target.closest('[data-drag-team]');if(header&&event.key.startsWith('Arrow')){event.preventDefault();const tile=tiles[Number(header.dataset.dragTeam)],step=event.shiftKey?40:10;tile.x+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;tile.y+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;positions[tile.key]={x:tile.x,y:tile.y};storageSave();header.parentElement.style.left=tile.x+'px';header.parentElement.style.top=tile.y+'px';return;}
  if(event.key==='+'||event.key==='='){event.preventDefault();zoomCenter(1.2);}if(event.key==='-'){event.preventDefault();zoomCenter(1/1.2);}if(event.key==='0'){event.preventDefault();fit();}
});
window.addEventListener('resize',fit);
$('heading-icon').innerHTML=icon('map');$('refresh').innerHTML=icon('refresh');$('search-icon').innerHTML=icon('search');
refresh();setInterval(()=>{if(document.visibilityState==='visible'&&(live||['127.0.0.1','localhost'].includes(location.hostname)))refresh();},5000);
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'get_team_map',description:'Read the currently displayed bots, teams, and connection status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(input===null||typeof input!=='object'||Object.keys(input).length)throw Error('Expected an empty object');return {live,totalBots:bots.length,search:$('search').value,bots:bots.filter(matches).map(b=>({id:b.id,name:b.name,team:b.section||'General',chiefOfStaff:!!b.chiefOfStaff,status:status(b)}))};}})).catch(()=>{});}catch{}}
