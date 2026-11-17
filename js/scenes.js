/* CULMERA scenes. Three.js r128 is self-hosted (js/vendor) and loaded on demand, only when a 3D scene is actually shown.
   Every scene registers a stop() so it can be disposed when the page changes (see sceneCleanup). */
window._scenes=window._scenes||new Set();window.sceneCleanup=function(){[...window._scenes].forEach(f=>{try{f()}catch(e){}});window._scenes.clear()};
window.withThree=function(cb){if(window.THREE)return cb();if(!window._t3){window._t3=[];const s=document.createElement('script');s.src='js/vendor/three.min.js';s.onload=()=>{window._t3.splice(0).forEach(f=>f())};s.onerror=()=>{window._t3=null};document.head.appendChild(s)}window._t3&&window._t3.push(cb)};
window.heroScene=function(cv){
const idle=window.requestIdleCallback||(f=>setTimeout(f,400));
idle(()=>withThree(()=>{if(!cv.isConnected)return;init(cv)}),{timeout:1500});
function init(cv){let r;try{r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true,powerPreference:'low-power'})}catch(e){cv.remove();return}
const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(45,1,.1,100),g=new THREE.Group(),GOLD=0xC9A96E,IVORY=0xF4EFE6,STEEL=0x8A93A8;c.position.z=11;s.add(g);
const wire=(geo,col,op)=>{const m=new THREE.LineSegments(new THREE.WireframeGeometry(geo),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:op}));g.add(m);return m};
const apex=wire(new THREE.ConeGeometry(1.7,3.6,4,4),GOLD,.5),core=wire(new THREE.IcosahedronGeometry(2.3,1),IVORY,.09);apex.rotation.y=.6;
const ring=(R,col,rx,ry)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(R,.006,6,200),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.45}));m.rotation.set(rx,ry,0);g.add(m);return m};
const rs=[ring(3.1,GOLD,1.25,.2),ring(3.8,STEEL,1.0,.9)];
const vane=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-2.8,0),new THREE.Vector3(0,3.2,0)]),new THREE.LineBasicMaterial({color:GOLD,transparent:true,opacity:.8}));g.add(vane);
const n=200,pa=new Float32Array(n*3);for(let i=0;i<n*3;i++)pa[i]=(Math.random()-.5)*14;const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pa,3));const pts=new THREE.Points(pg,new THREE.PointsMaterial({size:.022,color:IVORY,transparent:true,opacity:.35}));s.add(pts);
let mx=0,my=0,dpr=Math.min(devicePixelRatio||1,2),run=false,vis=true,slow=0,last=performance.now(),raf=0;
const pm=e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5};addEventListener('pointermove',pm,{passive:true});
const size=()=>{const w=cv.clientWidth||1,h=cv.clientHeight||1;r.setPixelRatio(dpr);r.setSize(w,h,false);c.aspect=w/h;c.updateProjectionMatrix();g.position.x=innerWidth>1000?(document.documentElement.dir==='rtl'?-3:3):0;g.scale.setScalar(innerWidth>1000?1:.8)};size();addEventListener('resize',size);
let dead=0;const stop=()=>{if(dead)return;dead=1;run=false;cancelAnimationFrame(raf);io.disconnect();removeEventListener('resize',size);removeEventListener('pointermove',pm);document.removeEventListener('visibilitychange',vc);window._scenes.delete(stop);s.traverse(o=>{o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});r.dispose();r.forceContextLoss&&r.forceContextLoss()};window._scenes.add(stop);
const loop=t=>{if(!cv.isConnected){stop();return}if(!run)return;raf=requestAnimationFrame(loop);const dt=t-last;last=t;if(dt>40&&++slow>40&&dpr>1){dpr=1;size()}
apex.rotation.y+=.0016;core.rotation.y-=.0009;core.rotation.x+=.0005;rs[0].rotation.z+=.0012;rs[1].rotation.z-=.0008;pts.rotation.y+=.0002;
g.rotation.y+=(mx*.5-g.rotation.y)*.03;g.rotation.x+=(my*.3-g.rotation.x)*.03;c.position.x+=(mx*.6-c.position.x)*.03;c.position.z=9-(window.camP?camP.p:Math.min(scrollY/innerHeight,1))*3;r.render(s,c)};
const go=()=>{const w=vis&&!document.hidden;if(w&&!run){run=true;last=performance.now();raf=requestAnimationFrame(loop)}else if(!w){run=false;cancelAnimationFrame(raf)}};
const vc=()=>go();document.addEventListener('visibilitychange',vc);
const io=new IntersectionObserver(es=>{vis=es[0].isIntersecting;go()},{threshold:0});io.observe(cv);
r.render(s,c);go()}};

