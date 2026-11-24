'use strict';
/* Phase 2.1: api/reply.js against a mock Supabase and a mock Resend (no network).
   Covers: who may call, reply (account + visitor), confirm, resend, req_id, link validation, failed email, nothing private in logs.
   The database rules themselves (RLS, constraints, triggers) are proven by `npm run test:rls`, not here. */
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/reply.js');

const ORIGIN = 'https://site.example';
const KEYS = ['ALLOWED_ORIGIN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VERCEL_ENV', 'NODE_ENV', 'RESEND_API_KEY', 'NOTIFY_EMAIL_TO', 'EMAIL_FROM', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SITE_URL', 'REPLY_TO', 'RATE_LIMIT_SALT'];
const BASE = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_x', VERCEL_ENV: 'development', RESEND_API_KEY: 'rk_test', NOTIFY_EMAIL_TO: 'founder@studio.test', EMAIL_FROM: 'CULMERA <info@verified.example>' };
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const U = { founder: id(1), dir: id(2), part: id(3), c1: id(11), c2: id(12), off: id(4), susp: id(5) };
const B = { b1: id(101), draft: id(103), b2: id(105) };
const M = { m1: id(201), other: id(202), cancelled: id(203), past: id(204), far: id(205), conf: id(206) };
const REF = { b1: 'CB-AAAA1111', draft: 'CB-CCCC3333', b2: 'CB-EEEE5555', none: 'CB-ZZZZ9999', vis: 'BR-ABC123', visNoLoc: 'BR-NOLOC1', visBadMail: 'BR-BADML1' };
const SECRET = { body: 'SECRET-BODY-TEXT-4711', price: 'EUR 12345 SECRET-PRICE', link: 'https://teams.example/l/meetup-join/SECRET-LINK-99', email: 'carla.secret@client-mail.test', name: 'Carla Clientname', vemail: 'vera@visitor-mail.test', note: 'SECRET-NOTE-TEXT' };
const DAY = 864e5, iso = ms => new Date(ms).toISOString();
const realFetch = global.fetch, realLog = { e: console.error, w: console.warn, l: console.log };
let st, calls, mails, logs;

function reset(env = {}) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, BASE, env);
  handler.__test.reset();
  calls = []; mails = []; logs = [];
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  const now = Date.now();
  st = {
    mailStatus: 200, mailFail: {}, seq: 0, insertFail: {}, stateFail: false, meetingRace: false, dbDown: false,
    profiles: {
      [U.founder]: { id: U.founder, role: 'founder', status: 'active', email: 'founder-profile@studio.test', full_name: 'Founder', locale: 'en' },
      [U.dir]: { id: U.dir, role: 'director', status: 'active', email: 'director@studio.test', full_name: 'Dina Director', locale: 'en' },
      [U.part]: { id: U.part, role: 'partner', status: 'active', email: 'partner@studio.test', full_name: 'Pat Partner', locale: 'en' },
      [U.c1]: { id: U.c1, role: 'client', status: 'active', email: SECRET.email, full_name: SECRET.name, locale: 'fr' },
      [U.c2]: { id: U.c2, role: 'client', status: 'active', email: 'client.two@secret-mail.test', full_name: 'Omar Other', locale: 'en' },
      [U.off]: { id: U.off, role: 'partner', status: 'active', email: 'off@studio.test', full_name: 'Off Partner', locale: 'en' },
      [U.susp]: { id: U.susp, role: 'founder', status: 'suspended', email: 'susp@studio.test', full_name: 'Suspended', locale: 'en' }
    },
    partners: { [U.dir]: true, [U.part]: true, [U.off]: false },
    client_briefs: {
      [B.b1]: { id: B.b1, ref: REF.b1, client_id: U.c1, status: 'submitted', locale: 'de' },
      [B.draft]: { id: B.draft, ref: REF.draft, client_id: U.c1, status: 'draft', locale: null },
      [B.b2]: { id: B.b2, ref: REF.b2, client_id: U.c2, status: 'in_review', locale: null }
    },
    briefs: [
      { ref: REF.vis, name: 'Vera Visitor', email: SECRET.vemail, payload: { locale: 'fr' } },
      { ref: REF.visNoLoc, name: 'Nora NoLocale', email: 'nora@visitor-mail.test', payload: {} },
      { ref: REF.visBadMail, name: 'Bad Mail', email: 'not-an-email', payload: { locale: 'de' } }
    ],
    meetings: {
      [M.m1]: { id: M.m1, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 5 * DAY), timezone: 'Europe/Berlin', duration_min: 45, status: 'requested', teams_url: null },
      [M.other]: { id: M.other, brief_id: B.b2, client_id: U.c2, starts_at: iso(now + 5 * DAY), timezone: 'Africa/Cairo', duration_min: 30, status: 'requested', teams_url: null },
      [M.cancelled]: { id: M.cancelled, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 5 * DAY), timezone: 'Europe/Berlin', duration_min: 30, status: 'cancelled', teams_url: null },
      [M.past]: { id: M.past, brief_id: B.b1, client_id: U.c1, starts_at: iso(now - 2 * DAY), timezone: 'Europe/Berlin', duration_min: 30, status: 'requested', teams_url: null },
      [M.far]: { id: M.far, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 500 * DAY), timezone: 'Europe/Berlin', duration_min: 30, status: 'requested', teams_url: null },
      [M.conf]: { id: M.conf, brief_id: B.b1, client_id: U.c1, starts_at: iso(now + 6 * DAY), timezone: 'Africa/Cairo', duration_min: 30, status: 'confirmed', teams_url: 'https://teams.example/old-link-123' }
    },
    brief_messages: [], visitor_replies: []
  };
  global.fetch = mockFetch;
}

