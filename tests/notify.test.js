'use strict';
/* Phase 5: notification rules of api/notify.js (and the invitation notice of api/admin.js) against a mock Supabase and a mock Resend.
   Nothing here touches the network. The database rules themselves are covered by `npm run test:rls`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/notify.js');
const admin = require('../api/admin.js');

const ORIGIN = 'https://site.example';
const KEYS = ['ALLOWED_ORIGIN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VERCEL_ENV', 'NODE_ENV', 'RESEND_API_KEY', 'NOTIFY_EMAIL_TO', 'EMAIL_FROM', 'NOTIFY_WEBHOOK_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'MEETING_TZ', 'OWNER_TZ', 'SITE_URL', 'NOTIFY_STAFF', 'CONFIRM_CLIENT', 'REPLY_TO'];
const BASE = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_x', VERCEL_ENV: 'development', RESEND_API_KEY: 'rk_test', NOTIFY_EMAIL_TO: 'founder@studio.test', EMAIL_FROM: 'CULMERA <info@verified.example>' };
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const U = { founder: id(1), dir: id(2), part: id(3), c1: id(11), c2: id(12), direct: id(13), old: id(14), orphan: id(15), susp: id(16), c3: id(17) };
const B = { b1: id(101), b2: id(102), draft: id(103), oldb: id(104), other: id(105), b3: id(106) };
const M = { m1: id(201), other: id(202), conf: id(203) };
const iso = ms => new Date(ms).toISOString();
const realFetch = global.fetch, realLog = { e: console.error, w: console.warn, l: console.log };
let st, calls, mails, logs, ipN = 0;

function reset(env = {}) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, BASE, env);
  require('../lib/shared').__reset();
  calls = []; mails = []; logs = [];
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  const now = Date.now();
  st = {
    mailStatus: 200, mailFail: {}, eventsMissing: false, thanksKindRejected: false, events: [], messages: {},
    profiles: {
      [U.founder]: { id: U.founder, role: 'founder', status: 'active', email: 'founder-profile@studio.test', full_name: 'Founder', locale: 'en', created_at: iso(now - 999e6) },
      [U.dir]: { id: U.dir, role: 'director', status: 'active', email: 'director@studio.test', full_name: 'Dina Director', locale: 'en', created_at: iso(now - 999e6) },
      [U.part]: { id: U.part, role: 'partner', status: 'active', email: 'partner@studio.test', full_name: 'Pat Partner', locale: 'en', created_at: iso(now - 999e6) },
      [U.c1]: { id: U.c1, role: 'client', status: 'active', email: 'client.one@secret-mail.test', full_name: 'Carla Client', locale: 'de', created_at: iso(now - 3600e3) },
      [U.c2]: { id: U.c2, role: 'client', status: 'active', email: 'client.two@secret-mail.test', full_name: 'Omar Other', locale: 'en', created_at: iso(now - 3600e3) },
      [U.c3]: { id: U.c3, role: 'client', status: 'active', email: 'client.three@secret-mail.test', full_name: 'Third Client', locale: 'en', created_at: iso(now - 3600e3) },
      [U.direct]: { id: U.direct, role: 'client', status: 'active', email: 'direct@secret-mail.test', full_name: 'Dora Direct', locale: 'en', created_at: iso(now - 3600e3) },
      [U.old]: { id: U.old, role: 'client', status: 'active', email: 'old@secret-mail.test', full_name: 'Olga Old', locale: 'en', created_at: iso(now - 30 * 864e5) },
      [U.susp]: { id: U.susp, role: 'client', status: 'suspended', email: 'susp@secret-mail.test', full_name: 'Sam Suspended', locale: 'en', created_at: iso(now - 3600e3) }
    },
    partners: { [U.dir]: { active: true, director_id: null }, [U.part]: { active: true, director_id: U.dir } },
    clients: {
      [U.c1]: { profile_id: U.c1, partner_id: U.part, code_used: 'PARTCODE', company: 'Acme Ltd', country: 'Germany', phone: '+49 555 0100' },
      [U.c2]: { profile_id: U.c2, partner_id: U.part, code_used: 'PARTCODE', company: 'Other Co', country: 'Egypt', phone: '+20 555 0100' },
      [U.c3]: { profile_id: U.c3, partner_id: U.dir, code_used: 'DIRCODE', company: 'Dir Co', country: 'France', phone: null },
      [U.direct]: { profile_id: U.direct, partner_id: null, code_used: null, company: 'Direct Co', country: 'Egypt', phone: null },
      [U.old]: { profile_id: U.old, partner_id: null, code_used: null, company: 'Old Co', country: 'Egypt', phone: null },
      [U.susp]: { profile_id: U.susp, partner_id: null, code_used: null, company: 'Susp Co', country: 'Egypt', phone: null }
    },
    briefs: {
      [B.b1]: { id: B.b1, ref: 'CB-AAAA1111', client_id: U.c1, status: 'submitted', selected_types: ['online-store', 'mobile-app'], submitted_at: iso(now - 60e3), answers: { secret: 'PRIVATE ANSWER TEXT' } },
      [B.b2]: { id: B.b2, ref: 'CB-BBBB2222', client_id: U.direct, status: 'submitted', selected_types: ['online-store'], submitted_at: iso(now - 60e3) },
      [B.draft]: { id: B.draft, ref: 'CB-CCCC3333', client_id: U.c1, status: 'draft', selected_types: [], submitted_at: null },
      [B.oldb]: { id: B.oldb, ref: 'CB-DDDD4444', client_id: U.c1, status: 'submitted', selected_types: ['online-store'], submitted_at: iso(now - 40 * 864e5) },
      [B.other]: { id: B.other, ref: 'CB-EEEE5555', client_id: U.c2, status: 'submitted', selected_types: ['online-store'], submitted_at: iso(now - 60e3) },
      [B.b3]: { id: B.b3, ref: 'CB-FFFF6666', client_id: U.c3, status: 'submitted', selected_types: ['online-store'], submitted_at: iso(now - 60e3) }
    },
    meetings: {
      [M.m1]: { id: M.m1, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 5 * 864e5), timezone: 'Europe/Berlin', duration_min: 45, status: 'requested', note: 'Please call after lunch, my private note' },
      [M.other]: { id: M.other, brief_id: B.other, client_id: U.c2, starts_at: iso(now + 5 * 864e5), timezone: 'Africa/Cairo', duration_min: 30, status: 'requested', note: null },
      [M.conf]: { id: M.conf, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 6 * 864e5), timezone: 'Africa/Cairo', duration_min: 30, status: 'confirmed', note: null }
    },
    inv: [], seq: 0
  };
  global.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)), m = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ u: String(url), host: u.host, m, body });
    const J = (s, d) => ({ ok: s < 400, status: s, json: async () => d });
    if (u.host === 'api.resend.com') {
      if (st.mailFail[body.to[0]] > 0) { st.mailFail[body.to[0]]--; return J(500, {}); }
      if (st.mailStatus < 400) mails.push(body); return J(st.mailStatus, { id: 'x' });
    }
    if (u.host !== 'db.example') return J(404, {});
    if (u.pathname === '/auth/v1/user') { const n = (opts.headers.Authorization || '').split('.')[1]; return U[n] ? J(200, { id: U[n] }) : J(401, {}); }
    if (u.pathname === '/auth/v1/invite') return J(200, {});
    const t = u.pathname.replace('/rest/v1/', ''), q = u.searchParams;
    const filt = rows => rows.filter(r => [...q.entries()].every(([k, v]) => {
      if (['select', 'limit', 'order'].includes(k)) return true;
      if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
      if (v.startsWith('like.')) return String(r[k]).startsWith(v.slice(5).replace(/\*$/, ''));
      return true;
    }));
    if (t === 'notify_events') {
      if (st.eventsMissing) return J(404, { code: 'PGRST205' });
      if (m === 'POST') { if (st.thanksKindRejected && body.kind === 'brief_thanks') return J(400, { code: '23514' }); if (st.events.some(e => e.key === body.key)) return J(409, { code: '23505' }); st.events.push({ ...body }); return J(201, null); }
      if (m === 'DELETE') { st.events = st.events.filter(e => e.key !== q.get('key').slice(3)); return J(204, null); }
      if (m === 'PATCH') { const e = st.events.find(x => x.key === q.get('key').slice(3)); if (e) Object.assign(e, body); return J(204, null); }
      return J(200, filt(st.events));
    }
    if (t === 'invitations') {
      if (m === 'DELETE') return J(204, null);
      if (m === 'POST') { const row = { id: id(900 + ++st.seq), ...body }; st.inv.push(row); return J(201, [row]); }
    }
    const tables = { profiles: Object.values(st.profiles), partners: Object.entries(st.partners).map(([k, v]) => ({ profile_id: k, ...v })), clients: Object.values(st.clients), client_briefs: Object.values(st.briefs), meetings: Object.values(st.meetings), brief_messages: Object.values(st.messages) };
    if (tables[t] && m === 'GET') return J(200, filt(tables[t]));
    return J(404, {});
  };
}
test.beforeEach(() => reset());
test.afterEach(() => { global.fetch = realFetch; console.error = realLog.e; console.warn = realLog.w; console.log = realLog.l; });

async function call(as, body, { origin = ORIGIN, method = 'POST', auth = true, ip } = {}, fn = handler) {
  const headers = { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': ip || '203.0.113.' + (++ipN % 250), ...(auth && as ? { authorization: 'Bearer a.' + as + '.c' } : {}) };
  const res = { headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await fn({ method, headers, body }, res); return res;
}
const to = () => mails.map(m => m.to[0]).sort();
const all = () => mails.map(m => m.subject + '\n' + m.text).join('\n----\n');
const FOUNDER = 'founder@studio.test';
const toF = () => mails.filter(m => m.to[0] === FOUNDER);                       // the Founder's own emails
const allF = () => toF().map(m => m.subject + '\n' + m.text).join('\n----\n');
const thanksMails = () => mails.filter(m => /^(We received|Wir haben|Nous avons|استلمنا)/.test(m.subject));

test('transport: origin, method, content type, token, event and id are checked before anything is read or sent', async () => {
  assert.equal((await call('c1', { event: 'registered' }, { origin: 'https://evil.example' })).code, 403);
  assert.equal((await call('c1', {}, { method: 'GET' })).code, 405);
  const o = await call('c1', null, { method: 'OPTIONS' }); assert.equal(o.code, 204); assert.match(o.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal((await call(null, { event: 'registered' })).code, 401);
  assert.equal((await call('nobody', { event: 'registered' })).code, 401);
  assert.equal((await call('c1', { event: 'nope' })).code, 400);
  assert.equal((await call('c1', { event: 'brief_submitted' })).code, 400);
  assert.equal((await call('c1', { event: 'meeting', id: 'not-a-uuid' })).code, 400);
  assert.equal((await call('c1', { event: 'registered', pad: 'x'.repeat(3000) })).code, 400);
  assert.equal(mails.length, 0); assert.equal(st.events.length, 0);
});

test('registered: ONLY the Founder is told (once, minimum detail), with the partner and the Director by name', async () => {
  const r = await call('c1', { event: 'registered' });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 1);
  assert.deepEqual(to(), [FOUNDER], 'no partner, no Director');
  const txt = all();
  assert.match(txt, /Carla Client/); assert.match(txt, /Acme Ltd/); assert.match(txt, /Germany/); assert.match(txt, /PARTCODE/);
  assert.match(txt, /^Partner: Pat Partner$/m); assert.match(txt, /^Director: Dina Director$/m);
  for (const secret of ['client.one@secret-mail.test', '+49 555 0100', 'partner@studio.test', 'director@studio.test']) assert.ok(!txt.includes(secret), 'must not be sent: ' + secret);
  assert.ok(mails.every(m => m.from === 'CULMERA <info@verified.example>'));
  assert.ok(mails.every(m => !/[\r\n]/.test(m.subject)));
  const again = await call('c1', { event: 'registered' });
  assert.equal(again.body.already, true); assert.equal(mails.length, 1, 'a repeat sends nothing');
});

test('chain: a direct client shows Direct / Direct; a Director-owned client shows the Director twice; a partner without a group shows Direct as Director', async () => {
  await call('direct', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER]); assert.match(all(), /^Partner: Direct$/m); assert.match(all(), /^Director: Direct$/m);
  mails.length = 0; await call('c3', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER]); assert.match(all(), /^Partner: Dina Director$/m); assert.match(all(), /^Director: Dina Director$/m);
  mails.length = 0; st.partners[U.part].director_id = null; st.events = []; await call('c1', { event: 'registered' });
  assert.match(all(), /^Partner: Pat Partner$/m); assert.match(all(), /^Director: Direct$/m);
});

test('NOTIFY_STAFF=1 brings the old behaviour back: owner and the partner\'s Director are told too; direct clients tell only the Founder', async () => {
  reset({ NOTIFY_STAFF: '1' });
  let r = await call('c1', { event: 'registered' }); assert.equal(r.body.sent, 3); assert.deepEqual(to(), ['director@studio.test', FOUNDER, 'partner@studio.test']);
  mails.length = 0; await call('direct', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER]);
  mails.length = 0; await call('c3', { event: 'registered' }); assert.deepEqual(to(), ['director@studio.test', FOUNDER]);
  reset({ NOTIFY_STAFF: '0' }); await call('c1', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER], 'only the value 1 turns it on');
});

test('registered: old accounts, staff and suspended users trigger nothing', async () => {
  for (const who of ['old', 'part', 'dir', 'founder', 'susp']) { const r = await call(who, { event: 'registered' }); assert.equal(r.code, 200, who); assert.equal(r.body.sent, 0, who); }
  assert.equal(mails.length, 0); assert.equal(st.events.length, 0);
});

test('with NOTIFY_STAFF=1 a deactivated partner or Director still receives nothing; the Founder always does', async () => {
  reset({ NOTIFY_STAFF: '1' });
  st.partners[U.part].active = false; await call('c1', { event: 'registered' });
  assert.deepEqual(to(), [FOUNDER], 'the partner is off, and the Director only follows an active partner');
  mails.length = 0; st.events = []; st.partners[U.part].active = true; st.partners[U.dir].active = false;
  await call('c1', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER, 'partner@studio.test']);
  mails.length = 0; st.events = []; st.profiles[U.part].status = 'suspended'; st.partners[U.dir].active = true;
  await call('c1', { event: 'registered' }); assert.deepEqual(to(), [FOUNDER]);
});

test('the Founder address falls back to the Founder profile when NOTIFY_EMAIL_TO is empty; several addresses are all used and duplicates merged', async () => {
  reset({ NOTIFY_EMAIL_TO: '' }); await call('direct', { event: 'registered' }); assert.deepEqual(to(), ['founder-profile@studio.test']);
  reset({ NOTIFY_EMAIL_TO: 'a@studio.test, b@studio.test, A@studio.test' }); await call('direct', { event: 'registered' }); assert.deepEqual(to(), ['a@studio.test', 'b@studio.test']);
  reset({ NOTIFY_STAFF: '1', NOTIFY_EMAIL_TO: 'partner@studio.test' }); await call('c1', { event: 'registered' });
  assert.deepEqual(to(), ['director@studio.test', 'partner@studio.test'], 'one email per address even when two roles match');
});

test('brief_submitted: only the owner of a really submitted, recent brief; the Founder gets reference, counts and the chain, never answers', async () => {
  assert.equal((await call('c1', { event: 'brief_submitted', id: B.other })).code, 404, 'someone else\'s brief');
  assert.equal((await call('c1', { event: 'brief_submitted', id: id(999) })).code, 404);
  assert.equal((await call('c1', { event: 'brief_submitted', id: B.draft })).code, 409, 'a draft is not news');
  const old = await call('c1', { event: 'brief_submitted', id: B.oldb }); assert.equal(old.body.skipped, 'old');
  assert.equal(mails.length, 0);
  const r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 1); assert.equal(r.body.thanks, 'sent');
  assert.deepEqual(to(), ['client.one@secret-mail.test', FOUNDER], 'the Founder and the client only: no partner, no Director');
  const txt = allF(); assert.match(txt, /CB-AAAA1111/); assert.match(txt, /Types chosen: 2/); assert.match(txt, /Acme Ltd/); assert.match(txt, /^Partner: Pat Partner$/m); assert.match(txt, /^Director: Dina Director$/m);
  for (const secret of ['PRIVATE ANSWER TEXT', 'client.one@secret-mail.test', '+49 555 0100', 'online-store']) assert.ok(!txt.includes(secret), 'leaked ' + secret);
  const again = await call('c1', { event: 'brief_submitted', id: B.b1 }); assert.equal(again.body.already, true); assert.equal(again.body.thanks, 'dup'); assert.equal(mails.length, 2);
});

test('brief_submitted: a brief that was submitted again later (new submitted_at) is a new event, with a new thank-you', async () => {
  await call('c1', { event: 'brief_submitted', id: B.b1 }); mails.length = 0;
  st.briefs[B.b1].submitted_at = iso(Date.now() - 1000);
  const r = await call('c1', { event: 'brief_submitted', id: B.b1 }); assert.equal(r.body.sent, 1); assert.equal(r.body.thanks, 'sent'); assert.equal(mails.length, 2);
});

test('thank-you to the account holder: his language (brief locale, else profile locale), English for the rest, Reply-To the Founder, own claim', async () => {
  await call('c1', { event: 'brief_submitted', id: B.b1 });                      // profile locale de, brief has no locale -> German
  let t = thanksMails(); assert.equal(t.length, 1); assert.equal(t[0].to[0], 'client.one@secret-mail.test'); assert.match(t[0].subject, /Wir haben Ihr Projektbriefing erhalten CB-AAAA1111/);
  assert.equal(t[0].reply_to, FOUNDER); assert.match(t[0].text, /Guten Tag Carla Client,/); assert.match(t[0].text, /24 Stunden/);
  assert.deepEqual(st.events.map(e => e.key.split(':')[0] + '/' + e.kind).sort(), ['brief/brief_submitted', 'thanks/brief_thanks']);
  assert.ok(st.events.find(e => e.kind === 'brief_thanks').key.startsWith('thanks:' + B.b1 + ':'));
  mails.length = 0; st.events = []; st.briefs[B.b1].locale = 'ar'; await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.match(thanksMails()[0].subject, /استلمنا/, 'the brief language wins over the profile language');
  mails.length = 0; st.events = []; st.briefs[B.b1].locale = 'zh'; await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.match(thanksMails()[0].subject, /We received your project brief/, 'Chinese gets English');
  mails.length = 0; st.events = []; await call('direct', { event: 'brief_submitted', id: B.b2 });
  assert.match(thanksMails()[0].subject, /We received your project brief CB-BBBB2222/); assert.match(thanksMails()[0].text, /within 24 hours/);
});

test('thank-you retry is its own thing: if only the thank-you fails its claim is released and a retry sends ONLY the thank-you', async () => {
  st.mailFail['client.one@secret-mail.test'] = 1;
  let r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 1); assert.equal(r.body.thanks, 'retry'); assert.equal(r.body.retry, true);
  assert.equal(toF().length, 1); assert.equal(thanksMails().length, 0);
  assert.deepEqual(st.events.map(e => e.kind), ['brief_submitted'], 'the Founder claim is kept, the thank-you claim was released');
  r = await call('c1', { event: 'brief_submitted', id: B.b1 });   // the browser asks again
  assert.equal(r.body.already, true, 'the Founder is not told twice'); assert.equal(r.body.thanks, 'sent'); assert.equal(r.body.retry, undefined);
  assert.equal(toF().length, 1); assert.equal(thanksMails().length, 1);
  r = await call('c1', { event: 'brief_submitted', id: B.b1 }); assert.equal(r.body.thanks, 'dup'); assert.equal(mails.length, 2, 'then nothing more');
});

test('thank-you: CONFIRM_CLIENT=0 turns it off (no claim either); a missing client address is skipped; the Founder email is unaffected', async () => {
  reset({ CONFIRM_CLIENT: '0' }); let r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.thanks, 'off'); assert.equal(r.body.sent, 1); assert.equal(thanksMails().length, 0); assert.deepEqual(st.events.map(e => e.kind), ['brief_submitted']);
  reset(); st.profiles[U.c1].email = 'not-an-address'; r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.thanks, 'skipped'); assert.equal(r.body.sent, 1); assert.deepEqual(to(), [FOUNDER]);
});

test('thank-you: when its claim cannot be written (migration 008 not run) the Founder is still told and nothing breaks', async () => {
  st.thanksKindRejected = true; const r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 1); assert.equal(r.body.thanks, 'skipped'); assert.deepEqual(to(), [FOUNDER]);
  assert.ok(logs.join('\n').includes('migration-008'));
});

test('no mail key: the Founder message and the thank-you both ask for a retry and keep no claim; webhook-only setup is not retried', async () => {
  reset({ RESEND_API_KEY: '' }); let r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.retry, true); assert.equal(r.body.thanks, 'retry'); assert.equal(st.events.length, 0);
  reset({ RESEND_API_KEY: '', NOTIFY_WEBHOOK_URL: 'https://hooks.example/x' }); const orig = global.fetch;
  global.fetch = async (u, o) => String(u).startsWith('https://hooks.example') ? { ok: true, status: 200, json: async () => ({}) } : orig(u, o);
  r = await call('c1', { event: 'brief_submitted', id: B.b1 }); assert.equal(r.body.thanks, 'skipped'); assert.equal(r.body.retry, undefined);
});

test('meeting: requested, then moved, then cancelled: each is one message with the right wording and the studio time', async () => {
  assert.equal((await call('c1', { event: 'meeting', id: M.other })).code, 404, 'someone else\'s meeting');
  assert.equal((await call('c1', { event: 'meeting', id: M.conf })).body.skipped, 'staff_state', 'a confirmed meeting is the team\'s state');
  assert.equal(mails.length, 0);
  let r = await call('c1', { event: 'meeting', id: M.m1 }); assert.equal(r.body.sent, 1);
  assert.match(mails[0].subject, /^Call requested CB-AAAA1111/); assert.match(mails[0].text, /A client requested a call\./);
  assert.match(mails[0].text, /\(Africa\/Cairo\)/); assert.match(mails[0].text, /Client time zone: Europe\/Berlin, length 45 min/); assert.match(mails[0].text, /read it in the console/); assert.match(mails[0].text, /^Partner: Pat Partner$/m); assert.match(mails[0].text, /^Director: Dina Director$/m);
  assert.ok(!all().includes('my private note'), 'the note text never travels by email');
  assert.equal((await call('c1', { event: 'meeting', id: M.m1 })).body.already, true);
  mails.length = 0; st.meetings[M.m1].starts_at = iso(Date.now() + 9 * 864e5);
  r = await call('c1', { event: 'meeting', id: M.m1 }); assert.equal(r.body.sent, 1); assert.match(mails[0].subject, /^Call moved CB-AAAA1111/); assert.match(mails[0].text, /moved a call/);
  mails.length = 0; st.meetings[M.m1].status = 'cancelled';
  r = await call('c1', { event: 'meeting', id: M.m1 }); assert.equal(r.body.sent, 1); assert.match(mails[0].subject, /^Call cancelled CB-AAAA1111/); assert.match(mails[0].text, /cancelled a call/);
});

test('email failures everywhere release the claim so a retry works; partial failure keeps it', async () => {
  st.mailStatus = 500;
  let r = await call('c1', { event: 'registered' }); assert.equal(r.code, 200); assert.equal(r.body.sent, 0); assert.equal(r.body.retry, true); assert.equal(st.events.length, 0);
  st.mailStatus = 200; r = await call('c1', { event: 'registered' }); assert.equal(r.body.sent, 1); assert.equal(st.events.length, 1);
  assert.deepEqual(st.events[0].result, { sent: 1, failed: 0, skipped: 0 }, 'only counts are recorded');
  reset({ NOTIFY_EMAIL_TO: 'a@studio.test, b@studio.test' }); st.mailFail['a@studio.test'] = 1;
  r = await call('c1', { event: 'registered' }); assert.equal(r.body.sent, 1); assert.equal(r.body.retry, undefined, 'partial failure keeps the claim'); assert.equal(st.events.length, 1);
});

test('no mail key: nothing is sent, the claim is released and a retry is asked for, so the event is not lost', async () => {
  reset({ RESEND_API_KEY: '' }); const r = await call('c1', { event: 'registered' });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 0); assert.equal(r.body.retry, true); assert.equal(calls.filter(c => c.host === 'api.resend.com').length, 0);
  assert.equal(st.events.length, 0, 'no claim is kept for an event nobody was told about');
});

test('production refuses the Resend test sender: no email, the claim is released, a retry is asked for', async () => {
  reset({ VERCEL_ENV: 'production', EMAIL_FROM: 'CULMERA <onboarding@resend.dev>' });
  const r = await call('c1', { event: 'registered' }); assert.equal(r.code, 200); assert.equal(r.body.sent, 0); assert.equal(r.body.retry, true); assert.equal(mails.length, 0);
  assert.equal(st.events.length, 0);
  assert.ok(logs.join('\n').includes('mail_sender_not_verified'));
});

test('a setting fixed after a failed first try: the same event is then sent exactly once', async () => {
  reset({ RESEND_API_KEY: '' }); let r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.retry, true); assert.equal(mails.length, 0);
  process.env.RESEND_API_KEY = 'rk_test';            // the owner fixes the Vercel variable
  r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.sent > 0, true); const n = mails.length; assert.ok(n > 0);
  r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.already, true); assert.equal(mails.length, n, 'no second email set');
});

test('webhook only setup (no mail key): the chat message is the notification, no retry, no repeat', async () => {
  reset({ RESEND_API_KEY: '', NOTIFY_WEBHOOK_URL: 'https://hooks.example/x' });
  const hooks = []; const orig = global.fetch;
  global.fetch = async (u, o) => String(u).startsWith('https://hooks.example') ? (hooks.push(JSON.parse(o.body)), { ok: true, status: 200, json: async () => ({}) }) : orig(u, o);
  const r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.retry, undefined); assert.equal(hooks.length, 1);
  const r2 = await call('c1', { event: 'brief_submitted', id: B.b1 }); assert.equal(r2.body.already, true); assert.equal(hooks.length, 1);
});

test('mail failing everywhere does not post the chat message, so a retry cannot repeat it', async () => {
  reset({ NOTIFY_WEBHOOK_URL: 'https://hooks.example/x' }); st.mailStatus = 500;
  const hooks = []; const orig = global.fetch;
  global.fetch = async (u, o) => String(u).startsWith('https://hooks.example') ? (hooks.push(JSON.parse(o.body)), { ok: true, status: 200, json: async () => ({}) }) : orig(u, o);
  const r = await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(r.body.retry, true); assert.equal(hooks.length, 0); assert.equal(st.events.length, 0);
});

test('migration not run: a clear 503, nothing sent', async () => {
  st.eventsMissing = true; const r = await call('c1', { event: 'registered' });
  assert.equal(r.code, 503); assert.equal(r.body.code, 'not_ready'); assert.equal(mails.length, 0); assert.ok(logs.join('\n').includes('migration-005'));
});

/* ---------- client_reply ---------- */
const RM = { plain: id(301), withCall: id(302), fromFounder: id(303), old: id(304), other: id(305), cancelledCall: id(306) };
function seedReplies() {
  const now = Date.now();
  const row = (i, o) => ({ id: i, brief_id: B.b1, client_id: U.c1, sender: 'client', kind: 'reply', body: 'PRIVATE REPLY TEXT', price_text: null, meeting_id: null, created_at: iso(now - 60e3), ...o });
  st.messages = {
    [RM.plain]: row(RM.plain), [RM.withCall]: row(RM.withCall, { meeting_id: M.m1 }),
    [RM.fromFounder]: row(RM.fromFounder, { sender: 'founder', price_text: 'PRICE 4500 EUR' }),
    [RM.old]: row(RM.old, { created_at: iso(now - 9 * 864e5) }), [RM.other]: row(RM.other, { brief_id: B.other, client_id: U.c2 })
  };
}
test('client_reply: the Founder alone is told THAT the client replied, with the chain, never the text, the price or the client\'s email', async () => {
  seedReplies();
  const r = await call('c1', { event: 'client_reply', id: RM.plain });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 1); assert.deepEqual(to(), [FOUNDER]);
  const m = mails[0]; assert.match(m.subject, /^Client reply CB-AAAA1111: Acme Ltd$/); assert.match(m.text, /^A client replied\.$/m);
  assert.match(m.text, /Carla Client/); assert.match(m.text, /^Partner: Pat Partner$/m); assert.match(m.text, /^Director: Dina Director$/m);
  assert.match(m.text, /The client did not choose a call time\./); assert.match(m.text, /Read the reply in the console\./);
  for (const secret of ['PRIVATE REPLY TEXT', 'PRICE 4500', 'client.one@secret-mail.test', '+49 555 0100', 'partner@studio.test', 'director@studio.test']) assert.ok(!all().includes(secret), 'leaked ' + secret);
  assert.deepEqual(st.events.map(e => e.key + '/' + e.kind), ['reply:' + RM.plain + '/client_reply']);
  const again = await call('c1', { event: 'client_reply', id: RM.plain }); assert.equal(again.body.already, true); assert.equal(mails.length, 1);
});