window.worldScene=function(cv,i,col){
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!window.THREE){cv.remove();return null}
let r;try{r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:innerWidth>800})}catch(e){cv.remove();return null}
const mob=innerWidth<800,s=new THREE.Scene(),c=new THREE.PerspectiveCamera(45,1,.1,100),g=new THREE.Group(),C=new THREE.Color(col),X=new THREE.Color(0xF4EFE6),B=THREE.BoxGeometry;
c.position.z=11;s.add(g);s.fog=new THREE.Fog(0x05060a,9,20);
const L=(geo,o=.9,p=g,w=0,cc=C)=>{const m=new THREE.LineSegments(w?new THREE.WireframeGeometry(geo):new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:cc,transparent:true,opacity:o}));p.add(m);return m},G=()=>{const o=new THREE.Group();g.add(o);return o};
const dust=(()=>{const n=mob?90:160,a=new Float32Array(n*3).map(()=>(Math.random()-.5)*12),b=new THREE.BufferGeometry();b.setAttribute('position',new THREE.BufferAttribute(a,3));const p=new THREE.Points(b,new THREE.PointsMaterial({size:.035,color:X,transparent:true,opacity:.6}));g.add(p);return p})();
const SC=[
()=>{const p=[0,1,2,3,4].map(k=>L(new B(3,2,.04),.95-k*.14));return t=>p.forEach((m,k)=>{m.position.set(k*.4-.8,Math.sin(t+k)*.15+k*.25-.5,-k*1.1);m.rotation.y=-.35+Math.sin(t*.5)*.08})},
()=>{const o=G(),p=[...Array(8)].map((_,k)=>L(k%2?new B(.9,.9,.9):new THREE.OctahedronGeometry(.65),.95,o));return t=>{o.rotation.y=t*.4;p.forEach((m,k)=>{const a=k*Math.PI/4;m.position.set(Math.cos(a)*3,Math.sin(t*2+k)*.2,Math.sin(a)*3);m.rotation.x=t+k})}},
()=>{const o=G();[...Array(28)].forEach((_,k)=>{const m=L(new B(.55,.4,.03),.9,o),a=k/28*6.283;m.position.set(Math.cos(a)*3.2,Math.sin(k*.9)*.7,Math.sin(a)*3.2);m.lookAt(0,m.position.y,0)});o.rotation.x=.35;return t=>{o.rotation.y=t*.25}},
()=>{const o=G(),p=[];for(let x=-1;x<2;x++)for(let y=-1;y<2;y++)for(let z=-1;z<2;z++){const m=L(new B(.9,.9,.9),.9,o);m.userData.b=[x,y,z];p.push(m)}return t=>{const f=1.15+.55*Math.max(0,Math.sin(t*.9));o.rotation.set(.5,t*.3,0);p.forEach(m=>m.position.set(...m.userData.b.map(v=>v*f)))}},
()=>{const o=G(),h=[1,2.6,1.6,3.4,2,2.9,1.3,2.2,1.8],pts=[];h.forEach((v,k)=>{const m=L(new B(.7,v,.7),.9,o);m.position.set(k-4,v/2-1.6,0);pts.push(new THREE.Vector3(k-4,v-1.6,0))});o.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:X,transparent:true,opacity:.7})));o.scale.setScalar(.75);return t=>{o.rotation.y=Math.sin(t*.3)*.5;o.rotation.x=.15}},
()=>{const k=L(new THREE.IcosahedronGeometry(1.2,1),.95),N=120,a=new Float32Array((N+1)*3),b=new THREE.BufferGeometry();b.setAttribute('position',new THREE.BufferAttribute(a,3));const ln=new THREE.Line(b,new THREE.LineBasicMaterial({color:X,transparent:true,opacity:.8}));g.add(ln);return t=>{k.rotation.y=t*.5;k.rotation.x=t*.3;for(let j=0;j<=N;j++){const q=j/N*6.283,rr=2.5+Math.sin(q*8+t*2.5)*.22;a[j*3]=Math.cos(q)*rr;a[j*3+1]=Math.sin(q)*rr}b.attributes.position.needsUpdate=true;ln.rotation.x=.9;ln.rotation.z=t*.2}},
()=>{const k=L(new THREE.TorusKnotGeometry(1.3,.38,90,12),.55,g,1),ring=L(new THREE.TorusGeometry(2.8,.03,4,80),.9,g,1);ring.rotation.x=1.2;return t=>{k.rotation.y=t*.6;k.rotation.x=t*.2;ring.rotation.z=t*.3}},
()=>{const rs=[2.9,2.1,1.3].map((v,k)=>{const o=G();L(new THREE.TorusGeometry(v,.02,4,70),.8,o,1);const m=L(k%2?new THREE.OctahedronGeometry(.4):new THREE.TorusGeometry(.3,.1,4,8),.95,o,1);m.position.x=v;o.rotation.set(k*.9,k*.5,0);return[o,m]});return t=>rs.forEach(([o,m],k)=>{o.rotation.z=t*(.4+k*.25)*(k%2?-1:1);m.rotation.x=t*2})}
];
let dpr=Math.min(devicePixelRatio,mob?1.5:2),on=true,slow=0,mx=0,my=0;const last0=performance.now();let last=last0;
const up=SC[i%8](),size=()=>{const w=cv.clientWidth||1,h=cv.clientHeight||1;r.setPixelRatio(dpr);r.setSize(w,h,false);c.aspect=w/h;c.updateProjectionMatrix()},pm=e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5};
size();addEventListener('resize',size);if(!mob)addEventListener('pointermove',pm,{passive:true});
let dead=0;const stop=()=>{if(dead)return;dead=1;on=false;removeEventListener('resize',size);removeEventListener('pointermove',pm);window._scenes.delete(stop);s.traverse(o=>{o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});r.dispose();r.forceContextLoss&&r.forceContextLoss()};window._scenes.add(stop);
(function loop(now){if(!on)return;if(!cv.isConnected){stop();return}if(!rm)requestAnimationFrame(loop);if(document.hidden)return;
const dt=now-last;last=now;if(dt>40&&++slow>30&&dpr>1){dpr=1;size()}
const t=(now-last0)/1000;up(t);g.rotation.y+=(mx*.8-g.rotation.y)*.05;g.rotation.x+=(my*.5-g.rotation.x)*.05;dust.rotation.y=t*.03;r.render(s,c)})(last0);
return stop};
window.worldInit=function(root){if(window._wio)window._wio.disconnect();const cs=root.querySelectorAll('.wc');if(!cs.length||!('IntersectionObserver' in window))return;
window._wio=new IntersectionObserver(es=>es.forEach(e=>{const cv=e.target;if(e.isIntersecting){cv._v=1;if(!cv._d&&!cv._p){cv._p=1;withThree(()=>{cv._p=0;if(cv.isConnected&&cv._v&&!cv._d)cv._d=window.worldScene(cv,+cv.dataset.i,cv.dataset.c)})}}else{cv._v=0;if(cv._d){cv._d();cv._d=null}}}),{rootMargin:'100px'});cs.forEach(c=>window._wio.observe(c))};