/* PostgREST-style filters used by api/reply.js: col=eq.x, col=in.(a,b), or=(...) */
function orMatch(row, v) {
  if (/email_status\.in\.\(failed,skipped\)/.test(v) && (row.email_status === 'failed' || row.email_status === 'skipped')) return true;
  const m = /email_at\.lt\.([^)]+)\)/.exec(v);
  return !!(m && /email_status\.eq\.sending/.test(v) && row.email_status === 'sending' && row.email_at < m[1]);
}
function matches(row, q) {
  for (const [k, v] of q) {
    if (k === 'select' || k === 'order' || k === 'limit') continue;
    if (k === 'or') { if (!orMatch(row, v)) return false; continue; }
    if (v.startsWith('eq.')) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(row[k])) return false; }
    else return false;
  }
  return true;
}
async function mockFetch(url, opts = {}) {
  const u = new URL(String(url)), m = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined, h = opts.headers || {};
  calls.push({ u: String(url), host: u.host, m, body, path: u.pathname });
  const J = (s, d) => ({ ok: s < 400, status: s, json: async () => d });
  if (u.host === 'api.resend.com') {
    if (st.mailFail[body.to[0]] > 0) { st.mailFail[body.to[0]]--; return J(500, {}); }
    if (st.mailStatus < 400) mails.push(body);
    return J(st.mailStatus, { id: 'x' });
  }
  if (u.host !== 'db.example') return J(404, {});
  if (st.dbDown) throw new Error('connection refused');
  if (u.pathname === '/auth/v1/user') { const n = (h.Authorization || '').split('.')[1]; return U[n] ? J(200, { id: U[n] }) : J(401, {}); }
  const t = u.pathname.replace('/rest/v1/', ''), q = u.searchParams;
  const sel = a => J(200, a);
  if (t === 'profiles') return sel(Object.values(st.profiles).filter(r => matches(r, q)));
  if (t === 'partners') { const pid = q.get('profile_id').slice(3); return sel(pid in st.partners ? [{ active: st.partners[pid] }] : []); }
  if (t === 'client_briefs') return sel(Object.values(st.client_briefs).filter(r => matches(r, q)));
  if (t === 'briefs') return sel(st.briefs.filter(r => matches(r, q)));
  if (t === 'meetings') {
    if (m === 'GET') return sel(Object.values(st.meetings).filter(r => matches(r, q)));
    if (m === 'PATCH') {
      if (st.meetingRace) Object.values(st.meetings).forEach(r => { if (r.status === 'requested') r.status = 'cancelled'; });
      const rows = Object.values(st.meetings).filter(r => matches(r, q));
      rows.forEach(r => Object.assign(r, body));
      return J(200, rows);
    }
  }
  if (t === 'brief_messages' || t === 'visitor_replies') {
    const rows = st[t];
    if (m === 'GET') return sel(rows.filter(r => matches(r, q)));
    if (m === 'POST') {
      const kind = body.kind || 'reply';
      if (st.insertFail[t] || st.insertFail[t + ':' + kind]) return J(st.insertFail[t] || st.insertFail[t + ':' + kind], {});
      if (body.req_id && rows.some(r => r.req_id === body.req_id)) return J(409, {});
      const row = { id: id(1000 + ++st.seq), created_at: iso(Date.now()), ...body };
      rows.push(row); return J(201, [row]);
    }
    if (m === 'PATCH') {
      if (st.stateFail && !q.get('or')) return J(500, {});
      const hit = rows.filter(r => matches(r, q)); hit.forEach(r => Object.assign(r, body));
      return (h.Prefer || '').includes('representation') ? J(200, hit) : J(204, null);
    }
  }
  return J(404, {});
}
test.beforeEach(() => reset());
test.afterEach(() => { global.fetch = realFetch; console.error = realLog.e; console.warn = realLog.w; console.log = realLog.l; });

async function call(as, body, { origin = ORIGIN, method = 'POST', auth = true, headers = {} } = {}) {
  const hd = { origin, 'content-type': 'application/json', ...(auth && as ? { authorization: 'Bearer ' + (as.includes('.') ? as : 'a.' + as + '.c') } : {}), ...headers };
  const res = { headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, headers: hd, body }, res); return res;
}
const writes = () => calls.filter(c => c.host === 'db.example' && c.m !== 'GET' && c.path !== '/auth/v1/user');
const rq = n => id(5000 + n);
const rep = (ref, extra) => ({ action: 'reply', ref, body: 'Hello, here is our answer.', ...extra });
const conf = (extra) => ({ action: 'confirm', ref: REF.b1, meeting_id: M.m1, teams_url: SECRET.link, ...extra });

/* ================= transport and permissions ================= */
test('transport: origin, method, content type, size, JSON, token, action', async () => {
  assert.equal((await call('founder', rep(REF.b1), { origin: 'https://evil.example' })).code, 403);
  assert.equal((await call('founder', {}, { method: 'GET' })).code, 405);
  const o = await call('founder', null, { method: 'OPTIONS' }); assert.equal(o.code, 204); assert.match(o.headers['Access-Control-Allow-Headers'], /Authorization/); assert.equal(o.headers['Access-Control-Allow-Origin'], ORIGIN);
  assert.equal((await call('founder', null, { method: 'OPTIONS', origin: 'https://evil.example' })).code, 403);
  assert.equal((await call('founder', rep(REF.b1), { headers: { 'content-type': 'text/plain' } })).code, 415);
  assert.equal((await call('founder', rep(REF.b1), { headers: { 'content-length': String(30 * 1024) } })).code, 413);
  assert.equal((await call('founder', 'not json')).code, 400);
  assert.equal((await call('founder', [1, 2])).code, 400);
  assert.equal((await call('founder', null)).code, 400);
  assert.equal((await call(null, rep(REF.b1))).code, 401);                       // no token
  assert.equal((await call('nobody', rep(REF.b1))).code, 401);                   // a token Supabase does not know
  assert.equal((await call('a.b', rep(REF.b1), { headers: { authorization: 'Bearer not-a-jwt' } })).code, 401);
  assert.equal((await call('founder', { action: 'drop_everything', ref: REF.b1 })).code, 400);
  assert.equal((await call('founder', { ref: REF.b1 })).code, 400);
  assert.equal((await call('founder', { action: 'reply', ref: REF.b1, body: 'x' }, { origin: ORIGIN })).code, 200);
  assert.equal(mails.length, 1, 'only the last, valid call sent a mail');
});

