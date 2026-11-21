/* CULMERA team consoles (Phase 4). No library. One private route, #/team, that adapts to the signed-in role:
   Partner  : personal code and link, own clients with brief status and call, notes, Playbook.
   Director : the same for the whole group, plus status changes, call confirmation, partner management and invitations.
   Founder  : everything, plus reassigning clients, roles, suspend / delete, data requests, activity log and CSV export.
   Every read and write uses the signed-in user's own token, so Row Level Security decides what each role can see and do; this
   page only hides buttons that would be refused. People management that needs the service key (invite, suspend, delete) goes
   through the API (/api/admin), which checks the role again on the server. All strings live in L.tm. */
(()=>{
const T=L.tm,A=L.auth,M=L.mt,$=s=>document.querySelector(s),G=()=>window.GW,C=()=>G().C,esc=s=>G().esc(s),fill=(s,o)=>G().fill(s,o),AU=()=>window.CulmeraAuth,enc=encodeURIComponent;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,CAP=1000,WEEK=7*864e5;
const BST=['submitted','in_review','scheduled','in_discussion','won','lost','archived'];
const TABS={partner:['overview','clients','playbook'],director:['overview','clients','meetings','team','playbook'],founder:['overview','clients','meetings','team','requests','audit','playbook']};
const fresh=()=>({me:null,tab:'overview',open:null,ask:null,f:{q:'',st:'',p:'',ms:'active',tb:'',lk:'home'},lim:100,det:null,aud:null,audLim:200,state:'load',msg:'',ok:false});
let S=fresh(),D=null;
/* ---------- helpers ---------- */
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};
const studio=()=>C().ownerTimezone||'Africa/Cairo';
const when=(d,z,short)=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:short?'medium':'full',timeStyle:short?undefined:'short',timeZone:z||undefined}).format(new Date(d))}catch(e){return ''}};
const pill=(s,l)=>`<span class="pill ${esc(s)}">${esc(l)}</span>`;
const bpill=s=>pill(s,A.st[s]||s),mpill=s=>pill(s,M.mst[s]||s);
const nm=p=>p?(p.full_name||p.email||'—'):T.unknown;
const site=()=>C().siteUrl.replace(/\/$/,'');
const adminUrl=()=>String(C().api||'').replace(/\/brief\/?$/,'/admin');
const say=(t,ok)=>{S.msg=t||'';S.ok=!!ok;const e=$('#tmmsg');if(e){e.textContent=S.msg;e.style.color=ok?'':'#f0a3a3'}};
const role=()=>S.me&&S.me.role;
const isF=()=>role()==='founder',isDir=()=>role()==='director',canManage=()=>isF()||isDir();
/* ---------- data ---------- */
async function admin(action,body){const s=await AU().session();if(!s)return{ok:false,data:{code:'auth'}};if(!adminUrl())return{ok:false,data:{code:'noApi'}};
const ac=new AbortController(),t=setTimeout(()=>ac.abort(),20000);
try{const r=await fetch(adminUrl(),{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.access_token},body:JSON.stringify({action,...body})});let d={};try{d=await r.json()}catch(e){}return{ok:r.ok&&d.ok!==false,status:r.status,data:d}}
catch(e){return{ok:false,data:{code:'offline'}}}finally{clearTimeout(t)}}
const why=r=>T.err[(r.data&&r.data.code)||'']||T.err.generic;
async function rd(path){const s=await AU().session();if(!s)return{ok:false,auth:true};const r=await AU().rest(path,s);return r.ok&&Array.isArray(r.data)?{ok:true,rows:r.data}:{ok:false,status:r.status}}
/* write with the user's token; n = number of rows really changed (zero rows means Row Level Security refused it) */
async function mut(path,body,method){const s=await AU().session();if(!s)return{ok:false,n:0};const r=await AU().restW(path,s,{method:method||'PATCH',body,prefer:'return=representation'});
return{ok:r.ok,n:r.ok&&Array.isArray(r.data)?r.data.length:0,status:r.status,rows:Array.isArray(r.data)?r.data:[]}}
async function load(){const s=await AU().session();if(!$('#tm'))return;if(!s){location.hash='#/signin';return}
const pr=await rd('profiles?select=id,full_name,email,role,status,locale,created_at&order=created_at.desc&limit='+CAP);if(!$('#tm'))return;
if(!pr.ok){S.state='err';paint();return}
const me=pr.rows.find(x=>x.id===s.user.id);
if(!me){S.state='paused';paint();return}
if(me.status!=='active'){await AU().signOut();location.hash='#/signin';location.reload();return}
if(me.role==='client'){location.hash='#/account';return}
const staff=me.role==='founder'||me.role==='director';
const [pa,cl,br,ms,iv,pb,rq]=await Promise.all([rd('partners?select=profile_id,code,director_id,active&limit='+CAP),rd('clients?select=profile_id,partner_id,code_used,company,country,phone,created_at&limit='+CAP),
rd('client_briefs?select=id,ref,client_id,status,locale,selected_types,created_at,updated_at,submitted_at&order=updated_at.desc&limit='+CAP),rd('meetings?select=id,brief_id,client_id,starts_at,timezone,duration_min,status,note&order=starts_at.desc&limit='+CAP),
staff?rd('invitations?select=id,email,role,director_id,invited_by,expires_at,accepted_at,created_at&accepted_at=is.null&order=created_at.desc&limit=200'):{ok:true,rows:[]},
rd('playbook?select=key,sort,title,body&order=sort.asc'),me.role==='founder'?rd('data_requests?select=id,client_id,kind,status,created_at,handled_at&order=created_at.desc&limit=200'):{ok:true,rows:[]}]);
if(!$('#tm'))return;if(![pa,cl,br,ms,iv].every(x=>x.ok)){S.state='err';paint();return}
S.me=me;D={profiles:pr.rows,pm:new Map(pr.rows.map(x=>[x.id,x])),partners:pa.rows,pa:new Map(pa.rows.map(x=>[x.profile_id,x])),clients:cl.rows,briefs:br.rows,meetings:ms.rows,inv:iv.rows,pb:pb.ok?pb.rows:null,req:rq.ok?rq.rows:[]};
D.cap=[pr,pa,cl,br,ms].some(x=>x.rows.length>=CAP);index();S.state='ok';paint()}
function index(){D.lb=new Map();D.bb=new Map();for(const b of D.briefs){if(!D.lb.has(b.client_id))D.lb.set(b.client_id,b);(D.bb.get(b.client_id)||D.bb.set(b.client_id,[]).get(b.client_id)).push(b)}
D.mc=new Map();for(const m of D.meetings){(D.mc.get(m.client_id)||D.mc.set(m.client_id,[]).get(m.client_id)).push(m)}
D.cm=new Map(D.clients.map(x=>[x.profile_id,x]))}
const callOf=cid=>{const a=D.mc.get(cid)||[];return a.filter(m=>m.status==='requested'||m.status==='confirmed').sort((x,y)=>String(x.starts_at).localeCompare(String(y.starts_at)))[0]||a.find(m=>m.status==='done')||null};
const ownerLabel=c=>{if(!c.partner_id)return T.direct;if(c.partner_id===S.me.id)return T.fYou;return nm(D.pm.get(c.partner_id))};
const myCode=()=>{const p=D.pa.get(S.me.id);return p&&p.code||''};
const linkFor=()=>{const c=myCode(),b=site()+'/'+(c?'?ref='+enc(c):'');return S.f.lk==='signup'?b+'#/signup':b};
/* ---------- shell ---------- */
const page=()=>`<section class="wrap pad tight hdrline" style="max-inline-size:1180px"><h1 class="h1s">${esc(T.title)}</h1><div id="tm"><p>${esc(T.loading)}</p></div></section>`;
function paint(){const box=$('#tm');if(!box)return;
if(S.state==='err'){box.innerHTML=`<p role="alert">${esc(T.loadErr)}</p>`;return}
if(S.state==='paused'){box.innerHTML=`<p role="alert">${esc(T.paused)}</p><p><button class="btn" type="button" data-tm="signout">${esc(T.signOut)}</button></p>`;return}
if(S.state!=='ok')return;
const tabs=TABS[role()];if(!tabs.includes(S.tab))S.tab='overview';
box.innerHTML=`<p class="lead-p">${esc(fill(T.hi,{name:nm(S.me)}))} <span class="pill active">${esc(A.roles[role()]||role())}</span></p>${D.cap?`<p class="note">${esc(T.cap)}</p>`:''}
<div class="tm-tabs" role="tablist" aria-label="${esc(T.title)}">${tabs.map(t=>`<button type="button" role="tab" id="tt-${t}" aria-selected="${S.tab===t}" aria-controls="tmbody" tabindex="${S.tab===t?0:-1}" data-tm="tab" data-v="${t}">${esc(T.tabs[t])}${t==='meetings'&&calls().length?` <span class="pill requested" aria-label="${esc(T.stCalls)}">${calls().length}</span>`:''}</button>`).join('')}</div>
<p id="tmmsg" role="status" aria-live="polite" class="note"></p><div id="tmbody" role="tabpanel" aria-labelledby="tt-${S.tab}" tabindex="-1">${body()}</div>
<p style="margin-block-start:2.5rem"><button class="btn" type="button" data-tm="signout">${esc(T.signOut)}</button></p>`;
say(S.msg,S.ok);if(S.tab==='audit'&&!S.open&&!S.aud)loadAudit()}
const paintBody=()=>{const b=$('#tmbody');if(b){b.innerHTML=body();}};
const calls=()=>D.meetings.filter(m=>m.status==='requested');
function body(){if(S.open&&S.open.k==='client')return clientView(S.open.id);if(S.open&&S.open.k==='user')return userView(S.open.id);
return({overview,clients:clientsTab,meetings:meetingsTab,team:teamTab,requests:requestsTab,audit:auditTab,playbook:playbookTab}[S.tab]||overview)()}
/* ---------- overview ---------- */
function stat(n,l){return `<div><b class="tm-n">${esc(n)}</b><span class="note">${esc(l)}</span></div>`}
function overview(){const cl=D.clients;let h='';
if(D.pa.has(S.me.id)){const c=myCode();h+=`<div class="tm-box"><h2>${esc(T.codeH)}</h2><p class="note">${esc(T.codeP)}</p><p>${esc(T.code)}: <b dir="ltr" class="tm-code" id="tmcode">${esc(c)}</b> <button class="btn" type="button" data-tm="copy" data-v="${esc(c)}">${esc(T.copy)}</button></p>
<div class="cform" style="max-inline-size:none"><label>${esc(T.linkTo)}<select id="lnkp"><option value="home"${S.f.lk==='home'?' selected':''}>${esc(T.toHome)}</option><option value="signup"${S.f.lk==='signup'?' selected':''}>${esc(T.toSignup)}</option></select></label>
<label>${esc(T.link)}<input id="lnk" readonly dir="ltr" value="${esc(linkFor())}"></label><p><button class="btn p" type="button" data-tm="copylink">${esc(T.copy)}</button></p></div></div>`}
const bs={};let nb=0;for(const c of cl){const b=D.lb.get(c.profile_id);if(!b)nb++;else bs[b.status]=(bs[b.status]||0)+1}
const week=cl.filter(c=>Date.now()-new Date(c.created_at).getTime()<WEEK).length;
h+=`<h2 class="h2s">${esc(T.statsH)}</h2><div class="tm-cards">${stat(cl.length,T.stClients)}${stat(week,T.stNew)}${stat(nb,T.stNoBrief)}${['draft',...BST].map(k=>stat(bs[k]||0,A.st[k])).join('')}</div>`;
if(canManage()){const parts=D.partners.filter(p=>p.profile_id!==S.me.id);h+=`<div class="tm-cards">${stat(parts.length,T.stPartners)}${stat(D.inv.length,T.stInv)}${stat(calls().length,T.stCalls)}</div>`;
const sub=cl.filter(c=>{const b=D.lb.get(c.profile_id);return b&&b.status==='submitted'}),req=calls();
h+=`<h2 class="h2s">${esc(T.todoH)}</h2>`+(sub.length||req.length?`<ul class="tm-list">${sub.slice(0,6).map(c=>`<li>${esc(T.todoBrief)}: <b>${esc(nm(D.pm.get(c.profile_id)))}</b> <button class="btn" type="button" data-tm="openc" data-id="${esc(c.profile_id)}">${esc(T.open)}</button></li>`).join('')}${req.slice(0,6).map(m=>`<li>${esc(T.todoCall)}: <b>${esc(nm(D.pm.get(m.client_id)))}</b> (${esc(when(m.starts_at,tz(),true))}) <button class="btn" type="button" data-tm="openc" data-id="${esc(m.client_id)}">${esc(T.open)}</button></li>`).join('')}</ul>`:`<p>${esc(T.todoNone)}</p>`)}
return h}
/* ---------- clients ---------- */
function filtered(){const q=S.f.q.trim().toLowerCase();return D.clients.filter(c=>{const p=D.pm.get(c.profile_id),b=D.lb.get(c.profile_id);
if(q&&!((p?p.full_name+' '+p.email:'')+' '+c.company).toLowerCase().includes(q))return false;
if(S.f.st==='none'?!!b:S.f.st&&(!b||b.status!==S.f.st))return false;
if(S.f.p==='direct'?!!c.partner_id:S.f.p&&c.partner_id!==S.f.p)return false;return true}).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))}
function ownerOpts(sel,withDirect){const ppl=D.partners.map(x=>D.pm.get(x.profile_id)).filter(Boolean).sort((a,b)=>nm(a).localeCompare(nm(b)));
return `<option value="">${esc(withDirect?T.fAll:T.fDirect)}</option>${withDirect?`<option value="direct"${sel==='direct'?' selected':''}>${esc(T.fDirect)}</option>`:''}${ppl.map(p=>`<option value="${esc(p.id)}"${sel===p.id?' selected':''}>${esc(p.id===S.me.id?T.fYou:nm(p))}</option>`).join('')}`}
function clientsTab(){return `<div class="tmf"><label>${esc(T.q)}<input type="search" data-f="q" value="${esc(S.f.q)}" maxlength="80" autocomplete="off"></label>
<label>${esc(T.fStatus)}<select data-f="st"><option value="">${esc(T.fAll)}</option><option value="none"${S.f.st==='none'?' selected':''}>${esc(T.fNoBrief)}</option>${['draft',...BST].map(k=>`<option value="${k}"${S.f.st===k?' selected':''}>${esc(A.st[k])}</option>`).join('')}</select></label>
${canManage()?`<label>${esc(T.fPartner)}<select data-f="p">${ownerOpts(S.f.p,true)}</select></label>`:''}</div>${isF()?exportBar():''}<div id="tmlist">${clientList()}</div>`}
function clientList(){const rows=filtered();if(!rows.length)return `<p>${esc(T.noMatch)}</p>`;const shown=rows.slice(0,S.lim);
return `<div class="tw"><table class="tm"><caption class="sr">${esc(T.tabs.clients)}</caption><thead><tr><th scope="col">${esc(T.colClient)}</th>${canManage()?`<th scope="col">${esc(T.colOwner)}</th>`:''}<th scope="col">${esc(T.colBrief)}</th><th scope="col">${esc(T.colCall)}</th><th scope="col">${esc(T.colJoined)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${shown.map(c=>{const p=D.pm.get(c.profile_id),b=D.lb.get(c.profile_id),m=callOf(c.profile_id);
return `<tr><th scope="row"><b>${esc(nm(p))}</b><br><span class="note">${esc(c.company)}</span></th>${canManage()?`<td>${esc(ownerLabel(c))}</td>`:''}<td>${b?`<span dir="ltr">${esc(b.ref)}</span><br>${bpill(b.status)}`:`<span class="note">${esc(T.fNoBrief)}</span>`}</td><td>${m?`${mpill(m.status)}<br><span class="note">${esc(when(m.starts_at,tz(),true))}</span>`:'—'}</td><td>${esc(when(c.created_at,undefined,true))}</td>
<td><button class="btn" type="button" data-tm="openc" data-id="${esc(c.profile_id)}">${esc(T.open)}</button></td></tr>`}).join('')}</tbody></table></div>${rows.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)} (${rows.length-S.lim})</button></p>`:''}`}
const paintList=()=>{const l=$('#tmlist');if(l)l.innerHTML=S.tab==='meetings'?meetList():clientList()};
/* ---------- client detail ---------- */
function clientView(id){const c=D.cm.get(id),p=D.pm.get(id);if(!c)return `<p>${esc(T.none)}</p><p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p>`;
const bl=D.bb.get(id)||[],b=D.lb.get(id),ml=D.mc.get(id)||[],dt=S.det&&S.det.id===id?S.det:null;
let h=`<p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p><h2 class="h2s" id="tmh" tabindex="-1">${esc(nm(p))}</h2><div class="acct">
<div><h2>${esc(T.infoH)}</h2><dl class="tm-dl"><dt>${esc(T.email)}</dt><dd dir="ltr">${p?`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`:'—'}</dd><dt>${esc(T.company)}</dt><dd>${esc(c.company||'—')}</dd><dt>${esc(T.country)}</dt><dd>${esc(c.country||'—')}</dd><dt>${esc(T.phone)}</dt><dd dir="ltr">${esc(c.phone||'—')}</dd><dt>${esc(T.joined)}</dt><dd>${esc(when(c.created_at,undefined,true))}</dd><dt>${esc(T.usedCode)}</dt><dd dir="ltr">${esc(c.code_used||'—')}</dd><dt>${esc(T.lang)}</dt><dd>${esc(p?p.locale:'—')}</dd><dt>${esc(T.ownerH)}</dt><dd>${esc(ownerLabel(c))}</dd></dl>`;
if(isF()){h+=`<form class="cform tmform" novalidate data-form="reassign" style="margin-block-start:1rem"><label>${esc(T.reassign)}<select id="ro">${ownerOpts(c.partner_id||'',false)}</select></label><p class="note">${esc(T.reassignHint)}</p><p><button class="btn" type="submit">${esc(T.reassign)}</button></p></form>`;
h+=acctActions(id,p)}
h+=`</div><div><h2>${esc(T.briefH)}</h2>`;
if(!b)h+=`<p>${esc(T.briefNone)}</p>`;else{h+=`<p><span dir="ltr">${esc(b.ref)}</span> ${bpill(b.status)}</p>`+(bl.length>1?`<p class="note">${esc(String(bl.length))} ${esc(T.briefH)}</p>`:'');
if(canManage()){h+=b.status==='draft'?`<p class="note">${esc(T.draftNote)}</p>`:`<form class="cform tmform" novalidate data-form="bstatus" data-id="${esc(b.id)}"><label>${esc(T.statusH)}<select id="bs">${BST.map(k=>`<option value="${k}"${b.status===k?' selected':''}>${esc(A.st[k])}</option>`).join('')}</select></label><p><button class="btn" type="submit">${esc(T.saveStatus)}</button></p></form>`}}
h+=`</div><div><h2>${esc(T.callsH)}</h2>`+(ml.length?ml.map(m=>meetCard(m)).join(''):`<p>${esc(T.callNone)}</p>`)+`</div></div>`;
if(b)h+=`<h2 class="h2s">${esc(T.answersH)}</h2><div class="tm-box" id="tmans">${dt&&dt.answers!==undefined?answers(dt.answers,b):`<p class="note">${esc(T.answersLoad)}</p>`}</div>`;
h+=`<h2 class="h2s">${esc(T.notesH)}</h2><p class="note">${esc(T.notesHint)}</p><form class="cform tmform" novalidate data-form="note" data-id="${esc(id)}"><label>${esc(T.noteLabel)}<textarea id="nb" rows="3" maxlength="4000"></textarea></label><p><button class="btn p" type="submit">${esc(T.noteAdd)}</button></p></form><div id="tmnotes">${dt&&dt.notes?notes(dt.notes):''}</div>`;
return h}
function acctActions(id,p){const st=p&&p.status;let h=`<h2 style="margin-block-start:1.4rem">${esc(T.accountH)}</h2>`;
if(S.ask&&S.ask.id===id)return h+`<p role="alert">${esc(S.ask.act==='delete'?T.askDelete:T.askSuspend)}</p><p><button class="btn p" type="button" data-tm="confirm">${esc(T.confirm)}</button> <button class="btn" type="button" data-tm="noask">${esc(T.cancel)}</button></p>`;
return h+`<p>${st==='suspended'?`<button class="btn" type="button" data-tm="restore" data-id="${esc(id)}">${esc(T.restore)}</button>`:`<button class="btn" type="button" data-tm="suspend" data-id="${esc(id)}">${esc(T.suspend)}</button>`} <button class="btn" type="button" data-tm="delete" data-id="${esc(id)}">${esc(T.delete)}</button></p>`}
function meetCard(m,full){const c=D.cm.get(m.client_id),b=D.briefs.find(x=>x.id===m.brief_id),act=m.status==='requested'||m.status==='confirmed';
return `<div class="tm-meet"><p>${mpill(m.status)} ${esc(fill(T.min,{n:m.duration_min}))}${full?` · <b>${esc(nm(D.pm.get(m.client_id)))}</b>`:''}${b?` · <span dir="ltr">${esc(b.ref)}</span>`:''}</p>
<div class="zn"><div><span class="note">${esc(T.yourTime)}</span><b>${esc(when(m.starts_at,tz()))}</b><span class="note" dir="ltr">${esc(tz())}</span></div><div><span class="note">${esc(T.studioTime)}</span><b>${esc(when(m.starts_at,studio()))}</b><span class="note" dir="ltr">${esc(studio())}</span></div></div>
<p class="note">${esc(T.clientZone)}: <span dir="ltr">${esc(m.timezone)}</span> — ${esc(when(m.starts_at,m.timezone))}</p>${m.note?`<p class="tm-pre">${esc(m.note)}</p>`:''}
${canManage()&&act?`<p>${m.status==='requested'?`<button class="btn p" type="button" data-tm="mset" data-id="${esc(m.id)}" data-v="confirmed">${esc(T.confirmCall)}</button> `:`<button class="btn p" type="button" data-tm="mset" data-id="${esc(m.id)}" data-v="done">${esc(T.doneCall)}</button> `}<button class="btn" type="button" data-tm="mset" data-id="${esc(m.id)}" data-v="cancelled">${esc(T.cancelCall)}</button>${full&&c?` <button class="btn" type="button" data-tm="openc" data-id="${esc(m.client_id)}">${esc(T.open)}</button>`:''}</p>`:(full&&c?`<p><button class="btn" type="button" data-tm="openc" data-id="${esc(m.client_id)}">${esc(T.open)}</button></p>`:'')}</div>`}
/* answers are untrusted text: everything is escaped, nothing is rendered as HTML */
const lab=k=>T.ans[k]||k;
function val(v){if(Array.isArray(v))return v.map(val).filter(Boolean).join(', ');if(v===true)return T.ans.yes;if(v&&typeof v==='object')return Object.entries(v).map(([k,x])=>(x===1||x===2?lab(k):lab(k)+': '+val(x))).join(', ');return String(v??'')}
function answers(a,b){if(!a||typeof a!=='object'||!Object.keys(a).length)return `<p>${esc(T.answersNone)}</p>`;
const kv=o=>Object.entries(o||{}).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>`<dt>${esc(lab(k))}</dt><dd class="tm-pre">${esc(val(v))}</dd>`).join('');
const items=Object.entries(a.items||{}).map(([s,i])=>{const t=G().S[s];return `<div class="tm-item"><h3>${esc(t?t.name:s)}</h3><dl class="tm-dl">${kv(i)}</dl></div>`}).join('');
return `<dl class="tm-dl">${kv(a.project)}${kv(a.refine)}</dl>${items?`<h3>${esc(T.ans.packs)}</h3>${items}`:''}`}
function notes(list){if(!list.length)return `<p class="note">${esc(T.noteNone)}</p>`;
return `<ul class="tm-list">${list.map(n=>{const a=D.pm.get(n.author_id),b=n.brief_id?D.briefs.find(x=>x.id===n.brief_id):null;return `<li><span class="note">${esc(n.author_id===S.me.id?T.you:(a?nm(a):T.teamMember))} · ${esc(when(n.created_at,tz(),false))}${b?` · ${esc(fill(T.noteBrief,{ref:b.ref}))}`:''}</span><span class="tm-pre">${esc(n.body)}</span></li>`}).join('')}</ul>`}
async function openClient(id){S.open={k:'client',id};S.ask=null;S.det={id};say('');paintBody();const h=$('#tmh');if(h)h.focus();
const b=D.lb.get(id),[an,nt]=await Promise.all([b?rd('client_briefs?select=answers&id=eq.'+enc(b.id)):{ok:true,rows:[]},rd('notes?select=id,author_id,body,brief_id,created_at&client_id=eq.'+enc(id)+'&order=created_at.desc&limit=200')]);
if(!S.open||S.open.id!==id)return;S.det={id,answers:an.ok&&an.rows[0]?an.rows[0].answers||{}:(an.ok?{}:null),notes:nt.ok?nt.rows:[]};
const a=$('#tmans');if(a)a.innerHTML=S.det.answers===null?`<p role="alert">${esc(T.err.generic)}</p>`:answers(S.det.answers,b);const n=$('#tmnotes');if(n)n.innerHTML=notes(S.det.notes)}
/* ---------- calls ---------- */
function meetList(){const all=S.f.ms==='all',rows=D.meetings.filter(m=>all||m.status==='requested'||m.status==='confirmed').sort((a,b)=>all?String(b.starts_at).localeCompare(String(a.starts_at)):String(a.starts_at).localeCompare(String(b.starts_at)));
return rows.length?rows.slice(0,S.lim).map(m=>meetCard(m,true)).join('')+(rows.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)}</button></p>`:''):`<p>${esc(T.meetNone)}</p>`}
function meetingsTab(){return `<div class="tmf"><label>${esc(T.meetFilter)}<select data-f="ms"><option value="active"${S.f.ms==='active'?' selected':''}>${esc(T.meetActive)}</option><option value="all"${S.f.ms==='all'?' selected':''}>${esc(T.meetAll)}</option></select></label></div>${isF()?exportBar('meetings'):''}<div id="tmlist">${meetList()}</div>`}
/* ---------- team: people and invitations ---------- */
function teamTab(){const ppl=D.partners.map(x=>({x,p:D.pm.get(x.profile_id)})).filter(r=>r.p&&r.p.id!==S.me.id).sort((a,b)=>nm(a.p).localeCompare(nm(b.p)));
const cnt=id=>D.clients.filter(c=>c.partner_id===id).length;
let h=`<h2 class="h2s" style="margin-block-start:.5rem">${esc(T.teamH)}</h2>`+(ppl.length?`<div class="tw"><table class="tm"><caption class="sr">${esc(T.teamH)}</caption><thead><tr><th scope="col">${esc(T.colName)}</th><th scope="col">${esc(T.colRole)}</th>${isF()?`<th scope="col">${esc(T.colGroup)}</th>`:''}<th scope="col">${esc(T.colCode)}</th><th scope="col">${esc(T.colClients)}</th><th scope="col">${esc(T.colStatus)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${ppl.map(({x,p})=>`<tr><th scope="row"><b>${esc(nm(p))}</b><br><span class="note" dir="ltr">${esc(p.email)}</span></th><td>${esc(A.roles[p.role]||p.role)}</td>${isF()?`<td>${esc(x.director_id?nm(D.pm.get(x.director_id)):'—')}</td>`:''}<td dir="ltr">${esc(x.code)}</td><td>${cnt(p.id)}</td><td>${p.status==='suspended'?pill('suspended',T.suspended):x.active?pill('active',T.active):pill('lost',T.inactive)}</td><td><button class="btn" type="button" data-tm="openu" data-id="${esc(p.id)}">${esc(T.open)}</button></td></tr>`).join('')}</tbody></table></div>`:`<p>${esc(T.teamNone)}</p>`);
h+=`<h2 class="h2s">${esc(T.invH)}</h2><p class="note">${esc(T.invP)}</p><form class="cform tmform" novalidate data-form="invite"><label>${esc(T.invEmail)}<input id="ive" type="email" dir="ltr" autocomplete="off" maxlength="200"></label>`;
if(isF()){const dirs=D.partners.filter(x=>D.pm.get(x.profile_id)&&D.pm.get(x.profile_id).role==='director').map(x=>D.pm.get(x.profile_id));
h+=`<label>${esc(T.invRole)}<select id="ivr"><option value="partner">${esc(T.rolePartner)}</option><option value="director">${esc(T.roleDirector)}</option></select></label><label>${esc(T.invGroup)}<select id="ivg"><option value="">${esc(T.invNoGroup)}</option>${dirs.map(d=>`<option value="${esc(d.id)}">${esc(nm(d))}</option>`).join('')}</select></label>`}
h+=`<p><button class="btn p" type="submit">${esc(T.invSend)}</button></p></form><h2 class="h2s">${esc(T.invH2)}</h2>`;
h+=D.inv.length?`<div class="tw"><table class="tm"><caption class="sr">${esc(T.invH2)}</caption><thead><tr><th scope="col">${esc(T.colEmail)}</th><th scope="col">${esc(T.colRole)}</th>${isF()?`<th scope="col">${esc(T.colGroup)}</th>`:''}<th scope="col">${esc(T.colExpires)}</th><th scope="col">${esc(T.colStatus)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${D.inv.map(i=>{const ex=new Date(i.expires_at).getTime()<Date.now();return `<tr><th scope="row" dir="ltr">${esc(i.email)}</th><td>${esc(i.role==='director'?T.roleDirector:T.rolePartner)}</td>${isF()?`<td>${esc(i.director_id?nm(D.pm.get(i.director_id)):'—')}</td>`:''}<td>${esc(when(i.expires_at,undefined,true))}</td><td>${ex?pill('lost',T.invExpired):pill('requested',T.invPending)}</td><td><button class="btn" type="button" data-tm="reinv" data-id="${esc(i.id)}">${esc(T.invAgain)}</button> <button class="btn" type="button" data-tm="revoke" data-id="${esc(i.id)}">${esc(T.invRevoke)}</button></td></tr>`}).join('')}</tbody></table></div>`:`<p>${esc(T.invNone)}</p>`;
return h}
/* ---------- one person (partner or director) ---------- */
function userView(id){const p=D.pm.get(id),x=D.pa.get(id);if(!p||!x)return `<p>${esc(T.none)}</p><p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p>`;
const dirs=D.partners.filter(r=>D.pm.get(r.profile_id)&&D.pm.get(r.profile_id).role==='director'&&r.profile_id!==id).map(r=>D.pm.get(r.profile_id));
let h=`<p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p><h2 class="h2s" id="tmh" tabindex="-1">${esc(nm(p))}</h2><div class="acct"><div><h2>${esc(T.infoH)}</h2><dl class="tm-dl"><dt>${esc(T.email)}</dt><dd dir="ltr"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd><dt>${esc(T.colRole)}</dt><dd>${esc(A.roles[p.role]||p.role)}</dd><dt>${esc(T.colCode)}</dt><dd dir="ltr">${esc(x.code)}</dd><dt>${esc(T.colGroup)}</dt><dd>${esc(x.director_id?nm(D.pm.get(x.director_id)):'—')}</dd><dt>${esc(T.colClients)}</dt><dd>${D.clients.filter(c=>c.partner_id===id).length}</dd><dt>${esc(T.colStatus)}</dt><dd>${p.status==='suspended'?pill('suspended',T.suspended):x.active?pill('active',T.active):pill('lost',T.inactive)}</dd><dt>${esc(T.joined)}</dt><dd>${esc(when(p.created_at,undefined,true))}</dd></dl></div>
<div><h2>${esc(x.active?T.deactivate:T.activate)}</h2><p class="note">${esc(T.deactHint)}</p><p><button class="btn ${x.active?'':'p'}" type="button" data-tm="toggle" data-id="${esc(id)}">${esc(x.active?T.deactivate:T.activate)}</button></p></div>`;
if(isF()){h+=`<div><h2>${esc(T.roleH)}</h2><form class="cform tmform" novalidate data-form="role" data-id="${esc(id)}"><label>${esc(T.colRole)}<select id="rl"><option value="partner"${p.role==='partner'?' selected':''}>${esc(T.rolePartner)}</option><option value="director"${p.role==='director'?' selected':''}>${esc(T.roleDirector)}</option></select></label><p class="note">${esc(T.roleHint)}</p><p><button class="btn" type="submit">${esc(T.setRole)}</button></p></form>`+(p.role==='partner'?`<form class="cform tmform" novalidate data-form="group" data-id="${esc(id)}"><label>${esc(T.groupH)}<select id="gr"><option value="">${esc(T.invNoGroup)}</option>${dirs.map(d=>`<option value="${esc(d.id)}"${x.director_id===d.id?' selected':''}>${esc(nm(d))}</option>`).join('')}</select></label><p><button class="btn" type="submit">${esc(T.setGroup)}</button></p></form>`:'')+`</div><div><h2>${esc(T.accountH)}</h2>${acctActions(id,p).replace(/<h2[^>]*>.*?<\/h2>/,'')}</div>`}
return h+`</div>`}
/* ---------- data requests (Founder) ---------- */
function requestsTab(){const r=D.req;return `<p class="note">${esc(T.reqNote)}</p>`+(r.length?`<div class="tw"><table class="tm"><caption class="sr">${esc(T.reqH)}</caption><thead><tr><th scope="col">${esc(T.colClient)}</th><th scope="col">${esc(T.colKind)}</th><th scope="col">${esc(T.colStatus)}</th><th scope="col">${esc(T.colWhen)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${r.map(q=>{const c=q.client_id&&D.cm.get(q.client_id),open=q.status==='open'||q.status==='in_progress';
return `<tr><th scope="row">${q.client_id?esc(nm(D.pm.get(q.client_id))):esc(T.deleted)}</th><td>${esc(q.kind==='export'?T.reqExport:T.reqDeletion)}</td><td>${pill(q.status==='done'?'won':q.status==='open'?'requested':'lost',T.reqSet[q.status]||q.status)}</td><td>${esc(when(q.created_at,undefined,true))}</td><td>${c?`<button class="btn" type="button" data-tm="openc" data-id="${esc(q.client_id)}">${esc(T.open)}</button> `:''}${open?`${q.status==='open'?`<button class="btn" type="button" data-tm="rset" data-id="${esc(q.id)}" data-v="in_progress">${esc(T.markProgress)}</button> `:''}<button class="btn p" type="button" data-tm="rset" data-id="${esc(q.id)}" data-v="done">${esc(T.markDone)}</button> <button class="btn" type="button" data-tm="rset" data-id="${esc(q.id)}" data-v="rejected">${esc(T.markRejected)}</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:`<p>${esc(T.reqNone)}</p>`)}
/* ---------- activity log (Founder) ---------- */
async function loadAudit(){const r=await rd('audit_log?select=id,at,actor,action,table_name,row_id,changed&order=at.desc&limit='+S.audLim);if(S.tab!=='audit'||S.open)return;S.aud=r.ok?r.rows:[];if(!r.ok)say(T.err.generic);paintBody()}
function auditTab(){if(!S.aud)return `<p>${esc(T.loading)}</p>`;const tbls=[...new Set(S.aud.map(a=>a.table_name))].sort(),rows=S.aud.filter(a=>!S.f.tb||a.table_name===S.f.tb);
return `<p class="note">${esc(T.audNote)}</p><div class="tmf"><label>${esc(T.colTable)}<select data-f="tb"><option value="">${esc(T.audTable)}</option>${tbls.map(t=>`<option value="${esc(t)}"${S.f.tb===t?' selected':''}>${esc(t)}</option>`).join('')}</select></label></div>`+(rows.length?`<div class="tw"><table class="tm"><caption class="sr">${esc(T.audH)}</caption><thead><tr><th scope="col">${esc(T.colWhen)}</th><th scope="col">${esc(T.colWho)}</th><th scope="col">${esc(T.colAction)}</th><th scope="col">${esc(T.colTable)}</th><th scope="col">${esc(T.colChanged)}</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(when(a.at,undefined,false))}</td><td>${a.actor?esc(nm(D.pm.get(a.actor)||(a.actor===S.me.id?S.me:null))):esc(T.system)}</td><td>${esc(a.action)}</td><td>${esc(a.table_name)}<br><span class="note" dir="ltr">${esc(String(a.row_id||'').slice(0,8))}</span></td><td dir="ltr">${esc((a.changed||[]).join(', '))}</td></tr>`).join('')}</tbody></table></div>`:`<p>${esc(T.none)}</p>`)+(S.aud.length>=S.audLim&&S.audLim<CAP?`<p><button class="btn" type="button" data-tm="moreaud">${esc(T.more)}</button></p>`:'')}
/* ---------- playbook (read from the database: only staff can read it) ---------- */
function playbookTab(){if(!D.pb||!D.pb.length)return `<p>${esc(T.pbNone)}</p>`;const link=site()+'/'+(myCode()?'?ref='+enc(myCode()):''),sub=s=>s.replace(/\{link\}/g,link).replace(/\{code\}/g,myCode());
const blk=b=>{if(!b||typeof b!=='object')return '';const x=typeof b.x==='string'?b.x:'';
if(b.t==='h')return `<h3>${esc(x)}</h3>`;if(b.t==='p')return `<p>${esc(x)}</p>`;
if(b.t==='ul')return `<ul class="tm-list">${(Array.isArray(b.items)?b.items:[]).filter(i=>typeof i==='string').map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
if(b.t==='copy'){const t=sub(x);return `<blockquote class="tm-copy"><p class="tm-pre">${esc(t)}</p><button class="btn" type="button" data-tm="copy" data-v="${esc(t)}">${esc(T.copy)}</button></blockquote>`}return ''};
return `<p class="note">${esc(T.pbNote)}</p>`+D.pb.map(s=>`<section class="tm-box"><h2>${esc(s.title)}</h2>${(Array.isArray(s.body)?s.body:[]).map(blk).join('')}</section>`).join('')}
/* ---------- CSV (Founder). Cells that could run as spreadsheet formulas are neutralised. ---------- */
function exportBar(only){const b=k=>`<button class="btn" type="button" data-tm="csv" data-v="${k}">${esc(T['export'+k[0].toUpperCase()+k.slice(1)])}</button>`;
return `<div class="tm-box"><p class="note">${esc(T.exportH)}: ${only?b(only):b('clients')+' '+b('briefs')+' '+b('meetings')}</p><p class="note">${esc(T.exportNote)}</p></div>`}
const cell=v=>{let s=v==null?'':Array.isArray(v)?v.join('; '):String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
function csv(kind){let head,rows;
if(kind==='clients'){head=['name','email','company','country','phone','owner','code_used','brief_ref','brief_status','call_status','call_start_utc','joined'];rows=D.clients.map(c=>{const p=D.pm.get(c.profile_id)||{},b=D.lb.get(c.profile_id)||{},m=callOf(c.profile_id)||{};return [p.full_name,p.email,c.company,c.country,c.phone,c.partner_id?nm(D.pm.get(c.partner_id)):'direct',c.code_used,b.ref,b.status,m.status,m.starts_at,c.created_at]})}
else if(kind==='briefs'){head=['ref','client','email','status','language','services','created','submitted','updated'];rows=D.briefs.map(b=>{const p=D.pm.get(b.client_id)||{};return [b.ref,p.full_name,p.email,b.status,b.locale,b.selected_types,b.created_at,b.submitted_at,b.updated_at]})}
else{head=['client','email','brief_ref','status','start_utc','minutes','client_timezone'];rows=D.meetings.map(m=>{const p=D.pm.get(m.client_id)||{},b=D.briefs.find(x=>x.id===m.brief_id)||{};return [p.full_name,p.email,b.ref,m.status,m.starts_at,m.duration_min,m.timezone]})}
const txt='\ufeff'+[head,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download='culmera-'+kind+'-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
/* ---------- actions ---------- */
const stale=async m=>{say(m||T.rowsNone);await refresh()};
async function refresh(){const keep={tab:S.tab,open:S.open,f:S.f,lim:S.lim},m=S.msg,mo=S.ok;S.state='load';await load();Object.assign(S,keep,{det:null});if(S.open&&S.open.k==='client'){const o=S.open;S.open=null;if(D&&D.cm.has(o.id))await openClient(o.id);else paint()}else paint();say(m,mo)}
async function copy(t){try{await navigator.clipboard.writeText(t);say(T.copied,true)}catch(e){try{const i=document.createElement('textarea');i.value=t;i.style.position='fixed';i.style.opacity='0';document.body.appendChild(i);i.select();const ok=document.execCommand('copy');i.remove();say(ok?T.copied:T.copyFail,ok)}catch(x){say(T.copyFail)}}}
async function toggleActive(id){const x=D.pa.get(id);if(!x)return;const r=await mut('partners?profile_id=eq.'+enc(id),{active:!x.active});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();x.active=!x.active;say(T.saved,true);paintBody()}
async function setStatus(id,status){const r=await admin('set_status',{id,status});if(!r.ok)return say(why(r));say(r.data&&r.data.partial?T.userPartial:status==='suspended'?T.userSuspended:T.userRestored,true);S.ask=null;await refresh()}
async function delUser(id){const r=await admin('delete_user',{id});if(!r.ok)return say(why(r));S.open=null;S.ask=null;S.tab=S.tab==='team'?'team':'clients';say(T.userGone,true);await refresh()}
async function invite(email,rl,group){const b={email,role:rl};if(group)b.director_id=group;const r=await admin('invite',b);if(!r.ok)return say(why(r));say(fill(T.invSent,{email}),true);await refresh()}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-tm]');if(!el||!$('#tm'))return;const a=el.dataset.tm,id=el.dataset.id,v=el.dataset.v;if(el.disabled)return;
const lock=async fn=>{el.disabled=true;try{await fn()}finally{el.disabled=false}};
if(a==='tab'){S.tab=v;S.open=null;S.ask=null;S.lim=100;say('');paint();const t=$('#tt-'+v);if(t)t.focus()}
else if(a==='signout'){await AU().signOut();location.hash='#/signin';location.reload()}
else if(a==='openc')await openClient(id);
else if(a==='openu'){S.open={k:'user',id};S.ask=null;say('');paintBody();const h=$('#tmh');if(h)h.focus()}
else if(a==='back'){S.open=null;S.ask=null;say('');paintBody()}
else if(a==='more'){S.lim+=100;paintList()}
else if(a==='moreaud'){S.audLim=Math.min(CAP,S.audLim+200);S.aud=null;paintBody();loadAudit()}
else if(a==='copy')copy(v);
else if(a==='copylink')copy(linkFor());
else if(a==='csv'&&isF())csv(v);
else if(a==='mset'&&canManage())await lock(async()=>{const r=await mut('meetings?id=eq.'+enc(id),{status:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();const m=D.meetings.find(x=>x.id===id);if(m)m.status=v;say(T.saved,true);paint()});
else if(a==='rset'&&isF())await lock(async()=>{const r=await mut('data_requests?id=eq.'+enc(id),{status:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();const q=D.req.find(x=>x.id===id);if(q){q.status=v;if(v==='done'||v==='rejected')q.handled_at=new Date().toISOString()}say(T.saved,true);paintBody()});
else if(a==='toggle'&&canManage())await lock(()=>toggleActive(id));
else if(a==='suspend'||a==='delete'){if(isF()){S.ask={act:a,id};paintBody()}}
else if(a==='restore'&&isF())await lock(()=>setStatus(id,'active'));
else if(a==='noask'){S.ask=null;paintBody()}
else if(a==='confirm'&&isF()&&S.ask)await lock(()=>S.ask.act==='delete'?delUser(S.ask.id):setStatus(S.ask.id,'suspended'));
else if(a==='revoke'&&canManage())await lock(async()=>{const r=await admin('revoke_invite',{id});if(!r.ok)return say(why(r));say(T.invRevoked,true);await refresh()});
else if(a==='reinv'&&canManage())await lock(async()=>{const i=D.inv.find(x=>x.id===id);if(i)await invite(i.email,i.role,i.director_id)})});
document.addEventListener('submit',async e=>{const f=e.target.closest('form.tmform');if(!f||!$('#tm'))return;e.preventDefault();const b=f.querySelector('button[type=submit]');if(b&&b.disabled)return;
const k=f.dataset.form,id=f.dataset.id,run=async fn=>{if(b)b.disabled=true;try{await fn()}finally{if(b)b.disabled=false}};
if(k==='note')await run(async()=>{const t=(($('#nb')||{}).value||'').trim();if(!t)return say(T.err.noteEmpty);if(t.length>4000)return say(T.err.noteLong);
const br=D.lb.get(id),r=await mut('notes',{client_id:id,...(br?{brief_id:br.id}:{}),body:t},'POST');if(!r.ok||!r.n)return say(r.ok?T.rowsNone:T.err.generic);
S.det.notes=[r.rows[0],...(S.det.notes||[])];$('#nb').value='';say(T.saved,true);const n=$('#tmnotes');if(n)n.innerHTML=notes(S.det.notes)});
else if(k==='bstatus'&&canManage())await run(async()=>{const v=($('#bs')||{}).value;if(!BST.includes(v))return;const r=await mut('client_briefs?id=eq.'+enc(id),{status:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();const x=D.briefs.find(y=>y.id===id);if(x)x.status=v;index();say(T.saved,true);paintBody()});
else if(k==='reassign'&&isF())await run(async()=>{const v=($('#ro')||{}).value||null;if(v&&!UUID.test(v))return;const cid=S.open.id,r=await mut('clients?profile_id=eq.'+enc(cid),{partner_id:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();const c=D.cm.get(cid);if(c)c.partner_id=v;say(T.saved,true);paintBody()});
else if(k==='invite'&&canManage())await run(async()=>{const em=(($('#ive')||{}).value||'').trim(),rl=isF()?($('#ivr')||{}).value:'partner',gr=isF()&&rl==='partner'?($('#ivg')||{}).value:'';if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return say(T.err.email);await invite(em,rl,gr)});
else if(k==='role'&&isF())await run(async()=>{const v=($('#rl')||{}).value,p=D.pm.get(id),x=D.pa.get(id);if(!p||!x||p.role===v||!['partner','director'].includes(v))return;
if(v==='partner'&&D.partners.some(y=>y.director_id===id))return say(T.roleBlocked);
const r=await mut('profiles?id=eq.'+enc(id),{role:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();
if(v==='director'&&x.director_id){const g=await mut('partners?profile_id=eq.'+enc(id),{director_id:null});if(!g.ok||!g.n)return stale()}
await refresh();say(T.saved,true)});
else if(k==='group'&&isF())await run(async()=>{const v=($('#gr')||{}).value||null;if(v&&!UUID.test(v))return;const r=await mut('partners?profile_id=eq.'+enc(id),{director_id:v});if(!r.ok)return say(T.err.generic);if(!r.n)return stale();const x=D.pa.get(id);if(x)x.director_id=v;say(T.saved,true);paintBody()})});
document.addEventListener('input',e=>{const f=e.target.closest('[data-f]');if(f&&f.tagName==='INPUT'&&$('#tm')){S.f[f.dataset.f]=f.value;S.lim=100;paintList()}});
document.addEventListener('change',e=>{if(!$('#tm'))return;const f=e.target.closest('[data-f]');if(f&&f.tagName==='SELECT'){S.f[f.dataset.f]=f.value;S.lim=100;if(f.dataset.f==='tb')paintBody();else paintList();return}
if(e.target.id==='lnkp'){S.f.lk=e.target.value;const i=$('#lnk');if(i)i.value=linkFor()}});
/* roving keys for the tab list */
document.addEventListener('keydown',e=>{const t=e.target.closest&&e.target.closest('[role=tab]');if(!t||!$('#tm'))return;const tabs=[...document.querySelectorAll('.tm-tabs [role=tab]')],i=tabs.indexOf(t),rtl=document.documentElement.dir==='rtl';
const n={ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1}[e.key];if(n){e.preventDefault();tabs[(i+n+tabs.length)%tabs.length].focus()}else if(e.key==='Home'){e.preventDefault();tabs[0].focus()}else if(e.key==='End'){e.preventDefault();tabs[tabs.length-1].focus()}});
const team=()=>{S=fresh();D=null;setTimeout(load,0);return page()};
window.PAGES=window.PAGES||{};window.PAGES.team=team;window.PAGES.title=Object.assign(window.PAGES.title||{},{team:T.title});
})();
