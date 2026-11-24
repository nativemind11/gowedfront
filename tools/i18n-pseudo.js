#!/usr/bin/env node
'use strict';
/* Writes a PSEUDO language pack to stdout: every translatable string is wrapped in ‹ › so a browser test can spot any visible text that did not come from a pack.
   Usage: node tools/i18n-pseudo.js [code]   (default code: de) */
const lib = require('./i18n-lib.js');
const code = process.argv[2] || 'de';
const L = lib.loadEn(), C = lib.loadCatalog();
const wrap = s => '\u2039' + s + '\u203a';
function conv(o, p) {
  if (typeof o === 'string') return lib.isKeep(p) ? o : wrap(o);
  if (Array.isArray(o)) return o.map((v, i) => conv(v, p ? p + '.' + i : String(i)));
  if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = conv(o[k], p ? p + '.' + k : k); return r; }
  return o;
}
const out = conv(L, ''); out.lang = code;
// optL labels are display text too
const CAT = {}; for (const s of lib.catStrings(C)) CAT[s] = wrap(s);
process.stdout.write('window.I18N_PACK=' + JSON.stringify({ code, L: out, CAT }) + ';\n');
