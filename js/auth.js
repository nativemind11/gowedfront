/* CULMERA auth (Phase 3, step 1). No library: talks to Supabase Auth over HTTPS with the PUBLISHABLE key only.
   Flow: email + password, email confirmation, password reset, all with PKCE (hash routing would break the older
   hash-token links). Role is never sent from here: the database decides it (invitation, otherwise "client").
   Redirect target is always CFG.siteUrl, which must be listed under Supabase > Auth > URL Configuration. */
(()=>{
const A=L.auth,$=s=>document.querySelector(s),G=()=>window.GW,C=()=>G().C,esc=s=>G().esc(s),fill=(s,o)=>G().fill(s,o);
const SK='culmera.session',PK='culmera.pkce',RK='culmera.ref';
const st={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const EM=/^[^@\s]+@[^@\s]+\.[^@\s]+$/,SB=()=>C().supabase||{};
/* ---------- boot: ?ref=CODE (pre-fills sign-up) and ?code= (PKCE return from an email link) ---------- */
const q=new URLSearchParams(location.search);let pending=null,notice='';
const rf=(q.get('ref')||'').trim().toUpperCase();if(/^[A-Z0-9-]{3,20}$/.test(rf))try{sessionStorage.setItem(RK,rf)}catch(e){}
if(q.get('code')||q.get('error'))pending={code:q.get('code'),mode:q.get('auth')||'confirm',err:q.get('error_description')||q.get('error')};
else if(/^#error=/.test(location.hash)){const h=new URLSearchParams(location.hash.slice(1));pending={code:null,mode:'confirm',err:h.get('error_description')||h.get('error')}}
if(pending||q.has('ref')||q.has('auth')||q.has('code')){let h=location.hash;if(pending)h=pending.err?'#/signin':pending.mode==='recovery'?'#/new-password':'#/account';if(pending&&pending.err)notice=A.err.expired;history.replaceState(null,'',location.pathname+h)}
/* ---------- PKCE ---------- */
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function pkce(){const v=b64u(crypto.getRandomValues(new Uint8Array(32)));const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));st.set(PK,v);return{code_challenge:b64u(h),code_challenge_method:'s256'}}
const back=m=>C().siteUrl.replace(/\/$/,'')+'/?auth='+m;
/* ---------- HTTP ---------- */
async function api(path,{method='GET',body,token,headers,keepalive}={}){const c=SB();if(!c.url||!c.key)return{ok:false,status:0,data:{},cfg:true};
const ac=new AbortController(),t=setTimeout(()=>ac.abort(),15000),h={apikey:c.key,'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;if(headers)Object.assign(h,headers);
try{const r=await fetch(c.url+path,{method,signal:ac.signal,headers:h,keepalive:!!keepalive,body:body?JSON.stringify(body):undefined});let d={};try{d=await r.json()}catch(e){}return{ok:r.ok,status:r.status,data:d}}
catch(e){return{ok:false,status:0,data:{},offline:true}}finally{clearTimeout(t)}}
const why=r=>{if(r.cfg)return A.err.config;if(r.offline)return A.err.offline;const k=(r.data&&(r.data.error_code||r.data.error))||'';
return({invalid_credentials:A.err.invalid,email_not_confirmed:A.err.unconfirmed,weak_password:A.err.weak,same_password:A.err.same,over_request_rate_limit:A.err.rate,over_email_send_rate_limit:A.err.rate,captcha_failed:A.err.captcha,user_banned:A.err.suspended,otp_expired:A.err.expired,email_address_invalid:A.err.emailBad,validation_failed:A.err.emailBad,signup_disabled:A.err.generic})[k]||(r.status===429?A.err.rate:A.err.generic)};
/* ---------- session (stored in this browser only; refreshed automatically) ---------- */
const read=()=>{try{return JSON.parse(st.get(SK)||'null')}catch(e){return null}};
const setS=d=>st.set(SK,JSON.stringify({access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:{id:d.user&&d.user.id,email:d.user&&d.user.email}}));
let rp=null;
async function session(){const s=read();if(!s||!s.access_token)return null;if(s.expires_at-60>Date.now()/1000)return s;
if(!rp)rp=(async()=>{const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}});rp=null;
if(r.ok&&r.data.access_token){setS(r.data);return read()}if(r.status>=400&&r.status<500){st.del(SK);return null}return s.expires_at>Date.now()/1000?s:null})();return rp}
const rest=async(p,s)=>api('/rest/v1/'+p,{token:s.access_token});
/* write helper for the portal: restW('client_briefs?id=eq.X',s,{method:'PATCH',body:{...},prefer:'return=representation'}) */
const restW=async(p,s,o={})=>api('/rest/v1/'+p,{method:o.method||'POST',body:o.body,token:s.access_token,keepalive:o.keepalive,headers:o.prefer?{Prefer:o.prefer}:undefined});
const has=()=>{const s=read();return !!(s&&s.access_token)},peek=()=>read();
async function signOut(){const s=read();st.del(SK);st.del('culmera.brief');st.del('culmera.brief.sync');if(s)api('/auth/v1/logout',{method:'POST',token:s.access_token});hdr()}
async function exchange(){const p=pending;pending=null;const v=st.get(PK);if(!p||!p.code||!v)return{ok:false};
const r=await api('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:p.code,code_verifier:v}});st.del(PK);if(r.ok&&r.data.access_token){setS(r.data);return{ok:true}}return{ok:false}}
/* ---------- Cloudflare Turnstile (own widget; the API forwards the token to Supabase CAPTCHA) ---------- */
let tsId=null;
function ts(sel){if(!C().turnstileSiteKey||!$(sel))return;const go=()=>{const e=$(sel);if(!e||e.dataset.r||!window.turnstile)return;e.dataset.r=1;try{tsId=turnstile.render(sel,{sitekey:C().turnstileSiteKey,theme:'dark',language:L.lang})}catch(x){}};
if(window.turnstile)return go();if(!window.__tsl){window.__tsl=1;const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=go;document.head.appendChild(s)}else{const t=setInterval(()=>{if(window.turnstile){clearInterval(t);go()}},200);setTimeout(()=>clearInterval(t),15000)}}
const tok=()=>{try{return window.turnstile&&tsId!=null?(turnstile.getResponse(tsId)||''):''}catch(e){return ''}},tsReset=()=>{try{window.turnstile&&tsId!=null&&turnstile.reset(tsId)}catch(e){}};
const sec=()=>{const t=tok();return t?{gotrue_meta_security:{captcha_token:t}}:{}};
/* ---------- views ---------- */
const page=(t,b,w=640)=>`<section class="wrap pad tight hdrline" style="max-inline-size:${w}px"><h1 class="h1s">${esc(t)}</h1>${b}</section>`;
const msg=(id='am')=>`<p id="${id}" role="alert" aria-live="polite" class="note"></p>`;
const say=(t,ok)=>{const e=$('#am');if(e){e.textContent=t;e.style.color=ok?'':'#f0a3a3'}};
const lnk=(h,t)=>`<a href="${h}">${esc(t)}</a>`;
const fld=(id,l,o={})=>`<label>${esc(l)}<input id="${id}" type="${o.t||'text'}" ${o.ltr?'dir="ltr"':''} autocomplete="${o.ac||'off'}" maxlength="${o.max||200}" ${o.v?`value="${esc(o.v)}"`:''}></label>${o.h?`<span class="help">${esc(o.h)}</span>`:''}`;
const g=i=>(($('#'+i)||{}).value||'').trim();
const signup=()=>{setTimeout(()=>ts('#ats'),0);let rv='';try{rv=sessionStorage.getItem(RK)||''}catch(e){}
return page(A.upH,`<p class="lead-p">${esc(A.upLead)}</p><form class="cform aform" id="fup" novalidate>${fld('un',A.name,{ac:'name',max:120})}${fld('ue',A.email,{t:'email',ltr:1,ac:'email'})}${fld('up',A.password,{t:'password',ac:'new-password',max:72,h:A.pwHelp})}<div class="two">${fld('uc',A.company,{ac:'organization',max:160})}${fld('uk',A.country,{ac:'country-name',max:100})}</div><div class="two">${fld('uh',A.phone,{t:'tel',ltr:1,ac:'tel',max:40})}${fld('ur',A.code,{ltr:1,max:20,v:rv})}</div><span class="help">${esc(A.codeHelp)}</span><label class="chk"><input id="ux" type="checkbox"><span>${fill(esc(A.consent),{privacy:lnk('#/privacy',A.privacy),terms:lnk('#/terms',A.terms)})}</span></label>${C().turnstileSiteKey?'<div id="ats"></div>':''}${msg()}<p><button class="btn p" type="submit" id="ub">${esc(A.create)}</button></p></form><p>${esc(A.haveAcct)} ${lnk('#/signin',A.signIn)}</p>`)};
const signin=()=>{setTimeout(()=>ts('#ats'),0);const n=notice;notice='';
return page(A.signIn,`<p class="lead-p">${esc(A.inLead)}</p><form class="cform aform" id="fin" novalidate>${fld('ie',A.email,{t:'email',ltr:1,ac:'email'})}${fld('ip',A.password,{t:'password',ac:'current-password',max:72})}${C().turnstileSiteKey?'<div id="ats"></div>':''}<p id="am" role="alert" aria-live="polite" class="note" style="color:#f0a3a3">${esc(n)}</p><p><button class="btn p" type="submit" id="ib">${esc(A.signIn)}</button></p></form><p>${lnk('#/reset',A.forgot)}</p><p>${esc(A.noAcct)} ${lnk('#/signup',A.upH)}</p>`)};
const reset=()=>{setTimeout(()=>ts('#ats'),0);return page(A.rstH,`<p class="lead-p">${esc(A.rstLead)}</p><form class="cform aform" id="frs" novalidate>${fld('re',A.email,{t:'email',ltr:1,ac:'email'})}${C().turnstileSiteKey?'<div id="ats"></div>':''}${msg()}<p><button class="btn p" type="submit" id="rb">${esc(A.rstSend)}</button></p></form><p>${lnk('#/signin',A.signIn)}</p>`)};
const newpw=()=>{setTimeout(async()=>{if(pending){const r=await exchange();if(!r.ok){const a=$('#app');if(a&&location.hash==='#/new-password')a.innerHTML=page(A.newH,`<p role="alert">${esc(A.err.expired)}</p><p>${lnk('#/reset',A.rstH)}</p>`)}}},0);
return page(A.newH,`<form class="cform aform" id="fnp" novalidate>${fld('np',A.newPw,{t:'password',ac:'new-password',max:72,h:A.pwHelp})}${fld('np2',A.newPw2,{t:'password',ac:'new-password',max:72})}${msg()}<p><button class="btn p" type="submit">${esc(A.save)}</button></p></form>`)};
const dt=(s,z)=>{try{return new Intl.DateTimeFormat(L.locale,{dateStyle:'full',timeStyle:'short',timeZone:z||undefined}).format(new Date(s))}catch(e){return s}};
const account=()=>{setTimeout(fillAccount,0);return page(A.account,`<div id="acct" aria-live="polite"><p>${esc(pending?A.confH:A.loading)}</p></div>`,980)};
async function fillAccount(){const box=$('#acct');if(!box)return;let ok=true;
if(pending){const r=await exchange();ok=r.ok;if(!r.ok)notice=A.confFail}
const s=await session();if(!$('#acct'))return;if(!s){location.hash='#/signin';return}
const [p,c]=await Promise.all([rest('profiles?select=full_name,role,status,email&id=eq.'+encodeURIComponent(s.user.id),s),rest('clients?select=company,country,phone,code_used&profile_id=eq.'+encodeURIComponent(s.user.id),s)]);
if(!$('#acct'))return;const pr=p.ok&&p.data[0];
if(!pr){$('#acct').innerHTML=`<p role="alert">${esc(A.loadErr)}</p>`;return}
if(pr.status!=='active'){await signOut();notice=A.err.suspended;location.hash='#/signin';return}
const name=pr.full_name||pr.email||'';let h=`<p class="lead-p">${esc(fill(A.hi,{name}))}</p>`;
if(pr.role!=='client'){h+=`<p>${esc(fill(A.staff,{role:A.roles[pr.role]||pr.role}))}</p>`}
else{const cl=c.ok&&c.data[0]||{},[b,m]=await Promise.all([rest('client_briefs?select=ref,status,updated_at&order=updated_at.desc&limit=1',s),rest('meetings?select=starts_at,timezone,status&status=neq.cancelled&order=starts_at.desc&limit=1',s)]);if(!$('#acct'))return;
const br=b.ok&&b.data[0],mt=m.ok&&m.data[0];
h+=`<div class="acct"><div><h2>${esc(A.briefH)}</h2>${br?`<p><span dir="ltr">${esc(br.ref)}</span> · ${esc(A.st[br.status]||br.status)}</p>`:`<p>${esc(A.briefNone)}</p>`}<p><a class="btn p" href="#/brief">${esc(br?A.briefOpen:A.briefStart)}</a></p></div><div><h2>${esc(A.meetH)}</h2>${mt?`<p>${esc(dt(mt.starts_at))}</p><p class="note">${esc(A.tz)}: <span dir="ltr">${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span> · ${esc(A.mst[mt.status]||mt.status)}</p>`:`<p>${esc(A.meetNone)}</p>`}</div><div><h2>${esc(A.detailsH)}</h2><p>${esc(cl.company||'')}${cl.company&&cl.country?' · ':''}${esc(cl.country||'')}</p><p dir="ltr" style="text-align:start">${esc(pr.email||'')}</p><p class="note">${esc(cl.code_used?fill(A.refBy,{code:cl.code_used}):A.direct)}</p></div></div><h2 style="margin-block-start:2.5rem">${esc(A.nextH)}</h2><ol>${A.next.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p class="note">${esc(A.pricing)}</p>`}
h+=`<p style="margin-block-start:2rem"><button class="btn" type="button" data-so>${esc(A.signOut)}</button></p>`;$('#acct').innerHTML=(ok?'':`<p role="alert">${esc(notice)}</p>`)+h;notice='';hdr()}
/* ---------- events ---------- */
document.addEventListener('submit',async e=>{const f=e.target.closest('form.aform');if(!f)return;e.preventDefault();const b=f.querySelector('button[type=submit]');if(b.disabled)return;
const need=()=>{if(C().turnstileSiteKey&&!tok()){say(A.err.tsMissing);return true}};
const run=async(fn)=>{b.disabled=true;const old=b.textContent;try{await fn()}finally{b.disabled=false;b.textContent=old;tsReset()}};
if(f.id==='fup'){const n=g('un'),m=g('ue'),pw=($('#up')||{}).value||'',co=g('uc'),k=g('uk'),code=g('ur').toUpperCase();
if(n.length<2||!EM.test(m)||!co||!k){say(A.err.fill);return}if(pw.length<10||!/[A-Za-z]/.test(pw)||!/\d/.test(pw)){say(A.err.pwShort);return}
if(code&&!/^[A-Z0-9-]{3,20}$/.test(code)){say(A.err.codeBad);return}if(!$('#ux').checked){say(A.err.consent);return}if(need())return;
await run(async()=>{b.textContent=A.creating;const ch=await pkce();
const r=await api('/auth/v1/signup?redirect_to='+encodeURIComponent(back('confirm')),{method:'POST',body:{email:m,password:pw,data:{full_name:n,company:co,country:k,phone:g('uh'),partner_code:code,locale:L.lang},...ch,...sec()}});
if(r.ok){$('#app').innerHTML=page(A.checkH,`<p>${esc(fill(A.checkP,{email:m}))}</p><p class="note">${esc(A.checkN)}</p>`)}else say(why(r))})}
else if(f.id==='fin'){const m=g('ie'),pw=($('#ip')||{}).value||'';if(!EM.test(m)||!pw){say(A.err.fillIn);return}if(need())return;
await run(async()=>{const r=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:m,password:pw,...sec()}});if(r.ok&&r.data.access_token){setS(r.data);hdr();location.hash='#/account'}else say(why(r))})}
else if(f.id==='frs'){const m=g('re');if(!EM.test(m)){say(A.err.emailBad);return}if(need())return;
await run(async()=>{const ch=await pkce();const r=await api('/auth/v1/recover?redirect_to='+encodeURIComponent(back('recovery')),{method:'POST',body:{email:m,...ch,...sec()}});
if(r.ok||r.status===404||r.status===400&&!(r.data.error_code==='captcha_failed'||r.data.error_code==='validation_failed')){say(fill(A.rstSent,{email:m}),true)}else say(why(r))})}
else if(f.id==='fnp'){const a=($('#np')||{}).value||'',c2=($('#np2')||{}).value||'';if(a.length<10||!/[A-Za-z]/.test(a)||!/\d/.test(a)){say(A.err.pwShort);return}if(a!==c2){say(A.err.mismatch);return}
await run(async()=>{const s=await session();if(!s){say(A.err.expired);return}const r=await api('/auth/v1/user',{method:'PUT',token:s.access_token,body:{password:a}});if(r.ok){say(A.saved,true);setTimeout(()=>{location.hash='#/account'},900)}else say(why(r))})}});
document.addEventListener('click',e=>{if(e.target.closest('[data-so]')){signOut().then(()=>{location.hash='#/signin';location.reload()})}});
/* ---------- header link and search-engine hygiene ---------- */
function hdr(){const a=$('#acc'),m=$('#mm-acc'),on=!!read();[a,m].forEach(x=>{if(x){x.textContent=on?A.account:A.signIn;x.setAttribute('href',on?'#/account':'#/signin')}})}
const NOIDX=/^#\/(account|new-password|reset)/;
function robots(){let m=$('meta[name=robots]');if(NOIDX.test(location.hash)){if(!m){m=document.createElement('meta');m.name='robots';document.head.appendChild(m)}m.content='noindex,nofollow'}else if(m)m.remove()}
addEventListener('hashchange',()=>{robots();hdr()});setTimeout(()=>{robots();hdr()},0);
window.PAGES=window.PAGES||{};Object.assign(window.PAGES,{signup,signin,reset,'new-password':newpw,account});
window.PAGES.title=Object.assign(window.PAGES.title||{},{signup:A.upH,signin:A.signIn,reset:A.rstH,'new-password':A.newH,account:A.account});
window.CulmeraAuth={session,signOut,api,rest,restW,has,peek};
})();