test('client_reply with a chosen time: the time (studio zone) and the client time zone are shown, and it says the call still needs the Founder', async () => {
  seedReplies(); const r = await call('c1', { event: 'client_reply', id: RM.withCall }); assert.equal(r.body.sent, 1);
  assert.match(mails[0].text, /The client chose a call time: .*\(Africa\/Cairo\) \(client time zone Europe\/Berlin, length 45 min\)/);
  assert.match(mails[0].text, /not confirmed until you confirm it and add the Teams link/); assert.ok(!all().includes('my private note'));
  mails.length = 0; st.events = []; st.meetings[M.m1].status = 'cancelled';
  await call('c1', { event: 'client_reply', id: RM.withCall }); assert.match(mails[0].text, /did not choose a call time/, 'a cancelled call is not offered as a time');
});

test('client_reply: only the client\'s own, recent, client-written message counts; nothing else is accepted', async () => {
  seedReplies();
  assert.equal((await call('c1', { event: 'client_reply', id: RM.other })).code, 404, 'someone else\'s message');
  assert.equal((await call('c1', { event: 'client_reply', id: RM.fromFounder })).code, 404, 'a Founder message is not a client reply');
  assert.equal((await call('c1', { event: 'client_reply', id: id(999) })).code, 404);
  assert.equal((await call('c1', { event: 'client_reply', id: 'nope' })).code, 400);
  assert.equal((await call('c1', { event: 'client_reply' })).code, 400);
  assert.equal((await call('c1', { event: 'client_reply', id: RM.old })).body.skipped, 'old');
  assert.equal((await call(null, { event: 'client_reply', id: RM.plain })).code, 401);
  assert.equal(mails.length, 0); assert.equal(st.events.length, 0);
});

