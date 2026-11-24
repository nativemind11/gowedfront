'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/brief.js');
const slugs = require('../lib/slugs.json'), modules = require('../lib/modules.json');

const ORIGIN = 'https://site.example';
const BASE_ENV = { ALLOWED_ORIGIN: ORIGIN + ',https://*.evil.example', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_x', VERCEL_ENV: 'development' };
const KEYS = ['ALLOWED_ORIGIN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VERCEL_ENV', 'NODE_ENV', 'TURNSTILE_SECRET', 'TURNSTILE_REQUIRED', 'RESEND_API_KEY', 'NOTIFY_EMAIL_TO', 'EMAIL_FROM', 'CONFIRM_CLIENT', 'REPLY_TO', 'NOTIFY_WEBHOOK_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'MEETING_TZ'];
const realFetch = global.fetch, realLog = { e: console.error, w: console.warn, l: console.log };
let calls, logs, dbStatus, mailStatus, tsOk, mailFails, ipN = 0;

function setup(env = {}) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, BASE_ENV, env);
  calls = []; logs = []; dbStatus = 201; mailStatus = 200; tsOk = true; mailFails = {};
  require('../api/brief.js').__test.reset();
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  global.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push({ url: u, opts });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (u.includes('/rest/v1/')) return json(opts.method === 'PATCH' ? 204 : dbStatus, {});
    if (u.includes('api.resend.com')) {   // mailFails[address] = how many sends to that address fail before one works
      const to = JSON.parse(opts.body).to[0];
      if (mailFails[to] > 0) { mailFails[to]--; return json(500, {}); }
      return json(mailStatus, { id: 'x' });
    }
    if (u.includes('turnstile')) return json(200, { success: tsOk });
    return json(200, {});
  };
}
test.afterEach(() => { global.fetch = realFetch; console.error = realLog.e; console.warn = realLog.w; console.log = realLog.l; });

const brief = (over = {}) => ({ type: 'brief', elapsed: 30, turnstile: 'tok', name: 'Ahmed Test', email: 'Ahmed@Example.com ', company: 'Acme', country: 'Egypt', timezone: 'Africa/Cairo', project: { goal: 'Sell products online', intent: 'sell' }, items: [{ slug: 'online-store' }], ...over });
function call(body, { origin = ORIGIN, method = 'POST', headers = {} } = {}) {
  const h = { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.' + (++ipN % 250), ...headers };
  const res = { headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method, headers: h, body }, res).then(() => res);
}
const dbWrites = () => calls.filter(c => c.url.includes('/rest/v1/') && c.opts.method === 'POST');
const mails = () => calls.filter(c => c.url.includes('resend'));
const mailBodies = () => mails().map(c => JSON.parse(c.opts.body));
const toClient = () => mailBodies().filter(m => m.to[0] === 'ahmed@example.com');

test('allowlists: every catalogue slug has modules and the file lists agree', () => {
  assert.equal(slugs.length, 77);
  for (const s of slugs) assert.ok(Array.isArray(modules[s]) && modules[s].length, s);
});

test('valid brief is saved, normalised and reported as saved', async () => {
  setup();
  const r = await call(brief());
  assert.equal(r.code, 200); assert.equal(r.body.saved, true); assert.match(r.body.ref, /^BR-[A-Z2-9]{6}$/);
  const row = JSON.parse(dbWrites()[0].opts.body);
  assert.equal(row.email, 'ahmed@example.com'); assert.equal(row.timezone, 'Africa/Cairo');
});

test('malformed input is rejected and nothing is stored', async () => {
  setup();
  const bad = [null, 'x', [], { type: 'nope' }, brief({ email: 'not-an-email' }), brief({ email: 'a..b@x.com' }), brief({ name: 'A' }), brief({ items: [] }), brief({ items: [{ slug: 'nope' }] }), brief({ items: [{ slug: 'online-store' }, { slug: 'online-store' }] }),
    brief({ timezone: 'Mars/Base' }), brief({ project: { goal: 'x', intent: 'bogus' } }), brief({ project: { goal: '' } }), brief({ phone: 'abc' }), brief({ project: { goal: 'x', currency: 'usd!' } }), brief({ project: { goal: 'x', stake: '0' } }),
    brief({ items: [{ slug: 'online-store', mods: { 'Not a module': 1 } }] }), brief({ items: [{ slug: 'online-store', mods: { [modules['online-store'][0]]: 3 } }] }), brief({ items: [{ slug: 'online-store', threeD: 'Huge' }] }), brief({ items: [{ slug: 'online-store', users: ['Aliens'] }] })];
  for (const b of bad) { const r = await call(b); assert.ok([400].includes(r.code), JSON.stringify(b).slice(0, 80) + ' -> ' + r.code); }
  assert.equal(dbWrites().length, 0);
});

