/* CULMERA client portal (Phase 3, steps 3.3 and 3.4). No library.
   3.3  #/meeting: calendar + time picker, any day and time, client and studio time zones side by side,
        request / change / cancel through the user's own token (Row Level Security decides what is allowed).
   3.4  account extras: status timeline, "how pricing works", and data export / deletion requests.
   A client never confirms a meeting: staff do. Nothing is deleted automatically. All strings live in L.mt and L.dr. */
(()=>{
const M=L.mt,R=L.dr,A=L.auth,$=s=>document.querySelector(s),G=()=>window.GW,C=()=>G().C,esc=s=>G().esc(s),fill=(s,o)=>G().fill(s,o),AU=()=>window.CulmeraAuth,enc=encodeURIComponent;
/* ---------- time helpers ---------- */
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};
const studio=()=>C().ownerTimezone||'Africa/Cairo';
const fmt=(d,z)=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:'full',timeStyle:'short',timeZone:z}).format(d)}catch(e){return ''}};
const day=(d)=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:'full'}).format(d)}catch(e){return ''}};
const p2=n=>String(n).padStart(2,'0'),key=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
const parts=k=>k.split('-').map(Number),mk=(k,h,mi)=>{const [y,m,d]=parts(k);return new Date(y,m-1,d,h,mi,0,0)};
/* same rule as the database (at least one hour ahead), plus one minute of safety for clock differences */
const earliest=()=>Date.now()+36e5+6e4,latest=()=>{const d=new Date();d.setMonth(d.getMonth()+12);return d.getTime()};
const dayOK=k=>{const [y,m,d]=parts(k);return new Date(y,m-1,d,23,59,59,999).getTime()>=earliest()&&new Date(y,m-1,d,0,0).getTime()<=latest()};
const hourOK=(k,h)=>mk(k,h,45).getTime()>=earliest();
const DURS=()=>L.opts.duration.map(Number),MINS=[0,15,30,45],CLOSED=['won','lost','archived'],OPENB=['submitted','in_review','scheduled','in_discussion'];
const rtl=()=>document.documentElement.dir==='rtl';
/* ---------- state ---------- */
const fresh=()=>({ctx:null,view:null,fd:'',sel:{d:'',h:'',m:'',dur:45,note:''},edit:false,ask:false,busy:false,msg:'',ok:false,focus:''});
let S=fresh();
const zones=d=>`<div class="zn"><div><span class="note">${esc(M.yourTime)}</span><b>${esc(fmt(d,tz()))}</b><span class="note">${esc(M.yourZone)}: <span dir="ltr">${esc(tz())}</span></span></div><div><span class="note">${esc(M.studioTime)}</span><b>${esc(fmt(d,studio()))}</b><span class="note">${esc(M.studioZone)}: <span dir="ltr">${esc(studio())}</span></span></div></div>`;
const pill=s=>`<span class="pill ${esc(s)}">${esc(M.mst[s]||s)}</span>`;
/* ---------- loading ---------- */
async function load(keep){const box=$('#mt');if(!box)return;if(!keep){S.msg='';S.ok=false}
const s=await AU().session();if(!$('#mt'))return;if(!s){location.hash='#/signin';return}
const bad=()=>{S.ctx={err:true};paint()};
const pr=await AU().rest('profiles?select=role,status&id=eq.'+enc(s.user.id),s);if(!$('#mt'))return;if(!pr.ok||!pr.data[0])return bad();
if(pr.data[0].status!=='active'){await AU().signOut();location.hash='#/signin';location.reload();return}
if(pr.data[0].role!=='client'){S.ctx={staff:pr.data[0].role};paint();return}
const [br,ms]=await Promise.all([AU().rest('client_briefs?select=id,ref,status,updated_at&order=updated_at.desc&limit=20',s),AU().rest('meetings?select=id,brief_id,starts_at,timezone,duration_min,status,note&order=starts_at.desc&limit=50',s)]);
if(!$('#mt'))return;if(!br.ok||!ms.ok||!Array.isArray(br.data)||!Array.isArray(ms.data))return bad();
const active=ms.data.find(x=>x.status==='requested'||x.status==='confirmed')||null;
/* the brief that has the active meeting, otherwise the latest brief the team can work on, otherwise the latest one */
const b=(active&&br.data.find(x=>x.id===active.brief_id))||br.data.find(x=>OPENB.includes(x.status))||br.data[0]||null;
const done=b?ms.data.find(x=>x.brief_id===b.id&&x.status==='done')||null:null;
S.ctx={uid:s.user.id,brief:b,active:active&&b&&active.brief_id===b.id?active:null,done};
if(S.ctx.active&&!S.edit)prefill(S.ctx.active);paint()}
function prefill(m){const d=new Date(m.starts_at);S.sel={d:key(d),h:String(d.getHours()),m:String(d.getMinutes()),dur:m.duration_min||45,note:m.note||''}}
/* ---------- views ---------- */
const gate=(h,p,href,b)=>`<h2 class="h2s" id="mth" tabindex="-1">${esc(h)}</h2><p>${p}</p><p><a class="btn p" href="${href}">${esc(b)}</a> <a class="btn" href="#/account">${esc(M.back)}</a></p>`;
function cal(){const t=new Date(),x=S.view||(S.view={y:t.getFullYear(),m:t.getMonth()});const first=new Date(x.y,x.m,1),n=new Date(x.y,x.m+1,0).getDate(),off=(first.getDay()+6)%7,tk=key(t);
const inM=k=>{const [y,m]=parts(k);return y===x.y&&m-1===x.m};
if(!S.fd||!inM(S.fd)){const sel=S.sel.d&&inM(S.sel.d)?S.sel.d:'';let f=sel;if(!f)for(let d=1;d<=n&&!f;d++){const k=key(new Date(x.y,x.m,d));if(dayOK(k))f=k}S.fd=f||key(first)}
const wd=[...Array(7)].map((_,i)=>{const d=new Date(2024,0,1+i);return `<th scope="col" abbr="${esc(new Intl.DateTimeFormat(L.locale,{weekday:'long'}).format(d))}">${esc(new Intl.DateTimeFormat(L.locale,{weekday:'short'}).format(d))}</th>`}).join('');
const cells=[...Array(off).fill(null),...Array.from({length:n},(_,i)=>i+1)];while(cells.length%7)cells.push(null);
const rows=[];for(let i=0;i<cells.length;i+=7)rows.push(cells.slice(i,i+7));
const body=rows.map(r=>`<tr>${r.map(d=>{if(!d)return '<td></td>';const dt=new Date(x.y,x.m,d),k=key(dt),ok=dayOK(k),on=S.sel.d===k;
return `<td role="gridcell"><button type="button" class="cd ${on?'on':''} ${ok?'':'off'} ${k===tk?'tdy':''}" data-day="${k}" tabindex="${k===S.fd?0:-1}" aria-pressed="${on}" ${ok?'':'aria-disabled="true"'} aria-label="${esc(day(dt)+(k===tk?', '+M.today:'')+(ok?'':', '+M.unavailable))}">${d}</button></td>`}).join('')}</tr>`).join('');
const cur=new Date(t.getFullYear(),t.getMonth(),1),lim=new Date(latest()),canPrev=first>cur,canNext=first<new Date(lim.getFullYear(),lim.getMonth(),1);
const ar=(a,b)=>rtl()?b:a;
return `<div class="cal" role="group" aria-label="${esc(M.calLabel)}"><div class="cal-h"><button type="button" class="btn" data-mt="prev" aria-label="${esc(M.prev)}" ${canPrev?'':'disabled'}>${ar('‹','›')}</button><b id="calh" aria-live="polite">${esc(new Intl.DateTimeFormat(L.locale,{month:'long',year:'numeric'}).format(first))}</b><button type="button" class="btn" data-mt="next" aria-label="${esc(M.next)}" ${canNext?'':'disabled'}>${ar('›','‹')}</button></div><table role="grid" aria-labelledby="calh"><thead><tr>${wd}</tr></thead><tbody>${body}</tbody></table></div>`}
function picker(c){const x=S.sel,hr=[...Array(24).keys()],mn=[...new Set([...MINS,...(x.m!==''&&!MINS.includes(+x.m)?[+x.m]:[])])].sort((a,b)=>a-b),du=[...new Set([...DURS(),...(DURS().includes(+x.dur)?[]:[+x.dur])])].sort((a,b)=>a-b);
const hOpt=h=>`<option value="${h}" ${String(x.h)===String(h)?'selected':''} ${x.d&&!hourOK(x.d,h)?'disabled':''}>${p2(h)}</option>`;
return `<p class="lead-p">${esc(M.lead)}</p><p class="note">${esc(M.yourZone)}: <b dir="ltr">${esc(tz())}</b> · ${esc(M.studioZone)}: <b dir="ltr">${esc(studio())}</b></p>
${S.edit&&c.active?`<p class="note">${esc(M.confirmedNote)}</p>`:''}<div class="pk"><div><h2 class="h2s" id="mth" tabindex="-1">${esc(M.pickH)}</h2>${cal()}</div>
<div><h2 class="h2s">${esc(M.timeH)}</h2><div class="two"><label><span>${esc(M.hour)}</span><select id="mth2" dir="ltr"><option value="">—</option>${hr.map(hOpt).join('')}</select></label><label><span>${esc(M.minute)}</span><select id="mtm" dir="ltr"><option value="">—</option>${mn.map(m=>`<option value="${m}" ${String(x.m)===String(m)?'selected':''}>${p2(m)}</option>`).join('')}</select></label></div>
<h3 class="wzq" style="font-size:1.2rem;margin-block-start:1.4rem">${esc(M.lenH)}</h3><div class="chips" role="group" aria-label="${esc(M.lenH)}">${du.map(v=>`<button type="button" class="chip ${+x.dur===v?'on':''}" aria-pressed="${+x.dur===v}" data-dur="${v}">${esc(fill(M.min,{n:v}))}</button>`).join('')}</div>
<label>${esc(M.noteL)}<textarea id="mtnote" rows="3" maxlength="1000">${esc(x.note)}</textarea><span class="note" id="mtcnt">${esc(fill(M.noteMax,{n:(x.note||'').length}))}</span></label></div></div>
<div id="mtsum" aria-live="polite"></div><p class="err" id="mterr" role="alert"></p>
<p><button type="button" class="btn p big" data-mt="send" id="mtbtn">${esc(S.edit?M.save:M.book)}</button>${S.edit?` <button type="button" class="btn" data-mt="stop">${esc(M.cancelNo)}</button>`:` <a class="btn" href="#/account">${esc(M.back)}</a>`}</p>`}
function current(c){const m=c.active,d=new Date(m.starts_at),past=d.getTime()<Date.now();
return `<h2 class="h2s" id="mth" tabindex="-1">${esc(M.yourH)} ${pill(m.status)}</h2>${zones(d)}<p class="note">${esc(M.dur)}: ${esc(fill(M.min,{n:m.duration_min}))} · ${esc(M.ref)}: <span dir="ltr">${esc(c.brief.ref)}</span></p>${m.note?`<p><span class="note">${esc(M.noteH)}</span><br>${esc(m.note)}</p>`:''}
<p class="note">${esc(past?M.pastNote:m.status==='confirmed'?M.confirmedNote:M.requestedNote)}</p>
${S.ask?`<div class="card cb" role="group" aria-label="${esc(M.cancelAsk)}"><p style="color:var(--ivory)">${esc(M.cancelAsk)}</p><button type="button" class="btn p" data-mt="cancel-yes" ${S.busy?'disabled':''}>${esc(M.cancelYes)}</button> <button type="button" class="btn" data-mt="cancel-no" id="mtkeep">${esc(M.cancelNo)}</button></div>`
:`<p><button type="button" class="btn p" data-mt="edit">${esc(M.resched)}</button> <button type="button" class="btn" data-mt="cancel">${esc(M.cancel)}</button> <a class="btn" href="#/account">${esc(M.back)}</a></p>`}`}
function main(c){const b=c.brief,em=C().email;
if(!b)return gate(M.needBriefH,esc(M.needBriefP),'#/brief',M.openBrief);
if(c.active&&!S.edit)return current(c);
if(c.active&&S.edit)return picker(c);
if(c.done)return `<h2 class="h2s" id="mth" tabindex="-1">${esc(M.yourH)} ${pill('done')}</h2>${zones(new Date(c.done.starts_at))}<p class="note">${esc(M.doneNote)}</p><p><a class="btn p" href="#/account">${esc(M.back)}</a></p>`;
if(b.status==='draft')return gate(M.needSubH,esc(M.needSubP),'#/brief',M.openBrief);
if(CLOSED.includes(b.status))return `<h2 class="h2s" id="mth" tabindex="-1">${esc(M.closedH)}</h2><p>${esc(fill(M.closedP,{status:A.st[b.status]||b.status,email:em,ref:b.ref}))}</p><p><a class="btn p" href="#/account">${esc(M.back)}</a></p>`;
return picker(c)}
function paint(){const box=$('#mt');if(!box)return;const c=S.ctx;let h;
if(!c)h=`<p>${esc(M.loading)}</p>`;
else if(c.err)h=`<p role="alert">${esc(M.loadErr)}</p><p><button type="button" class="btn p" data-mt="retry">${esc(M.tryAgain)}</button></p>`;
else if(c.staff)h=`<h2 class="h2s" id="mth" tabindex="-1">${esc(M.staffH)}</h2><p>${esc(fill(M.staffP,{role:A.roles[c.staff]||c.staff}))}</p><p><a class="btn" href="#/account">${esc(A.account)}</a></p>`;
else h=main(c);
box.innerHTML=(S.msg?`<p class="${S.ok?'note okm':'err'}" role="${S.ok?'status':'alert'}" id="mtmsg">${esc(S.msg)}</p>`:'')+h;sum();
const f=S.focus?$(S.focus):(S.msg?$('#mtmsg'):null)||$('#mth');S.focus='';if(f){if(!f.hasAttribute('tabindex')&&!/^(BUTTON|A|SELECT|INPUT|TEXTAREA)$/.test(f.tagName))f.tabIndex=-1;f.focus({preventScroll:true})}}
function sum(){const e=$('#mtsum');if(!e)return;const x=S.sel;e.innerHTML=x.d&&x.h!==''&&x.m!==''?`<p class="note">${esc(M.chosen)}</p>${zones(mk(x.d,+x.h,+x.m))}`:`<p class="note">${esc(M.nothing)}</p>`}
/* ---------- rules and saving ---------- */
const problem=()=>{const x=S.sel;if(!x.d)return M.errDay;if(x.h===''||x.m==='')return M.errTime;const t=mk(x.d,+x.h,+x.m).getTime();if(!(t>=Date.now()))return M.past;if(t<earliest())return M.tooSoon;if(t>latest())return M.far;return ''};
const fail=t=>{S.busy=false;const b=$('#mtbtn');if(b){b.disabled=false;b.textContent=S.edit?M.save:M.book}const e=$('#mterr');if(e){e.textContent=t;e.scrollIntoView({block:'center'})}};
const why=r=>{const m=String((r.data&&r.data.message)||'');if(r.offline||r.status===0)return M.errOffline;if(r.status===401)return M.errAuth;if(/one hour/i.test(m))return M.tooSoon;return M.errGeneric};
const dup=r=>!!(r.data&&r.data.code==='23505');
async function send(){if(S.busy)return;const p=problem();if(p){const e=$('#mterr');e&&(e.textContent=p);return}
const c=S.ctx,x=S.sel,btn=$('#mtbtn');S.busy=true;btn.disabled=true;btn.textContent=S.edit?M.saving:M.booking;$('#mterr').textContent='';
const s=await AU().session();if(!s)return fail(M.errAuth);
const body={starts_at:mk(x.d,+x.h,+x.m).toISOString(),timezone:tz(),duration_min:+x.dur,status:'requested',note:(x.note||'').trim()||null};
const r=c.active?await AU().restW('meetings?id=eq.'+enc(c.active.id),s,{method:'PATCH',prefer:'return=representation',body}):await AU().restW('meetings',s,{prefer:'return=representation',body:{brief_id:c.brief.id,client_id:c.uid,...body}});
if(r.ok&&Array.isArray(r.data)&&r.data[0]){try{AU().notify&&AU().notify('meeting',r.data[0].id)}catch(e){}S.busy=false;S.msg=c.active?M.okMoved:M.okBooked;S.ok=true;S.edit=false;S.ask=false;await load(true);return}
if(r.ok){/* zero rows: the team moved this meeting on */S.busy=false;S.msg=M.errChanged;S.ok=false;S.edit=false;await load(true);return}
if(dup(r)){S.busy=false;S.msg=M.errDup;S.ok=false;S.edit=false;await load(true);return}
fail(why(r))}
async function cancel(){if(S.busy||!S.ctx||!S.ctx.active)return;S.busy=true;const s=await AU().session();if(!s){S.busy=false;S.msg=M.errAuth;S.ok=false;paint();return}
const r=await AU().restW('meetings?id=eq.'+enc(S.ctx.active.id),s,{method:'PATCH',prefer:'return=representation',body:{status:'cancelled'}});S.busy=false;S.ask=false;
if(r.ok&&Array.isArray(r.data)&&r.data[0]){try{AU().notify&&AU().notify('meeting',r.data[0].id)}catch(e){}S.msg=M.okCancelled;S.ok=true;S.edit=false;S.sel=fresh().sel;await load(true);return}
S.msg=r.ok?M.errChanged:why(r);S.ok=false;if(r.ok)await load(true);else paint()}
/* ---------- events ---------- */
function move(dt){const t=new Date(),a=new Date(t.getFullYear(),t.getMonth(),t.getDate()),l=new Date(latest());if(dt<a)dt=a;if(dt>l)dt=new Date(l.getFullYear(),l.getMonth(),l.getDate());S.fd=key(dt);S.view={y:dt.getFullYear(),m:dt.getMonth()};S.focus='[data-day="'+S.fd+'"]';paint()}
document.addEventListener('keydown',e=>{const b=e.target.closest&&e.target.closest('button[data-day]');if(!b)return;const [y,m,d]=parts(b.dataset.day);let dt=new Date(y,m-1,d);const f=rtl()?-1:1;
if(e.key==='ArrowLeft')dt.setDate(dt.getDate()-f);else if(e.key==='ArrowRight')dt.setDate(dt.getDate()+f);else if(e.key==='ArrowUp')dt.setDate(dt.getDate()-7);else if(e.key==='ArrowDown')dt.setDate(dt.getDate()+7);
else if(e.key==='Home')dt.setDate(dt.getDate()-((dt.getDay()+6)%7));else if(e.key==='End')dt.setDate(dt.getDate()+6-((dt.getDay()+6)%7));else if(e.key==='PageUp')dt.setMonth(dt.getMonth()-1);else if(e.key==='PageDown')dt.setMonth(dt.getMonth()+1);else return;e.preventDefault();move(dt)});
document.addEventListener('click',e=>{const x=e.target.closest('button,a');if(!x)return;const d=x.dataset;
if(d.day!==undefined&&$('#mt')){if(x.getAttribute('aria-disabled')==='true'){const q=$('#mterr');q&&(q.textContent=M.tooSoon);return}S.sel.d=d.day;S.fd=d.day;if(S.sel.h!==''&&!hourOK(d.day,+S.sel.h)){S.sel.h='';S.sel.m=''}S.focus='[data-day="'+d.day+'"]';paint();return}
if(d.dur!==undefined&&$('#mt')){S.sel.dur=+d.dur;S.focus='[data-dur="'+d.dur+'"]';paint();return}
if(d.mt!==undefined&&$('#mt')){const a=d.mt;
if(a==='prev'||a==='next'){const v=S.view,n=new Date(v.y,v.m+(a==='next'?1:-1),1);S.view={y:n.getFullYear(),m:n.getMonth()};S.fd='';S.focus='[data-mt="'+a+'"]:not([disabled])';paint();return}
if(a==='send'){send();return}if(a==='retry'){S.ctx=null;paint();load();return}
if(a==='edit'){S.edit=true;S.msg='';prefill(S.ctx.active);S.view=null;S.fd='';paint();return}
if(a==='stop'){S.edit=false;S.msg='';paint();return}
if(a==='cancel'){S.ask=true;S.msg='';S.focus='#mtkeep';paint();return}if(a==='cancel-no'){S.ask=false;paint();return}if(a==='cancel-yes'){cancel();return}}
if(d.dr!==undefined&&$('#dr')){dr(d.dr)}});
document.addEventListener('change',e=>{const t=e.target;if(!$('#mt'))return;if(t.id==='mth2'){S.sel.h=t.value;if(t.value!==''&&S.sel.m==='')S.sel.m='0';const m=$('#mtm');m&&(m.value=S.sel.m);sum()}else if(t.id==='mtm'){S.sel.m=t.value;sum()}});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='mtnote'){S.sel.note=t.value;const c=$('#mtcnt');c&&(c.textContent=fill(M.noteMax,{n:t.value.length}))}});
/* ---------- the page ---------- */
const meeting=()=>{S=fresh();setTimeout(load,0);return `<section class="wrap pad tight hdrline" style="max-inline-size:980px"><h1 class="h1s">${esc(M.title)}</h1><div id="mt" aria-live="polite"><p>${esc(M.loading)}</p></div></section>`};
/* ---------- account page pieces ---------- */
function card(mt,br){let h=`<h2>${esc(A.meetH)}</h2>`;
if(mt){const d=new Date(mt.starts_at);h+=`<p><b>${esc(fmt(d,tz()))}</b></p><p class="note">${esc(M.yourZone)}: <span dir="ltr">${esc(tz())}</span></p><p class="note">${esc(M.studioTime)}: ${esc(fmt(d,studio()))} (<span dir="ltr">${esc(studio())}</span>)</p><p>${pill(mt.status)} <span class="note">${esc(fill(M.min,{n:mt.duration_min}))}</span></p>${mt.status==='done'?'':`<p><a class="btn" href="#/meeting">${esc(M.acctManage)}</a></p>`}`}
else if(br&&br.status!=='draft'&&!CLOSED.includes(br.status))h+=`<p>${esc(A.meetNone)}</p><p><a class="btn p" href="#/meeting">${esc(M.acctBook)}</a></p>`;
else h+=`<p>${esc(A.meetNone)}</p><p class="note">${esc(br?M.acctNeed:M.acctNeedStart)}</p>`;
return `<div>${h}</div>`}
function timeline(br){if(!br)return '';const st=br.status,i=R.steps.findIndex(x=>x[0]===st);
if(i<0)return `<h2 style="margin-block-start:2.5rem">${esc(R.statusH)}</h2><p><span dir="ltr">${esc(br.ref)}</span> · <span class="pill">${esc(A.st[st]||st)}</span></p><p class="note">${esc(fill(st==='lost'?R.closedNote:R.archivedNote,{email:C().email}))}</p>`;
return `<h2 style="margin-block-start:2.5rem">${esc(R.statusH)}</h2><p class="note">${esc(R.statusLead)} <span dir="ltr">${esc(br.ref)}</span></p><ol class="tl">${R.steps.map((x,k)=>`<li class="${k<i?'dn':k===i?'nw':''}" ${k===i?'aria-current="step"':''}><span class="tk" aria-hidden="true">${k<i?'✓':k+1}</span><div><b>${esc(x[1])}</b> <span class="sr">(${esc(k<i?R.stepsDone:k===i?R.stepsNow:R.stepsNext)})</span><span class="note">${esc(x[2])}</span></div></li>`).join('')}</ol>`}
const pricing=()=>`<h2 style="margin-block-start:2.5rem">${esc(R.priceH)}</h2><div class="pgrid">${R.price.map(p=>`<article class="pr"><h3>${esc(p[0])}</h3><p>${esc(p[1])}</p></article>`).join('')}</div><p class="note">${esc(R.priceNote)}</p>`;
const extras=br=>timeline(br)+pricing()+`<h2 style="margin-block-start:2.5rem">${esc(R.dataH)}</h2><div id="dr"><p>${esc(R.dataP)}</p></div>`;
/* ---------- data export / deletion requests ---------- */
let DR={list:[],ok:true,ask:false,msg:'',good:false,busy:false};
const kindL=k=>k==='export'?R.kindExport:R.kindDeletion,pend=k=>DR.list.find(x=>x.kind===k&&(x.status==='open'||x.status==='in_progress'));
const dd=s=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:'medium'}).format(new Date(s))}catch(e){return ''}};
function drPaint(){const b=$('#dr');if(!b)return;const mail=C().email;
b.innerHTML=`<p>${esc(R.dataP)}</p>${DR.ok?'':`<p class="err" role="alert">${esc(R.loadErr)} <a href="mailto:${esc(mail)}">${esc(mail)}</a></p>`}
${DR.list.length?`<ul class="rl">${DR.list.map(x=>`<li><span>${esc(kindL(x.kind))}</span><span class="note">${esc(fill(R.received,{d:dd(x.created_at)}))} · ${esc(R.rst[x.status]||x.status)}</span></li>`).join('')}</ul>`:''}
${DR.ask?`<div class="card cb" role="group" aria-label="${esc(R.delAsk)}"><p style="color:var(--ivory)">${esc(R.delAsk)}</p><button type="button" class="btn p" data-dr="deletion-yes" ${DR.busy?'disabled':''}>${esc(R.delYes)}</button> <button type="button" class="btn" data-dr="deletion-no" id="drkeep">${esc(R.delNo)}</button></div>`
:DR.ok?`<p>${pend('export')?`<span class="note">${esc(R.kindExport)}: ${esc(R.pending)}</span>`:`<button type="button" class="btn" data-dr="export" ${DR.busy?'disabled':''}>${esc(R.reqExport)}</button>`} ${pend('deletion')?`<span class="note">${esc(R.kindDeletion)}: ${esc(R.pending)}</span>`:`<button type="button" class="btn" data-dr="deletion" ${DR.busy?'disabled':''}>${esc(R.reqDelete)}</button>`}</p>`:''}
<p class="${DR.good?'note okm':'err'}" id="drm" role="status" aria-live="polite">${esc(DR.msg)}</p>`}
async function pull(){const s=await AU().session();if(!s)return null;const r=await AU().rest('data_requests?select=id,kind,status,created_at&order=created_at.desc&limit=20',s);DR.ok=r.ok&&Array.isArray(r.data);DR.list=DR.ok?r.data:[];return s}
async function rights(){if(!$('#dr'))return;DR={list:[],ok:true,ask:false,msg:'',good:false,busy:false};await pull();if(!$('#dr'))return;drPaint()}
async function dr(a){if(DR.busy)return;
if(a==='deletion'){DR.ask=true;DR.msg='';drPaint();const k=$('#drkeep');k&&k.focus();return}
if(a==='deletion-no'){DR.ask=false;drPaint();return}
const kind=a==='export'?'export':a==='deletion-yes'?'deletion':'';if(!kind)return;
DR.busy=true;DR.msg='';drPaint();const s=await AU().session();
const r=s?await AU().restW('data_requests',s,{prefer:'return=representation',body:{client_id:s.user.id,kind}}):{ok:false,status:401,data:{}};
DR.busy=false;DR.ask=false;
if(r.ok&&Array.isArray(r.data)&&r.data[0]){DR.good=true;DR.msg=R.sent;DR.list=[r.data[0],...DR.list];drPaint();return}
DR.good=false;if(r.data&&r.data.code==='23505'){DR.msg=R.dup;await pull()}else DR.msg=fill(R.err,{email:C().email});
if(!$('#dr'))return;drPaint()}
/* ---------- registration ---------- */
window.PAGES=window.PAGES||{};window.PAGES.meeting=meeting;window.PAGES.title=Object.assign(window.PAGES.title||{},{meeting:M.title});
window.CulmeraPortal={card,extras,rights,fmt,tz};
})();