test('client_reply: a failed email releases the claim so the browser can retry; the migration missing is a clear 503', async () => {
  seedReplies(); st.mailStatus = 500;
  let r = await call('c1', { event: 'client_reply', id: RM.plain }); assert.equal(r.body.retry, true); assert.equal(st.events.length, 0);
  st.mailStatus = 200; r = await call('c1', { event: 'client_reply', id: RM.plain }); assert.equal(r.body.sent, 1); assert.equal(st.events.length, 1);
  reset(); seedReplies(); st.eventsMissing = true; assert.equal((await call('c1', { event: 'client_reply', id: RM.plain })).code, 503);
});

test('client_reply with NOTIFY_STAFF=1 also tells the owning partner and Director (and still never the text)', async () => {
  reset({ NOTIFY_STAFF: '1' }); seedReplies(); const r = await call('c1', { event: 'client_reply', id: RM.plain });
  assert.equal(r.body.sent, 3); assert.deepEqual(to(), ['director@studio.test', FOUNDER, 'partner@studio.test']); assert.ok(!all().includes('PRIVATE REPLY TEXT'));
});

test('rate limits: per address before the token, and per signed-in user', async () => {
  let last; for (let i = 0; i < 61; i++) last = await call(null, { event: 'registered' }, { ip: '198.51.100.7' });
  assert.equal(last.code, 429);
  reset(); for (let i = 0; i < 21; i++) last = await call('c1', { event: 'meeting', id: M.conf });
  assert.equal(last.code, 429);
});