test('transport failures write nothing and send nothing', async () => {
  reset();
  await call('founder', rep(REF.b1), { origin: 'https://evil.example' });
  await call(null, rep(REF.b1)); await call('nobody', rep(REF.b1));
  await call('founder', rep(REF.b1), { headers: { 'content-type': 'text/plain' } });
  assert.equal(writes().length, 0); assert.equal(mails.length, 0);
});

test('only the Founder: client, partner, director, deactivated partner, suspended founder and anonymous are refused, on every action', async () => {
  const bodies = [rep(REF.b1), rep(REF.vis), conf(), { action: 'resend', ref: REF.b1, id: id(1) }];
  for (const who of ['c1', 'c2', 'part', 'dir', 'off', 'susp']) for (const b of bodies) {
    const r = await call(who, b); assert.equal(r.code, 403, who + ' ' + b.action); assert.equal(r.body.code, 'forbidden');
  }
  for (const b of bodies) assert.equal((await call(null, b)).code, 401);
  assert.equal(writes().length, 0, 'nothing was written'); assert.equal(mails.length, 0, 'nothing was sent');
  assert.equal(calls.filter(c => /brief_messages|visitor_replies|meetings|client_briefs|\/briefs/.test(c.path)).length, 0, 'not even read');
});

test('the role comes from the database: a request that claims role=founder is still refused', async () => {
  const r = await call('c1', { ...rep(REF.b1), role: 'founder', as: 'founder', user: U.founder });
  assert.equal(r.code, 403); assert.equal(writes().length, 0);
});

/* ================= reply: account brief ================= */
test('reply to an account brief: saved first, then emailed to the client in his language, state recorded', async () => {
  const r = await call('founder', rep(REF.b1, { body: SECRET.body, price: SECRET.price, propose_meeting: true, req_id: rq(1) }));
  assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.equal(r.body.email, 'sent'); assert.ok(r.body.id);
  assert.equal(st.brief_messages.length, 1); const row = st.brief_messages[0];
  assert.deepEqual([row.brief_id, row.client_id, row.sender, row.kind, row.body, row.price_text, row.proposes_meeting, row.req_id], [B.b1, U.c1, 'founder', 'reply', SECRET.body, SECRET.price, true, rq(1)]);
  assert.equal(row.email_status, 'sent'); assert.ok(row.email_at);
  assert.equal(mails.length, 1); const m = mails[0];
  assert.deepEqual(m.to, [SECRET.email]); assert.equal(m.reply_to, 'founder@studio.test'); assert.equal(m.from, 'CULMERA <info@verified.example>');
  assert.match(m.subject, /Antwort auf Ihr Briefing CB-AAAA1111/, 'the brief locale (de) wins over the profile locale (fr)');
  assert.ok(m.text.includes(SECRET.body) && m.text.includes(SECRET.price)); assert.match(m.text, /Termin/); assert.ok(m.text.includes('https://culmera-solutions.com/#/account') || m.text.includes(ORIGIN + '/#/account'));
  const order = calls.filter(c => c.host === 'db.example' && c.m !== 'GET' || c.host === 'api.resend.com').map(c => c.host + ' ' + c.m + ' ' + c.path);
  assert.deepEqual(order, ['db.example POST /rest/v1/brief_messages', 'api.resend.com POST /emails', 'db.example PATCH /rest/v1/brief_messages']);
});

test('reply: the profile language is used when the brief has none; unknown languages get English', async () => {
  await call('founder', rep(REF.b2));                                            // brief locale null, profile en
  assert.match(mails[0].subject, /Our reply to your brief CB-EEEE5555/);
  st.client_briefs[B.b2].locale = 'zh'; await call('founder', rep(REF.b2));
  assert.match(mails[1].subject, /Our reply to your brief/);
  st.client_briefs[B.b2].locale = 'ar'; await call('founder', rep(REF.b2));
  assert.match(mails[2].subject, /ردّنا على بريف مشروعك/);
});

