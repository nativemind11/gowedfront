/* Language runtime. Loaded right after the language file (js/i18n/<code>.js) and before the catalogue is used.
   tr(s): shows the translation of a catalogue / option / label string, or the string itself when the language is English.
   Stored values (module names, option values) are NEVER changed: only what is shown goes through tr(). */
(function(){
var has=Object.prototype.hasOwnProperty,D=L.dict||null;
window.tr=function(s){return D&&typeof s==='string'&&has.call(D,s)?D[s]:s};
var lang=window.CULMERA_LANG||{code:L.code||'en',tag:L.lang,dir:L.dir};
/* the file and the registry must agree, or the page would show the wrong direction */
if(lang.code!==L.code||lang.dir!==L.dir)console.error('i18n: registry and language file disagree for '+lang.code);
/* catalogue display fields. core/extra (module names) stay as stored values; the pages show tr(name). The English name stays in t.en. */
if(D&&window.CATALOG){
 CATALOG.cats.forEach(function(c){c.en=c.name;c.name=tr(c.name);c.promise=tr(c.promise)});
 CATALOG.types.forEach(function(t){t.en=t.name;t.name=tr(t.name);t.desc=tr(t.desc);t.p2=tr(t.p2);t.aud=t.aud.map(tr);t.faq=t.faq.map(function(q){return[tr(q[0]),tr(q[1])]})});
}
/* the language switcher chooses a language, remembers it and reloads the page on the same address (no data is lost: drafts are stored) */
window.CULMERA_I18N={list:window.LANGS||[],current:lang,
 set:function(code){var ok=(window.LANGS||[]).some(function(l){return l.code===code});if(!ok||code===lang.code)return;
  try{localStorage.setItem('culmera.lang',code);sessionStorage.removeItem('culmera.langfix')}catch(e){}
  location.reload()}};
})();
