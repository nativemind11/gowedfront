(()=>{
const T0=Date.now(),G=()=>window.GW,C=()=>G().C,$=s=>document.querySelector(s),esc=s=>G().esc(s),BL=L.brief,O=L.opts;
const STEPS=BL.steps;
const LANGS="Arabic,English,French,Spanish,German,Italian,Portuguese,Russian,Turkish,Chinese (Simplified),Chinese (Traditional),Japanese,Korean,Hindi,Urdu,Bengali,Persian,Hebrew,Dutch,Swedish,Norwegian,Danish,Finnish,Polish,Czech,Slovak,Hungarian,Romanian,Bulgarian,Greek,Ukrainian,Serbian,Croatian,Slovenian,Lithuanian,Latvian,Estonian,Indonesian,Malay,Thai,Vietnamese,Filipino,Swahili,Amharic,Hausa,Yoruba,Zulu,Afrikaans,Tamil,Telugu,Marathi,Gujarati,Punjabi,Nepali,Sinhala,Kurdish,Pashto,Azerbaijani,Kazakh,Uzbek,Armenian,Georgian,Catalan,Icelandic,Irish,Albanian,Macedonian,Maltese".split(',');
const B=()=>G().B,ico=(n,w)=>G().ico(n,w);
let acct=null,step=1,sent=null,OPEN={},banner=!!(()=>{try{const b=B();return Object.keys(b.items||{}).length||b.you||b.project}catch(e){return 0}})(),busy=false,errs=[],ferr={};
const ens=()=>{const b=B();b.project=b.project||{};b.you=b.you||{};b.refine=b.refine||{};b.meet=b.meet||{dur:45};b.meet.slots=b.meet.slots||[{},{},{}];b.meet.dur=b.meet.dur||45};
const get=p=>p.split('.').reduce((o,k)=>o==null?o:o[k],B()),val=p=>get(p)??'';
const setP=(p,v)=>{const k=p.split('.'),l=k.pop();let o=B();for(const x of k){if(o[x]==null||typeof o[x]!=='object')o[x]={};o=o[x]}o[l]=v;G().save()};
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return 'UTC'}};
const unsure=()=>(B().project||{}).intent==='unsure';
const REQ=()=>new Set(['you.name','you.email','you.company','you.country','meet.slots.0.d','meet.slots.0.f','meet.slots.0.t',...(unsure()?[]:['project.goal'])]),EM=/^[^@\s]+@[^@\s]+\.[^@\s]+$/,PH=/^[0-9+()\-.\s\u0660-\u0669]{5,40}$/;
const fe=p=>ferr[p]?`<span class="fe" role="alert">${esc(ferr[p])}</span>`:'',bad=p=>ferr[p]?'aria-invalid="true"':'',star=p=>REQ().has(p)?' <i class="rq" title="Required">*</i>':'';
const LTR=new Set(['email','tel','url','date','time','number']);
const inp=(p,l,t='text',x='',max=300)=>`<label><span>${l}${star(p)}</span><input data-p="${p}" type="${t}" value="${esc(val(p))}" maxlength="${max}" ${LTR.has(t)?'dir="ltr"':''} ${bad(p)} ${x}>${fe(p)}</label>`;
const sel=(p,l,o)=>`<label><span>${l}${star(p)}</span><select data-p="${p}"><option value="">Select…</option>${o.map(v=>`<option ${String(val(p))===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
const ms=(p,o)=>`<div class="chips" role="group">${o.map(v=>{const on=(get(p)||[]).includes(v);return `<button type="button" class="chip ${on?'on':''}" aria-pressed="${on}" data-ms="${p}" data-v="${esc(v)}">${esc(v)}</button>`}).join('')}</div>`;
/* ---------- time slots ---------- */
const pHm=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m?+m[1]*60+ +m[2]:null};
const dur=()=>+B().meet.dur||45;
const inst=(d,f)=>new Date(d+'T'+f);
const conv=(d,f)=>{if(!d||!f)return '';try{return new Intl.DateTimeFormat(L.locale,{timeZone:C().ownerTimezone,dateStyle:'medium',timeStyle:'short'}).format(inst(d,f))+' ('+C().ownerTimezone+')'}catch(e){return ''}};
const inHours=(d,f)=>{const m=C().meetingHours;if(!m)return true;try{const ps=new Intl.DateTimeFormat('en-US',{timeZone:C().ownerTimezone,weekday:'short',hourCycle:'h23',hour:'numeric',minute:'numeric'}).formatToParts(inst(d,f)),g=t=>ps.find(p=>p.type===t).value,day=['sun','mon','tue','wed','thu','fri','sat'].indexOf(g('weekday').toLowerCase().slice(0,3)),mins=+g('hour')*60+ +g('minute');return m.days.includes(day)&&mins>=pHm(m.from)&&mins+dur()<=pHm(m.to)}catch(e){return true}};
const slots=()=>(B().meet.slots||[]).filter(s=>s&&s.d&&s.f&&s.t);
const slotErr=s=>{if(!s||!s.d||!s.f||!s.t)return BL.slotErr;const f=pHm(s.f),t=pHm(s.t);if(f==null||t==null||isNaN(inst(s.d,s.f)))return BL.slotErr;if(inst(s.d,s.f).getTime()<Date.now()+36e5)return BL.past;if(t<=f)return BL.endBefore;if(t-f<dur())return f+dur()>=1440?BL.midnight:BL.tooShort;if(!inHours(s.d,s.f))return BL.hours+': '+BL.outside;return ''};
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
/* ---------- starting points ---------- */
const pkgs=()=>{const b=B(),a=b.refine||{};return (L.packs[b.project.intent]||[]).map(([n,tag,ty,d],i)=>{let t=[...ty];if(a.who==='staff'&&i>0)t.push('internal-tools');if(a.who==='partners'&&i>0)t.push('integrations');if(a.login==='yes'&&i>0)t.push('portals');if((a.scale==='10–100k'||a.scale==='100k+')&&i>0)t.push('admin-cms');if(a.scale==='100k+'&&i===2)t.push('multi-region');t=[...new Set(t)].filter(x=>G().S[x]);return{n,tag,t,d,i}})};
function p1(){ens();const b=B(),intent=b.project.intent,q=(val('_q')||'').toLowerCase(),R=b.refine;
const tiles=`<h3 class="wzq">${BL.goalQ}</h3><p class="note">${BL.goalHint}</p><div class="wzg" role="group" aria-label="${esc(BL.goalQ)}">${BL.goals.map(o=>`<button type="button" class="wzt ${intent===o[0]?'on':''}" aria-pressed="${intent===o[0]}" data-goal="${o[0]}">${ico(o[2])}<b>${o[1]}</b><span>${o[3]}</span></button>`).join('')}</div>`;
let mid='';
if(intent==='unsure')mid=`<div class="card cb unsure" role="status"><h3>${BL.unsureH}</h3><p>${BL.unsureP}</p></div>`;
else if(intent){const ps=pkgs();mid=`<h3 class="wzq" style="margin-top:2rem">${BL.startH}</h3><p class="note">${BL.startP}</p><div class="wzr">${ps.map(p=>{const all=p.t.length&&p.t.every(x=>b.items[x]);return `<article class="wzk ${p.i===1?'hot':''}"><span class="wzt2">${esc(p.tag)}</span><h4>${esc(p.n)}</h4><p>${esc(p.d)}</p><ul>${p.t.map(x=>`<li>${esc(G().S[x].name)}</li>`).join('')}</ul><button type="button" class="btn ${all?'on':'p'}" aria-pressed="${all}" data-pkg="${p.i}">${all?BL.packIn:BL.packUse}</button></article>`}).join('')}</div>
<details class="more" data-t="_ref" ${OPEN._ref?'open':''}><summary>${BL.refine}</summary><h4>${BL.who[0]?'':''}${esc(L.brief.users)}</h4><div class="chips" role="group">${BL.who.map(o=>`<button type="button" class="chip ${R.who===o[0]?'on':''}" aria-pressed="${R.who===o[0]}" data-ref="who|${o[0]}">${esc(o[1])}</button>`).join('')}</div><h4>${esc(BL.scale)}</h4><div class="chips" role="group">${O.scale.map(v=>`<button type="button" class="chip ${R.scale===v?'on':''}" aria-pressed="${R.scale===v}" data-ref="scale|${esc(v)}">${esc(v)}</button>`).join('')}</div><h4>Accounts</h4><div class="chips" role="group">${BL.login.map(o=>`<button type="button" class="chip ${R.login===o[0]?'on':''}" aria-pressed="${R.login===o[0]}" data-ref="login|${o[0]}">${esc(o[1])}</button>`).join('')}</div></details>`}
const pick=`<details class="more" data-t="_pick" ${(OPEN._pick??!intent)?'open':''}><summary>${BL.pick}</summary><p class="note">${BL.pickP}</p><label>${esc(L.catalog.search)}<input id="bs" type="search" placeholder="${esc(L.catalog.searchPh)}" value="${esc(q)}" autocomplete="off"></label>${G().GR.map(g=>`<h4>${esc(g.name)}</h4><div class="chips">${G().T.filter(t=>g.cats.includes(t.cat)).map(t=>`<button type="button" class="chip pick ${b.items[t.slug]?'on':''}" aria-pressed="${!!b.items[t.slug]}" data-pick="${t.slug}" data-n="${esc((t.name+' '+t.desc).toLowerCase())}" ${q&&!(t.name+' '+t.desc).toLowerCase().includes(q)?'hidden':''}>${esc(t.name)}</button>`).join('')}</div>`).join('')}</details><p id="gmsg" class="note" aria-live="polite"></p>`;
return tiles+mid+pick}
/* ---------- per-type details (advanced, optional) ---------- */
function item(s){const t=G().S[s],it=B().items[s],P='items.'+s+'.',mods=[...new Set([...t.core,...t.extra])],open=OPEN[s]??!Object.keys(it).length;
return `<details data-t="${s}" ${open?'open':''}><summary>${esc(t.name)}</summary>${t.r?`<p class="note">${esc(L.rnote)}</p>`:''}
<h4>${BL.modules}</h4><p class="note">${BL.modulesNote}</p><div class="chips">${mods.map(m=>{const v=(it.mods||{})[m];return `<button type="button" class="chip ${v===1?'m':v===2?'nth':''}" data-mod="${s}|${esc(m)}">${esc(m)}${v===1?' · must':v===2?' · nice':''}</button>`}).join('')}</div>
<h4>${BL.users}</h4>${ms(P+'users',O.users)}${sel(P+'scale',BL.scale,O.scale)}
<h4>${BL.have}</h4>${ms(P+'have',O.have)}${inp(P+'haveLinks',BL.haveLinks)}
<h4>${BL.integ}</h4>${ms(P+'integ',O.integ)}${inp(P+'integOther',BL.integOther)}
<h4>${BL.langs}</h4><label>${BL.langAdd}<input data-lang="${s}" list="dl-lang" placeholder="Type to search" dir="auto"></label><div class="chips">${(it.langs||[]).map(l=>`<button type="button" class="chip on" data-rmlang="${s}|${esc(l)}" aria-label="Remove ${esc(l)}">${esc(l)} ✕</button>`).join('')}</div><label><span><input type="checkbox" style="inline-size:auto" data-p="${P}rtl" ${it.rtl?'checked':''}> ${BL.rtl}</span></label>${inp(P+'countries',BL.countries)}
${sel(P+'threeD',BL.threeD,O.threeD)}
<h4>${BL.mood}</h4>${ms(P+'mood',O.mood)}${[0,1,2].map(i=>inp(P+'r'+i,BL.refLink+' '+(i+1),'url')).join('')}${inp(P+'avoid',BL.avoid)}
<label>${BL.describe}<textarea data-p="${P}text" data-cnt="c-${s}" maxlength="2000" rows="4">${esc(it.text||'')}</textarea><span class="note" id="c-${s}">${(it.text||'').length}/2000</span></label></details>`}
const types=()=>{const k=Object.keys(B().items);return k.length?k.map(item).join(''):`<p class="note">${BL.noTypes}</p>`};
const p3=()=>{ens();return `<p class="note">${BL.required}</p><label><span>${unsure()?'Anything you already know about the project (optional)':BL.goalLabel}${star('project.goal')}</span><textarea data-p="project.goal" rows="4" maxlength="2000" ${bad('project.goal')} placeholder="${esc(BL.goalPh)}">${esc(val('project.goal'))}</textarea>${fe('project.goal')}</label>${sel('project.launch',BL.launch,O.launch)}<p class="note">${L.pref}</p><details class="more" data-t="_more" ${OPEN._more?'open':''}><summary>${BL.adv}</summary><p class="note">${BL.advP}</p><div class="two">${inp('project.industry',BL.industry,'text','',160)}${inp('project.success',BL.success,'text','',400)}</div><div class="two">${inp('project.systems',BL.systems,'text','',400)}${inp('project.stake',BL.stake,'number','min="1" max="999"')}</div><h3>${BL.perType}</h3>${types()}</details>`};
const p4=()=>`<p class="note">${BL.required}</p><div class="two">${inp('you.name',BL.name,'text','autocomplete="name"',120)}${inp('you.email',BL.email,'email','autocomplete="email"',200)}</div><div class="two">${inp('you.company',BL.company,'text','autocomplete="organization"',160)}${inp('you.country',BL.country,'text','autocomplete="country-name"',100)}</div><div class="two">${inp('you.role',BL.role,'text','',120)}${inp('you.phone',BL.phone,'tel','autocomplete="tel"',40)}</div><label class="hp" aria-hidden="true">Website<input name="website" data-p="you.website" tabindex="-1" autocomplete="off"></label><label><span><input type="checkbox" style="inline-size:auto" data-p="you.consent" ${val('you.consent')?'checked':''} ${bad('you.consent')}> ${fillC()} <i class="rq" title="Required">*</i></span>${fe('you.consent')}</label>`;
const fillC=()=>BL.consent.replace('{privacy}',`<a href="#/privacy">${BL.privacy}</a>`);
function p5(){ens();const h=C().meetingHours,sl=i=>{const s=B().meet.slots[i]||{};return `<fieldset><legend>${i?BL.backup+' '+i:BL.pref1}</legend><div class="three">${inp('meet.slots.'+i+'.d',BL.date,'date','min="'+today()+'"')}${inp('meet.slots.'+i+'.f',BL.from,'time')}${inp('meet.slots.'+i+'.t',BL.to,'time')}</div><p class="note" aria-live="polite">${esc(conv(s.d,s.f))}${s.d&&s.f&&!inHours(s.d,s.f)?' · '+BL.outside:''}</p></fieldset>`};
return `<p>${BL.tz}: <strong dir="ltr">${esc(tz())}</strong>. ${BL.studioTz}: <strong dir="ltr">${esc(C().ownerTimezone)}</strong>.${h?` ${BL.hours}: <span dir="ltr">${esc(h.from)}–${esc(h.to)}</span>.`:''}</p>${sel('meet.dur',BL.dur,O.duration)}${sl(0)}<details class="more" data-t="_slots" ${OPEN._slots?'open':''}><summary>${BL.backupMore}</summary>${sl(1)}${sl(2)}</details>${inp('meet.lang',BL.callLang,'text','',80)}${C().bookingUrl?`<a class="btn" href="${esc(C().bookingUrl)}" rel="noopener">${L.cta.book}</a>`:''}<p>${BL.teams}</p>`}
/* ---------- checks, validation ---------- */
const hasStart=()=>!!(B().project.intent||Object.keys(B().items).length);
const checks=()=>{const r=checks0();return acct?r.filter(x=>x[2]<=2):r};const checks0=()=>{ens();const b=B(),y=b.you,p=b.project,c=BL.checks;return [[c[0],hasStart(),1],...(unsure()?[]:[[c[1],!!(p.goal||'').trim(),2]]),[c[2],!!(y.name||'').trim(),3],[c[3],EM.test(y.email||''),3],[c[4],!!(y.company||'').trim(),3],[c[5],!!(y.country||'').trim(),3],[c[6],!!y.consent,3],[c[7],slots().length>0&&!slotErr(slots()[0]),4]]};
const need=n=>{ens();const b=B(),y=b.you,p=b.project,e={};if(acct&&(n===3||n===4))return e;
if(n===1){if(!hasStart())e._types=BL.pickNone;else if(p.intent&&p.intent!=='unsure'&&!Object.keys(b.items).length)e._types=BL.pickNone}
if(n===2&&!unsure()&&!(p.goal||'').trim())e['project.goal']=BL.goalMiss;
if(n===3){if(!(y.name||'').trim()||y.name.trim().length<2)e['you.name']='Please enter your full name.';if(!EM.test(y.email||''))e['you.email']='Please enter a valid work email.';if(!(y.company||'').trim())e['you.company']='Please enter your company.';if(!(y.country||'').trim()||y.country.trim().length<2)e['you.country']='Please enter your country.';if((y.phone||'').trim()&&!PH.test(y.phone.trim()))e['you.phone']=BL.phoneBad;if(!y.consent)e['you.consent']='Please accept the privacy policy to continue.'}
if(n===4){const sl=B().meet.slots;sl.forEach((s,i)=>{const any=s&&(s.d||s.f||s.t);if(i===0||any){const m=slotErr(s);if(m)e['meet.slots.'+i+'.d']=m}})}
return e};
const errBox=()=>Object.keys(ferr).length?`<p class="err errsum" role="alert">${esc(ferr._types||'Please complete the details marked below to continue.')}</p>`:'';
const go=t=>{t=Math.min(5,Math.max(1,t));if(t>step){for(let n=step;n<t;n++){ferr=need(n);if(Object.keys(ferr).length){step=n;rr(false);const e=$('[aria-invalid="true"]');if(e){e.focus({preventScroll:true});e.scrollIntoView({block:'center',behavior:G().reduced?'auto':'smooth'})}else{const q=$('.errsum');q&&q.scrollIntoView({block:'center'})}return}}}ferr={};step=t;rr();scrollTo(0,0)};
const pct=()=>{const c=checks();return Math.round(c.filter(x=>x[1]).length/c.length*100)};
const mustCount=()=>Object.values(B().items).reduce((n,i)=>n+Object.values(i.mods||{}).filter(v=>v===1).length,0);
function side(){const k=Object.keys(B().items);return `<h3>${BL.mine}</h3>${k.length?`<ul class="m">${k.map(s=>`<li>${esc(G().S[s]?.name||s)}</li>`).join('')}</ul>`:`<p class="note">${BL.noTypes}</p>`}<p class="note">${esc(G().fill(BL.typesN,{n:k.length}))} · ${mustCount()} must-have</p><div class="meter" role="progressbar" aria-label="${esc(BL.mine)}" aria-valuenow="${pct()}" aria-valuemin="0" aria-valuemax="100"><i style="inline-size:${pct()}%"></i></div><p class="note">${esc(G().fill(BL.complete,{n:pct()}))}</p><button type="button" class="btn" data-reset>${BL.reset}</button>`}
/* ---------- summary text (always English, for the studio) ---------- */
function sumText(ref){ens();const b=B(),y=b.you,p=b.project,gl=(BL.goals.find(g=>g[0]===p.intent)||[])[1]||'',o=[`CULMERA project brief${ref?' '+ref:''}`,'',`Name: ${y.name||''}`,`Email: ${y.email||''}`,`Company: ${y.company||''}${y.role?' ('+y.role+')':''}`,`Country: ${y.country||''}`,...(y.phone?[`Phone: ${y.phone}`]:[]),'',...(gl?[`Starting point: ${gl}`]:[]),`Goal: ${p.goal||''}`,`Timing preference: ${p.launch||''} (a preference, not a commitment)`,'','Types:'];
if(!Object.keys(b.items).length)o.push('- None chosen yet: discovery conversation recommended');
for(const [s,i] of Object.entries(b.items)){o.push(`- ${G().S[s]?.name||s}`);const m=Object.entries(i.mods||{});if(m.length)o.push('  Modules: '+m.map(([k,v])=>k+(v===1?' (must)':' (nice)')).join(', '));if(i.threeD)o.push('  3D & motion: '+i.threeD);if(i.text)o.push('  Notes: '+i.text)}
if(!acct){o.push('','Meeting ('+dur()+' min, visitor timezone '+tz()+'):');slots().forEach(s=>o.push(`- ${s.d} ${s.f}-${s.t}`));o.push('Call language: '+(b.meet.lang||''))}return o.join('\n')}
const rev=()=>{const c=checks(),ok=c.every(x=>x[1]);return `<p>${ok?BL.ok:BL.missing}</p><ul class="m">${c.map(x=>`<li>${x[1]?'✓':'○'} ${esc(x[0])}${x[1]?'':` <button type="button" class="btn" data-step="${x[2]}">${BL.fix}</button>`}</li>`).join('')}</ul><details class="more" data-t="_sum"><summary>${BL.seeFull}</summary><pre class="card cb" dir="auto" style="white-space:pre-wrap">${esc(sumText(''))}</pre><p>${[1,2,3,4].filter(i=>seq().includes(i)).map(i=>`<button type="button" class="btn" data-step="${i}">${BL.edit} ${esc(STEPS[i-1])}</button>`).join(' ')}</p></details>${sendArea()}`};
/* ---------- result screens ---------- */
function done(){const r=sent,ref=r.ref||'',em=C().email;const sub=encodeURIComponent(`Project brief ${ref||'(not saved online)'}: ${B().you.company||''}`),body=encodeURIComponent(sumText(ref).slice(0,1500)+'\n\nPlease attach the PDF.');
const why=r.reason==='offline'?L.offline:r.reason==='config'?L.notConnected:BL.serverErr;
const acts=`<p style="display:flex;gap:.8rem;flex-wrap:wrap;max-inline-size:none">${r.saved?'':`<button type="button" class="btn p" data-retry>${BL.retry}</button>`}<a class="btn ${r.saved?'p':''}" href="mailto:${esc(em)}?subject=${sub}&body=${body}">${BL.emailBrief}</a> <button type="button" class="btn" data-act="pdf">${BL.pdf}</button> <button type="button" class="btn" data-act="copy">${BL.copy}</button></p><p class="note" id="amsg" aria-live="polite">${r.saved?BL.pdfHint:BL.pdfHintFail}</p>`;
return `<section class="wrap pad tight hdrline done" style="max-inline-size:960px"><h1 class="h1s" tabindex="-1" id="dh">${r.saved?BL.doneH:BL.failH}</h1>${r.saved?`<p class="lead-p">${BL.doneP}</p><p class="note" style="margin-block-end:.2rem">${BL.refNo}</p><div class="ref" dir="ltr" aria-label="${esc(BL.refNo)} ${esc(ref)}">${esc(ref)}</div><p>${r.client==='sent'?BL.confirmSent:BL.confirmNone}</p><h2 class="h2s">${BL.nextH}</h2><ol class="next">${BL.nextSteps.map(s=>`<li><b>${s[0]}</b>${s[1]}</li>`).join('')}</ol><h2 class="h2s">${BL.contactH}</h2><p>${BL.contactP.replace('{email}',`<a href="mailto:${esc(em)}">${esc(em)}</a>`)}</p>`:`<p class="err errsum" role="alert">${esc(why)} ${esc(L.notSaved)}</p>`}${acts}<button type="button" class="btn" data-reset>${BL.newBrief}</button></section>`}
function lay(){ens();if(sent)return sent.acct?doneAcct():done();const gate=gateView();if(gate)return gate;const P=[p1,p3,p4,p5,rev][step-1];return `<section class="wrap pad tight hdrline" id="bp"><h1 class="h1s">${BL.title}</h1>${top()}${banner&&!signed()?`<div class="card cb" role="status" style="margin-block-end:1.5rem"><p>${BL.resume}</p><button type="button" class="btn" data-resume>${BL.continue}</button> <button type="button" class="btn" data-reset>${BL.startOver}</button></div>`:''}<div class="bl"><nav class="st" aria-label="${esc(BL.title)}"><ol>${seq().map((n,k)=>`<li><button type="button" data-step="${n}" class="${step===n?'on':''} ${step>n?'ok':''}" ${step===n?'aria-current="step"':''}><i>${k+1}</i>${esc(STEPS[n-1])}</button></li>`).join('')}</ol></nav><div><div class="bprog"><span>${esc(G().fill(BL.stepOf,{n:pos()+1,t:seq().length}))}</span><div class="meter" role="progressbar" aria-label="${esc(BL.title)}" aria-valuenow="${pos()+1}" aria-valuemin="1" aria-valuemax="${seq().length}"><i style="inline-size:${(pos()+1)/seq().length*100}%"></i></div></div><h2 id="bh" tabindex="-1">${esc(STEPS[step-1])}</h2><p class="why">${acct&&step===5?L.pb.whyReview:BL.why[step-1]}</p>${errBox()}${P()}<p class="row btnrow">${pos()>0?`<button type="button" class="btn" data-go="-1">${BL.back}</button>`:'<span></span>'}${pos()<seq().length-1?`<button type="button" class="btn p" data-go="1">${BL.nextBtn}</button>`:''}</p></div><aside class="sum" id="sum" aria-label="${esc(BL.mine)}">${side()}</aside></div><datalist id="dl-lang">${LANGS.map(l=>`<option value="${l}">`).join('')}</datalist></section>`}
const rr=(f=true)=>{const a=$('#app');a.innerHTML=lay();if(f){const h=$('#bh')||$('#dh');h&&h.focus({preventScroll:true})}G().upd();if(step===5&&!sent)tsRender('#ts')};
/* ---------- Cloudflare Turnstile ---------- */
let tsId=null;
function tsRender(sel){if(!C().turnstileSiteKey||!$(sel))return;const go=()=>{const e=$(sel);if(!e||e.dataset.r||!window.turnstile)return;e.dataset.r=1;try{tsId=turnstile.render(sel,{sitekey:C().turnstileSiteKey,theme:'dark',language:L.lang})}catch(x){}};if(window.turnstile)return go();if(!window.__tsl){window.__tsl=1;const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=()=>go();document.head.appendChild(s)}else{const t=setInterval(()=>{if(window.turnstile){clearInterval(t);go()}},200);setTimeout(()=>clearInterval(t),15000)}}
const tsToken=()=>{try{return window.turnstile&&tsId!=null?(turnstile.getResponse(tsId)||''):''}catch(e){return ''}};
const tsReset=()=>{try{window.turnstile&&tsId!=null&&turnstile.reset(tsId)}catch(e){}};
function pdf(ref){const t=sumText(ref),f=document.createElement('iframe');f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;inline-size:0;block-size:0;border:0;opacity:0';document.body.appendChild(f);const w=f.contentWindow,d=w.document;d.open();d.write('<!doctype html><html lang="'+L.lang+'" dir="'+document.documentElement.dir+'"><head><meta charset="utf-8"><title>CULMERA-brief-'+esc(ref||'draft')+'</title><style>body{font:14px/1.6 system-ui,"Segoe UI",Tahoma,Arial,sans-serif;margin:24px;color:#111}pre{white-space:pre-wrap;word-wrap:break-word;font:inherit;unicode-bidi:plaintext}</style></head><body><pre dir="auto">'+esc(t)+'</pre></body></html>');d.close();w.onafterprint=()=>f.remove();setTimeout(()=>{try{w.focus();w.print()}catch(e){f.remove()}},300);setTimeout(()=>f.remove(),120000)}
/* ---------- API: a save is only reported when the API confirms it ---------- */
const apiReady=()=>{const u=C().api;return !!u&&!/\.example(\/|$)/.test(u)};
async function postApi(b){if(!apiReady())return{ok:false,reason:'config'};const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
try{const r=await fetch(C().api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),signal:c.signal}),j=await r.json().catch(()=>null);
if(r.ok&&j&&j.ok===true&&j.saved===true&&/^(BR|CT)-[A-Z0-9]{6}$/.test(String(j.ref||'')))return{ok:true,j};
const fixable=r.status===400||r.status===429||r.status===413;return{ok:false,reason:fixable?'fixable':'server',error:j&&typeof j.error==='string'?j.error:''}}
catch(e){return{ok:false,reason:'offline'}}finally{clearTimeout(t)}}
async function send(btn){errs=[];const c=checks().filter(x=>!x[1]);if(c.length)errs=c.map(x=>x[0]);
else{for(const s of slots()){const m=slotErr(s);if(m){errs=[m];break}}}
const tk=tsToken();if(!errs.length&&C().turnstileSiteKey&&!tk)errs=[BL.tsMissing];
if(errs.length){rr(false);return}
busy=true;btn.disabled=true;btn.textContent=BL.sending;
const b=B(),y=b.you,items=Object.entries(b.items).map(([slug,i])=>({slug,...i,refs:[i.r0,i.r1,i.r2].filter(Boolean)}));
const res=await postApi({type:'brief',website:y.website||'',elapsed:Math.round((Date.now()-T0)/1000),turnstile:tk,name:y.name,email:y.email,company:y.company,role:y.role,country:y.country,phone:y.phone,timezone:tz(),project:{...b.project,company:b.project.company||y.company},meet:{...b.meet,slots:slots()},items});
busy=false;
if(res.ok){const n=(res.j.notifications||{});sent={saved:true,ref:res.j.ref,client:n.client};rr();return}
if(res.reason==='fixable'){errs=[res.error||BL.serverErr];tsReset();rr(false);const e=$('#err');e&&e.scrollIntoView({block:'center'});return}
sent={saved:false,reason:res.reason};rr()}

