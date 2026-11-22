/* 1) LANGUAGE. Runs before every other script. It decides the language (saved choice, then the browser language, then English),
   sets <html lang> and dir, and, for every language except English, loads that language's single file js/i18n/<code>.js
   (a blocking request on purpose, so the page is never painted in English first). The pack is applied in js/i18n/en.js.
   TO ADD A LANGUAGE: put js/i18n/<code>.js next to the others and add ONE line to LANGS below (and its code to the SQL check).
   Fields: n = native name, d = direction, l = locale for Intl (dates, numbers), h = value of <html lang>, og = Open Graph locale, ts = Cloudflare Turnstile language. */
(function(){
var LANGS={
en:{n:'English',d:'ltr',l:'en-GB',h:'en',og:'en_US',ts:'en'},
fr:{n:'Français',d:'ltr',l:'fr-FR',h:'fr',og:'fr_FR',ts:'fr'},
de:{n:'Deutsch',d:'ltr',l:'de-DE',h:'de',og:'de_DE',ts:'de'},
zh:{n:'中文',d:'ltr',l:'zh-CN',h:'zh-CN',og:'zh_CN',ts:'zh-cn'},
ru:{n:'Русский',d:'ltr',l:'ru-RU',h:'ru',og:'ru_RU',ts:'ru'},
pt:{n:'Português',d:'ltr',l:'pt-PT',h:'pt-PT',og:'pt_PT',ts:'pt-br'},
nl:{n:'Nederlands',d:'ltr',l:'nl-NL',h:'nl',og:'nl_NL',ts:'nl'},
ar:{n:'العربية',d:'rtl',l:'ar-EG-u-nu-latn',h:'ar',og:'ar_AR',ts:'ar-eg'}};
var KEY='culmera.lang',c=null,m;
try{m=/[?&]lang=([a-z]{2})\b/.exec(location.search);if(m&&LANGS[m[1]]){c=m[1];localStorage.setItem(KEY,c)}}catch(e){}
if(!c){try{var s=localStorage.getItem(KEY);if(s&&LANGS[s])c=s}catch(e){}}
if(!c){var nl=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en']);
for(var i=0;i<nl.length&&!c;i++){var b=String(nl[i]||'').toLowerCase().split('-')[0];if(LANGS[b])c=b}}
if(!c)c='en';
window.LANGS=LANGS;window.LANG=c;
var h=document.documentElement;h.lang=LANGS[c].h;h.dir=LANGS[c].d;
if(c!=='en')document.write('<script src="js/i18n/'+c+'.js"><\/script>');
/* 2) Optional, very short intro (about 0.8s at most). It never waits for the page to finish loading,
   never blocks keyboard or screen-reader access to the content, and is skipped for reduced motion and repeat visits. */
var p=document.getElementById('pre');if(!p)return;
var seen=false;try{seen=sessionStorage.getItem('culmera.intro')==='1';sessionStorage.setItem('culmera.intro','1')}catch(e){}
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
function done(){p.classList.add('out');setTimeout(function(){p.remove()},350)}
if(rm||seen){p.remove();return}
setTimeout(done,500)})();