test('modules must belong to the chosen service slug', async () => {
  setup();
  const other = modules['crm'].find(m => !modules['online-store'].includes(m));
  assert.equal((await call(brief({ items: [{ slug: 'online-store', mods: { [other]: 1 } }] }))).code, 400);
  assert.equal((await call(brief({ items: [{ slug: 'online-store', mods: { [modules['online-store'][0]]: 1 } }] }))).code, 200);
});

test('no meeting step: an old front end that still sends `meet` is ignored (no error, nothing stored); a brief needs no meeting', async () => {
  setup();
  const old = { dur: 45, lang: 'English', slots: [{ d: '2031-02-31', f: '25:00', t: '01:00' }] };   // would have been invalid before Phase 2
  let r = await call(brief({ meet: old })); assert.equal(r.code, 200); assert.equal(r.body.saved, true);
  r = await call(brief({ meet: 'garbage' })); assert.equal(r.code, 200);
  r = await call(brief({ meet: null })); assert.equal(r.code, 200);
  for (const w of dbWrites()) { const row = JSON.parse(w.opts.body); assert.equal(row.payload.meet, undefined); assert.ok(!JSON.stringify(row).includes('2031-02-31')); }
  assert.equal(dbWrites().length, 3);
});

test('locale: the eight site languages are stored in payload.locale; anything else is ignored without an error', async () => {
  setup();
  for (const l of ['en', 'fr', 'de', 'zh', 'ru', 'pt', 'nl', 'ar']) { const r = await call(brief({ locale: l })); assert.equal(r.code, 200, l); }
  const rows = dbWrites().map(w => JSON.parse(w.opts.body));
  assert.deepEqual(rows.map(r => r.payload.locale), ['en', 'fr', 'de', 'zh', 'ru', 'pt', 'nl', 'ar']);
  for (const l of ['xx', 'EN', '', null, 5, { a: 1 }, ['de'], 'de\nBcc: x']) { const r = await call(brief({ locale: l })); assert.equal(r.code, 200, JSON.stringify(l)); }
  const rest = dbWrites().slice(8).map(w => JSON.parse(w.opts.body));
  assert.ok(rest.every(r => !('locale' in r.payload)), 'an unknown locale is not stored');
  assert.ok(rows.every(r => !('locale' in r)), 'no new column: only payload.locale');
});

test('"not sure yet" brief needs no types', async () => {
  setup();
  assert.equal((await call(brief({ items: [], project: { intent: 'unsure' } }))).code, 200);
  assert.equal((await call(brief({ items: [], project: { intent: 'sell', goal: 'x' } }))).code, 400);
});

test('oversized and wrong-type payloads', async () => {
  setup();
  assert.equal((await call(brief({ project: { goal: 'x'.repeat(200000) } }))).code, 413);
  assert.equal((await call(brief(), { headers: { 'content-length': '999999' } })).code, 413);
  assert.equal((await call('{bad json')).code, 400);
  assert.equal((await call(brief(), { headers: { 'content-type': 'text/plain' } })).code, 415);
  assert.equal((await call(brief({ project: { goal: 'x'.repeat(4001) } }))).code, 400);
  assert.equal(dbWrites().length, 0);
});