test('reply: no price and no meeting proposal means none in the row and none in the email', async () => {
  await call('founder', rep(REF.b2, { price: '   ' }));
  const row = st.brief_messages[0]; assert.equal(row.price_text, null); assert.equal(row.proposes_meeting, false);
  assert.ok(!/Price:/.test(mails[0].text)); assert.ok(!/choose a time/.test(mails[0].text)); assert.match(mails[0].text, /#\/account/);
});

test('reply: the message text is cleaned (control characters, bidi marks, extra blank lines)', async () => {
  await call('founder', rep(REF.b2, { body: '  Line one\u0000\u202E  \r\n\r\n\r\n\r\nLine   two\u0007  ' }));
  assert.equal(st.brief_messages[0].body, 'Line one\n\nLine two');
});

test('reply: validation, nothing is written and nothing is sent on a bad request', async () => {
  const bad = [
    [{ ref: 'CB-short' }, 'ref'], [{ ref: 'XX-AAAA1111' }, 'ref'], [{ ref: 123 }, 'ref'], [{ ref: undefined }, 'ref'],
    [{ ref: "CB-AAAA1111' or 1=1" }, 'ref'],
    [{ body: '' }, 'body'], [{ body: '   \n  ' }, 'body'], [{ body: undefined }, 'body'], [{ body: 5 }, 'body'], [{ body: 'x'.repeat(4001) }, 'body'], [{ body: 'x'.repeat(16001) }, 'body'], [{ body: { a: 1 } }, 'body'],
    [{ price: 'p'.repeat(121) }, 'price'], [{ price: 7 }, 'price'], [{ price: 'p'.repeat(481) }, 'price'],
    [{ propose_meeting: 'yes' }, 'propose'], [{ propose_meeting: 1 }, 'propose'],
    [{ req_id: 'nope' }, 'req_id'], [{ req_id: 5 }, 'req_id']
  ];
  for (const [patch, code] of bad) { const r = await call('founder', { ...rep(REF.b1), ...patch }); assert.equal(r.code, 400, JSON.stringify(patch).slice(0, 60)); assert.equal(r.body.code, code); }
  assert.equal(writes().length, 0); assert.equal(mails.length, 0);
  assert.equal((await call('founder', rep(REF.b1, { body: 'x'.repeat(4000), price: 'p'.repeat(120) }))).code, 200, 'the limits themselves are allowed');
});

test('reply: a draft brief is 409, an unknown brief is 404, nothing is written', async () => {
  let r = await call('founder', rep(REF.draft)); assert.equal(r.code, 409); assert.equal(r.body.code, 'draft');
  r = await call('founder', rep(REF.none)); assert.equal(r.code, 404);
  r = await call('founder', rep('BR-NOPE99')); assert.equal(r.code, 404);
  assert.equal(writes().length, 0); assert.equal(mails.length, 0);
});

test('req_id: a repeated press is {already:true}, no second message, no second email', async () => {
  const a = await call('founder', rep(REF.b1, { req_id: rq(7) })); assert.equal(a.code, 200); assert.ok(!a.body.already);
  const b = await call('founder', rep(REF.b1, { req_id: rq(7) })); assert.equal(b.code, 200); assert.equal(b.body.already, true);
  assert.equal(st.brief_messages.length, 1); assert.equal(mails.length, 1);
  const c = await call('founder', rep(REF.b1, { req_id: rq(8) })); assert.ok(!c.body.already); assert.equal(st.brief_messages.length, 2);
  const d = await call('founder', rep(REF.b1)); const e = await call('founder', rep(REF.b1));           // no req_id: no protection, two messages
  assert.ok(!d.body.already && !e.body.already); assert.equal(st.brief_messages.length, 4);
});

test('req_id: two presses at the same instant give one message (the unique index answers 409 to the loser)', async () => {
  const [a, b] = await Promise.all([call('founder', rep(REF.b1, { req_id: rq(9) })), call('founder', rep(REF.b1, { req_id: rq(9) }))]);
  assert.deepEqual([a.code, b.code], [200, 200]);
  assert.equal(st.brief_messages.length, 1); assert.equal(mails.length, 1);
  assert.equal([a, b].filter(r => r.body.already).length, 1);
});

/* ================= reply: visitor (no account) ================= */
test('reply to a visitor: email only, kept in visitor_replies, language from payload.locale, Reply-To set, no account link', async () => {
  const r = await call('founder', rep(REF.vis, { body: SECRET.body, price: SECRET.price, propose_meeting: true, req_id: rq(20) }));
  assert.equal(r.code, 200); assert.equal(r.body.email, 'sent');
  assert.equal(st.brief_messages.length, 0, 'nothing in the account conversation'); assert.equal(st.visitor_replies.length, 1);
  const row = st.visitor_replies[0]; assert.deepEqual([row.brief_ref, row.body, row.price_text, row.proposes_meeting, row.email_status], [REF.vis, SECRET.body, SECRET.price, true, 'sent']);
  assert.ok(!('client_id' in row) && !('brief_id' in row));
  const m = mails[0]; assert.deepEqual(m.to, [SECRET.vemail]); assert.equal(m.reply_to, 'founder@studio.test');
  assert.match(m.subject, /Notre réponse à votre brief BR-ABC123/);
  assert.ok(m.text.includes(SECRET.body) && m.text.includes(SECRET.price));
  assert.ok(!/#\/account/.test(m.text), 'a visitor has no account to open'); assert.match(m.text, /répondez à cet e-mail/);
});

test('reply to a visitor: English by default, no meeting text without the proposal, a repeated req_id is harmless', async () => {
  const a = await call('founder', rep(REF.visNoLoc, { req_id: rq(21) })); assert.equal(a.body.email, 'sent');
  assert.match(mails[0].subject, /Our reply to your brief BR-NOLOC1/); assert.ok(!/reply to this email/.test(mails[0].text));
  const b = await call('founder', rep(REF.visNoLoc, { req_id: rq(21) })); assert.equal(b.body.already, true);
  assert.equal(st.visitor_replies.length, 1); assert.equal(mails.length, 1);
});

test('reply to a visitor with an unusable email address: saved, email skipped, can be resent later', async () => {
  const r = await call('founder', rep(REF.visBadMail)); assert.equal(r.code, 200); assert.equal(r.body.email, 'skipped');
  assert.equal(st.visitor_replies[0].email_status, 'skipped'); assert.equal(mails.length, 0);
});

/* ================= failed emails and failed saves ================= */
test('failed email: the message stays, answer is 200 with email:failed, state failed', async () => {
  st.mailStatus = 500;
  const r = await call('founder', rep(REF.b1, { body: SECRET.body })); assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.equal(r.body.email, 'failed');
  assert.equal(st.brief_messages.length, 1); assert.equal(st.brief_messages[0].email_status, 'failed');
});

test('no mail key: saved, email skipped. A production sender that is not verified: saved, email failed (misconfigured), never sent', async () => {
  reset({ RESEND_API_KEY: '' });
  let r = await call('founder', rep(REF.b1)); assert.equal(r.code, 200); assert.equal(r.body.email, 'skipped'); assert.equal(st.brief_messages[0].email_status, 'skipped');
  reset({ VERCEL_ENV: 'production', EMAIL_FROM: 'CULMERA <onboarding@resend.dev>' });
  r = await call('founder', rep(REF.b1)); assert.equal(r.code, 200); assert.equal(r.body.email, 'failed'); assert.equal(st.brief_messages[0].email_status, 'failed');
  assert.equal(calls.filter(c => c.host === 'api.resend.com').length, 0, 'the unverified sender was never used');
});

test('the email state could not be recorded: still 200, with a warning that holds no message text', async () => {
  st.stateFail = true;
  const r = await call('founder', rep(REF.b1, { body: SECRET.body })); assert.equal(r.code, 200); assert.equal(r.body.email, 'sent');
  assert.ok(logs.some(l => l.includes('email_state_not_recorded'))); assert.ok(!logs.join('\n').includes(SECRET.body));
});

test('the message cannot be saved: 502 (503 when migration 008 is missing), and then NO email is sent', async () => {
  st.insertFail.brief_messages = 500;
  let r = await call('founder', rep(REF.b1)); assert.equal(r.code, 502); assert.equal(r.body.code, 'not_saved');
  st.insertFail.brief_messages = 404;
  r = await call('founder', rep(REF.b1)); assert.equal(r.code, 503);
  assert.ok(logs.some(l => l.includes('migration-008')), 'the log tells the operator what to check');
  st.insertFail.visitor_replies = 500; r = await call('founder', rep(REF.vis)); assert.equal(r.code, 502);
  assert.equal(mails.length, 0); assert.equal(st.brief_messages.length + st.visitor_replies.length, 0);
});

test('the database is down: 502, generic message, nothing leaks', async () => {
  st.dbDown = true;
  const r = await call('founder', rep(REF.b1, { body: SECRET.body })); assert.equal(r.code, 502); assert.equal(r.body.code, 'server');
  assert.ok(!JSON.stringify(r.body).includes('connection refused'));
  st.dbDown = false; delete process.env.SUPABASE_URL;
  const r2 = await call('founder', rep(REF.b1)); assert.ok([401, 502, 503].includes(r2.code)); assert.equal(mails.length, 0);
});

/* ================= confirm ================= */
test('confirm: the meeting becomes confirmed with the link, a message is added, the client is emailed with HIS time zone', async () => {
  const r = await call('founder', conf({ body: SECRET.note, req_id: rq(30) }));
  assert.equal(r.code, 200); assert.equal(r.body.email, 'sent');
  assert.deepEqual([st.meetings[M.m1].status, st.meetings[M.m1].teams_url], ['confirmed', SECRET.link]);
  const row = st.brief_messages[0];
  assert.deepEqual([row.brief_id, row.client_id, row.sender, row.kind, row.body, row.meeting_id, row.req_id, row.email_status], [B.b1, U.c1, 'founder', 'meeting_confirmed', SECRET.note, M.m1, rq(30), 'sent']);
  assert.ok(!('price_text' in row) || row.price_text == null); assert.ok(!row.proposes_meeting);
  const m = mails[0]; assert.deepEqual(m.to, [SECRET.email]); assert.match(m.subject, /Ihr Termin ist bestätigt \(CB-AAAA1111\)/);
  assert.ok(m.text.includes(SECRET.link)); assert.ok(m.text.includes('(Europe/Berlin)')); assert.match(m.text, /Dauer: 45 Minuten/); assert.ok(m.text.includes(SECRET.note));
  const when = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' }).format(new Date(st.meetings[M.m1].starts_at));
  assert.ok(m.text.includes(when), 'the time is shown in the client time zone and language');
  const order = calls.filter(c => c.host === 'db.example' && c.m !== 'GET' || c.host === 'api.resend.com').map(c => c.m + ' ' + c.path);
  assert.deepEqual(order, ['PATCH /rest/v1/meetings', 'POST /rest/v1/brief_messages', 'POST /emails', 'PATCH /rest/v1/brief_messages']);
});

test('confirm: the Founder may move the time; the new time is saved and emailed', async () => {
  const t = iso(Date.now() + 9 * DAY);
  const r = await call('founder', conf({ starts_at: t })); assert.equal(r.code, 200);
  assert.equal(st.meetings[M.m1].starts_at, t);
  const when = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' }).format(new Date(t));
  assert.ok(mails[0].text.includes(when));
  assert.ok(logs.some(l => l.includes('"moved":true')));
});

test('confirm: the note is optional', async () => {
  const r = await call('founder', conf()); assert.equal(r.code, 200);
  assert.equal(st.brief_messages[0].body, ''); assert.ok(mails[0].text.includes(SECRET.link));
});

test('confirm: the Teams link is strictly checked (https only, 12..500 characters, no spaces, no credentials, a real URL)', async () => {
  const badLinks = ['http://teams.example/l/meetup-join/abc', 'javascript:alert(1)//https://x.example', 'https://a.b', 'https://', 'https://teams.example/join me', 'https://teams.example/a\nb', ' https://teams.example/l/meetup-join/abc',
    'https://user:pass@teams.example/l/meetup-join/abc', 'https://teams.example/' + 'a'.repeat(500), 'ftp://teams.example/l/meetup-join/abc', 'teams.example/l/meetup-join/abc', '', null, undefined, 12345678901234, { u: 1 }, ['https://teams.example/l/meetup-join/abc'], 'HTTP://teams.example/l/meetup-join/abc', 'data:text/html,<script>alert(1)</script>'];
  for (const link of badLinks) { const r = await call('founder', conf({ teams_url: link })); assert.equal(r.code, 400, String(link).slice(0, 50)); assert.equal(r.body.code, 'teams_url'); }
  assert.equal(st.meetings[M.m1].status, 'requested'); assert.equal(st.brief_messages.length, 0); assert.equal(mails.length, 0);
  const T = handler.__test.teamsLink;
  assert.equal(T('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7b%7d'), 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7b%7d');
  assert.equal(T('https://meet.example.org/room/123'), 'https://meet.example.org/room/123', 'not tied to a Teams domain');
  assert.equal(T('https://a.example/' + 'a'.repeat(482)), 'https://a.example/' + 'a'.repeat(482), '500 characters is the limit');
  assert.equal(T('https://a.bc'), 'https://a.bc', '12 characters is the minimum');
  assert.equal(T('https://a.example/' + 'a'.repeat(483)), undefined);
  assert.equal((await call('founder', conf({ teams_url: 'https://teams.example/ok-link-1' }))).code, 200);
});

test('confirm: other bad input', async () => {
  const bad = [[{ ref: REF.vis }, 'ref'], [{ ref: 'nope' }, 'ref'], [{ meeting_id: 'x' }, 'meeting'], [{ meeting_id: undefined }, 'meeting'], [{ body: 'x'.repeat(4001) }, 'body'], [{ body: 5 }, 'body'],
    [{ starts_at: 'tomorrow' }, 'starts_at'], [{ starts_at: 12345 }, 'starts_at'], [{ starts_at: iso(Date.now() - DAY) }, 'starts_at'], [{ starts_at: iso(Date.now() + 401 * DAY) }, 'starts_at'], [{ req_id: 'nope' }, 'req_id']];
  for (const [patch, code] of bad) { const r = await call('founder', conf(patch)); assert.equal(r.code, 400, JSON.stringify(patch)); assert.equal(r.body.code, code); }
  assert.equal(writes().length, 0); assert.equal(mails.length, 0);
});

test('confirm: the meeting must belong to THIS brief and THIS client, be requested or confirmed, and lie in the future', async () => {
  let r = await call('founder', conf({ meeting_id: M.other })); assert.equal(r.code, 404);                       // another client's meeting
  r = await call('founder', conf({ meeting_id: id(999) })); assert.equal(r.code, 404);
  r = await call('founder', conf({ ref: REF.b2, meeting_id: M.m1 })); assert.equal(r.code, 404);                // right meeting, wrong brief
  r = await call('founder', conf({ meeting_id: M.cancelled })); assert.equal(r.code, 409); assert.equal(r.body.code, 'state');
  r = await call('founder', conf({ meeting_id: M.past })); assert.equal(r.code, 400); assert.equal(r.body.code, 'starts_at');
  r = await call('founder', conf({ meeting_id: M.far })); assert.equal(r.code, 400);
  r = await call('founder', conf({ ref: REF.none })); assert.equal(r.code, 404);
  assert.equal(writes().length, 0); assert.equal(mails.length, 0);
  assert.equal(st.meetings[M.other].status, 'requested'); assert.equal(st.meetings[M.cancelled].status, 'cancelled');
});

test('confirm: the client cancelled while the Founder was typing, so nothing is confirmed and nobody is told (409)', async () => {
  st.meetingRace = true;
  const r = await call('founder', conf()); assert.equal(r.code, 409); assert.equal(r.body.code, 'state');
  assert.equal(st.meetings[M.m1].status, 'cancelled'); assert.equal(st.brief_messages.length, 0); assert.equal(mails.length, 0);
});

test('confirm: confirming an already confirmed call is allowed (new link or time) and sends a new confirmation', async () => {
  const r = await call('founder', conf({ meeting_id: M.conf, teams_url: 'https://teams.example/new-link-456', req_id: rq(31) }));
  assert.equal(r.code, 200); assert.equal(st.meetings[M.conf].teams_url, 'https://teams.example/new-link-456');
  assert.equal(st.brief_messages.length, 1); assert.equal(mails.length, 1); assert.ok(mails[0].text.includes('new-link-456'));
});

test('confirm: a repeated req_id changes nothing and sends nothing more', async () => {
  await call('founder', conf({ req_id: rq(32) }));
  const again = await call('founder', conf({ req_id: rq(32), teams_url: 'https://teams.example/other-link-789' }));
  assert.equal(again.code, 200); assert.equal(again.body.already, true);
  assert.equal(st.brief_messages.length, 1); assert.equal(mails.length, 1); assert.equal(st.meetings[M.m1].teams_url, SECRET.link, 'the second link was not applied');
});

test('confirm: the message cannot be saved: the call IS confirmed, the answer says to press again, and pressing again finishes the job', async () => {
  st.insertFail['brief_messages:meeting_confirmed'] = 500;
  let r = await call('founder', conf()); assert.equal(r.code, 502); assert.equal(r.body.code, 'message_not_saved');
  assert.equal(st.meetings[M.m1].status, 'confirmed'); assert.equal(mails.length, 0);
  st.insertFail = {};
  r = await call('founder', conf()); assert.equal(r.code, 200); assert.equal(st.brief_messages.length, 1); assert.equal(mails.length, 1);
});

test('confirm: the meeting cannot be saved (e.g. migration 008 missing): 502, nothing else happens', async () => {
  const f = global.fetch; global.fetch = async (u, o = {}) => (String(u).includes('/rest/v1/meetings') && o.method === 'PATCH' ? { ok: false, status: 400, json: async () => ({}) } : f(u, o));
  const r = await call('founder', conf()); assert.equal(r.code, 502); assert.equal(r.body.code, 'not_saved');
  assert.equal(st.brief_messages.length, 0); assert.equal(mails.length, 0); assert.ok(logs.some(l => l.includes('migration-008')));
});

test('confirm: the email fails, the state is recorded as failed, and the Founder can resend it', async () => {
  st.mailStatus = 500;
  const r = await call('founder', conf()); assert.equal(r.code, 200); assert.equal(r.body.email, 'failed');
  assert.equal(st.meetings[M.m1].status, 'confirmed'); assert.equal(st.brief_messages[0].email_status, 'failed');
  st.mailStatus = 200;
  const s = await call('founder', { action: 'resend', ref: REF.b1, id: r.body.id }); assert.equal(s.code, 200); assert.equal(s.body.email, 'sent');
  assert.equal(mails.length, 1); assert.ok(mails[0].text.includes(SECRET.link)); assert.match(mails[0].subject, /Ihr Termin ist bestätigt/); assert.equal(st.brief_messages[0].email_status, 'sent');
});

/* ================= resend ================= */
async function failedReply(ref = REF.b1) { st.mailStatus = 500; const r = await call('founder', rep(ref, { body: SECRET.body, price: SECRET.price, propose_meeting: true })); st.mailStatus = 200; mails.length = 0; return r.body.id; }

test('resend: a failed email is sent again (same content, same language), once', async () => {
  const mid = await failedReply();
  const r = await call('founder', { action: 'resend', ref: REF.b1, id: mid }); assert.equal(r.code, 200); assert.equal(r.body.email, 'sent');
  assert.equal(mails.length, 1); assert.ok(mails[0].text.includes(SECRET.body) && mails[0].text.includes(SECRET.price)); assert.match(mails[0].subject, /Antwort auf Ihr Briefing/); assert.deepEqual(mails[0].to, [SECRET.email]); assert.equal(mails[0].reply_to, 'founder@studio.test');
  assert.equal(st.brief_messages[0].email_status, 'sent'); assert.equal(st.brief_messages.length, 1, 'no new message');
  const again = await call('founder', { action: 'resend', ref: REF.b1, id: mid }); assert.equal(again.code, 409); assert.equal(again.body.code, 'not_resendable');
  assert.equal(mails.length, 1);
});

test('resend: a skipped email can be re-sent once the mail key exists', async () => {
  reset({ RESEND_API_KEY: '' }); const r = await call('founder', rep(REF.b1)); assert.equal(r.body.email, 'skipped');
  process.env.RESEND_API_KEY = 'rk_test';
  const s = await call('founder', { action: 'resend', ref: REF.b1, id: r.body.id }); assert.equal(s.code, 200); assert.equal(s.body.email, 'sent'); assert.equal(mails.length, 1);
});

test('resend: a sent email, and one still being sent, are 409 and send nothing', async () => {
  const ok = await call('founder', rep(REF.b1)); mails.length = 0;
  assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: ok.body.id })).code, 409);
  st.brief_messages[0].email_status = 'sending'; st.brief_messages[0].email_at = iso(Date.now() - 60e3);
  assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: ok.body.id })).code, 409);
  assert.equal(mails.length, 0);
});

