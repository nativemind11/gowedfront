/* Optional, very short intro (about 0.8s at most). It never waits for the page to finish loading,
   never blocks keyboard or screen-reader access to the content, and is skipped for reduced motion and repeat visits. */
(function(){var p=document.getElementById('pre');if(!p)return;
var seen=false;try{seen=sessionStorage.getItem('culmera.intro')==='1';sessionStorage.setItem('culmera.intro','1')}catch(e){}
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
function done(){p.classList.add('out');setTimeout(function(){p.remove()},350)}
if(rm||seen){p.remove();return}
setTimeout(done,500)})();
