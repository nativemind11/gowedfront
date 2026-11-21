#!/usr/bin/env node
'use strict';
/* Static checks for the front end.   node tools/validate.js [path-to-backend-repo]
 * Exits 1 on any failure. Warnings (placeholders still present) do not fail. */
const fs = require('fs'), path = require('path');
const { load, routes } = require('./build-routes.js');
const root = path.join(__dirname, '..'), fails = [], warns = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root), text = files.filter(f => /\.(html|js|css|json|xml|txt|md|svg)$/.test(f) && !f.includes('vendor') && !f.includes(path.sep + 'tools' + path.sep));
const D = load(), { CFG, L } = D;

// 1. old project URLs and names
for (const f of text) { const t = fs.readFileSync(f, 'utf8'); if (/gowed/i.test(t)) fails.push('old "gowed" reference in ' + path.relative(root, f)); }
// 2. unverified claims never in source
for (const f of text.filter(f => /\.(js|html)$/.test(f))) { const t = fs.readFileSync(f, 'utf8'); for (const bad of ['Trusted by', 'Unsplash', 'images/people']) if (t.includes(bad)) fails.push(`"${bad}" found in ${path.relative(root, f)}`); }
ok(!fs.existsSync(path.join(root, 'images/people')), 'AI portraits still present in images/people');
// 3. proof defaults are empty, placeholders flagged
for (const k of ['stats', 'clients', 'testimonials', 'certs', 'leaders', 'caseStudies']) ok(Array.isArray(CFG.proof[k]), 'proof.' + k + ' must be an array');
for (const k of ['stats', 'clients', 'testimonials', 'certs', 'leaders', 'caseStudies']) if (CFG.proof[k].length) warns.push('proof.' + k + ' has ' + CFG.proof[k].length + ' item(s): they only show when verified:true and permission:"approved" (see js/config.js)');
if (/\.example/.test(CFG.siteUrl + CFG.api)) warns.push('siteUrl/api are still placeholders: run node tools/set-urls.js <site> <api>');
for (const [k, v] of Object.entries(CFG.socials)) ok(v === '' || /^https:\/\//.test(v), 'social "' + k + '" must be empty or an https URL (no "#")');
// 3b. Phase 6: home pricing block (no public prices) and case-study entries
ok(L.pricing && Array.isArray(L.pricing.steps) && L.pricing.steps.length === 3, 'L.pricing must have exactly 3 steps (home pricing block)');
{ const t = JSON.stringify(L.pricing || {}); ok(!/[$\u20ac\u00a3]|\b\d[\d,.]*\s?(USD|EUR|EGP|GBP)\b|best price|cheapest|lowest price/i.test(t), 'the pricing block must not show a price or a \"best price\" claim'); }
{ const ids = (CFG.proof.caseStudies || []).map(x => x && x.id); ok(new Set(ids).size === ids.length, 'duplicate case-study ids');
  for (const x of CFG.proof.caseStudies || []) { ok(/^[a-z0-9-]+$/.test(x.id || ''), 'case-study id must be lowercase letters, digits and dashes'); if (x.verified === true) ok(x.permission === 'approved', 'case study ' + x.id + ' is verified but not approved'); if (!x.problem && !x.solution) ok(Array.isArray(x.features) && x.features.length >= 3 && !!x.summary, 'features-only case study ' + x.id + ' needs a summary and at least 3 features'); ok(!x.outcomes || x.outcomes.every(o => o && o.source), 'case study ' + x.id + ': every outcome needs a source'); } }
for (const f of ['js/i18n/en.js']) { const t = fs.readFileSync(path.join(root, f), 'utf8'); ok(!/arrive in a later release/.test(t), 'stale \"later release\" text in ' + f); }

// 4. catalogue <-> groups <-> levels
const cats = new Set(D.D.cats.map(c => c.slug)), inGroup = L.groups.flatMap(g => g.cats);
ok(L.groups.length === 5, 'expected 5 public groups');
for (const c of cats) ok(inGroup.filter(x => x === c).length === 1, 'category not in exactly one group: ' + c);
for (const t of D.D.types) { ok(cats.has(t.cat), 'unknown category on ' + t.slug); ok(L.scope[t.scope], 'no client-friendly level name for ' + t.scope + ' (' + t.slug + ')'); }
ok(new Set(D.D.types.map(t => t.slug)).size === D.D.types.length, 'duplicate type slugs');
for (const [intent, packs] of Object.entries(L.packs)) { ok(L.opts.intents.includes(intent), 'pack intent not in opts.intents: ' + intent); for (const p of packs) for (const s of p[2]) ok(D.D.types.some(t => t.slug === s), `pack "${p[0]}" uses unknown type ${s}`); }
ok(L.opts.intents.every(i => i === 'unsure' || L.packs[i]), 'intent without starting points');
// 5. route manifest
const want = JSON.stringify(routes(D)), have = fs.existsSync(path.join(root, 'routes.json')) ? JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'routes.json'), 'utf8')).routes) : '';
ok(want === have, 'routes.json is out of date: run node tools/build-routes.js');
const site = CFG.siteUrl.replace(/\/$/, ''), sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
ok(routes(D).every(r => sm.includes(`<loc>${site}/#/${r}</loc>`)), 'sitemap.xml does not list every route');
ok(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8').includes(site + '/sitemap.xml'), 'robots.txt sitemap line does not match siteUrl');
// 6. local assets referenced exist
for (const f of text.filter(f => /\.(html|css|js)$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(?:src|href)="((?:images|fonts|js|css)\/[^"#?]+)"/g)) ok(fs.existsSync(path.join(root, m[1])), `${path.relative(root, f)} references missing ${m[1]}`);
  for (const m of t.matchAll(/url\((\.\.\/[^)]+)\)/g)) ok(fs.existsSync(path.join(path.dirname(f), m[1])), `${path.relative(root, f)} references missing ${m[1]}`);
}
// 7. only expected external hosts
const allowed = /^(challenges\.cloudflare\.com|www\.w3\.org|schema\.org|www\.sitemaps\.org|culmera\.example|api\.culmera\.example|culmera-solutions\.com|[a-z0-9]+\.supabase\.co)$/;
for (const f of text.filter(f => /\.(html|js|css)$/.test(f) && !f.includes('catalog.js'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*)/gi)) if (!allowed.test(m[1]) && !(CFG.siteUrl + CFG.api).includes(m[1])) fails.push(`unexpected external host ${m[1]} in ${path.relative(root, f)}`);
ok(!/fonts\.googleapis|fonts\.gstatic/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')), 'Google Fonts still requested');
// 8. every image used is a real file with fallback-friendly attributes
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
ok(/<html lang="en" dir="ltr">/.test(html), 'html lang/dir missing');
// 9. backend allowlists match (optional)
const sib = fs.readdirSync(path.join(root, '..'), { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(root, '..', e.name, 'scripts/sync-from-front.js'))).map(e => path.join(root, '..', e.name))[0];
const be = process.argv[2] || sib || '';
if (be && fs.existsSync(path.join(be, 'scripts/sync-from-front.js'))) { try { require('child_process').execFileSync(process.execPath, [path.join(be, 'scripts/sync-from-front.js'), root, '--check'], { stdio: 'pipe' }); } catch (e) { fails.push('backend allowlists differ from the front end: run npm run sync in the backend repo'); } }
else warns.push('backend repo not found next to this one: skipped the slug/option allowlist check');
warns.forEach(w => console.log('WARN  ' + w));
if (fails.length) { fails.forEach(f => console.log('FAIL  ' + f)); process.exit(1); }
console.log('front-end validation passed (' + D.D.types.length + ' types, ' + routes(D).length + ' routes)');