test('resend: a message stuck in "sending" for over 5 minutes may be re-sent', async () => {
  const ok = await call('founder', rep(REF.b1)); mails.length = 0;
  st.brief_messages[0].email_status = 'sending'; st.brief_messages[0].email_at = iso(Date.now() - 6 * 60e3);
  const r = await call('founder', { action: 'resend', ref: REF.b1, id: ok.body.id }); assert.equal(r.code, 200); assert.equal(mails.length, 1); assert.equal(st.brief_messages[0].email_status, 'sent');
});

test('resend: two presses at the same instant send ONE email (atomic claim)', async () => {
  const mid = await failedReply();
  const [a, b] = await Promise.all([call('founder', { action: 'resend', ref: REF.b1, id: mid }), call('founder', { action: 'resend', ref: REF.b1, id: mid })]);
  assert.deepEqual([a.code, b.code].sort(), [200, 409]); assert.equal(mails.length, 1);
});

test('resend: a failed resend leaves the message resendable', async () => {
  const mid = await failedReply(); st.mailStatus = 500;
  const r = await call('founder', { action: 'resend', ref: REF.b1, id: mid }); assert.equal(r.code, 200); assert.equal(r.body.email, 'failed'); assert.equal(st.brief_messages[0].email_status, 'failed');
  st.mailStatus = 200; assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: mid })).body.email, 'sent');
});

