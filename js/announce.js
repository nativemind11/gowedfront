/* CULMERA announcements (update 10). A small notice, top right, for every visitor.
   - Reads public.announcements with the public key only: access rules returns ONLY the notices that are live now.
   - The visitor can close a notice with the x button. The choice is kept in this browser (notice id only) until the notice ends.
   - The Project Manager publishes and deletes notices in #/team > Announcements (js/team.js).
   - Text is always inserted as plain text (textContent), never as HTML. */
(()=>{
const KEY='culmera.ann.hidden',EVERY=5*60*1000,MAX=3;
const hidden=()=>{try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}};
const hide=id=>{try{const a=hidden();if(!a.includes(id)){a.push(id);localStorage.setItem(KEY,JSON.stringify(a.slice(-100)))}}catch(e){}};
const T=()=>(typeof L!=='undefined'&&L.tm&&L.tm.an)||{};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let box=null;
function mk(){if(box&&box.isConnected)return box;box=document.createElement('aside');box.id='ann';box.setAttribute('aria-label',T().region||'Announcements');document.body.appendChild(box);return box}
function card(x){const a=document.createElement('section');a.className='ann';a.dataset.id=x.id;a.setAttribute('role','status');
const h=document.createElement('h2');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.body;
const b=document.createElement('button');b.type='button';b.className='ann-x';b.setAttribute('aria-label',T().close||'Close');
b.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
b.addEventListener('click',()=>{hide(x.id);a.classList.add('out');setTimeout(()=>{a.remove();if(box&&!box.children.length)box.remove()},220)});
a.append(b,h,p);return a}
async function sync(){const A=window.CulmeraAuth;if(!A||!A.api)return;
const r=await A.api('/rest/v1/announcements?select=id,title,body,expires_at&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&order=created_at.desc&limit=10');
if(!r.ok||!Array.isArray(r.data))return;
const gone=new Set(hidden()),live=r.data.filter(x=>x&&UUID.test(x.id)&&typeof x.title==='string'&&typeof x.body==='string'&&!gone.has(x.id)).slice(0,MAX);
const ids=new Set(live.map(x=>x.id));
if(box)for(const c of [...box.children])if(!ids.has(c.dataset.id))c.remove();
for(const x of live){if(box&&box.querySelector('[data-id="'+x.id+'"]'))continue;mk().appendChild(card(x))}
if(box&&!box.children.length){box.remove();box=null}}
const go=()=>{sync().catch(()=>{})};
/* deferred scripts run while readyState is 'interactive' and app.js (which sets up the config) comes after this file, so wait for DOMContentLoaded */
if(document.readyState==='complete')go();else document.addEventListener('DOMContentLoaded',go);
setInterval(go,EVERY);document.addEventListener('visibilitychange',()=>{if(!document.hidden)go()});
})();