/* ---------- signed-in clients: autosaving brief (Phase 3, step 2) ----------
   Working copy = the same draft object the public wizard uses (G().B). Saved to public.client_briefs through the user's own token,
   so Row Level Security decides what is allowed. Answers are stored as slugs and option values, which are identical in every language. */
const AU=()=>window.CulmeraAuth,PB=L.pb,enc=encodeURIComponent,signed=()=>!!(AU()&&AU().has());
const SYNC='culmera.brief.sync',LOCALES=['en','ar','de','zh','fr','ru'],pickLoc=()=>LOCALES.includes(L.lang)?L.lang:'en';
const lget=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lset=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
const hash=t=>{let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return String(h)};
let sv={st:'idle',at:null,t:null,pend:false,flight:false,tries:0};
const seq=()=>acct?[1,2,5]:[1,2,3,4,5],pos=()=>Math.max(0,seq().indexOf(step));
/* whitelist + trim: used both when saving and when loading, so stored data is always clean */
const TS=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'',IN=(v,a)=>typeof v==='string'&&a.includes(v),AIN=(v,a)=>Array.isArray(v)?[...new Set(v.filter(x=>IN(x,a)))]:[];
function cleanItem(s,i){const t=G().S[s],mods=new Set([...t.core,...t.extra]),o={},m={};
for(const [k,v] of Object.entries(i.mods||{}))if(mods.has(k)&&(v===1||v===2))m[k]=v;if(Object.keys(m).length)o.mods=m;
const A=(k,a)=>{const x=AIN(i[k],a);if(x.length)o[k]=x},S=(k,n)=>{const x=TS(i[k],n);if(x)o[k]=x};
A('users',O.users);if(IN(i.scale,O.scale))o.scale=i.scale;A('have',O.have);S('haveLinks',300);A('integ',O.integ);S('integOther',300);
const lg=Array.isArray(i.langs)?[...new Set(i.langs.map(x=>TS(x,60)).filter(Boolean))].slice(0,70):[];if(lg.length)o.langs=lg;
if(i.rtl)o.rtl=true;S('countries',300);if(IN(i.threeD,O.threeD))o.threeD=i.threeD;A('mood',O.mood);['r0','r1','r2'].forEach(k=>S(k,500));S('avoid',300);S('text',2000);return o}
function clean(a){a=a&&typeof a==='object'?a:{};const p=a.project||{},r=a.refine||{},pr={},rf={};
if(IN(p.intent,O.intents))pr.intent=p.intent;[['launch',O.launch]].forEach(([k,l])=>{if(IN(p[k],l))pr[k]=p[k]});
[['goal',2000],['industry',160],['success',400],['systems',400]].forEach(([k,n])=>{const x=TS(p[k],n);if(x)pr[k]=x});const st=TS(String(p.stake??''),4);if(/^[1-9]\d{0,2}$/.test(st))pr.stake=st;
if(IN(r.who,BL.who.map(x=>x[0])))rf.who=r.who;if(IN(r.scale,O.scale))rf.scale=r.scale;if(IN(r.login,BL.login.map(x=>x[0])))rf.login=r.login;
const items={};for(const [s,i] of Object.entries(a.items||{}))if(G().S[s]&&i&&typeof i==='object')items[s]=cleanItem(s,i);return{project:pr,refine:rf,items}}
const toAnswers=()=>{ens();const b=B();return{v:1,...clean({project:b.project,refine:b.refine,items:b.items})}};
const apply=c=>{const b=B();b.project=c.project;b.refine=c.refine;b.items=c.items;G().rawSave()};
const merge=(srv,loc)=>({project:{...loc.project,...srv.project},refine:{...loc.refine,...srv.refine},items:{...loc.items,...srv.items}});
const mark=id=>lset(SYNC,JSON.stringify({id,h:hash(JSON.stringify(toAnswers()))}));
const fillYou=()=>{if(!acct||!acct.me)return;const b=B();b.you={name:acct.me.name,email:acct.me.email,company:acct.me.company,country:acct.me.country,phone:acct.me.phone||'',consent:true}};
/* ---------- status line and saving ---------- */
const svText=()=>sv.st==='saving'?PB.saving:sv.st==='saved'&&sv.at?G().fill(PB.savedAt,{t:new Intl.DateTimeFormat(L.locale,{timeStyle:'short'}).format(sv.at)}):sv.st==='error'?(sv.big?PB.big:PB.notSaved):'';
function setSv(st,x){sv.st=st;if(st!=='error')sv.big=false;Object.assign(sv,x||{});const e=$('#svst'),b=$('#svretry');if(e)e.textContent=svText();if(b)b.hidden=sv.st!=='error'||!!sv.big}
function queueSave(){if(!acct||acct.role!=='client'||acct.locked)return;sv.pend=true;clearTimeout(sv.t);sv.t=setTimeout(flush,1200);setSv('saving')}
async function flush(){if(!acct||acct.role!=='client'||acct.locked||sv.flight||!sv.pend)return;
const ans=toAnswers(),js=JSON.stringify(ans);if(js.length>190000){sv.pend=false;setSv('error',{big:true});return}
if(!acct.id&&!Object.keys(ans.items).length&&!Object.keys(ans.project).length&&!Object.keys(ans.refine).length){sv.pend=false;setSv('idle');return}
sv.flight=true;sv.pend=false;const s=await AU().session();if(!s){sv.flight=false;sv.pend=true;setSv('error');return}
const body={answers:ans,selected_types:Object.keys(ans.items),locale:pickLoc()},ka=document.hidden&&js.length<60000;
const r=acct.id?await AU().restW('client_briefs?id=eq.'+enc(acct.id),s,{method:'PATCH',prefer:'return=representation',body,keepalive:ka}):await AU().restW('client_briefs',s,{method:'POST',prefer:'return=representation',body:{client_id:acct.uid,status:'draft',...body},keepalive:ka});
sv.flight=false;
if(r.ok&&Array.isArray(r.data)&&r.data[0]){const row=r.data[0];acct.id=row.id;acct.ref=row.ref;acct.status=row.status;lset(SYNC,JSON.stringify({id:row.id,h:hash(js)}));sv.tries=0;sv.zero=0;sv.at=new Date();setSv(sv.pend?'saving':'saved');if(sv.pend)sv.t=setTimeout(flush,300);return}
if(r.ok){/* nothing updated: the team has moved this brief on, so the database no longer lets the client edit it */sv.zero=(sv.zero||0)+1;sv.pend=false;if(sv.zero>2){setSv('error');return}await initAcct();return}
sv.pend=true;sv.tries++;setSv('error');if(sv.tries<=4)sv.t=setTimeout(flush,Math.min(30000,2000*2**sv.tries))}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&acct&&sv.pend){clearTimeout(sv.t);flush()}});
addEventListener('online',()=>{if(acct&&sv.pend){sv.tries=0;flush()}});
/* ---------- loading the account, the brief, and reconciling with this device ---------- */
async function initAcct(){const s=await AU().session();if(!s){if(signed()){acct={err:true,uid:null};if($('#bp'))rr(false)}else{acct=null;if(/^#\/?brief/.test(location.hash))location.hash='#/signin'}return}
const uid=s.user.id,rest=p=>AU().rest(p,s);
const pr=await rest('profiles?select=full_name,role,status,email&id=eq.'+enc(uid));
if(!pr.ok||!pr.data[0]){acct={err:true,uid};if($('#bp'))rr(false);return}
const me=pr.data[0];if(me.status!=='active'){await AU().signOut();location.hash='#/signin';location.reload();return}
if(me.role!=='client'){acct={uid,role:me.role,staff:true};if($('#bp'))rr(false);return}
const [cl,br]=await Promise.all([rest('clients?select=company,country,phone&profile_id=eq.'+enc(uid)),rest('client_briefs?select=id,ref,status,answers,updated_at,submitted_at&order=updated_at.desc&limit=1')]);
if(!br.ok){acct={err:true,uid};if($('#bp'))rr(false);return}
const c=(cl.ok&&cl.data[0])||{},b0=br.data[0]||null;
acct={uid,role:'client',me:{name:me.full_name||'',email:me.email||s.user.email||'',company:c.company||'',country:c.country||'',phone:c.phone||''},id:null,ref:null,status:null,locked:false,submittedAt:null};
if(!G().rawSave){const raw=G().save;G().rawSave=raw;G().save=()=>{raw();queueSave()}}
ens();fillYou();banner=false;
const loc=toAnswers(),lh=hash(JSON.stringify(loc)),hasLoc=Object.keys(loc.items).length||loc.project.intent||loc.project.goal;
let mk=null;try{mk=JSON.parse(lget(SYNC)||'null')}catch(e){}
if(!b0){if(hasLoc)queueSave()}
else{acct.id=b0.id;acct.ref=b0.ref;acct.status=b0.status;acct.submittedAt=b0.submitted_at;const srv=clean(b0.answers);
if(!['draft','submitted'].includes(b0.status)){acct.locked=true;apply(srv);mark(b0.id)}
else if(mk&&mk.id===b0.id){if(mk.h!==lh)queueSave();else{apply(srv);mark(b0.id)}}
else if(!hasLoc){apply(srv);mark(b0.id)}
else{apply(merge(srv,loc));queueSave()}}
if($('#bp')&&location.hash.replace(/^#\/?/,'')==='brief')rr(false)}
function startNew(){if(!acct||acct.role!=='client')return;acct.id=null;acct.ref=null;acct.status=null;acct.locked=false;acct.submittedAt=null;sent=null;step=1;ferr={};errs=[];OPEN={};
const b=B();for(const k of Object.keys(b))delete b[k];b.items={};fillYou();G().rawSave();lset(SYNC,null);sv={st:'idle',at:null,t:null,pend:false,flight:false,tries:0};rr()}
/* ---------- views ---------- */
const shell=(h,p,x='')=>`<section class="wrap pad tight hdrline" id="bp" style="max-inline-size:760px"><h1 class="h1s">${esc(BL.title)}</h1><h2 class="h2s" id="bh" tabindex="-1">${esc(h)}</h2>${p?`<p>${p}</p>`:''}${x}</section>`;
function gateView(){if(!signed())return '';
if(!acct)return shell(PB.loading,'');
if(acct.err)return shell(PB.loadErr,'',`<p><button type="button" class="btn p" data-acctretry>${esc(PB.tryAgain)}</button></p>`);
if(acct.staff)return shell(PB.staffH,esc(G().fill(PB.staffP,{role:L.auth.roles[acct.role]||acct.role})),`<p><a class="btn" href="#/account">${esc(L.auth.account)}</a></p>`);
if(acct.locked){const em=C().email;return `<section class="wrap pad tight hdrline" id="bp" style="max-inline-size:960px"><h1 class="h1s">${esc(BL.title)}</h1><h2 class="h2s" id="bh" tabindex="-1">${esc(PB.lockedH)}</h2><p>${esc(G().fill(PB.lockedP,{status:L.auth.st[acct.status]||acct.status,email:em}))}</p><div class="ref" dir="ltr">${esc(acct.ref||'')}</div><pre class="card cb" dir="auto" style="white-space:pre-wrap">${esc(sumText(acct.ref||''))}</pre><p><button type="button" class="btn p" data-newbrief>${esc(PB.another)}</button> <a class="btn" href="#/account">${esc(L.auth.account)}</a></p></section>`}
return ''}
function top(){if(!signed())return `<div class="card cb" role="note" style="margin-block-end:1.5rem"><h2 class="h2s" style="margin-block-start:0">${esc(PB.hintH)}</h2><p>${esc(PB.hintP)}</p><p><a class="btn p" href="#/signup">${esc(PB.hintUp)}</a> <a class="btn" href="#/signin">${esc(PB.hintIn)}</a></p></div>`;
if(!acct||acct.role!=='client')return '';
const d=acct.submittedAt?new Intl.DateTimeFormat(L.locale,{dateStyle:'medium'}).format(new Date(acct.submittedAt)):'';
return `${acct.status==='submitted'?`<p class="note" role="status">${esc(G().fill(PB.subNote,{d}))}</p>`:''}<p class="note" id="svrow"><span id="svst" role="status" aria-live="polite">${esc(svText())}</span> <button type="button" class="btn" id="svretry" data-svretry ${sv.st==='error'&&!sv.big?'':'hidden'}>${esc(PB.saveNow)}</button></p>`}
function sendArea(){if(acct&&acct.role==='client')return `<p class="err" id="err" role="alert">${errs.map(esc).join(' · ')}</p>${acct.status==='submitted'?`<p class="note" role="status">${esc(PB.subDone)}</p><p><a class="btn p" href="#/meeting">${esc(PB.bookCta)}</a> <a class="btn" href="#/account">${esc(PB.viewAcct)}</a></p>`:`<button type="button" class="btn p big" data-send>${esc(PB.submit)}</button>`}`;
return `${C().turnstileSiteKey?`<p class="note">${BL.tsHint}</p><div id="ts"></div>`:''}<p class="err" id="err" role="alert">${errs.map(esc).join(' · ')}</p><button type="button" class="btn p big" data-send>${BL.send}</button>`}
const doneAcct=()=>{const r=sent;return `<section class="wrap pad tight hdrline done" style="max-inline-size:960px"><h1 class="h1s" tabindex="-1" id="dh">${esc(PB.doneH)}</h1><p class="lead-p">${esc(PB.doneP)}</p><p class="note" style="margin-block-end:.2rem">${BL.refNo}</p><div class="ref" dir="ltr" aria-label="${esc(BL.refNo)} ${esc(r.ref)}">${esc(r.ref)}</div><p>${esc(G().fill(PB.doneNext,{email:acct.me.email}))}</p><h2 class="h2s">${BL.nextH}</h2><ol class="next">${PB.nextSteps.map(x=>`<li><b>${esc(x[0])}</b>${esc(x[1])}</li>`).join('')}</ol><h2 class="h2s">${BL.contactH}</h2><p>${BL.contactP.replace('{email}',`<a href="mailto:${esc(C().email)}">${esc(C().email)}</a>`)}</p><p><a class="btn p" href="#/meeting">${esc(PB.bookCta)}</a> <a class="btn" href="#/account">${esc(PB.viewAcct)}</a> <button type="button" class="btn" data-newbrief>${esc(PB.another)}</button></p></section>`};
/* ---------- submit: the only status change a client may make is draft -> submitted ---------- */
async function submitAcct(btn){errs=[];const c=checks().filter(x=>!x[1]);if(c.length){errs=c.map(x=>x[0]);rr(false);return}
busy=true;btn.disabled=true;btn.textContent=PB.submitting;clearTimeout(sv.t);while(sv.flight)await new Promise(r=>setTimeout(r,100));
const ans=toAnswers(),js=JSON.stringify(ans),fail=()=>{busy=false;errs=[PB.submitErr];rr(false);const e=$('#err');e&&e.scrollIntoView({block:'center'})};
if(js.length>190000){busy=false;errs=[PB.big];rr(false);return}
const s=await AU().session();if(!s)return fail();const body={answers:ans,selected_types:Object.keys(ans.items),locale:pickLoc()};
if(!acct.id){const r=await AU().restW('client_briefs',s,{prefer:'return=representation',body:{client_id:acct.uid,status:'draft',...body}});if(!(r.ok&&Array.isArray(r.data)&&r.data[0]))return fail();acct.id=r.data[0].id;acct.ref=r.data[0].ref}
const r=await AU().restW('client_briefs?id=eq.'+enc(acct.id),s,{method:'PATCH',prefer:'return=representation',body:{...body,status:'submitted'}});
if(!(r.ok&&Array.isArray(r.data)&&r.data[0]))return fail();
const row=r.data[0];acct.status=row.status;acct.submittedAt=row.submitted_at;acct.ref=row.ref;sv.pend=false;mark(row.id);busy=false;sent={saved:true,ref:row.ref,acct:true};try{AU().notify&&AU().notify('brief_submitted',row.id)}catch(e){}rr()}
/* ---------- legal and info pages ---------- */
const html=(t,b)=>`<section class="wrap pad tight hdrline" style="max-inline-size:900px"><h1 class="h1s">${t}</h1>${b}</section>`;
const legal=(o)=>{const intro=o.intro.replace('{legal}',C().legalName).replace('{country}',C().country);const mail=`<a href="mailto:${esc(C().email)}">${esc(C().email)}</a>`;
return html(o.h,`<p>${esc(intro)}</p>${o.blocks.map(b=>`<h2 class="h2s">${esc(b[0])}</h2><p>${esc(b[1].replace(/\{legal\}/g,C().legalName).replace(/\{country\}/g,C().country).replace('{email}','@@E@@')).replace('@@E@@',mail)}</p>`).join('')}`)};
const priv=()=>legal(L.privacy),terms=()=>legal(L.terms);
const howp=()=>html(L.nav.how,`<p class="lead-p">${esc(L.engage.lead)}</p>${G().how()}<h2 class="h2s">${esc(L.ready.h)}</h2><p>${esc(L.ready.lead)}</p><div class="pgrid">${L.ready.items.map(i=>`<article class="pr"><h3>${esc(i[0])}</h3><p>${esc(i[1])}</p></article>`).join('')}</div><h2 class="h2s">The discovery conversation</h2>${L.hfaq.map(q=>`<details><summary>${esc(q[0])}</summary><p>${esc(q[1])}</p></details>`).join('')}<p><a class="btn p" href="#/brief">${esc(L.cta.brief)}</a></p>`);
const about=()=>html(L.about.h,`<p class="lead-p">${esc(L.about.p)}</p><h2 class="h2s">Values</h2><ul class="m">${L.values.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><h2 class="h2s">${esc(L.about.big)}</h2><p>${esc(L.about.bigP)}</p><h2 class="h2s">${esc(L.team.h)}</h2><p>${esc(L.team.lead)}</p><div class="pgrid">${L.team.items.map(i=>`<article class="pr"><h3>${esc(i[0])}</h3><p>${esc(i[1])}</p></article>`).join('')}</div><p><a class="btn p" href="#/brief">${esc(L.cta.brief)}</a></p>`);
const LC=L.contact;
const contact=()=>{setTimeout(()=>tsRender('#cts'),0);return html(LC.h,`<p class="lead-p">${esc(LC.lead)}</p><p>Email: <a href="mailto:${esc(C().email)}">${esc(C().email)}</a>${C().phone?` · <span dir="ltr">${esc(C().phone)}</span>`:''}</p>${apiReady()?'':`<p class="note" role="status">${esc(L.notConnected)}</p>`}<div class="cform"><label>${LC.name}<input id="cn" autocomplete="name" maxlength="120"></label><label>${LC.email}<input id="ce" type="email" dir="ltr" autocomplete="email" maxlength="200"></label><label>${LC.message}<textarea id="cm" rows="5" maxlength="4000"></textarea></label><label class="hp" aria-hidden="true">Website<input id="cw" tabindex="-1" autocomplete="off"></label>${C().turnstileSiteKey?'<div id="cts"></div>':''}<p><button type="button" class="btn p" data-contact>${LC.send}</button></p><p id="cs" role="status" aria-live="polite"></p></div><p><a class="btn" href="#/brief">${esc(L.cta.brief)}</a></p>`)};
document.addEventListener('click',async e=>{const x=e.target.closest('button');if(!x)return;const d=x.dataset;
if(d.contact!==undefined){const g=i=>($('#'+i)||{}).value||'',s=$('#cs');if(g('cn').trim().length<2||!EM.test(g('ce').trim())||!g('cm').trim()){s.textContent=LC.fillAll;return}
if(C().turnstileSiteKey&&!tsToken()){s.textContent=BL.tsMissing;return}
x.disabled=true;x.textContent=LC.sending;s.textContent='';
const res=await postApi({type:'contact',name:g('cn'),email:g('ce'),message:g('cm'),website:g('cw'),turnstile:tsToken(),elapsed:Math.round((Date.now()-T0)/1000)});
x.disabled=false;x.textContent=LC.send;
if(res.ok){s.textContent=LC.ok;['cn','ce','cm'].forEach(i=>{$('#'+i).value=''});tsReset()}
else{tsReset();const why=res.reason==='offline'?L.offline:res.reason==='config'?L.notConnected:res.reason==='fixable'&&res.error?res.error:BL.serverErr;s.innerHTML=`${esc(LC.notSent)} ${esc(why)} <a href="mailto:${esc(C().email)}?subject=Message&body=${encodeURIComponent(g('cm').slice(0,1500))}">${esc(LC.emailInstead)}</a>.`}return}
if(d.act==='pdf'){try{await pdf(sent&&sent.ref)}catch(er){$('#amsg').textContent=BL.pdfErr}return}
if(d.act==='copy'){try{await navigator.clipboard.writeText(sumText(sent&&sent.ref));$('#amsg').textContent=BL.copied}catch(er){$('#amsg').textContent=BL.copyErr}return}
if(!$('#bp')&&!sent)return;
if(d.svretry!==undefined){sv.tries=0;sv.pend=true;flush();return}if(d.newbrief!==undefined){startNew();return}if(d.acctretry!==undefined){acct=null;initAcct();return}
if(d.goal){const p=B().project;p.intent=d.goal;G().save();delete ferr._types;rr(false);return}
if(d.ref){const [k,v]=d.ref.split('|'),r=B().refine;r[k]=r[k]===v?'':v;G().save();OPEN._ref=true;rr(false);return}
if(d.pick){delete ferr._types;const b=B();if(b.items[d.pick])delete b.items[d.pick];else{b.items[d.pick]={};OPEN[d.pick]=true}OPEN._pick=true;G().save();rr(false);return}
if(d.ms){const a=get(d.ms)||[];setP(d.ms,a.includes(d.v)?a.filter(v=>v!==d.v):[...a,d.v]);rr(false);return}
if(d.mod){const [s,m]=d.mod.split('|'),it=B().items[s];it.mods=it.mods||{};const v=it.mods[m];if(!v)it.mods[m]=1;else if(v===1)it.mods[m]=2;else delete it.mods[m];G().save();rr(false);return}
if(d.rmlang){const [s,l]=d.rmlang.split('|'),it=B().items[s];it.langs=(it.langs||[]).filter(v=>v!==l);G().save();rr(false);return}
if(d.step){go(+d.step);return}if(d.go){go(seq()[Math.min(seq().length-1,Math.max(0,pos()+ +d.go))]);return}
if(d.pkg!==undefined){delete ferr._types;const p=pkgs()[+d.pkg];if(p){const all=p.t.every(x=>B().items[x]);p.t.forEach(x=>{if(all)delete B().items[x];else if(!B().items[x]){B().items[x]={};OPEN[x]=true}});G().save();rr(false);const m=$('#gmsg');m&&(m.textContent=(all?'Removed: ':'Added: ')+p.n)}return}
if(d.resume!==undefined){banner=false;rr(false);return}
if(d.retry!==undefined){sent=null;step=5;errs=[];rr();return}
if(d.reset!==undefined){if(confirm(acct?L.pb.confirmClear:BL.confirmReset)){const b=B();for(const k of Object.keys(b))delete b[k];b.items={};if(acct)fillYou();G().save();sent=null;step=1;ferr={};banner=false;errs=[];OPEN={};rr();G().upd()}return}
if(d.send!==undefined&&!busy){acct&&acct.role==='client'?submitAcct(x):send(x)}});
const sync=e=>{const t=e.target;if(!$('#bp'))return;if(t.id==='bs'){const q=t.value.toLowerCase();setP('_q',q);document.querySelectorAll('[data-n]').forEach(b=>b.hidden=!!q&&!b.dataset.n.includes(q));return}
if(t.dataset.lang&&e.type==='change'){const v=t.value.trim();if(v){const it=B().items[t.dataset.lang];it.langs=[...new Set([...(it.langs||[]),v])];G().save();rr(false)}return}
if(!t.dataset.p)return;setP(t.dataset.p,t.type==='checkbox'?t.checked:t.value);if(ferr[t.dataset.p]&&(t.type==='checkbox'?t.checked:t.value.trim())){delete ferr[t.dataset.p];t.removeAttribute('aria-invalid');const f=t.closest('label');f&&f.querySelectorAll('.fe').forEach(x=>x.remove());if(!Object.keys(ferr).length){const q=$('.errsum');q&&q.remove()}}
if(e.type==='change'){const m=/^meet\.slots\.(\d)\.f$/.exec(t.dataset.p);if(m&&t.value){const sl=B().meet.slots[+m[1]]||{};if(!sl.t){const f=pHm(t.value),tot=f+dur(),v=tot>=1440?'23:59':String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');setP('meet.slots.'+m[1]+'.t',v);rr(false);return}}}
if(t.dataset.cnt)document.getElementById(t.dataset.cnt).textContent=t.value.length+'/2000';
if(e.type==='change'&&t.dataset.p.startsWith('meet.')){rr(false)}else{const s=$('#sum');if(s)s.innerHTML=side()}};
document.addEventListener('input',sync);document.addEventListener('change',sync);
document.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.t)OPEN[d.dataset.t]=d.open},true);
window.PAGES={brief:()=>{setTimeout(()=>{if(step===5&&!sent&&!signed())tsRender('#ts')},0);
if(signed()){const pk=AU().peek();if(acct&&(!pk||acct.uid!==pk.user.id))acct=null;if(sent&&sent.acct){sent=null;step=1}if(!acct||acct.err){acct=null;setTimeout(initAcct,0)}}else{acct=null;if(sent&&sent.acct)sent=null}
return lay()},'how-we-work':howp,about,contact,privacy:priv,terms};
window.PAGES.title={brief:BL.title,'how-we-work':L.nav.how,about:L.about.h,contact:LC.h,privacy:L.privacy.h,terms:L.terms.h};
})();