test('the shared limiter uses Upstash when configured', async () => {
  reset({ UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 't' });
  const orig = global.fetch; let n = 0;
  global.fetch = async (u, o) => String(u).includes('redis.example') ? { ok: true, status: 200, json: async () => [{ result: ++n }, { result: 1 }] } : orig(u, o);
  let last; for (let i = 0; i < 61; i++) last = await call('c1', { event: 'meeting', id: M.conf });
  assert.equal(last.code, 429); assert.ok(n >= 61);
});

test('logs hold no names, emails, message text, secrets or addresses; the service key only goes to Supabase', async () => {
  seedReplies();
  await call('c1', { event: 'registered' }); await call('c1', { event: 'brief_submitted', id: B.b1 }); await call('c1', { event: 'meeting', id: M.m1 }); await call('c1', { event: 'client_reply', id: RM.withCall });
  const text = logs.join('\n');
  for (const s of ['Carla', 'Acme', 'secret-mail', 'founder@studio', 'partner@studio', 'private note', 'PRIVATE REPLY', 'PRICE 4500', 'Pat Partner', 'Dina', 'sb_secret_x', 'rk_test', 'Bearer', '203.0.113']) assert.ok(!text.includes(s), 'log leaked ' + s);
  assert.ok(calls.filter(c => c.host !== 'db.example' && c.host !== 'api.resend.com').length === 0);
  assert.ok(calls.filter(c => c.host === 'db.example').every(c => !c.u.includes('sb_secret_x')));
});