test('CORS: unknown, missing and wildcard origins are refused', async () => {
  setup();
  for (const origin of ['https://evil.example', 'https://x.evil.example', '', 'null']) {
    const r = await call(brief(), { origin }); assert.equal(r.code, 403); assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
  }
  const pre = await call(null, { method: 'OPTIONS', origin: 'https://evil.example' }); assert.equal(pre.code, 403);
  const ok = await call(null, { method: 'OPTIONS' }); assert.equal(ok.code, 204); assert.equal(ok.headers['Access-Control-Allow-Origin'], ORIGIN);
  const good = await call(brief()); assert.equal(good.headers['Access-Control-Allow-Origin'], ORIGIN); assert.notEqual(good.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(dbWrites().length, 1);
});

test('honeypot: looks successful but nothing is stored or emailed', async () => {
  setup({ RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com', EMAIL_FROM: 'a@b.c', NOTIFY_WEBHOOK_URL: 'https://hook.example/x' });
  const r = await call(brief({ website: 'http://spam.example' }));
  assert.equal(r.code, 200); assert.equal(dbWrites().length, 0); assert.equal(mails().length, 0);
  assert.equal(calls.filter(c => c.url.includes('hook.example')).length, 0);
});

test('Turnstile in production: missing secret fails explicitly, wrong token fails, good token passes', async () => {
  setup({ VERCEL_ENV: 'production' });
  let r = await call(brief());
  assert.equal(r.code, 503); assert.equal(r.body.code, 'protection_unavailable'); assert.equal(dbWrites().length, 0);
  assert.ok(logs.some(l => l.includes('turnstile_not_configured')));
  setup({ VERCEL_ENV: 'production', TURNSTILE_SECRET: 's' }); tsOk = false;
  r = await call(brief()); assert.equal(r.code, 400); assert.equal(r.body.code, 'verification'); assert.equal(dbWrites().length, 0);
  r = await call(brief({ turnstile: undefined })); assert.equal(r.code, 400);
  setup({ VERCEL_ENV: 'production', TURNSTILE_SECRET: 's' });
  r = await call(brief()); assert.equal(r.code, 200);
  setup({ VERCEL_ENV: 'production', TURNSTILE_REQUIRED: '0' });
  r = await call(brief()); assert.equal(r.code, 200, 'explicit opt-out');
});

test('API failures never produce a false saved state', async () => {
  setup(); dbStatus = 500;
  let r = await call(brief()); assert.equal(r.code, 502); assert.equal(r.body.ok, false); assert.equal(r.body.saved, undefined);
  setup({ SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' });
  r = await call(brief()); assert.equal(r.code, 503); assert.equal(r.body.ok, false);
  setup(); global.fetch = async () => { throw new Error('network down'); };
  r = await call(brief()); assert.equal(r.code, 502); assert.equal(r.body.ok, false);
});

test('database save is reported separately from email results', async () => {
  setup({ RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com', EMAIL_FROM: 'CULMERA <hello@verified.example>' }); mailStatus = 500;
  let r = await call(brief());
  assert.equal(r.code, 200); assert.equal(r.body.saved, true);
  assert.equal(r.body.notifications.owner, 'failed'); assert.equal(r.body.notifications.client, 'failed');
  setup({ RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com', EMAIL_FROM: 'CULMERA <hello@verified.example>' });
  r = await call(brief()); assert.equal(r.body.notifications.owner, 'sent'); assert.equal(r.body.notifications.client, 'sent');
  setup({});
  r = await call(brief()); assert.equal(r.body.notifications.client, 'skipped');
});

const MAILENV = { RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'founder@x.com, other@x.com', EMAIL_FROM: 'CULMERA <hello@verified.example>' };

test('thank-you: sent to the visitor right after the save, on by default, with the Founder as Reply-To, no price and no personal data from other people', async () => {
  setup({ ...MAILENV, NOTIFY_EMAIL_TO: 'founder@x.com' });
  const r = await call(brief()); assert.equal(r.code, 200); assert.equal(r.body.notifications.client, 'sent');
  const t = toClient(); assert.equal(t.length, 1);
  assert.equal(t[0].reply_to, 'founder@x.com'); assert.match(t[0].subject, /We received your project brief BR-/);
  assert.match(t[0].text, /within 24 hours/); assert.match(t[0].text, /including the price/); assert.match(t[0].text, /Hello Ahmed Test,/);
  assert.ok(!/\d+\s?(USD|EUR|EGP)|\$/.test(t[0].text), 'no price anywhere in the thank-you');
  assert.ok(!/meeting slot|choose a time/i.test(t[0].text), 'the thank-you does not talk about a meeting step');
  const saved = JSON.parse(dbWrites()[0].opts.body); assert.ok(t[0].subject.includes(r.body.ref) && saved.email === 'ahmed@example.com');
});

test('thank-you language: the visitor\'s locale (en/ar/de/fr), English for the others and when there is no locale', async () => {
  setup(MAILENV);
  const subj = {};
  for (const l of ['de', 'ar', 'fr', 'en', 'zh', 'ru', 'pt', 'nl', undefined]) { calls.length = 0; await call(brief({ locale: l })); subj[l] = toClient()[0].subject; }
  assert.match(subj.de, /Projektbriefing/); assert.match(subj.ar, /استلمنا/); assert.match(subj.fr, /brief/);
  for (const l of ['en', 'zh', 'ru', 'pt', 'nl', undefined]) assert.match(subj[l], /We received your project brief/, 'English for ' + l);
  assert.notEqual(subj.de, subj.fr);
});

test('thank-you: ONE retry when the first send fails; two failures are reported as failed and the brief is still saved', async () => {
  setup(MAILENV); mailFails['ahmed@example.com'] = 1;
  let r = await call(brief()); assert.equal(r.body.saved, true); assert.equal(r.body.notifications.client, 'sent'); assert.equal(toClient().length, 2, 'one failed + one retry');
  setup(MAILENV); mailFails['ahmed@example.com'] = 5;
  r = await call(brief()); assert.equal(r.code, 200); assert.equal(r.body.saved, true); assert.equal(r.body.notifications.client, 'failed'); assert.equal(r.body.notifications.owner, 'sent');
  assert.equal(toClient().length, 2, 'exactly one retry, never more');
});

test('thank-you never blocks saving: a failure of the Founder\'s email and of the visitor\'s email both leave a saved brief', async () => {
  setup(MAILENV); mailFails['founder@x.com'] = 9; mailFails['other@x.com'] = 9; mailFails['ahmed@example.com'] = 9;
  const r = await call(brief()); assert.equal(r.code, 200); assert.equal(r.body.saved, true); assert.equal(dbWrites().length, 1);
  assert.equal(r.body.notifications.owner, 'failed'); assert.equal(r.body.notifications.client, 'failed');
});

test('CONFIRM_CLIENT=0 turns the thank-you off; any other value (even 1 or empty) leaves it on; contact messages never get one', async () => {
  setup({ ...MAILENV, CONFIRM_CLIENT: '0' });
  let r = await call(brief()); assert.equal(r.body.notifications.client, 'skipped'); assert.equal(toClient().length, 0); assert.deepEqual(mailBodies().map(m => m.to[0]).sort(), ['founder@x.com', 'other@x.com'], 'only the Founder\'s emails');
  setup({ ...MAILENV, CONFIRM_CLIENT: '1' }); r = await call(brief()); assert.equal(r.body.notifications.client, 'sent');
  setup({ ...MAILENV, CONFIRM_CLIENT: '' }); r = await call(brief()); assert.equal(r.body.notifications.client, 'sent');
  setup(MAILENV); await call({ type: 'contact', elapsed: 30, turnstile: 't', name: 'Sara Ali', email: 'sara@x.com', message: 'Hi' });
  assert.equal(mailBodies().filter(m => m.to[0] === 'sara@x.com').length, 0);
});

test('NOTIFY_EMAIL_TO with several addresses: each one gets the Founder email (one failing address does not hide the other)', async () => {
  setup(MAILENV); let r = await call(brief());
  assert.deepEqual(mailBodies().filter(m => m.to[0] !== 'ahmed@example.com').map(m => m.to[0]).sort(), ['founder@x.com', 'other@x.com']); assert.equal(r.body.notifications.owner, 'sent');
  setup(MAILENV); mailFails['founder@x.com'] = 9; r = await call(brief()); assert.equal(r.body.notifications.owner, 'sent');
  setup({ ...MAILENV, NOTIFY_EMAIL_TO: 'bad address, ,' }); r = await call(brief()); assert.equal(r.body.notifications.owner, 'skipped');
});

test('REPLY_TO decides where the visitor\'s answer goes; otherwise the first Founder address; nothing valid means no Reply-To', async () => {
  setup({ ...MAILENV, REPLY_TO: 'Hello@Studio.example' }); await call(brief()); assert.equal(toClient()[0].reply_to, 'hello@studio.example');
  setup(MAILENV); await call(brief()); assert.equal(toClient()[0].reply_to, 'founder@x.com');
  setup({ ...MAILENV, REPLY_TO: 'not an address' }); await call(brief()); assert.equal(toClient()[0].reply_to, undefined);
});

test('the Founder\'s email shows the visitor language and has no meeting lines', async () => {
  setup({ ...MAILENV, NOTIFY_EMAIL_TO: 'founder@x.com' }); await call(brief({ locale: 'de' }));
  const f = mailBodies().find(m => m.to[0] === 'founder@x.com');
  assert.match(f.text, /Visitor language: de/); assert.ok(!/Meeting:|Preferred:|Backup:/.test(f.text));
  setup({ ...MAILENV, NOTIFY_EMAIL_TO: 'founder@x.com' }); await call(brief());
  assert.ok(!/Visitor language/.test(mailBodies().find(m => m.to[0] === 'founder@x.com').text));
});

test('production refuses the Resend test sender and an empty sender', async () => {
  setup({ VERCEL_ENV: 'production', TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com', EMAIL_FROM: 'CULMERA <onboarding@resend.dev>' });
  let r = await call(brief()); assert.equal(r.body.saved, true); assert.equal(r.body.notifications.owner, 'misconfigured'); assert.equal(mails().length, 0);
  setup({ VERCEL_ENV: 'production', TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com' });
  r = await call(brief()); assert.equal(r.body.notifications.owner, 'misconfigured');
  setup({ RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com' });
  r = await call(brief()); assert.equal(r.body.notifications.owner, 'sent', 'development default allowed');
});

test('subjects are single-line and logs hold no personal data or secrets', async () => {
  setup({ RESEND_API_KEY: 'k', NOTIFY_EMAIL_TO: 'me@x.com', EMAIL_FROM: 'a@b.c' });
  await call(brief({ company: 'Acme\r\nBcc: evil@x.com' }));
  const m = JSON.parse(mails()[0].opts.body);
  assert.ok(!/[\r\n]/.test(m.subject)); assert.ok(m.subject.includes('Acme Bcc: evil@x.com'));
  const all = logs.join('\n');
  for (const s of ['ahmed@example.com', 'Ahmed Test', 'sb_secret_x', 'Acme', '203.0.113']) assert.ok(!all.includes(s), 'log leaked ' + s);
});

test('rate limiting kicks in per client (in-memory fallback)', async () => {
  setup(); let last;
  for (let i = 0; i < 12; i++) last = await call(brief(), { headers: { 'x-vercel-forwarded-for': '198.51.100.9' } });
  assert.equal(last.code, 429);
});

test('rate limiting uses the distributed store when configured', async () => {
  setup({ UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 't' });
  const orig = global.fetch; let n = 0;
  global.fetch = async (u, o) => String(u).includes('redis.example') ? { ok: true, status: 200, json: async () => [{ result: ++n }, { result: 1 }] } : orig(u, o);
  for (let i = 0; i < 11; i++) await call(brief());
  assert.equal((await call(brief())).code, 429);
});

test('contact messages are validated, normalised and stored', async () => {
  setup();
  const c = o => ({ type: 'contact', elapsed: 30, turnstile: 't', name: 'Sara Ali', email: 'sara@x.com', message: 'Hello\r\n\r\n\r\n\r\nthere\u0000', ...o });
  assert.equal((await call(c({ message: '' }))).code, 400);
  const r = await call(c()); assert.equal(r.code, 200); assert.match(r.body.ref, /^CT-/);
  assert.equal(JSON.parse(dbWrites()[0].opts.body).message, 'Hello\n\nthere');
});

test('too-fast submissions are turned away (weak signal only)', async () => {
  setup(); assert.equal((await call(brief({ elapsed: 1 }))).code, 400); assert.equal((await call(brief({ elapsed: 'x' }))).code, 400);
});

test('wrong methods', async () => { setup(); assert.equal((await call(null, { method: 'GET' })).code, 405); });