test('resend: only the Founder\'s own messages of THAT brief: a client message, another brief\'s message or an unknown id is 404', async () => {
  const mid = await failedReply();
  st.brief_messages.push({ id: id(777), brief_id: B.b1, client_id: U.c1, sender: 'client', kind: 'reply', body: 'client text', email_status: null });
  assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: id(777) })).code, 404);
  assert.equal((await call('founder', { action: 'resend', ref: REF.b2, id: mid })).code, 404);
  assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: id(888) })).code, 404);
  assert.equal((await call('founder', { action: 'resend', ref: REF.none, id: mid })).code, 404);
  assert.equal(mails.length, 0); assert.equal(st.brief_messages[0].email_status, 'failed');
});

test('resend: validation', async () => {
  for (const b of [{ ref: 'bad', id: id(1) }, { ref: REF.b1, id: 'bad' }, { ref: REF.b1 }, { ref: REF.b1, id: 5 }]) assert.equal((await call('founder', { action: 'resend', ...b })).code, 400);
  assert.equal(writes().length, 0);
});

test('resend: a visitor reply can be re-sent', async () => {
  st.mailStatus = 500; const r = await call('founder', rep(REF.vis, { body: SECRET.body })); st.mailStatus = 200; mails.length = 0;
  const s = await call('founder', { action: 'resend', ref: REF.vis, id: r.body.id }); assert.equal(s.code, 200); assert.equal(s.body.email, 'sent');
  assert.deepEqual(mails[0].to, [SECRET.vemail]); assert.ok(mails[0].text.includes(SECRET.body)); assert.equal(st.visitor_replies[0].email_status, 'sent');
  assert.equal((await call('founder', { action: 'resend', ref: REF.visNoLoc, id: r.body.id })).code, 404, 'another visitor\'s brief');
});

