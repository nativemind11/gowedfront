#!/usr/bin/env node
'use strict';
/* Shared helpers for the language system (Phase 8). Used by tools/validate.js, tools/i18n-test.py and for the review sheets.
 *   node tools/i18n-tools.js sheet <outdir>     writes one review sheet per language (CSV: key, English, translation)
 *   node tools/i18n-tools.js pseudo <ar|fr>     prints a pseudo-language file (every text wrapped in ⟦ ⟧) for the crawl test
 *   node tools/i18n-tools.js need               prints every English string that every language's `dict` must translate */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const ctxOf = src => { const c = {}; c.window = c; vm.runInNewContext(src, c); return c; };

function registry() { return ctxOf(read('js/langs.js')).LANGS; }
function loadLang(code) { const c = {}; vm.runInNewContext(read('js/i18n/' + code + '.js') + ';this.L=L', c); return c.L; }
function catalog() { return ctxOf(read('js/catalog.js')).CATALOG; }
function config() { const c = {}; vm.runInNewContext(read('js/config.js') + ';this.CFG=CFG', c); return c.CFG; }

/* paths whose values are stored, sent or used as keys: they must be IDENTICAL in every language */
const IDENT = [/^(groups)\[\d+\]\.(slug|cats|scene|icon)/, /^show\.items\[\d+\]\[2\]$/, /^brief\.(goals|who|login)\[\d+\]\[(0|2)\]$/, /^dr\.steps\[\d+\]\[0\]$/, /^opts\./, /^packs\.\w+\[\d+\]\[2\]/];
/* paths that describe the language itself and are checked separately */
const META = /^(code|lang|dir|locale|ogLocale|dict)(\.|$)/;
const isIdent = p => IDENT.some(r => r.test(p));

function leaves(o, f, p = '') {
  if (typeof o === 'string' || typeof o === 'number' || typeof o === 'boolean') return f(p, o);
  if (Array.isArray(o)) return o.forEach((x, i) => leaves(x, f, p + '[' + i + ']'));
  if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], f, p ? p + '.' + k : k);
}

/* every English string that must have a translation in `dict`: catalogue, option labels, proof labels */
function need() {
  const D = catalog(), CFG = config(), L = loadLang('en'), s = new Set();
  const add = x => { if (typeof x === 'string' && x.trim() && !/^\d+$/.test(x)) s.add(x); };
  D.cats.forEach(c => { add(c.name); add(c.promise); });
  D.types.forEach(t => { add(t.name); add(t.desc); add(t.p2); t.core.forEach(add); t.extra.forEach(add); t.aud.forEach(add); t.faq.forEach(q => q.forEach(add)); });
  ['users', 'scale', 'have', 'integ', 'threeD', 'mood', 'launch'].forEach(k => L.opts[k].forEach(add));
  (CFG.proof.stats || []).forEach(x => add(x.l));
  (CFG.proof.testimonials || []).forEach(x => { add(x.country); add(x.sector); });
  (CFG.proof.caseStudies || []).forEach(x => { add(x.country); add(x.sector); add(x.anonymousSector); });
  return [...s];
}

/* pseudo-language for the crawl test: every translatable text becomes ⟦text⟧, values stay as they are */
function pseudo(code) {
  const en = loadLang('en'), reg = registry().find(l => l.code === code), out = JSON.parse(JSON.stringify(en));
  const wrap = s => '⟦' + s + '⟧';
  (function walk(o, p) {
    for (const k of Array.isArray(o) ? o.keys() : Object.keys(o)) {
      const q = Array.isArray(o) ? p + '[' + k + ']' : (p ? p + '.' + k : k), v = o[k];
      if (typeof v === 'string') { if (!META.test(q) && !isIdent(q)) o[k] = wrap(v); }
      else if (v && typeof v === 'object') walk(v, q);
    }
  })(out, '');
  out.code = code; out.lang = reg.tag; out.dir = reg.dir; out.locale = reg.tag; out.ogLocale = 'en_US';
  out.dict = Object.fromEntries(need().map(x => [x, wrap(x)]));
  return 'const L=' + JSON.stringify(out) + ';';
}

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
function sheet(outdir) {
  const en = loadLang('en'), D = need(); fs.mkdirSync(outdir, { recursive: true });
  for (const l of registry()) {
    if (l.code === 'en') continue;
    const L = loadLang(l.code), rows = [['key', 'English', l.name + ' (' + l.code + ')', 'reviewer notes']];
    leaves(en, (p, v) => { if (typeof v !== 'string' || META.test(p) || isIdent(p)) return; let t = L; for (const m of p.match(/[^.\[\]]+/g)) t = t == null ? t : t[m]; rows.push([p, v, t, '']); });
    for (const e of D) rows.push(['dict: ' + e.slice(0, 40), e, (L.dict || {})[e], '']);
    fs.writeFileSync(path.join(outdir, 'review-' + l.code + '.csv'), '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n');
    console.log('review-' + l.code + '.csv: ' + (rows.length - 1) + ' rows');
  }
}
module.exports = { registry, loadLang, catalog, config, IDENT, META, isIdent, leaves, need, pseudo };
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'sheet') sheet(arg || 'review'); else if (cmd === 'pseudo') process.stdout.write(pseudo(arg || 'ar')); else if (cmd === 'need') console.log(need().join('\n')); else console.log('usage: node tools/i18n-tools.js sheet <dir> | pseudo <code> | need');
}