test('webhook (optional): only the subject line is posted, nothing else', async () => {
  reset({ NOTIFY_WEBHOOK_URL: 'https://hooks.example/x' });
  const hooks = []; const orig = global.fetch;
  global.fetch = async (u, o) => String(u).startsWith('https://hooks.example') ? (hooks.push(JSON.parse(o.body)), { ok: true, status: 200, json: async () => ({}) }) : orig(u, o);
  await call('c1', { event: 'brief_submitted', id: B.b1 });
  assert.equal(hooks.length, 1); assert.match(hooks[0].content, /Brief submitted CB-AAAA1111/); assert.ok(!hooks[0].content.includes('secret-mail'));
});

/* ---------- invitation notice (api/admin.js) ---------- */
const adminCall = (as, body) => call(as, body, {}, admin);
test('invitation: the Founder is told; a partner placed in a group also tells that group\'s Director; failure never breaks the invitation', async () => {
  let r = await adminCall('founder', { action: 'invite', email: 'new.partner@x.test', role: 'partner', director_id: U.dir });
  assert.equal(r.code, 200); assert.equal(r.body.notified, 'sent'); assert.deepEqual(to(), ['director@studio.test', 'founder@studio.test']);
  assert.match(all(), /Invited: new\.partner@x\.test/); assert.match(all(), /Role: Partner\n/);
  mails.length = 0; r = await adminCall('founder', { action: 'invite', email: 'new.director@x.test', role: 'director' });
  assert.deepEqual(to(), ['founder@studio.test']); assert.match(all(), /Role: Partner Director/);
  mails.length = 0; st.mailStatus = 500; r = await adminCall('founder', { action: 'invite', email: 'third@x.test', role: 'partner' });
  assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.equal(r.body.notified, 'failed');
  mails.length = 0; st.mailStatus = 200; r = await adminCall('dir', { action: 'invite', email: 'mine@x.test', role: 'partner' });
  assert.equal(r.code, 403); assert.deepEqual(to(), []);   // since Phase 9 only the Founder invites: a Director's attempt is refused and nobody is told
});
