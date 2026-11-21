/* 1) Language. Runs before anything else on the page: it picks the language and loads ONLY that language file.
      Order: ?lang=xx in the address, then the saved choice (localStorage culmera.lang), then the browser language, then English.
      It also sets <html lang> and dir at once, so nothing flashes in the wrong direction. */
(function(){var LS=window.LANGS||[],find=function(c){for(var i=0;i<LS.length;i++)if(LS[i].code===c)return LS[i];return null},pick=null;
try{var m=/[?&]lang=([a-z]{2})(?:&|#|$)/.exec(location.search);if(m&&find(m[1])){pick=m[1];localStorage.setItem('culmera.lang',pick)}}catch(e){}
if(!pick)try{var s=localStorage.getItem('culmera.lang');if(s&&find(s))pick=s}catch(e){}
if(!pick){var nl=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en'];for(var j=0;j<nl.length&&!pick;j++){var c=String(nl[j]).toLowerCase().split('-')[0];if(find(c))pick=c}}
var cur=find(pick||'en')||LS[0]||{code:'en',tag:'en',dir:'ltr'};window.CULMERA_LANG=cur;
var h=document.documentElement;h.lang=cur.tag;h.dir=cur.dir;
/* if the language file cannot be loaded, forget the saved choice and open the English site once */
var bad="try{if(sessionStorage.getItem('culmera.langfix'))return;sessionStorage.setItem('culmera.langfix','1');localStorage.removeItem('culmera.lang')}catch(e){}location.replace(location.pathname+'?lang=en'+location.hash)";
document.write('<script defer src="js/i18n/'+cur.code+'.js" onerror="'+bad+'"><\/script>')})();
/* 2) Optional, very short intro (about 0.8s at most). It never waits for the page to finish loading,
   never blocks keyboard or screen-reader access to the content, and is skipped for reduced motion and repeat visits. */
(function(){var p=document.getElementById('pre');if(!p)return;
var seen=false;try{seen=sessionStorage.getItem('culmera.intro')==='1';sessionStorage.setItem('culmera.intro','1')}catch(e){}
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
function done(){p.classList.add('out');setTimeout(function(){p.remove()},350)}
if(rm||seen){p.remove();return}
setTimeout(done,500)})();
