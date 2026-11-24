'use strict';
/* Phase 4: permission matrix of api/admin.js against a mock Supabase (no network). The real database rules are proven by `npm run test:rls`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/admin.js');

const ORIGIN = 'https://site.example';
const ENV = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_x', VERCEL_ENV: 'development' };
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const U = { founder: id(1), dir1: id(2), dir2: id(3), part1: id(4), client: id(5), off: id(6), susp: id(7) };
const TOK = n => 'a.' + n + '.c';
const realFetch = global.fetch, realLog = { e: console.error, w: console.warn, l: console.log };
let calls, st, logs;

function reset() {
  Object.assign(process.env, ENV); handler.__test.reset(); logs = []; calls = [];
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  st = {
    profiles: { [U.founder]: { id: U.founder, role: 'founder', status: 'active', email: 'f@x.test' }, [U.dir1]: { id: U.dir1, role: 'director', status: 'active', email: 'd1@x.test' },
      [U.dir2]: { id: U.dir2, role: 'director', status: 'active', email: 'd2@x.test' }, [U.part1]: { id: U.part1, role: 'partner', status: 'active', email: 'p1@x.test' },
      [U.client]: { id: U.client, role: 'client', status: 'active', email: 'c@x.test' }, [U.off]: { id: U.off, role: 'partner', status: 'active', email: 'off@x.test' }, [U.susp]: { id: U.susp, role: 'director', status: 'suspended', email: 's@x.test' } },
    partners: { [U.dir1]: true, [U.dir2]: true, [U.part1]: true, [U.off]: false, [U.susp]: true },
    inv: [], inviteStatus: 200, inviteBody: {}, banStatus: 200, delStatus: 200, seq: 0
  };
  global.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ u, m, body, h: opts.headers });
    const J = (s, d) => ({ ok: s < 400, status: s, json: async () => d });
    if (u.includes('/auth/v1/user')) { const t = (opts.headers.Authorization || '').split('.')[1]; const uid = U[t]; return uid ? J(200, { id: uid }) : J(401, {}); }
    if (u.includes('/auth/v1/invite')) return J(st.inviteStatus, st.inviteBody);
    if (u.includes('/auth/v1/admin/users/')) return m === 'PUT' ? J(st.banStatus, {}) : J(st.delStatus, {});
    if (u.includes('/rest/v1/profiles')) {
      const q = new URL(u).searchParams, rows = Object.values(st.profiles).filter(p => (!q.get('id') || p.id === q.get('id').slice(3)) && (!q.get('email') || p.email === q.get('email').slice(3)) && (!q.get('role') || p.role === q.get('role').slice(3)) && (!q.get('status') || p.status === q.get('status').slice(3)));
      if (m === 'PATCH') { const p = st.profiles[new URL(u).searchParams.get('id').slice(3)]; Object.assign(p, body); return J(204, null); }
      return J(200, rows);
    }
    if (u.includes('/rest/v1/partners')) { const pid = new URL(u).searchParams.get('profile_id').slice(3); return J(200, pid in st.partners ? [{ active: st.partners[pid] }] : []); }
    if (u.includes('/rest/v1/invitations')) {
      const q = new URL(u).searchParams;
      if (m === 'GET') return J(200, st.inv.filter(i => i.id === q.get('id').slice(3)));
      if (m === 'DELETE') { st.inv = st.inv.filter(i => !(q.get('email') ? i.email === q.get('email').slice(3) && !i.accepted_at : i.id === q.get('id').slice(3) && !(q.get('accepted_at') && i.accepted_at))); return J(204, null); }
      if (m === 'POST') { if (st.inv.some(i => i.email === body.email && !i.accepted_at)) return J(409, {}); const row = { id: id(900 + ++st.seq), accepted_at: null, ...body }; st.inv.push(row); return J(201, [row]); }
    }
    return J(404, {});
  };
}
test.beforeEach(reset);
test.afterEach(() => { global.fetch = realFetch; console.error = realLog.e; console.warn = realLog.w; console.log = realLog.l; });

async function call(as, body, { origin = ORIGIN, method = 'POST', auth = true } = {}) {
  const headers = { origin, 'content-type': 'application/json', ...(auth && as ? { authorization: 'Bearer ' + TOK(as) } : {}) };
  const res = { headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method, headers, body }, res); return res;
}
const writes = () => calls.filter(c => c.m !== 'GET' && !c.u.includes('/auth/v1/user'));
const inv = (email, role, extra) => ({ action: 'invite', email, role, ...extra });

test('transport: origin, method, content type, token', async () => {
  assert.equal((await call('founder', inv('n@x.test', 'partner'), { origin: 'https://evil.example' })).code, 403);
  assert.equal((await call('founder', {}, { method: 'GET' })).code, 405);
  const o = await call('founder', null, { method: 'OPTIONS' }); assert.equal(o.code, 204); assert.match(o.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal((await call(null, inv('n@x.test', 'partner'))).code, 401);          // no token
  assert.equal((await call('nobody', inv('n@x.test', 'partner'))).code, 401);      // token Supabase does not know
  assert.equal(writes().length, 0);
});

test('only active staff may call: clients, suspended and deactivated staff are refused', async () => {
  for (const who of ['client', 'susp', 'off']) assert.equal((await call(who, inv('n@x.test', 'partner'))).code, 403, who);
  assert.equal((await call('part1', inv('n@x.test', 'partner'))).code, 403);        // a partner never invites
  assert.equal((await call('dir1', inv('n@x.test', 'partner'))).code, 403);         // a director never invites (Founder only)
  assert.equal(writes().length, 0);
});

test('invite: Founder invites a director and a partner (with or without a group)', async () => {
  let r = await call('founder', inv('Dir@X.test ', 'director')); assert.equal(r.code, 200); assert.equal(st.inv[0].email, 'dir@x.test'); assert.equal(st.inv[0].role, 'director'); assert.equal(st.inv[0].director_id, null); assert.equal(st.inv[0].invited_by, U.founder);
  r = await call('founder', inv('p@x.test', 'partner', { director_id: U.dir1 })); assert.equal(r.code, 200); assert.equal(st.inv[1].director_id, U.dir1);
  r = await call('founder', inv('q@x.test', 'partner')); assert.equal(r.code, 200); assert.equal(st.inv[2].director_id, null);
  const sent = calls.filter(c => c.u.includes('/auth/v1/invite')); assert.equal(sent.length, 3);
  assert.ok(sent[0].u.includes(encodeURIComponent(ORIGIN + '/?auth=invite')) || sent[0].u.includes('culmera-solutions.com'), 'redirect target is the site');
  assert.ok(calls.findIndex(c => c.m === 'POST' && c.u.includes('/invitations')) < calls.findIndex(c => c.u.includes('/auth/v1/invite')), 'the invitation row exists before the email is sent');
  assert.ok(!JSON.stringify(sent[0].body).includes('role'), 'role is never sent to Supabase Auth');
});

test('invite: a Director cannot invite anyone (Founder only)', async () => {
  for (const body of [inv('p@x.test', 'partner'), inv('p2@x.test', 'partner', { director_id: U.dir1 }), inv('d@x.test', 'director')]) {
    const r = await call('dir1', body); assert.equal(r.code, 403); assert.equal(r.body.code, 'forbidden');
  }
  assert.equal(st.inv.length, 0); assert.equal(writes().length, 0);
});

test('invite: validation, existing accounts, and a dead group', async () => {
  assert.equal((await call('founder', inv('not-an-email', 'partner'))).code, 400);
  assert.equal((await call('founder', inv('n@x.test', 'founder'))).code, 400);       // roles other than director/partner never
  assert.equal((await call('founder', inv('n@x.test', 'client'))).code, 400);
  assert.equal((await call('founder', inv('n@x.test', 'partner', { director_id: 'zzz' }))).code, 400);
  assert.equal((await call('founder', inv('n@x.test', 'partner', { director_id: U.part1 }))).code, 400, 'a partner is not a group');
  const r = await call('founder', inv('C@x.test', 'partner')); assert.equal(r.code, 409); assert.equal(r.body.code, 'exists');
  assert.equal(st.inv.length, 0); assert.equal(calls.filter(c => c.u.includes('/auth/v1/invite')).length, 0);
});

test('invite: re-inviting replaces the unused invitation; a failed email leaves nothing behind', async () => {
  await call('founder', inv('p@x.test', 'partner')); await call('founder', inv('p@x.test', 'director'));
  assert.equal(st.inv.length, 1); assert.equal(st.inv[0].role, 'director');
  st.inviteStatus = 422; st.inviteBody = { error_code: 'email_exists' };
  let r = await call('founder', inv('z@x.test', 'partner')); assert.equal(r.code, 409); assert.equal(st.inv.filter(i => i.email === 'z@x.test').length, 0, 'rolled back');
  st.inviteStatus = 500; st.inviteBody = {}; r = await call('founder', inv('y@x.test', 'partner')); assert.equal(r.code, 502); assert.equal(st.inv.filter(i => i.email === 'y@x.test').length, 0);
  st.inviteStatus = 429; st.inviteBody = { error_code: 'over_email_send_rate_limit' }; r = await call('founder', inv('w@x.test', 'partner')); assert.equal(r.code, 429);
});

test('revoke: Founder only (a Director cannot cancel even an invitation that exists), accepted ones never', async () => {
  await call('founder', inv('a@x.test', 'partner')); await call('founder', inv('b@x.test', 'partner', { director_id: U.dir1 }));
  const [a, b] = st.inv;
  assert.equal((await call('dir1', { action: 'revoke_invite', id: a.id })).code, 403);
  assert.equal((await call('dir1', { action: 'revoke_invite', id: b.id })).code, 403);   // even his own group's invitation
  assert.equal((await call('part1', { action: 'revoke_invite', id: a.id })).code, 403);
  assert.equal(st.inv.length, 2);
  assert.equal((await call('founder', { action: 'revoke_invite', id: b.id })).code, 200);
  assert.equal((await call('founder', { action: 'revoke_invite', id: a.id })).code, 200); assert.equal(st.inv.length, 0);
  assert.equal((await call('founder', { action: 'revoke_invite', id: a.id })).code, 404);
  st.inv.push({ id: id(950), email: 'acc@x.test', accepted_at: '2026-01-01', invited_by: U.founder });
  assert.equal((await call('founder', { action: 'revoke_invite', id: id(950) })).code, 409);
  assert.equal((await call('founder', { action: 'revoke_invite', id: 'nope' })).code, 400);
});

test('set_status: Founder only; never self, never the Founder; also blocks the sign-in', async () => {
  for (const who of ['dir1', 'part1']) assert.equal((await call(who, { action: 'set_status', id: U.client, status: 'suspended' })).code, 403);
  assert.equal(st.profiles[U.client].status, 'active');
  assert.equal((await call('founder', { action: 'set_status', id: U.founder, status: 'suspended' })).code, 400);
  let r = await call('founder', { action: 'set_status', id: U.client, status: 'suspended' }); assert.equal(r.code, 200); assert.equal(st.profiles[U.client].status, 'suspended');
  const ban = calls.find(c => c.m === 'PUT'); assert.equal(ban.body.ban_duration, '876000h');
  await call('founder', { action: 'set_status', id: U.client, status: 'active' }); assert.equal(calls.filter(c => c.m === 'PUT').pop().body.ban_duration, 'none');
  assert.equal((await call('founder', { action: 'set_status', id: U.client, status: 'deleted' })).code, 400);
  st.banStatus = 500; r = await call('founder', { action: 'set_status', id: U.client, status: 'suspended' }); assert.equal(r.code, 200); assert.equal(r.body.partial, true);
  assert.equal((await call('founder', { action: 'set_status', id: id(99), status: 'suspended' })).code, 404);
});

test('delete_user: Founder only, with the same protections', async () => {
  for (const who of ['dir1', 'part1', 'client']) assert.equal((await call(who, { action: 'delete_user', id: U.client })).code, 403);
  assert.equal(calls.filter(c => c.m === 'DELETE').length, 0);
  assert.equal((await call('founder', { action: 'delete_user', id: U.founder })).code, 400);
  assert.equal((await call('founder', { action: 'delete_user', id: U.client })).code, 200);
  assert.ok(calls.some(c => c.m === 'DELETE' && c.u.endsWith('/auth/v1/admin/users/' + U.client)));
  st.delStatus = 500; assert.equal((await call('founder', { action: 'delete_user', id: U.part1 })).code, 502);
  assert.equal((await call('founder', { action: 'nope' })).code, 400);
});

test('secrets and personal data never reach the logs; the service key only goes to Supabase', async () => {
  await call('founder', inv('Secret.Person@x.test', 'partner')); await call('founder', inv('Secret.Person@x.test', 'partner', { director_id: 'bad' }));
  assert.ok(!logs.join('\n').match(/secret\.person|sb_secret|Bearer/i));
  assert.ok(calls.every(c => c.u.startsWith('https://db.example/')));
});

test('rate limit: a signed-in caller cannot flood the endpoint', async () => {
  let last; for (let i = 0; i < 45; i++) last = await call('founder', { action: 'nope' });
  assert.equal(last.code, 429);
});
