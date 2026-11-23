/* CULMERA team consoles (Phase 4). No library. One private route, #/team, that adapts to the signed-in role:
   Partner  : personal code and link, the NAMES of his clients, how many, the project each one asked for, Playbook. Nothing else.
   Director : READ ONLY. His partners, each partner's clients, the project each client asked for, each client's brief status and
              answers, the calls, Playbook. He changes nothing (no status, calls, partners, invitations).
   Founder  : everything, plus status changes, call confirmation, partners on/off, invitations, reassigning clients, roles,
              suspend / delete, data requests, activity log and CSV export.
   Every read and write uses the signed-in user's own token, so Row Level Security decides what each role can see and do
   (Partner and Director read through the read-only views of migration 007); this page only hides buttons that would be refused. People management that needs the service key (invite, suspend, delete) goes
   through the API (/api/admin), which checks the role again on the server. All strings live in L.tm.
   Phase 2 (Founder only): the conversation with each client (reply + optional price + "suggest a meeting"), confirming a call with a Teams link
   pasted by hand, the public (visitor) briefs with an email-only reply. Every write goes through POST /api/reply with a fresh req_id per press.
   Partner and Director never ask for, and never see, any message, price or link (those tables are not readable by them). */
(()=>{
const T=L.tm,A=L.auth,M=L.mt,$=s=>document.querySelector(s),G=()=>window.GW,C=()=>G().C,esc=s=>G().esc(s),fill=(s,o)=>G().fill(s,o),AU=()=>window.CulmeraAuth,enc=encodeURIComponent;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,CAP=1000,WEEK=7*864e5;
const PST=['pending','building','delivered'];
const BST=['submitted','in_review','scheduled','in_discussion','won','lost','archived'];
const TABS={partner:['overview','clients','playbook'],director:['overview','clients','meetings','team','playbook'],founder:['overview','clients','public','meetings','team','requests','announcements','audit','playbook']};
const fresh=()=>({me:null,tab:'overview',open:null,ask:null,f:{q:'',st:'',p:'',ms:'active',tb:'',lk:'home'},lim:100,det:null,aud:null,audLim:200,state:'load',msg:'',ok:false});
let S=fresh(),D=null;
/* ---------- helpers ---------- */
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};
const studio=()=>C().ownerTimezone||'Africa/Cairo';
const when=(d,z,short)=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:short?'medium':'full',timeStyle:short?undefined:'short',timeZone:z||undefined}).format(new Date(d))}catch(e){return ''}};
const pill=(s,l)=>`<span class="pill ${esc(s)}">${esc(l)}</span>`;
const bpill=s=>pill(s,A.st[s]||s),mpill=s=>pill(s,M.mst[s]||s);
/* project status of a client (migration 009): pending / building / delivered, plus the amount in USD once delivered */
const usd=n=>{try{return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n)}catch(e){return '$'+n}};
const pstPill=s=>pill('p-'+s,(T.pst&&T.pst[s])||s);
const nm=p=>p?(p.full_name||p.email||'—'):T.unknown;
const site=()=>C().siteUrl.replace(/\/$/,'');
const adminUrl=()=>String(C().api||'').replace(/\/brief\/?$/,'/admin');
const replyUrl=()=>String(C().api||'').replace(/\/brief\/?$/,'/reply');
const uuid=()=>{try{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5')}catch(e){return null}};
const HTTPS=/^https:\/\/[^\s]+$/;
const say=(t,ok)=>{S.msg=t||'';S.ok=!!ok;const e=$('#tmmsg');if(e){e.textContent=S.msg;e.style.color=ok?'':'#f0a3a3'}};
const role=()=>S.me&&S.me.role;
const isF=()=>role()==='founder',isDir=()=>role()==='director',isP=()=>role()==='partner',canManage=()=>isF(),seesOwner=()=>isF()||isDir();
/* ---------- data ---------- */
async function admin(action,body,url){const s=await AU().session();if(!s)return{ok:false,data:{code:'auth'}};const U=url||adminUrl();if(!U)return{ok:false,data:{code:'noApi'}};
const ac=new AbortController(),t=setTimeout(()=>ac.abort(),20000);
try{const r=await fetch(U,{method:'POST',signal:ac.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.access_token},body:JSON.stringify({action,...body})});let d={};try{d=await r.json()}catch(e){}return{ok:r.ok&&d.ok!==false,status:r.status,data:d}}
catch(e){return{ok:false,data:{code:'offline'}}}finally{clearTimeout(t)}}
const why=r=>T.err[(r.data&&r.data.code)||'']||T.err.generic;
/* the reply API: Founder only, every press carries its own req_id (a double click can never send twice) */
const rpl=(action,body)=>admin(action,body,replyUrl());
const rwhy=r=>{const c=(r.data&&r.data.code)||'';return T.rp.err[c]||T.err[c]||T.err.generic};
async function rd(path){const s=await AU().session();if(!s)return{ok:false,auth:true};const r=await AU().rest(path,s);return r.ok&&Array.isArray(r.data)?{ok:true,rows:r.data}:{ok:false,status:r.status}}
/* write with the user's token; n = number of rows really changed (zero rows means Row Level Security refused it) */
async function mut(path,body,method,prefer){const s=await AU().session();if(!s)return{ok:false,n:0};const r=await AU().restW(path,s,{method:method||'PATCH',body,prefer:prefer||'return=representation'});
return{ok:r.ok,n:r.ok&&Array.isArray(r.data)?r.data.length:0,status:r.status,rows:Array.isArray(r.data)?r.data:[]}}
/* a view with the migration-009 columns; if migration 009 is not applied yet the old columns are read, so nothing breaks */
async function rdv(view,base,extra){const r=await rd(view+'?select='+base+','+extra+'&limit='+CAP);return r.ok?r:rd(view+'?select='+base+'&limit='+CAP)}
const stg=x=>PST.includes(x.project_stage)?x.project_stage:'pending',amtOf=x=>x.amount_usd==null||x.amount_usd===''?null:Number(x.amount_usd);
async function load(){const s=await AU().session();if(!$('#tm'))return;if(!s){location.hash='#/signin';return}
const pr=await rd('profiles?select=id,full_name,email,role,status,locale,created_at&order=created_at.desc&limit='+CAP);if(!$('#tm'))return;
if(!pr.ok){S.state='err';paint();return}
const me=pr.rows.find(x=>x.id===s.user.id);
if(!me){S.state='paused';paint();return}
if(me.status!=='active'){await AU().signOut();location.hash='#/signin';location.reload();return}
if(me.role==='client'){location.hash='#/account';return}
const EMPTY={ok:true,rows:[]},pbq=()=>rd('playbook?select=key,sort,title,body&order=sort.asc'),named=(rows,r)=>rows.map(x=>({id:x.profile_id,full_name:x.full_name||'',email:'',role:r,status:'active',locale:'en',created_at:x.created_at}));
let people=pr.rows,pa,cl,br,ms,iv,pb,rq,types=null,ex=null;
if(me.role==='founder'){
[pa,cl,br,ms,iv,pb,rq]=await Promise.all([rd('partners?select=profile_id,code,director_id,active&limit='+CAP),rd('clients?select=profile_id,partner_id,code_used,company,country,phone,created_at&limit='+CAP),
rd('client_briefs?select=id,ref,client_id,status,locale,selected_types,created_at,updated_at,submitted_at&order=updated_at.desc&limit='+CAP),rd('meetings?select=id,brief_id,client_id,starts_at,timezone,duration_min,status,note&order=starts_at.desc&limit='+CAP),
rd('invitations?select=id,email,role,director_id,invited_by,expires_at,accepted_at,created_at&accepted_at=is.null&order=created_at.desc&limit=200'),
pbq(),rd('data_requests?select=id,client_id,kind,status,created_at,handled_at&order=created_at.desc&limit=200')]);
const [xm,xv,xp,xt,xj]=await Promise.all([rd('brief_messages?select=id,brief_id,client_id,sender,kind,body,price_text,proposes_meeting,meeting_id,email_status,email_at,created_at&order=created_at.asc&limit='+CAP),
rd('visitor_replies?select=id,brief_ref,body,price_text,proposes_meeting,email_status,email_at,created_at&order=created_at.asc&limit='+CAP),
rd('briefs?select=ref,created_at,name,email,company,country,timezone,items_count,payload,status&order=created_at.desc&limit=300'),
rd('meetings?select=id,teams_url&teams_url=not.is.null&limit='+CAP),rd('client_projects?select=profile_id,stage,amount_usd&limit='+CAP)]);
const xa=await rd('announcements?select=id,title,body,starts_at,expires_at,created_at&order=created_at.desc&limit=200');
ex={ann:xa.ok?xa.rows:null,msgs:xm.ok?xm.rows:null,vis:xv.ok?xv.rows:null,pub:xp.ok?xp.rows:null,tu:xt.ok?xt.rows:null,proj:xj.ok?xj.rows:null}}
else if(me.role==='director'){
/* read-only views of migration 007: names only, no contact details, no notes */
const [p1,tm,c1,b1,m1,pb1]=await Promise.all([rd('partners?select=profile_id,code,director_id,active&limit='+CAP),rd('director_team?select=profile_id,full_name,director_id,active,created_at&limit='+CAP),
rdv('director_clients','profile_id,partner_id,full_name,created_at','project_stage,amount_usd'),rd('director_briefs?select=id,ref,client_id,status,locale,selected_types,created_at,updated_at,submitted_at&order=updated_at.desc&limit='+CAP),
rd('director_meetings?select=id,brief_id,client_id,starts_at,timezone,duration_min,status&order=starts_at.desc&limit='+CAP),pbq()]);
if(![p1,tm,c1,b1,m1].every(x=>x.ok)){if(!$('#tm'))return;S.state='err';paint();return}
people=[...pr.rows,...named(tm.rows,'partner'),...named(c1.rows,'client')];
pa={ok:true,rows:[...p1.rows,...tm.rows.map(x=>({profile_id:x.profile_id,code:'',director_id:x.director_id,active:x.active}))]};
cl={ok:true,rows:c1.rows.map(x=>({profile_id:x.profile_id,partner_id:x.partner_id,code_used:null,company:'',country:'',phone:null,created_at:x.created_at,stage:stg(x),amt:amtOf(x)}))};
br=b1;ms=m1;iv=EMPTY;pb=pb1;rq=EMPTY}
else{
/* partner: only the names of his clients and the project each asked for */
const [p1,c1,pb1]=await Promise.all([rd('partners?select=profile_id,code,director_id,active&limit='+CAP),rdv('partner_clients','profile_id,full_name,selected_types,created_at','project_stage,amount_usd'),pbq()]);
if(![p1,c1].every(x=>x.ok)){if(!$('#tm'))return;S.state='err';paint();return}
people=[...pr.rows,...named(c1.rows,'client')];types=new Map(c1.rows.map(x=>[x.profile_id,x.selected_types||[]]));
pa=p1;cl={ok:true,rows:c1.rows.map(x=>({profile_id:x.profile_id,partner_id:me.id,code_used:null,company:'',country:'',phone:null,created_at:x.created_at,stage:stg(x),amt:amtOf(x)}))};
br=EMPTY;ms=EMPTY;iv=EMPTY;pb=pb1;rq=EMPTY}
if(!$('#tm'))return;if(![pa,cl,br,ms,iv].every(x=>x.ok)){S.state='err';paint();return}
S.me=me;D={profiles:people,pm:new Map(people.map(x=>[x.id,x])),partners:pa.rows,pa:new Map(pa.rows.map(x=>[x.profile_id,x])),clients:cl.rows,briefs:br.rows,meetings:ms.rows,inv:iv.rows,pb:pb.ok?pb.rows:null,req:rq.ok?rq.rows:[],types,ex};
D.cap=[pr,pa,cl,br,ms].some(x=>x.rows.length>=CAP);index();S.state='ok';paint()}

function index(){D.lb=new Map();D.bb=new Map();for(const b of D.briefs){if(!D.lb.has(b.client_id))D.lb.set(b.client_id,b);(D.bb.get(b.client_id)||D.bb.set(b.client_id,[]).get(b.client_id)).push(b)}
D.mc=new Map();for(const m of D.meetings){(D.mc.get(m.client_id)||D.mc.set(m.client_id,[]).get(m.client_id)).push(m)}
D.cm=new Map(D.clients.map(x=>[x.profile_id,x]));
if(D.ex){const pj=new Map((D.ex.proj||[]).map(x=>[x.profile_id,x]));for(const c of D.clients){const x=pj.get(c.profile_id);c.stage=x&&PST.includes(x.stage)?x.stage:'pending';c.amt=x&&x.amount_usd!=null?Number(x.amount_usd):null}}
D.mm=new Map();D.vm=new Map();D.tu=new Map();
if(D.ex){for(const x of D.ex.msgs||[]){(D.mm.get(x.brief_id)||D.mm.set(x.brief_id,[]).get(x.brief_id)).push(x)}
for(const x of D.ex.vis||[]){(D.vm.get(x.brief_ref)||D.vm.set(x.brief_ref,[]).get(x.brief_ref)).push(x)}
for(const x of D.ex.tu||[])D.tu.set(x.id,x.teams_url)}}
const callOf=cid=>{const a=D.mc.get(cid)||[];return a.filter(m=>m.status==='requested'||m.status==='confirmed').sort((x,y)=>String(x.starts_at).localeCompare(String(y.starts_at)))[0]||a.find(m=>m.status==='done')||null};
const amtCell=c=>c.stage==='delivered'&&c.amt!=null?`<b dir="ltr" class="tm-amt">${esc(usd(c.amt))}</b><br><span class="note">${esc(isDir()?T.amtToYou:T.amtToDir)}</span>`:'—';
const projOf=cid=>D.types?(D.types.get(cid)||[]):((D.lb.get(cid)||{}).selected_types||[]);
const projText=a=>(a||[]).map(x=>{const t=G().S[x];return t?t.name:x}).join(', ');
const ownerLabel=c=>{if(!c.partner_id)return T.direct;if(c.partner_id===S.me.id)return T.fYou;return nm(D.pm.get(c.partner_id))};
const dirLabel=c=>{if(!c.partner_id)return T.direct;const o=D.pm.get(c.partner_id);if(o&&o.role==='director')return nm(o);const x=D.pa.get(c.partner_id);return x&&x.director_id?nm(D.pm.get(x.director_id)):T.direct};
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
<div class="tm-tabs" role="tablist" aria-label="${esc(T.title)}">${tabs.map(t=>`<button type="button" role="tab" id="tt-${t}" aria-selected="${S.tab===t}" aria-controls="tmbody" tabindex="${S.tab===t?0:-1}" data-tm="tab" data-v="${t}">${esc(t==='public'?T.rp.tabPublic:T.tabs[t])}${t==='meetings'&&isF()&&calls().length?` <span class="pill requested" aria-label="${esc(T.stCalls)}">${calls().length}</span>`:''}</button>`).join('')}</div>
<p id="tmmsg" role="status" aria-live="polite" class="note"></p><div id="tmbody" role="tabpanel" aria-labelledby="tt-${S.tab}" tabindex="-1">${body()}</div>
<p style="margin-block-start:2.5rem"><button class="btn" type="button" data-tm="signout">${esc(T.signOut)}</button></p>`;
say(S.msg,S.ok);if(S.tab==='audit'&&!S.open&&!S.aud)loadAudit()}
const paintBody=()=>{const b=$('#tmbody');if(b){b.innerHTML=body();}};
const calls=()=>D.meetings.filter(m=>m.status==='requested');
function body(){if(S.open&&S.open.k==='pub'&&isF())return pubView(S.open.id);if(S.open&&S.open.k==='client')return clientView(S.open.id);if(S.open&&S.open.k==='user')return userView(S.open.id);
return({overview,clients:clientsTab,meetings:meetingsTab,team:teamTab,requests:requestsTab,announcements:annTab,audit:auditTab,playbook:playbookTab,public:publicTab}[S.tab]||overview)()}
/* ---------- overview ---------- */
function stat(n,l){return `<div><b class="tm-n">${esc(n)}</b><span class="note">${esc(l)}</span></div>`}
function overview(){const cl=D.clients;let h='';
if(D.pa.has(S.me.id)){const c=myCode();h+=`<div class="tm-box"><h2>${esc(T.codeH)}</h2><p class="note">${esc(T.codeP)}</p><p>${esc(T.code)}: <b dir="ltr" class="tm-code" id="tmcode">${esc(c)}</b> <button class="btn" type="button" data-tm="copy" data-v="${esc(c)}">${esc(T.copy)}</button></p>
<div class="cform" style="max-inline-size:none"><label>${esc(T.linkTo)}<select id="lnkp"><option value="home"${S.f.lk==='home'?' selected':''}>${esc(T.toHome)}</option><option value="signup"${S.f.lk==='signup'?' selected':''}>${esc(T.toSignup)}</option></select></label>
<label>${esc(T.link)}<input id="lnk" readonly dir="ltr" value="${esc(linkFor())}"></label><p><button class="btn p" type="button" data-tm="copylink">${esc(T.copy)}</button></p></div></div>`}
if(isP()){h+=`<h2 class="h2s">${esc(T.tabs.clients)}</h2><div class="tm-cards">${stat(cl.length,T.stClients)}</div>`;return h}
const bs={};let nb=0;for(const c of cl){const b=D.lb.get(c.profile_id);if(!b)nb++;else bs[b.status]=(bs[b.status]||0)+1}
const week=cl.filter(c=>Date.now()-new Date(c.created_at).getTime()<WEEK).length;
h+=`<h2 class="h2s">${esc(T.statsH)}</h2><div class="tm-cards">${stat(cl.length,T.stClients)}${stat(week,T.stNew)}${stat(nb,T.stNoBrief)}${['draft',...BST].map(k=>stat(bs[k]||0,A.st[k])).join('')}</div>`;
if(isDir())h+=`<div class="tm-cards">${stat(D.partners.filter(p=>p.profile_id!==S.me.id).length,T.stPartners)}</div>`;
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
function clientsTab(){return `<div class="tmf"><label>${esc(isF()?T.q:T.colName)}<input type="search" data-f="q" value="${esc(S.f.q)}" maxlength="80" autocomplete="off"></label>
${isP()?'':`<label>${esc(T.fStatus)}<select data-f="st"><option value="">${esc(T.fAll)}</option><option value="none"${S.f.st==='none'?' selected':''}>${esc(T.fNoBrief)}</option>${['draft',...BST].map(k=>`<option value="${k}"${S.f.st===k?' selected':''}>${esc(A.st[k])}</option>`).join('')}</select></label>`}
${seesOwner()?`<label>${esc(T.fPartner)}<select data-f="p">${ownerOpts(S.f.p,true)}</select></label>`:''}</div>${isF()?exportBar():''}<div id="tmlist">${clientList()}</div>`}
function partnerList(){const q=S.f.q.trim().toLowerCase(),nmOf=c=>nm(D.pm.get(c.profile_id)),rows=D.clients.filter(c=>!q||nmOf(c).toLowerCase().includes(q)).sort((a,b)=>nmOf(a).localeCompare(nmOf(b)));
if(!rows.length)return `<p>${esc(T.noMatch)}</p>`;
return `<p class="note">${esc(T.stClients)}: ${rows.length}</p><div class="tw"><table class="tm"><caption class="sr">${esc(T.tabs.clients)}</caption><thead><tr><th scope="col">${esc(T.colClient)}</th><th scope="col">${esc(T.colProj)}</th><th scope="col">${esc(T.colAmt)}</th><th scope="col">${esc(T.ans.packs)}</th></tr></thead><tbody>${rows.slice(0,S.lim).map(c=>`<tr><th scope="row"><b>${esc(nmOf(c))}</b></th><td>${pstPill(c.stage||'pending')}</td><td>${amtCell(c)}</td><td>${esc(projText(projOf(c.profile_id))||'—')}</td></tr>`).join('')}</tbody></table></div>${rows.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)} (${rows.length-S.lim})</button></p>`:''}`}
function clientList(){if(isP())return partnerList();const rows=filtered();if(!rows.length)return `<p>${esc(T.noMatch)}</p>`;const shown=rows.slice(0,S.lim);
return `<div class="tw"><table class="tm"><caption class="sr">${esc(T.tabs.clients)}</caption><thead><tr><th scope="col">${esc(T.colClient)}</th><th scope="col">${esc(T.colProj)}</th>${isDir()?`<th scope="col">${esc(T.colAmt)}</th>`:''}${seesOwner()?`<th scope="col">${esc(T.colOwner)}</th>`:''}<th scope="col">${esc(T.colBrief)}</th>${isDir()?`<th scope="col">${esc(T.ans.packs)}</th>`:''}<th scope="col">${esc(T.colCall)}</th><th scope="col">${esc(T.colJoined)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${shown.map(c=>{const p=D.pm.get(c.profile_id),b=D.lb.get(c.profile_id),m=callOf(c.profile_id);
return `<tr><th scope="row"><b>${esc(nm(p))}</b><br>${isF()?`<br><span class="note">${esc(c.company)}</span>`:''}</th><td>${pstPill(c.stage||'pending')}${isF()&&c.stage==='delivered'&&c.amt!=null?`<br><b dir="ltr" class="tm-amt">${esc(usd(c.amt))}</b>`:''}</td>${isDir()?`<td>${amtCell(c)}</td>`:''}${seesOwner()?`<td>${esc(ownerLabel(c))}${isF()?`<br><span class="note">${esc(T.rp.directorH)}: ${esc(dirLabel(c))}</span>`:''}</td>`:''}<td>${b?`<span dir="ltr">${esc(b.ref)}</span><br>${bpill(b.status)}`:`<span class="note">${esc(T.fNoBrief)}</span>`}</td>${isDir()?`<td>${esc(projText(projOf(c.profile_id))||'—')}</td>`:''}<td>${m?`${mpill(m.status)}<br><span class="note">${esc(when(m.starts_at,tz(),true))}</span>`:'—'}</td><td>${esc(when(c.created_at,undefined,true))}</td>
<td><button class="btn" type="button" data-tm="openc" data-id="${esc(c.profile_id)}">${esc(T.open)}</button></td></tr>`}).join('')}</tbody></table></div>${rows.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)} (${rows.length-S.lim})</button></p>`:''}`}
const paintList=()=>{const l=$('#tmlist');if(l)l.innerHTML=S.tab==='meetings'?meetList():S.tab==='public'?publicList():clientList()};
/* ---------- client detail ---------- */
function clientView(id){const c=D.cm.get(id),p=D.pm.get(id);if(!c)return `<p>${esc(T.none)}</p><p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p>`;
const bl=D.bb.get(id)||[],b=D.lb.get(id),ml=D.mc.get(id)||[],dt=S.det&&S.det.id===id?S.det:null;
let h=`<p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p><h2 class="h2s" id="tmh" tabindex="-1">${esc(nm(p))}</h2><div class="acct">
<div><h2>${esc(T.infoH)}</h2><dl class="tm-dl">${isF()?`<dt>${esc(T.email)}</dt><dd dir="ltr">${p?`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`:'—'}</dd><dt>${esc(T.company)}</dt><dd>${esc(c.company||'—')}</dd><dt>${esc(T.country)}</dt><dd>${esc(c.country||'—')}</dd><dt>${esc(T.phone)}</dt><dd dir="ltr">${esc(c.phone||'—')}</dd>`:''}<dt>${esc(T.joined)}</dt><dd>${esc(when(c.created_at,undefined,true))}</dd>${isF()?`<dt>${esc(T.usedCode)}</dt><dd dir="ltr">${esc(c.code_used||'—')}</dd><dt>${esc(T.lang)}</dt><dd>${esc(p?p.locale:'—')}</dd>`:''}<dt>${esc(T.ownerH)}</dt><dd>${esc(ownerLabel(c))}</dd>${isF()?`<dt>${esc(T.rp.directorH)}</dt><dd>${esc(dirLabel(c))}</dd>`:''}</dl>`;
if(isF()){h+=`<form class="cform tmform" novalidate data-form="reassign" style="margin-block-start:1rem"><label>${esc(T.reassign)}<select id="ro">${ownerOpts(c.partner_id||'',false)}</select></label><p class="note">${esc(T.reassignHint)}</p><p><button class="btn" type="submit">${esc(T.reassign)}</button></p></form>`;
h+=acctActions(id,p)}
h+=`</div><div><h2>${esc(T.briefH)}</h2>`;
if(!b)h+=`<p>${esc(T.briefNone)}</p>`;else{h+=`<p><span dir="ltr">${esc(b.ref)}</span> ${bpill(b.status)}</p>`+(bl.length>1?`<p class="note">${esc(String(bl.length))} ${esc(T.briefH)}</p>`:'');
if(canManage()){h+=b.status==='draft'?`<p class="note">${esc(T.draftNote)}</p>`:`<form class="cform tmform" novalidate data-form="bstatus" data-id="${esc(b.id)}"><label>${esc(T.statusH)}<select id="bs">${BST.map(k=>`<option value="${k}"${b.status===k?' selected':''}>${esc(A.st[k])}</option>`).join('')}</select></label><p><button class="btn" type="submit">${esc(T.saveStatus)}</button></p></form>`}}
h+=`</div><div><h2>${esc(T.callsH)}</h2>`+(ml.length?ml.map(m=>meetCard(m)).join(''):`<p>${esc(T.callNone)}</p>`)+`</div></div>`;
if(isF())h+=projBlock(id,c);
if(isF()&&b&&b.status!=='draft')h+=convBlock(b);
if(b)h+=`<h2 class="h2s">${esc(T.answersH)}</h2><div class="tm-box" id="tmans">${dt&&dt.answers!==undefined?answers(dt.answers,b):`<p class="note">${esc(T.answersLoad)}</p>`}</div>`;
if(isF())h+=`<h2 class="h2s">${esc(T.notesH)}</h2><p class="note">${esc(T.notesHint)}</p><form class="cform tmform" novalidate data-form="note" data-id="${esc(id)}"><label>${esc(T.noteLabel)}<textarea id="nb" rows="3" maxlength="4000"></textarea></label><p><button class="btn p" type="submit">${esc(T.noteAdd)}</button></p></form><div id="tmnotes">${dt&&dt.notes?notes(dt.notes):''}</div>`;
return h}
function projBlock(id,c){const st=c.stage||'pending';let h=`<h2 class="h2s">${esc(T.projH)}</h2><p class="note">${esc(T.projLead)}</p>`;
if(!D.ex||!D.ex.proj)return h+`<p class="note">${esc(T.projNoTable)}</p>`;
return h+`<form class="cform tmform" novalidate data-form="proj" data-id="${esc(id)}"><label>${esc(T.pstL)}<select id="pjs">${PST.map(k=>`<option value="${k}"${st===k?' selected':''}>${esc(T.pst[k])}</option>`).join('')}</select></label><div id="pjw"${st==='delivered'?'':' hidden'}><label>${esc(T.amtL)}<input id="pja" type="text" inputmode="decimal" dir="ltr" autocomplete="off" maxlength="14" value="${c.amt!=null?esc(String(c.amt)):''}"></label><p class="note">${esc(T.amtHint)}</p></div><p><button class="btn p" type="submit">${esc(T.saveProj)}</button></p></form>`}
function acctActions(id,p){const st=p&&p.status;let h=`<h2 style="margin-block-start:1.4rem">${esc(T.accountH)}</h2>`;
if(S.ask&&S.ask.id===id)return h+`<p role="alert">${esc(S.ask.act==='delete'?T.askDelete:T.askSuspend)}</p><p><button class="btn p" type="button" data-tm="confirm">${esc(T.confirm)}</button> <button class="btn" type="button" data-tm="noask">${esc(T.cancel)}</button></p>`;
return h+`<p>${st==='suspended'?`<button class="btn" type="button" data-tm="restore" data-id="${esc(id)}">${esc(T.restore)}</button>`:`<button class="btn" type="button" data-tm="suspend" data-id="${esc(id)}">${esc(T.suspend)}</button>`} <button class="btn" type="button" data-tm="delete" data-id="${esc(id)}">${esc(T.delete)}</button></p>`}
function meetCard(m,full){const c=D.cm.get(m.client_id),b=D.briefs.find(x=>x.id===m.brief_id),act=m.status==='requested'||m.status==='confirmed';
return `<div class="tm-meet"><p>${mpill(m.status)} ${esc(fill(T.min,{n:m.duration_min}))}${full?` · <b>${esc(nm(D.pm.get(m.client_id)))}</b>`:''}${b?` · <span dir="ltr">${esc(b.ref)}</span>`:''}</p>
<div class="zn"><div><span class="note">${esc(T.yourTime)}</span><b>${esc(when(m.starts_at,tz()))}</b><span class="note" dir="ltr">${esc(tz())}</span></div><div><span class="note">${esc(T.studioTime)}</span><b>${esc(when(m.starts_at,studio()))}</b><span class="note" dir="ltr">${esc(studio())}</span></div></div>
<p class="note">${esc(T.clientZone)}: <span dir="ltr">${esc(m.timezone)}</span> — ${esc(when(m.starts_at,m.timezone))}</p>${m.note?`<p class="tm-pre">${esc(m.note)}</p>`:''}${isF()?teamsLine(D.tu.get(m.id)):''}
${canManage()&&act?`<p>${m.status==='requested'?``:`<button class="btn p" type="button" data-tm="mset" data-id="${esc(m.id)}" data-v="done">${esc(T.doneCall)}</button> `}<button class="btn" type="button" data-tm="mset" data-id="${esc(m.id)}" data-v="cancelled">${esc(T.cancelCall)}</button>${full&&c?` <button class="btn" type="button" data-tm="openc" data-id="${esc(m.client_id)}">${esc(T.open)}</button>`:''}</p>`:(full&&c?`<p><button class="btn" type="button" data-tm="openc" data-id="${esc(m.client_id)}">${esc(T.open)}</button></p>`:'')}${canManage()&&act?confirmForm(m):''}</div>`}
/* ---------- Phase 2: conversation with the client, confirming a call, public briefs (Founder only) ---------- */
const teamsLine=u=>typeof u==='string'&&HTTPS.test(u)?`<p><b>${esc(T.rp.teamsLink)}:</b> <a href="${esc(u)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(u)}</a></p>`:'';
const mailPill=st=>st?pill(st==='sent'?'won':st==='failed'?'lost':'requested',T.rp.mail[st]||st):'';
const canResend=m=>m.email_status==='failed'||m.email_status==='skipped'||(m.email_status==='sending'&&Date.now()-new Date(m.email_at).getTime()>5*60*1000);
function msgLine(m,ref){const mine=m.sender==='founder',mt=m.meeting_id?D.meetings.find(x=>x.id===m.meeting_id):null;
return `<div class="cvm${mine?' me':''}"><div class="cvh"><b>${esc(mine?T.rp.you:T.rp.client)}</b><span class="note">${esc(when(m.created_at,tz(),false))}</span></div>`
+(m.kind==='meeting_confirmed'?`<p>${pill('confirmed',T.rp.confirmedH)}${mt?` <span class="note">${esc(fill(T.rp.callAt,{t:when(mt.starts_at,tz())}))}</span>`:''}</p>`:(mt&&!mine?`<p class="note">${esc(fill(T.rp.suggested,{t:when(mt.starts_at,tz())}))}</p>`:''))
+(m.body?`<p class="cvb">${esc(m.body)}</p>`:'')+(m.price_text?`<p><b>${esc(T.rp.priceL)}:</b> ${esc(m.price_text)}</p>`:'')+(m.proposes_meeting?`<p>${pill('requested',T.rp.proposes)}</p>`:'')
+(mine?`<p class="note">${mailPill(m.email_status)}${canResend(m)?` <button class="btn" type="button" data-tm="resend" data-id="${esc(m.id)}" data-ref="${esc(ref)}">${esc(T.rp.resend)}</button>`:''}</p>`:'')+`</div>`}
function replyForm(id,ref,k){const vis=k==='vreply';
return `<form class="cform tmform" novalidate data-form="${k}" data-id="${esc(id)}" data-ref="${esc(ref)}"><h3>${esc(vis?T.rp.replyVisH:T.rp.replyH)}</h3>${vis?`<p class="note">${esc(T.rp.visNote)}</p>`:''}
<label>${esc(T.rp.msgL)}<textarea name="rb" rows="5" maxlength="4000"></textarea></label>
<label>${esc(T.rp.priceOpt)}<input name="rp" maxlength="120" autocomplete="off" placeholder="${esc(T.rp.pricePh)}"></label>
<label style="display:flex;gap:.6rem;align-items:center"><input type="checkbox" name="rpm" style="inline-size:auto"> <span>${esc(T.rp.propose)}</span></label>
<p><button class="btn p" type="submit">${esc(T.rp.send)}</button></p></form>`}
function convBlock(b){const ok=D.ex&&D.ex.msgs,list=ok?(D.mm.get(b.id)||[]):[];
let h=`<h2 class="h2s">${esc(T.rp.convH)}</h2><p class="note">${esc(T.rp.convLead)}</p>`;
if(!ok)return h+`<p role="alert">${esc(T.rp.msgsErr)}</p>`;
return h+`<div class="cvl" id="tmconv">${list.length?list.map(m=>msgLine(m,b.ref)).join(''):`<p class="note">${esc(T.rp.convNone)}</p>`}</div>`+replyForm(b.client_id,b.ref,'reply')}
function confirmForm(m){const b=D.briefs.find(x=>x.id===m.brief_id);if(!b||!D.ex||!D.ex.msgs)return '';const cf=m.status==='confirmed';
return `<details class="tm-cf"><summary>${esc(cf?T.rp.updateCall:T.rp.confirmCall)}</summary><form class="cform tmform" novalidate data-form="confirm" data-id="${esc(m.id)}" data-ref="${esc(b.ref)}">
<label>${esc(T.rp.teamsL)}<input name="tl" type="url" dir="ltr" maxlength="500" autocomplete="off" placeholder="https://" value="${esc(D.tu.get(m.id)||'')}"></label>
<label>${esc(T.rp.noteL)}<textarea name="nt" rows="3" maxlength="4000"></textarea></label>
<label>${esc(T.rp.moveL)}<input name="st" type="datetime-local"></label><p class="note">${esc(T.rp.moveHint)}</p>
<p><button class="btn p" type="submit">${esc(cf?T.rp.updateBtn:T.rp.confirmBtn)}</button></p></form></details>`}
/* public (visitor) briefs: read with the Founder's own token, answered by email only */
function publicList(){const P=(D.ex&&D.ex.pub)||[];if(!P.length)return `<p>${esc(T.rp.pubNone)}</p>`;
return `<div class="tw"><table class="tm"><caption class="sr">${esc(T.rp.tabPublic)}</caption><thead><tr><th scope="col">${esc(T.rp.colRef)}</th><th scope="col">${esc(T.colName)}</th><th scope="col">${esc(T.rp.colCompany)}</th><th scope="col">${esc(T.rp.colReplies)}</th><th scope="col">${esc(T.colWhen)}</th><th scope="col"><span class="sr">${esc(T.colAction)}</span></th></tr></thead><tbody>${P.slice(0,S.lim).map(b=>`<tr><th scope="row" dir="ltr">${esc(b.ref)}</th><td>${esc(b.name)}</td><td>${esc(b.company)}</td><td>${(D.vm.get(b.ref)||[]).length}</td><td>${esc(when(b.created_at,undefined,true))}</td><td><button class="btn" type="button" data-tm="openp" data-id="${esc(b.ref)}">${esc(T.open)}</button></td></tr>`).join('')}</tbody></table></div>${P.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)} (${P.length-S.lim})</button></p>`:''}`}
function publicTab(){if(!isF())return '';if(!D.ex||!D.ex.pub)return `<p role="alert">${esc(T.rp.pubErr)}</p>`;return `<p class="note">${esc(T.rp.pubLead)}</p><div id="tmlist">${publicList()}</div>`}
function pubView(ref){const back=`<p><button class="btn" type="button" data-tm="back">${esc(T.back)}</button></p>`,b=((D.ex&&D.ex.pub)||[]).find(x=>x.ref===ref);if(!b)return `<p>${esc(T.none)}</p>`+back;
const p=b.payload&&typeof b.payload==='object'?b.payload:{},pr=p.project&&typeof p.project==='object'?p.project:{};
const kv=o=>Object.entries(o||{}).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>`<dt>${esc(lab(k))}</dt><dd class="tm-pre">${esc(val(v))}</dd>`).join('');
const items=(Array.isArray(p.items)?p.items:[]).filter(i=>i&&typeof i==='object').map(i=>{const t=G().S[i.slug],o={...i};delete o.slug;return `<div class="tm-item"><h3>${esc(t?t.name:String(i.slug||''))}</h3><dl class="tm-dl">${kv(o)}</dl></div>`}).join('');
const rl=D.vm.get(b.ref)||[];
return back+`<h2 class="h2s" id="tmh" tabindex="-1">${esc(b.name)} <span class="note" dir="ltr">${esc(b.ref)}</span></h2><div class="acct"><div><h2>${esc(T.infoH)}</h2><dl class="tm-dl"><dt>${esc(T.email)}</dt><dd dir="ltr"><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></dd><dt>${esc(T.company)}</dt><dd>${esc(b.company||'—')}</dd><dt>${esc(T.country)}</dt><dd>${esc(b.country||'—')}</dd><dt>${esc(T.phone)}</dt><dd dir="ltr">${esc(p.phone||'—')}</dd><dt>${esc(T.rp.roleL)}</dt><dd>${esc(p.role||'—')}</dd><dt>${esc(T.rp.tzL)}</dt><dd dir="ltr">${esc(b.timezone||'—')}</dd><dt>${esc(T.lang)}</dt><dd>${esc(p.locale||'—')}</dd><dt>${esc(T.joined)}</dt><dd>${esc(when(b.created_at,undefined,true))}</dd></dl></div></div>`
+`<h2 class="h2s">${esc(T.answersH)}</h2><div class="tm-box"><dl class="tm-dl">${kv(pr)}</dl>${items?`<h3>${esc(T.ans.packs)}</h3>${items}`:''}</div>`
+`<h2 class="h2s">${esc(T.rp.repliesH)}</h2>`+(D.ex.vis?`<div class="cvl">${rl.length?rl.map(v=>msgLine({...v,sender:'founder',kind:'reply'},b.ref)).join(''):`<p class="note">${esc(T.rp.convNone)}</p>`}</div>`+replyForm(b.ref,b.ref,'vreply'):`<p role="alert">${esc(T.rp.msgsErr)}</p>`)}
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
const b=D.lb.get(id),[an,nt]=await Promise.all([b?rd((isF()?'client_briefs':'director_briefs')+'?select=answers&id=eq.'+enc(b.id)):{ok:true,rows:[]},isF()?rd('notes?select=id,author_id,body,brief_id,created_at&client_id=eq.'+enc(id)+'&order=created_at.desc&limit=200'):{ok:true,rows:[]}]);
if(!S.open||S.open.id!==id)return;S.det={id,answers:an.ok&&an.rows[0]?an.rows[0].answers||{}:(an.ok?{}:null),notes:nt.ok?nt.rows:[]};
const a=$('#tmans');if(a)a.innerHTML=S.det.answers===null?`<p role="alert">${esc(T.err.generic)}</p>`:answers(S.det.answers,b);const n=$('#tmnotes');if(n)n.innerHTML=notes(S.det.notes)}
/* ---------- calls ---------- */
function meetList(){const all=S.f.ms==='all',rows=D.meetings.filter(m=>all||m.status==='requested'||m.status==='confirmed').sort((a,b)=>all?String(b.starts_at).localeCompare(String(a.starts_at)):String(a.starts_at).localeCompare(String(b.starts_at)));
return rows.length?rows.slice(0,S.lim).map(m=>meetCard(m,true)).join('')+(rows.length>S.lim?`<p><button class="btn" type="button" data-tm="more">${esc(T.more)}</button></p>`:''):`<p>${esc(T.meetNone)}</p>`}
function meetingsTab(){return `<div class="tmf"><label>${esc(T.meetFilter)}<select data-f="ms"><option value="active"${S.f.ms==='active'?' selected':''}>${esc(T.meetActive)}</option><option value="all"${S.f.ms==='all'?' selected':''}>${esc(T.meetAll)}</option></select></label></div>${isF()?exportBar('meetings'):''}<div id="tmlist">${meetList()}</div>`}
/* ---------- team: people and invitations ---------- */
function teamRO(){const byName=(a,b)=>nm(D.pm.get(a.profile_id)).localeCompare(nm(D.pm.get(b.profile_id))),mine=id=>D.clients.filter(c=>c.partner_id===id).sort(byName);
const blk=(title,list,tag)=>`<section class="tm-box"><h2>${esc(title)} <span class="note">(${list.length})</span>${tag||''}</h2>${list.length?`<ul class="tm-list">${list.map(c=>`<li><b>${esc(nm(D.pm.get(c.profile_id)))}</b> — ${esc(projText(projOf(c.profile_id))||'—')} <button class="btn" type="button" data-tm="openc" data-id="${esc(c.profile_id)}">${esc(T.open)}</button></li>`).join('')}</ul>`:`<p class="note">${esc(T.none)}</p>`}</section>`;
const ppl=D.partners.filter(x=>x.profile_id!==S.me.id&&D.pm.get(x.profile_id)).sort((a,b)=>nm(D.pm.get(a.profile_id)).localeCompare(nm(D.pm.get(b.profile_id))));
return `<h2 class="h2s" style="margin-block-start:.5rem">${esc(T.teamH)}</h2>`+(ppl.length?ppl.map(x=>blk(nm(D.pm.get(x.profile_id)),mine(x.profile_id),' '+(x.active?pill('active',T.active):pill('lost',T.inactive)))).join(''):`<p>${esc(T.teamNone)}</p>`)+(mine(S.me.id).length?blk(T.fYou,mine(S.me.id)):'')}
function teamTab(){if(!isF())return teamRO();const ppl=D.partners.map(x=>({x,p:D.pm.get(x.profile_id)})).filter(r=>r.p&&r.p.id!==S.me.id).sort((a,b)=>nm(a.p).localeCompare(nm(b.p)));
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
/* ---------- announcements (Founder): a notice shown to every visitor, top right (js/announce.js) ---------- */
const AN=()=>T.an;
function annTab(){const a=AN(),rows=D.ex&&D.ex.ann;
if(!rows)return `<div class="tm-box"><h2>${esc(a.title)}</h2><p role="alert">${esc(a.noTable)}</p></div>`;
const now=Date.now(),live=x=>new Date(x.starts_at).getTime()<=now&&new Date(x.expires_at).getTime()>now;
const row=x=>`<article class="tm-box ann-row"><p>${live(x)?pill('active',a.live):pill('lost',a.ended)} <span class="note">${esc(fill(a.until,{date:when(x.expires_at,undefined,true)}))}</span></p><h3>${esc(x.title)}</h3><p class="tm-pre">${esc(x.body)}</p>`
+(S.ask&&S.ask.act==='ann'&&S.ask.id===x.id?`<p class="note">${esc(a.askDel)}</p><p><button class="btn p" type="button" data-tm="confirm" data-id="${esc(x.id)}">${esc(a.yesDel)}</button> <button class="btn" type="button" data-tm="noask">${esc(T.cancel||a.no)}</button></p>`
:`<p><button class="btn" type="button" data-tm="anndel" data-id="${esc(x.id)}">${esc(a.del)}</button></p>`)+`</article>`;
const on=rows.filter(live),off=rows.filter(x=>!live(x));
return `<p class="note">${esc(a.lead)}</p>
<form class="cform tmform" novalidate data-form="ann"><h2 class="h2s">${esc(a.newH)}</h2>
<label>${esc(a.fTitle)}<input id="ant" type="text" maxlength="120" autocomplete="off"></label>
<label>${esc(a.fBody)}<textarea id="anb" rows="4" maxlength="600"></textarea></label>
<label>${esc(a.fDays)}<input id="and" type="number" min="1" max="365" step="1" value="7" inputmode="numeric" dir="ltr" style="max-inline-size:8rem"></label>
<p><button class="btn p" type="submit">${esc(a.publish)}</button></p></form>
<h2 class="h2s">${esc(a.liveH)} (${on.length})</h2>${on.length?on.map(row).join(''):`<p>${esc(a.none)}</p>`}
${off.length?`<h2 class="h2s">${esc(a.pastH)} (${off.length})</h2>${off.map(row).join('')}`:''}`}
async function annSave(t,b,d){const a=AN();if(!t||!b)return say(a.errEmpty);if(t.length>120||b.length>600)return say(a.errLong);
if(!Number.isInteger(d)||d<1||d>365)return say(a.errDays);
const now=Date.now(),r=await mut('announcements',{title:t,body:b,starts_at:new Date(now).toISOString(),expires_at:new Date(now+d*864e5).toISOString()},'POST');
if(!r.ok||!r.n)return say(r.ok?T.rowsNone:T.err.generic);say(a.saved,true);await refresh()}
async function annDel(id){const a=AN(),r=await mut('announcements?id=eq.'+enc(id),null,'DELETE');if(!r.ok)return say(T.err.generic);if(!r.n)return stale();S.ask=null;say(a.gone,true);await refresh()}
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
else if(a==='openc'&&!isP())await openClient(id);
else if(a==='openu'&&isF()){S.open={k:'user',id};S.ask=null;say('');paintBody();const h=$('#tmh');if(h)h.focus()}
else if(a==='openp'&&isF()){S.open={k:'pub',id};S.ask=null;say('');paintBody();const h=$('#tmh');if(h)h.focus()}
else if(a==='resend'&&isF())await lock(async()=>{const rid=uuid();if(!rid)return say(T.err.generic);const r=await rpl('resend',{ref:el.dataset.ref,id,req_id:rid});if(!r.ok)return say(rwhy(r));const sent=r.data&&r.data.email==='sent';say(sent?T.rp.resentOk:T.rp.resentFail,sent);await refresh()});
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
else if(a==='anndel'&&isF()){S.ask={act:'ann',id};paintBody()}
else if(a==='confirm'&&isF()&&S.ask&&S.ask.act==='ann')await lock(()=>annDel(S.ask.id));
else if(a==='confirm'&&isF()&&S.ask)await lock(()=>S.ask.act==='delete'?delUser(S.ask.id):setStatus(S.ask.id,'suspended'));
else if(a==='revoke'&&canManage())await lock(async()=>{const r=await admin('revoke_invite',{id});if(!r.ok)return say(why(r));say(T.invRevoked,true);await refresh()});
else if(a==='reinv'&&canManage())await lock(async()=>{const i=D.inv.find(x=>x.id===id);if(i)await invite(i.email,i.role,i.director_id)})});
document.addEventListener('submit',async e=>{const f=e.target.closest('form.tmform');if(!f||!$('#tm'))return;e.preventDefault();const b=f.querySelector('button[type=submit]');if(b&&b.disabled)return;
const k=f.dataset.form,id=f.dataset.id,run=async fn=>{if(b)b.disabled=true;try{await fn()}finally{if(b)b.disabled=false}};
if(k==='ann'&&isF())await run(async()=>{await annSave((($('#ant')||{}).value||'').trim(),(($('#anb')||{}).value||'').trim(),Number(($('#and')||{}).value)||0)});
else if(k==='note')await run(async()=>{const t=(($('#nb')||{}).value||'').trim();if(!t)return say(T.err.noteEmpty);if(t.length>4000)return say(T.err.noteLong);
const br=D.lb.get(id),r=await mut('notes',{client_id:id,...(br?{brief_id:br.id}:{}),body:t},'POST');if(!r.ok||!r.n)return say(r.ok?T.rowsNone:T.err.generic);
S.det.notes=[r.rows[0],...(S.det.notes||[])];$('#nb').value='';say(T.saved,true);const n=$('#tmnotes');if(n)n.innerHTML=notes(S.det.notes)});
else if((k==='reply'||k==='vreply')&&isF())await run(async()=>{const el=f.elements,body=el.rb.value.trim(),price=el.rp.value.trim(),vis=k==='vreply';
if(!body||body.length>4000)return say(T.rp.err.body);if(price.length>120)return say(T.rp.err.price);const rid=uuid();if(!rid)return say(T.err.generic);
const r=await rpl('reply',{ref:f.dataset.ref,body,...(price?{price}:{}),propose_meeting:!!el.rpm.checked,req_id:rid});if(!r.ok)return say(rwhy(r));
const e=r.data&&r.data.email,txt=r.data&&r.data.already?T.rp.already:(vis?T.rp.vsent:T.rp.sent)[e]||T.rp.sent.failed;say(txt,!!(r.data&&r.data.already)||e==='sent');await refresh()});
else if(k==='confirm'&&isF())await run(async()=>{const el=f.elements,link=el.tl.value.trim(),note=el.nt.value.trim(),st=el.st.value;
let okl=HTTPS.test(link)&&link.length>=12&&link.length<=500;if(okl){try{okl=new URL(link).protocol==='https:'}catch(x){okl=false}}if(!okl)return say(T.rp.err.teams_url);
let iso;if(st){const t=new Date(st).getTime();if(!Number.isFinite(t)||t<=Date.now())return say(T.rp.err.starts_at);iso=new Date(t).toISOString()}
if(note.length>4000)return say(T.rp.err.body);const rid=uuid();if(!rid)return say(T.err.generic);
const r=await rpl('confirm',{ref:f.dataset.ref,meeting_id:id,teams_url:link,...(note?{body:note}:{}),...(iso?{starts_at:iso}:{}),req_id:rid});
if(!r.ok){say(rwhy(r));if(r.data&&r.data.code==='message_not_saved')await refresh();return}
const e=r.data&&r.data.email;say(r.data&&r.data.already?T.rp.already:T.rp.cf[e]||T.rp.cf.failed,!!(r.data&&r.data.already)||e==='sent');await refresh()});
else if(k==='proj'&&isF())await run(async()=>{const st=($('#pjs')||{}).value;if(!PST.includes(st))return;let amt=null;
if(st==='delivered'){const raw=(($('#pja')||{}).value||'').trim().replace(/,/g,'');if(!/^\d{1,9}(\.\d{1,2})?$/.test(raw))return say(T.amtErr);amt=Number(raw)}
const r=await mut('client_projects?on_conflict=profile_id',{profile_id:id,stage:st,amount_usd:amt},'POST','resolution=merge-duplicates,return=representation');
if(!r.ok)return say(T.err.generic);if(!r.n)return stale();
const c=D.cm.get(id);if(c){c.stage=st;c.amt=amt}if(D.ex){const a=D.ex.proj||(D.ex.proj=[]),x=a.find(y=>y.profile_id===id);if(x){x.stage=st;x.amount_usd=amt}else a.push({profile_id:id,stage:st,amount_usd:amt})}
say(T.saved,true);paintBody()});
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
if(e.target.id==='pjs'){const w=$('#pjw');if(w)w.hidden=e.target.value!=='delivered';return}
if(e.target.id==='lnkp'){S.f.lk=e.target.value;const i=$('#lnk');if(i)i.value=linkFor()}});
/* roving keys for the tab list */
document.addEventListener('keydown',e=>{const t=e.target.closest&&e.target.closest('[role=tab]');if(!t||!$('#tm'))return;const tabs=[...document.querySelectorAll('.tm-tabs [role=tab]')],i=tabs.indexOf(t),rtl=document.documentElement.dir==='rtl';
const n={ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1}[e.key];if(n){e.preventDefault();tabs[(i+n+tabs.length)%tabs.length].focus()}else if(e.key==='Home'){e.preventDefault();tabs[0].focus()}else if(e.key==='End'){e.preventDefault();tabs[tabs.length-1].focus()}});
const team=()=>{S=fresh();D=null;setTimeout(load,0);return page()};
window.PAGES=window.PAGES||{};window.PAGES.team=team;window.PAGES.title=Object.assign(window.PAGES.title||{},{team:T.title});
})();
