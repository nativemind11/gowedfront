#!/usr/bin/env node
'use strict';
/* Keeps the API allowlists in step with the front end (single source of truth = the front end).
 *   node scripts/sync-from-front.js <front-dir>          write lib/slugs.json, lib/modules.json, lib/options.json
 *   node scripts/sync-from-front.js <front-dir> --check  fail (exit 1) if they differ, writes nothing */
const fs = require('fs'), path = require('path'), vm = require('vm');
const front = process.argv.slice(2).find(a => !a.startsWith('--')), check = process.argv.includes('--check');
if (!front) { console.error('usage: node scripts/sync-from-front.js <front-dir> [--check]'); process.exit(2); }
const read = p => fs.readFileSync(path.join(front, p), 'utf8');
const ctx = {}; ctx.window = ctx;
vm.runInNewContext(read('js/catalog.js'), ctx);
const D = ctx.CATALOG;
const c2 = {}; c2.window = c2; vm.runInNewContext(read('js/i18n/en.js') + ';this.L=L', c2);
const O = c2.L.opts;
const slugs = D.types.map(t => t.slug);
const modules = Object.fromEntries(D.types.map(t => [t.slug, [...new Set([...t.core, ...t.extra])]]));
const options = { intents: O.intents, users: O.users, scale: O.scale, have: O.have, integ: O.integ, threeD: O.threeD, mood: O.mood, duration: O.duration };
const out = { 'lib/slugs.json': slugs, 'lib/modules.json': modules, 'lib/options.json': options };
let diff = 0;
for (const [f, v] of Object.entries(out)) {
  const text = JSON.stringify(v, null, 1) + '\n', file = path.join(__dirname, '..', f);
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (check) { if (cur !== text) { console.error('OUT OF DATE: ' + f); diff++; } }
  else fs.writeFileSync(file, text);
}
if (check) { if (diff) process.exit(1); console.log('allowlists match the front end (' + slugs.length + ' slugs)'); }
else console.log('wrote allowlists for ' + slugs.length + ' slugs');
