'use strict';
/* Shared helpers for language packs (used by tools/validate.js and the build scripts).
   A pack is js/i18n/<code>.js:  window.I18N_PACK = { code, L: {same keys as en.js}, CAT: {english sentence: translation} }  */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
// Paths inside L that are NOT text: identifiers, slugs, icon names, option VALUES. They must be identical in every pack.
const KEEP = [/^lang$/, /^dir$/, /^locale$/, /^groups\.\d+\.(slug|icon|scene)$/, /^groups\.\d+\.cats\.\d+$/, /^show\.items\.\d+\.2$/,
  /^brief\.(goals|who|login)\.\d+\.(0|2)$/, /^dr\.steps\.\d+\.0$/, /^opts\./, /^packs\.[a-z]+\.\d+\.2(\.\d+)?$/];
const isKeep = p => KEEP.some(r => r.test(p));
function walk(o, f, p = '') {
  if (typeof o === 'string') f(p, o, 's'); else if (typeof o === 'number' || typeof o === 'boolean' || o === null) f(p, o, 'v');
  else if (Array.isArray(o)) o.forEach((v, i) => walk(v, f, p ? p + '.' + i : String(i)));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], f, p ? p + '.' + k : k);
}
function loadEn() { const c = {}; c.window = c; vm.runInNewContext(fs.readFileSync(path.join(root, 'js/i18n/en.js'), 'utf8') + ';this.L=L', c); return c.L; }
function loadCatalog() { const c = {}; c.window = c; vm.runInNewContext(fs.readFileSync(path.join(root, 'js/catalog.js'), 'utf8'), c); return c.CATALOG; }
function loadPack(code) { const c = { console }; c.window = c; vm.runInNewContext(fs.readFileSync(path.join(root, 'js/i18n/' + code + '.js'), 'utf8'), c); return c.I18N_PACK; }
// Catalogue sentences that are shown to people (core/extra are module KEYS shown through TR(), so they are included too).
function catStrings(C) {
  const out = [], add = s => { if (typeof s === 'string' && s.trim()) out.push(s); };
  C.cats.forEach(c => { add(c.name); add(c.promise); });
  C.types.forEach(t => { add(t.name); add(t.desc); add(t.p2); (t.core || []).forEach(add); (t.extra || []).forEach(add); (t.aud || []).forEach(add); (t.faq || []).forEach(f => { add(f[0]); add(f[1]); }); });
  return [...new Set(out)];
}
const placeholders = s => (String(s).match(/\{\w+\}/g) || []).sort().join('|');
module.exports = { root, KEEP, isKeep, walk, loadEn, loadCatalog, loadPack, catStrings, placeholders };
