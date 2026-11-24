/* Applies the language pack to the catalogue. Runs after js/catalog.js. Only DISPLAY fields are translated
   (name, desc, p2, audience, FAQ, category names). `core` and `extra` (module names) stay English because they are
   the keys a client's choices are saved under; show them through TR(). Slugs, ids, scope and art are never touched. */
(function(){var C=window.CATALOG;if(!C||window.LANG==='en')return;var t=window.TR;
C.cats.forEach(function(c){c.name=t(c.name);c.promise=t(c.promise)});
C.types.forEach(function(x){x.name=t(x.name);x.desc=t(x.desc);x.p2=t(x.p2);x.aud=(x.aud||[]).map(t);x.faq=(x.faq||[]).map(function(f){return[t(f[0]),t(f[1])]})})})();