test('resend: a confirmation is not re-sent after the call was cancelled or moved away from confirmed (409, BEFORE the claim)', async () => {
  st.mailStatus = 500; const c = await call('founder', conf()); st.mailStatus = 200; mails.length = 0;
  st.meetings[M.m1].status = 'cancelled'; st.meetings[M.m1].teams_url = null;
  const r = await call('founder', { action: 'resend', ref: REF.b1, id: c.body.id }); assert.equal(r.code, 409); assert.equal(r.body.code, 'state');
  assert.equal(st.brief_messages[0].email_status, 'failed', 'the claim was not taken'); assert.equal(mails.length, 0);
  st.meetings[M.m1].status = 'requested';
  assert.equal((await call('founder', { action: 'resend', ref: REF.b1, id: c.body.id })).code, 409);
  st.meetings[M.m1].status = 'confirmed'; st.meetings[M.m1].teams_url = 'https://teams.example/after-link-1';
  const ok = await call('founder', { action: 'resend', ref: REF.b1, id: c.body.id }); assert.equal(ok.code, 200); assert.ok(mails[0].text.includes('after-link-1'), 'the CURRENT link is sent');
});

test('resend: the claim cannot be made (database error) is 502 and sends nothing', async () => {
  const mid = await failedReply(); const f = global.fetch;
  global.fetch = async (u, o = {}) => (o.method === 'PATCH' && String(u).includes('brief_messages') ? { ok: false, status: 500, json: async () => ({}) } : f(u, o));
  const r = await call('founder', { action: 'resend', ref: REF.b1, id: mid }); assert.equal(r.code, 502); assert.equal(mails.length, 0);
});

