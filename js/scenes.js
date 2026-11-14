window.heroScene=function(cv){
if(!window.THREE||matchMedia('(prefers-reduced-motion: reduce)').matches){cv.remove();return}
let r;try{r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true})}catch(e){cv.remove();return}
const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(50,1,.1,100);c.position.z=7;s.fog=new THREE.Fog(0x07080d,6,16);
const mk=(col,rx,ry)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(2.2,.03,12,160),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.9}));m.rotation.set(rx,ry,0);s.add(m);return m};
const rs=[mk(0x36e2c8,0,0),mk(0xff7a45,1.1,.3),mk(0x3d6bff,.4,1.2)];
const n=900,g=new THREE.BufferGeometry(),a=new Float32Array(n*3);for(let i=0;i<n*3;i++)a[i]=(Math.random()-.5)*14;
g.setAttribute('position',new THREE.BufferAttribute(a,3));const pts=new THREE.Points(g,new THREE.PointsMaterial({size:.025,color:0xf2efe9}));s.add(pts);
let last=performance.now(),slow=0,dpr=Math.min(devicePixelRatio,2);
const size=()=>{const w=cv.clientWidth,h=cv.clientHeight;r.setPixelRatio(dpr);r.setSize(w,h,false);c.aspect=w/h;c.updateProjectionMatrix()};size();addEventListener('resize',size);
(function loop(t){if(!cv.isConnected){r.dispose();g.dispose();removeEventListener('resize',size);return}
requestAnimationFrame(loop);if(document.hidden)return;
const dt=t-last;last=t;if(dt>40&&++slow>30&&dpr>1){dpr=1;size()}
rs.forEach((m,i)=>{m.rotation.z+=.002*(i+1);m.rotation.x+=.0008});pts.rotation.y+=.0004;
c.position.z=7-Math.min(scrollY/innerHeight,1)*4;r.render(s,c)})(last)};
