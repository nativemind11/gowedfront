#!/usr/bin/env node
'use strict';
/* Sets the final public addresses everywhere they appear, in one step.
 *   node tools/set-urls.js https://www.your-domain.com https://your-api.vercel.app/api/brief
 * Updates js/config.js, index.html, robots.txt and sitemap.xml (via build-routes). */
const fs = require('fs'), path = require('path');
const [site, api] = process.argv.slice(2);
const ok = u => /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(u || '');
if (!ok(site) || !ok(api)) { console.error('usage: node tools/set-urls.js <https site url> <https api url>'); process.exit(2); }
const root = path.join(__dirname, '..'), s = site.replace(/\/$/, '');
const edit = (f, fn) => { const p = path.join(root, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
edit('js/config.js', t => t.replace(/siteUrl:"[^"]*"/, `siteUrl:"${s}"`).replace(/api:"[^"]*"/, `api:"${api}"`));
edit('index.html', t => t.replace(/https:\/\/[^"]*\/images\/og\.jpg/g, s + '/images/og.jpg').replace(/(property="og:url" content=")[^"]*"/, `$1${s}/"`));
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-routes.js')], { stdio: 'inherit' });
console.log('Done. Remember to add ' + s + ' to ALLOWED_ORIGIN in the API environment.');
