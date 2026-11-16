window.heroScene=function(cv){
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches,mob=innerWidth<800||matchMedia('(pointer:coarse)').matches;
if(!window.THREE||rm||mob){cv.remove();return}
let r;try{r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true})}catch(e){cv.remove();return}
const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(45,1,.1,100),G=new THREE.Group(),GOLD=0xC9A96E,STEEL=0x8A93A8;s.add(G);c.position.z=9;
const ln=(geo,col,o,w)=>{const m=new THREE.LineSegments(w?new THREE.WireframeGeometry(geo):new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:o}));G.add(m);return m};
const ico=ln(new THREE.IcosahedronGeometry(1.5,1),GOLD,.65,1),oct=ln(new THREE.OctahedronGeometry(2.4),STEEL,.35),r1=ln(new THREE.TorusGeometry(3.3,.012,4,140),GOLD,.4,1),r2=ln(new THREE.TorusGeometry(2.7,.01,4,140),STEEL,.3,1);r1.rotation.x=1.25;r2.rotation.set(.5,.4,0);
const n=160,a=new Float32Array(n*3).map(()=>(Math.random()-.5)*14),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(a,3));const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.025,color:0xF4EFE6,transparent:true,opacity:.35}));G.add(pts);
let mx=0,my=0,vis=true,dpr=Math.min(devicePixelRatio,2),last=performance.now(),slow=0;
const pm=e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5};addEventListener('pointermove',pm,{passive:true});
const io=new IntersectionObserver(es=>{vis=es[0].isIntersecting});io.observe(cv);
const size=()=>{const w=cv.clientWidth||1,h=cv.clientHeight||1;r.setPixelRatio(dpr);r.setSize(w,h,false);c.aspect=w/h;c.updateProjectionMatrix();G.position.x=innerWidth>900?2.8:0};size();addEventListener('resize',size);
(function loop(t){if(!cv.isConnected){io.disconnect();removeEventListener('pointermove',pm);removeEventListener('resize',size);s.traverse(o=>{o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});r.dispose();return}
requestAnimationFrame(loop);if(document.hidden||!vis)return;const dt=t-last;last=t;if(dt>40&&++slow>30&&dpr>1){dpr=1;size()}
ico.rotation.y+=.0025;ico.rotation.x+=.0012;oct.rotation.y-=.0015;oct.rotation.z+=.0008;r1.rotation.z+=.0016;r2.rotation.z-=.0012;pts.rotation.y+=.0002;
G.rotation.y+=(mx*.5-G.rotation.y)*.03;G.rotation.x+=(my*.35-G.rotation.x)*.03;c.position.z=9-(window.camP?camP.p:Math.min(scrollY/innerHeight,1))*3;r.render(s,c)})(last)};

window.worldScene=function(cv,i,col){
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!window.THREE){cv.remove();return null}
let r;try{r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:innerWidth>800})}catch(e){cv.remove();return null}
const mob=innerWidth<800,s=new THREE.Scene(),c=new THREE.PerspectiveCamera(45,1,.1,100),g=new THREE.Group(),C=new THREE.Color(col),X=new THREE.Color(0xf4efe6),B=THREE.BoxGeometry;
c.position.z=9;s.add(g);s.fog=new THREE.Fog(0x05060a,9,20);
const L=(geo,o=.9,p=g,w=0,cc=C)=>{const m=new THREE.LineSegments(w?new THREE.WireframeGeometry(geo):new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:cc,transparent:true,opacity:o}));p.add(m);return m},G=()=>{const o=new THREE.Group();g.add(o);return o};
const dust=(()=>{const n=mob?150:400,a=new Float32Array(n*3).map(()=>(Math.random()-.5)*12),b=new THREE.BufferGeometry();b.setAttribute('position',new THREE.BufferAttribute(a,3));const p=new THREE.Points(b,new THREE.PointsMaterial({size:.035,color:X,transparent:true,opacity:.6}));g.add(p);return p})();
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
const stop=()=>{on=false;removeEventListener('resize',size);removeEventListener('pointermove',pm);s.traverse(o=>{o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});r.dispose()};
(function loop(now){if(!on)return;if(!cv.isConnected){stop();return}if(!rm)requestAnimationFrame(loop);if(document.hidden)return;
const dt=now-last;last=now;if(dt>40&&++slow>30&&dpr>1){dpr=1;size()}
const t=(now-last0)/1000;up(t);g.rotation.y+=(mx*.8-g.rotation.y)*.05;g.rotation.x+=(my*.5-g.rotation.x)*.05;dust.rotation.y=t*.03;r.render(s,c)})(last0);
return stop};
window.worldInit=function(root){if(matchMedia('(max-width:800px)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches){root.querySelectorAll('.wc').forEach(c=>c.remove());return}if(window._wio)window._wio.disconnect();const cs=root.querySelectorAll('.wc');if(!cs.length||!('IntersectionObserver' in window))return;
window._wio=new IntersectionObserver(es=>es.forEach(e=>{const cv=e.target;if(e.isIntersecting){if(!cv._d)cv._d=window.worldScene(cv,+cv.dataset.i,cv.dataset.c)}else if(cv._d){cv._d();cv._d=null}}),{rootMargin:'100px'});cs.forEach(c=>window._wio.observe(c))};