/* ================= rate limits ================= */
test('rate limit: per signed-in user (40 per 10 minutes) and per address before the token is even checked (60)', async () => {
  let last;
  for (let i = 0; i < 41; i++) last = await call('founder', { action: 'nope' });
  assert.equal(last.code, 429); assert.equal(last.body.code, 'rate_limited');
  handler.__test.reset();
  for (let i = 0; i < 61; i++) last = await call(null, rep(REF.b1));
  assert.equal(last.code, 429, 'tokenless calls are counted per address');
  assert.equal(writes().length, 0);
});

test('rate limit: the limiter is shared state (Upstash) and an outage falls back to memory without leaking the user id', async () => {
  reset({ UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'tok' });
  const f = global.fetch; global.fetch = async (u, o) => (String(u).startsWith('https://redis.example') ? { ok: false, status: 500, json: async () => ({}) } : f(u, o));
  const r = await call('founder', rep(REF.b1)); assert.equal(r.code, 200);
  assert.ok(logs.some(l => l.includes('rate_limit_store_failed'))); assert.ok(!logs.join('\n').includes(U.founder));
});

/* ================= nothing private in logs ================= */
test('logs never hold a message, a price, an email, a name, a Teams link, a token or a user id (all paths, including failures)', async () => {
  const pw = { body: SECRET.body, price: SECRET.price };
  await call('founder', rep(REF.b1, { ...pw, propose_meeting: true, req_id: rq(40) }));
  await call('founder', rep(REF.b1, { ...pw, req_id: rq(40) }));
  await call('founder', rep(REF.vis, pw)); await call('founder', rep(REF.visBadMail, pw)); await call('founder', rep(REF.draft, pw)); await call('founder', rep(REF.none, pw));
  await call('founder', conf({ body: SECRET.note })); await call('founder', conf({ meeting_id: M.cancelled })); await call('founder', conf({ teams_url: 'http://' + SECRET.link.slice(8) }));
  st.mailStatus = 500;
  const f1 = await call('founder', rep(REF.b1, pw)); await call('founder', rep(REF.vis, pw)); st.mailStatus = 200;
  await call('founder', { action: 'resend', ref: REF.b1, id: f1.body.id }); await call('founder', { action: 'resend', ref: REF.b1, id: id(4242) });
  st.stateFail = true; await call('founder', rep(REF.b1, pw)); st.stateFail = false;
  st.insertFail.brief_messages = 500; await call('founder', rep(REF.b1, pw)); st.insertFail = {};
  st.dbDown = true; await call('founder', rep(REF.b1, pw)); st.dbDown = false;
  for (const who of ['c1', 'part', 'dir', 'nobody']) await call(who, rep(REF.b1, pw));
  const all = logs.join('\n'); assert.ok(logs.length > 5, 'the flows did log something');
  for (const [k, v] of Object.entries(SECRET)) assert.ok(!all.includes(v), 'a log holds the ' + k);
  for (const v of ['Vera Visitor', 'founder@studio.test', 'founder-profile@studio.test', 'rk_test', 'sb_secret_x', U.founder, U.c1, 'a.founder.c', 'teams.example', 'Hello, here is our answer']) assert.ok(!all.includes(v), 'a log holds ' + v);
  for (const l of logs) { const j = JSON.parse(l); assert.ok(j.t && j.level && j.event, 'structured: ' + l); }
});

test('answers to the browser never echo the message, the price, the email address or the link', async () => {
  const outs = [await call('founder', rep(REF.b1, { body: SECRET.body, price: SECRET.price })), await call('founder', conf({ body: SECRET.note })), await call('founder', rep(REF.vis, { body: SECRET.body }))];
  for (const o of outs) { const s = JSON.stringify(o.body); for (const v of [SECRET.body, SECRET.price, SECRET.email, SECRET.vemail, SECRET.link, SECRET.name, SECRET.note]) assert.ok(!s.includes(v)); }
});

/* ================= small validators ================= */
test('validators: messageText, priceText', () => {
  const { messageText: M_, priceText: P_ } = handler.__test;
  assert.equal(M_('hi', true), 'hi'); assert.equal(M_('', true), undefined); assert.equal(M_(null, true), undefined); assert.equal(M_('', false), ''); assert.equal(M_(undefined, false), '');
  assert.equal(M_('a\u0000b', true), 'ab', 'control characters are removed');
  assert.equal(M_('a'.repeat(4000), true).length, 4000); assert.equal(M_('a'.repeat(4001), true), undefined); assert.equal(M_(['a'], true), undefined);
  assert.equal(P_(undefined), null); assert.equal(P_(''), null); assert.equal(P_('  '), null); assert.equal(P_(' 500 EUR '), '500 EUR'); assert.equal(P_('p'.repeat(121)), undefined); assert.equal(P_({}), undefined);
});
