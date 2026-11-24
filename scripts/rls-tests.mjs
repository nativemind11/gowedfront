// Isolation test suite for the platform schema. Uses an in-memory Postgres; nothing touches your real database.
// Run: npm i && npm run test:rls
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
const dir = new URL('../supabase/', import.meta.url).pathname;
const read = f => fs.readFileSync(dir + f, 'utf8');

const STUB = `
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;`;

const db = new PGlite();
const ids = {};
async function signup(name, meta = {}) {
  const email = name + '@t.test';
  const r = await db.query(`insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning id`, [email, JSON.stringify({ full_name: name, ...meta })]);
  ids[name] = r.rows[0].id; return r.rows[0].id;
}
const invite = (email, role, invitedBy, directorId = null) => db.query(`insert into public.invitations(email,role,invited_by,director_id,token_hash) values ($1,$2,$3,$4,'h')`, [email, role, invitedBy, directorId]);
async function as(user, fn) {
  await db.exec(user === 'anon' ? `set role anon` : `set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user === 'anon' ? '' : ids[user]]);
  try { return await fn(); } finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub','',false)`); }
}
const q = (user, sql, p = []) => as(user, async () => (await db.query(sql, p)).rows);
const names = rows => rows.map(r => r.n).sort();
const denied = async (user, sql, p = []) => { let ok = false; try { await as(user, () => db.query(sql, p)); } catch (e) { ok = true; } assert.ok(ok, "NOT rejected for " + user + ": " + sql); };
const blocked = async (user, sql, p = []) => { let n = 0; try { n = (await as(user, () => db.query(sql + ' returning 1', p))).rows.length; } catch (e) { return; } assert.equal(n, 0, 'changed rows for ' + user + ': ' + sql); };
const code = async n => (await db.query(`select code from public.partners where profile_id=$1`, [ids[n]])).rows[0].code;

test('setup', async () => {
  await db.exec(STUB); await db.exec(read('schema.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(read('migration-002-platform.sql')); await db.exec(read('migration-002-platform.sql')); // twice: idempotent
  await db.exec(read('migration-003-portal.sql')); await db.exec(read('migration-003-portal.sql')); // Phase 3 portal: twice, idempotent
  await db.exec(read('migration-004-team.sql')); await db.exec(read('migration-004-team.sql')); // Phase 4 team: twice, idempotent
  await db.exec(read('migration-005-notify.sql')); await db.exec(read('migration-005-notify.sql')); // Phase 5 notifications: twice, idempotent
  await db.exec(read('migration-006-languages.sql')); await db.exec(read('migration-006-languages.sql')); // Phase 8 languages: twice, idempotent
  await signup('founder'); await db.query(`select private.bootstrap_founder('founder@t.test')`);
  await invite('dir1@t.test', 'director', ids.founder); await invite('dir2@t.test', 'director', ids.founder);
  await signup('dir1', { role: 'founder' }); await signup('dir2');
  await invite('p1@t.test', 'partner', ids.founder, ids.dir1); await invite('p2@t.test', 'partner', ids.founder, ids.dir2);
  await signup('p1'); await signup('p2');
  await signup('c1', { partner_code: ' ' + (await code('p1')).toLowerCase() + ' ', company: 'A', country: 'Egypt' });
  await signup('c2', { partner_code: await code('p1') });
  await signup('c3', { partner_code: await code('p2') });
  await signup('c4', { partner_code: 'NOPE-123' });
  await signup('c5', { partner_code: await code('dir1') });
  for (const c of ['c1', 'c2', 'c3', 'c4']) await db.query(`insert into public.client_briefs(client_id,answers) values ($1,'{"secret":1}')`, [ids[c]]);
  await db.query(`insert into public.notes(client_id,author_id,body) values ($1,$2,'internal')`, [ids.c1, ids.founder]);
});

test('roles come from invitations only, never from user metadata', async () => {
  const r = Object.fromEntries((await db.query(`select email, role from public.profiles`)).rows.map(x => [x.email, x.role]));
  assert.equal(r['founder@t.test'], 'founder'); assert.equal(r['dir1@t.test'], 'director'); assert.equal(r['p1@t.test'], 'partner');
  assert.equal(r['c1@t.test'], 'client');
  await signup('sneaky', { role: 'founder' }); // metadata asks for founder: ignored
  assert.equal((await db.query(`select role from public.profiles where id=$1`, [ids.sneaky])).rows[0].role, 'client');
});

test('client attribution comes from the code typed at sign-up (normalised); bad code means direct', async () => {
  const own = async c => (await db.query(`select partner_id from public.clients where profile_id=$1`, [ids[c]])).rows[0].partner_id;
  assert.equal(await own('c1'), ids.p1); assert.equal(await own('c3'), ids.p2);
  assert.equal(await own('c4'), null); assert.equal(await own('c5'), ids.dir1); // a Director can bring clients
});

test('unauthenticated caller reads nothing', async () => {
  for (const t of ['profiles', 'partners', 'clients', 'client_briefs', 'meetings', 'notes', 'invitations', 'audit_log', 'briefs', 'contacts'])
    await denied('anon', `select * from public.${t}`);
});

test('a client cannot read another client', async () => {
  assert.deepEqual(names(await q('c1', `select full_name n from public.profiles`)), ['c1']);
  assert.equal((await q('c1', `select 1 from public.clients where profile_id=$1`, [ids.c2])).length, 0);
  const b = await q('c1', `select client_id from public.client_briefs`); assert.ok(b.length === 1 && b[0].client_id === ids.c1);
  assert.equal((await q('c1', `select 1 from public.partners`)).length, 0);
  assert.equal((await q('c1', `select 1 from public.invitations`)).length, 0);
});

test('notes are never visible to the client and a client cannot write them', async () => {
  assert.equal((await q('c1', `select 1 from public.notes`)).length, 0);
  await denied('c1', `insert into public.notes(client_id,author_id,body) values ($1,$1,'x')`, [ids.c1]);
});

test('a partner reads only their own clients', async () => {
  assert.deepEqual(names(await q('p1', `select p.full_name n from public.clients c join public.profiles p on p.id=c.profile_id`)), ['c1', 'c2']);
  assert.equal((await q('p1', `select 1 from public.client_briefs where client_id=$1`, [ids.c3])).length, 0);
  assert.equal((await q('p1', `select 1 from public.profiles where id=$1`, [ids.c3])).length, 0);
  assert.equal((await q('p1', `select 1 from public.partners where profile_id=$1`, [ids.p2])).length, 0);
  assert.equal((await q('p1', `select 1 from public.notes`)).length, 1);
});

test('a partner writes notes on their own clients only, and cannot edit briefs or statuses', async () => {
  await q('p1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'hello')`, [ids.c1, ids.p1]);
  await denied('p1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'no')`, [ids.c3, ids.p1]);
  await denied('p1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'forged')`, [ids.c1, ids.founder]);
  assert.equal((await q('p1', `update public.client_briefs set status='won' where client_id=$1 returning 1`, [ids.c1])).length, 0);
  await denied('p1', `update public.notes set body='edited'`); await denied('p1', `delete from public.notes`);
});

test('a director sees only their own group', async () => {
  assert.deepEqual(names(await q('dir1', `select p.full_name n from public.clients c join public.profiles p on p.id=c.profile_id`)), ['c1', 'c2', 'c5']);
  assert.deepEqual(names(await q('dir2', `select p.full_name n from public.clients c join public.profiles p on p.id=c.profile_id`)), ['c3']);
  assert.deepEqual(names(await q('dir1', `select p.full_name n from public.partners x join public.profiles p on p.id=x.profile_id where x.profile_id<>$1`, [ids.dir1])), ['p1']);
  assert.equal((await q('dir1', `select 1 from public.client_briefs where client_id=$1`, [ids.c3])).length, 0);
  assert.equal((await q('dir1', `select 1 from public.profiles where id=$1`, [ids.p2])).length, 0);
});

test('a director edits status of briefs in their group only', async () => {
  assert.equal((await q('dir1', `update public.client_briefs set status='in_review' where client_id=$1 returning 1`, [ids.c1])).length, 1);
  assert.equal((await q('dir1', `update public.client_briefs set status='won' where client_id=$1 returning 1`, [ids.c3])).length, 0);
  await q('dir1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'d')`, [ids.c2, ids.dir1]);
  await denied('dir1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'d')`, [ids.c3, ids.dir1]);
});

test('nobody can change their own role, status or identity', async () => {
  for (const u of ['c1', 'p1', 'dir1', 'founder']) {
    await denied(u, `update public.profiles set role='${u === 'founder' ? 'director' : 'founder'}' where id=$1`, [ids[u]]);
    await denied(u, `update public.profiles set status='suspended' where id=$1`, [ids[u]]);
    await denied(u, `update public.profiles set email='x@y.z' where id=$1`, [ids[u]]);
  }
  await q('c1', `update public.profiles set full_name='C One', locale='ar' where id=$1`, [ids.c1]); // allowed fields still work
});

test('only the Founder can change someone else\'s role or suspend', async () => {
  await blocked('dir1', `update public.profiles set role='founder' where id=$1`, [ids.p1]);
  await blocked('dir1', `update public.profiles set status='suspended' where id=$1`, [ids.p1]);
  assert.equal((await q('founder', `update public.profiles set role='director' where id=$1 returning 1`, [ids.c5])).length, 1);
  await q('founder', `update public.profiles set role='client' where id=$1`, [ids.c5]);
});

test('clients cannot edit attribution; only the Founder reassigns', async () => {
  await denied('c1', `update public.clients set partner_id=$1 where profile_id=$2`, [ids.p2, ids.c1]);
  await denied('c1', `update public.clients set code_used='X' where profile_id=$1`, [ids.c1]);
  await q('c1', `update public.clients set company='New Co', phone='123' where profile_id=$1`, [ids.c1]);
  await blocked('dir1', `update public.clients set partner_id=$1 where profile_id=$2`, [ids.p2, ids.c1]);
  assert.equal((await q('p1', `update public.clients set partner_id=$1 where profile_id=$2 returning 1`, [ids.p2, ids.c1])).length, 0);
  assert.equal((await q('founder', `update public.clients set partner_id=$1 where profile_id=$2 returning 1`, [ids.p2, ids.c1])).length, 1);
  await q('founder', `update public.clients set partner_id=$1 where profile_id=$2`, [ids.p1, ids.c1]);
});

test('client brief rules: draft to submitted only, editable while draft or submitted', async () => {
  await db.query(`update public.client_briefs set status='draft' where client_id=$1`, [ids.c2]);
  await q('c2', `update public.client_briefs set answers='{"a":2}' where client_id=$1`, [ids.c2]);
  await denied('c2', `update public.client_briefs set status='won' where client_id=$1`, [ids.c2]);
  await denied('c2', `update public.client_briefs set status='in_review' where client_id=$1`, [ids.c2]);
  const s = await q('c2', `update public.client_briefs set status='submitted' where client_id=$1 returning submitted_at`, [ids.c2]);
  assert.ok(s[0].submitted_at);
  await q('c2', `update public.client_briefs set answers='{"a":3}' where client_id=$1`, [ids.c2]); // "request changes after"
  await denied('c2', `update public.client_briefs set status='draft' where client_id=$1`, [ids.c2]);
  assert.equal((await q('c1', `update public.client_briefs set status='submitted' where client_id=$1 returning 1`, [ids.c1])).length, 0); // c1 is in_review now: locked
  assert.equal((await q('c2', `update public.client_briefs set answers='{"x":1}' where client_id=$1 returning 1`, [ids.c1])).length, 0); // not another client's
  await denied('c1', `insert into public.client_briefs(client_id,status) values ($1,'draft')`, [ids.c2]); // cannot create for someone else
});

test('meetings: client books in the future in their time zone, cannot confirm, cannot touch others', async () => {
  const brief = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c2])).rows[0].id;
  await denied('c2', `insert into public.meetings(brief_id,client_id,starts_at,timezone) values ($1,$2,now()+interval '10 minutes','Africa/Cairo')`, [brief, ids.c2]);
  await denied('c2', `insert into public.meetings(brief_id,client_id,starts_at,timezone,status) values ($1,$2,now()+interval '2 days','Africa/Cairo','confirmed')`, [brief, ids.c2]);
  await denied('c1', `insert into public.meetings(brief_id,client_id,starts_at,timezone) values ($1,$2,now()+interval '2 days','Africa/Cairo')`, [brief, ids.c1]); // someone else's brief
  const m = await q('c2', `insert into public.meetings(brief_id,client_id,starts_at,timezone) values ($1,$2,now()+interval '2 days','Africa/Cairo') returning id`, [brief, ids.c2]);
  await q('c2', `update public.meetings set starts_at=now()+interval '3 days' where id=$1`, [m[0].id]);
  assert.equal((await q('c1', `select 1 from public.meetings`)).length, 0);
  assert.equal((await q('p1', `select 1 from public.meetings`)).length, 1);
  assert.equal((await q('dir2', `select 1 from public.meetings`)).length, 0);
  await q('c2', `update public.meetings set status='cancelled' where id=$1`, [m[0].id]);
});

test('invitations: Director invites partners into own group only; partners and clients cannot invite', async () => {
  await q('dir1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n1@t.test','partner',$1,$1,'h')`, [ids.dir1]);
  await denied('dir1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n2@t.test','partner',$1,$2,'h')`, [ids.dir1, ids.dir2]);
  await denied('dir1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n3@t.test','director',$1,null,'h')`, [ids.dir1]);
  await denied('dir1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n4@t.test','partner',$1,$2,'h')`, [ids.founder, ids.dir1]); // forged inviter
  await denied('p1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n5@t.test','partner',$1,null,'h')`, [ids.p1]);
  await denied('c1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('n6@t.test','partner',$1,null,'h')`, [ids.c1]);
  assert.equal((await q('dir2', `select 1 from public.invitations`)).length, 0);
  assert.equal((await q('founder', `insert into public.invitations(email,role,invited_by,token_hash) values ('n7@t.test','director',$1,'h') returning 1`, [ids.founder])).length, 1);
});

test('directors manage partners in their group only; partner codes are immutable', async () => {
  assert.equal((await q('dir1', `update public.partners set active=false where profile_id=$1 returning 1`, [ids.p1])).length, 1);
  assert.equal((await q('dir1', `update public.partners set active=false where profile_id=$1 returning 1`, [ids.p2])).length, 0);
  await q('dir1', `update public.partners set active=true where profile_id=$1`, [ids.p1]);
  await denied('dir1', `update public.partners set director_id=$1 where profile_id=$2`, [ids.dir2, ids.p1]);
  await blocked('p1', `update public.partners set code='HACK-1' where profile_id=$1`, [ids.p1]);
  await denied('dir1', `update public.partners set code='HACK-3' where profile_id=$1`, [ids.p1]); // in their group, still immutable
  await denied('founder', `update public.partners set code='HACK-2' where profile_id=$1`, [ids.p1]);
});

test('a suspended user sees nothing', async () => {
  await db.query(`update public.profiles set status='suspended' where id=$1`, [ids.p2]);
  assert.equal((await q('p2', `select 1 from public.clients`)).length, 0);
  assert.equal((await q('p2', `select 1 from public.profiles`)).length, 0);
  await db.query(`update public.profiles set status='active' where id=$1`, [ids.p2]);
});

test('Founder sees everything', async () => {
  assert.ok((await q('founder', `select 1 from public.profiles`)).length >= 11);
  assert.equal((await q('founder', `select 1 from public.client_briefs`)).length, 4);
  assert.ok((await q('founder', `select 1 from public.notes`)).length >= 3);
});

test('audit log: Founder reads, nobody else does, it is append-only and holds no personal data', async () => {
  const rows = await q('founder', `select * from public.audit_log`);
  assert.ok(rows.length > 10 && rows.some(r => r.table_name === 'clients' && r.action === 'update' && r.changed.includes('partner_id')));
  assert.ok(rows.some(r => r.table_name === 'client_briefs' && r.changed && r.changed.join() === 'status'));
  assert.ok(!JSON.stringify(rows).includes('@t.test') && !JSON.stringify(rows).includes('secret'));
  for (const u of ['c1', 'p1', 'dir1']) assert.equal((await q(u, `select 1 from public.audit_log`)).length, 0);
  await denied('founder', `delete from public.audit_log`); await denied('founder', `update public.audit_log set action='x'`);
  await assert.rejects(db.query(`delete from public.audit_log`), /append-only/);
});

test('browser roles cannot run the bootstrap or delete anything', async () => {
  await denied('c1', `select private.bootstrap_founder('c1@t.test')`);
  for (const t of ['profiles', 'clients', 'client_briefs', 'meetings', 'notes']) await denied('founder', `delete from public.${t}`);
  await denied('anon', `select private.me_role()`);
});

test('the public form tables stay server-only', async () => {
  for (const u of ['anon', 'c1', 'founder']) await denied(u, `select * from public.briefs`);
});

// ---------------- Phase 3, step 3.3: the exact query shapes the booking page sends ----------------
test('3.3 booking: insert, one active meeting per brief, reschedule, cancel, one-hour rule, isolation', async () => {
  await db.query(`update public.client_briefs set status='submitted' where client_id=$1`, [ids.c2]);
  const brief = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c2])).rows[0].id;
  const ins = `insert into public.meetings(brief_id,client_id,starts_at,timezone,duration_min,status,note) values ($1,$2,$3,'Europe/Berlin',45,'requested',$4) returning id,status,duration_min,timezone`;
  const soon = new Date(Date.now() + 30 * 60e3).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
  const d2 = new Date(Date.now() + 2 * 864e5).toISOString(), d3 = new Date(Date.now() + 3 * 864e5).toISOString();
  await denied('c2', ins, [brief, ids.c2, soon, 'x']);            // less than one hour ahead
  await denied('c2', ins, [brief, ids.c2, past, 'x']);            // in the past
  await denied('c2', ins, [brief, ids.c2, d2, 'y'.repeat(1001)]); // note too long
  await denied('c1', ins, [brief, ids.c1, d2, 'x']);              // someone else's brief
  await denied('c1', ins, [brief, ids.c2, d2, 'x']);              // pretending to be c2
  const m = await q('c2', ins, [brief, ids.c2, d2, 'hello']);
  assert.equal(m.length, 1); assert.equal(m[0].status, 'requested'); assert.equal(m[0].duration_min, 45); assert.equal(m[0].timezone, 'Europe/Berlin');
  await denied('c2', ins, [brief, ids.c2, d3, 'second']);         // a second ACTIVE meeting on the same brief is refused
  await denied('c2', `insert into public.meetings(brief_id,client_id,starts_at,timezone,duration_min) values ($1,$2,now()+interval '2 days','Africa/Cairo',10)`, [brief, ids.c2]);
  await denied('c2', `update public.meetings set status='confirmed' where id=$1`, [m[0].id]);   // a client never confirms
  await denied('c2', `update public.meetings set status='done' where id=$1`, [m[0].id]);
  // reschedule: same row, status stays requested
  const rs = `update public.meetings set starts_at=$2,duration_min=60,timezone='Europe/Berlin',note='moved',status='requested' where id=$1 returning id,status,duration_min`;
  const r1 = await q('c2', rs, [m[0].id, d3]); assert.equal(r1.length, 1); assert.equal(r1[0].status, 'requested'); assert.equal(r1[0].duration_min, 60);
  await denied('c2', rs, [m[0].id, soon]);                       // reschedule to less than one hour ahead
  await denied('c2', rs, [m[0].id, past]);
  // the team confirms; the client reschedules; it goes back to requested
  await q('founder', `update public.meetings set status='confirmed' where id=$1`, [m[0].id]);
  const r2 = await q('c2', rs, [m[0].id, d2]); assert.equal(r2.length, 1); assert.equal(r2[0].status, 'requested');
  // isolation
  await blocked('c1', `update public.meetings set status='cancelled' where id='${m[0].id}'`);
  assert.equal((await q('c1', `select 1 from public.meetings`)).length, 0);
  await blocked('p1', `update public.meetings set status='cancelled' where id='${m[0].id}'`);   // partners watch, never edit
  assert.ok((await q('p1', `select 1 from public.meetings where id=$1`, [m[0].id])).length === 1);
  assert.equal((await q('dir2', `select 1 from public.meetings where id=$1`, [m[0].id])).length, 0);
  await denied('c2', `delete from public.meetings where id='${m[0].id}'`);
  // a meeting whose time has already passed can still be cancelled by the client
  await db.query(`update public.meetings set starts_at=now()-interval '1 day' where id=$1`, [m[0].id]);
  const c = await q('c2', `update public.meetings set status='cancelled' where id=$1 returning status`, [m[0].id]); assert.equal(c[0].status, 'cancelled');
  await blocked('c2', `update public.meetings set starts_at=now()+interval '5 days' where id='${m[0].id}'`); // a cancelled meeting cannot be revived
  // cancelling frees the slot: a new request is allowed
  const again = await q('c2', ins, [brief, ids.c2, d3, 'again']); assert.equal(again.length, 1);
  const mine = await q('c2', `select id,status from public.meetings where brief_id=$1 order by starts_at`, [brief]);
  assert.equal(mine.filter(x => x.status === 'requested').length, 1); assert.equal(mine.filter(x => ['requested', 'confirmed'].includes(x.status)).length, 1); // exactly one active
  await q('c2', `update public.meetings set status='cancelled' where id=$1`, [again[0].id]);
});

// ---------------- Phase 3, step 3.4: data export / deletion requests ----------------
test('3.4 data requests: client records, Founder handles, nobody else sees them', async () => {
  const ins = `insert into public.data_requests(client_id,kind) values ($1,$2) returning id,status,kind`;
  await denied('anon', `select * from public.data_requests`);
  await denied('anon', ins, [ids.c1, 'export']);
  const a = await q('c1', ins, [ids.c1, 'export']); assert.equal(a.length, 1); assert.equal(a[0].status, 'open');
  await denied('c1', ins, [ids.c1, 'export']);                    // one pending request per kind
  const b = await q('c1', ins, [ids.c1, 'deletion']); assert.equal(b.length, 1);
  await denied('c1', ins, [ids.c1, 'wipe']);                      // unknown kind
  await denied('c1', ins, [ids.c2, 'export']);                    // never for someone else
  await denied('c1', `insert into public.data_requests(client_id,kind,status) values ($1,'export','done')`, [ids.c3]);
  await denied('c3', `insert into public.data_requests(client_id,kind,status) values ($1,'deletion','done')`, [ids.c3]); // cannot self-complete
  await denied('p1', ins, [ids.c2, 'export']); await denied('dir1', ins, [ids.c2, 'export']);
  // visibility: own only; staff other than the Founder see none
  assert.equal((await q('c1', `select 1 from public.data_requests`)).length, 2);
  assert.equal((await q('c2', `select 1 from public.data_requests`)).length, 0);
  assert.equal((await q('p1', `select 1 from public.data_requests`)).length, 0);
  assert.equal((await q('dir1', `select 1 from public.data_requests`)).length, 0);
  assert.equal((await q('founder', `select 1 from public.data_requests`)).length, 2);
  // a client cannot change or delete a request
  await blocked('c1', `update public.data_requests set status='rejected'`);
  await denied('c1', `delete from public.data_requests`); await denied('founder', `delete from public.data_requests`);
  // the Founder handles it; handled_at is filled; identity columns are immutable
  const h = await q('founder', `update public.data_requests set status='done' where id=$1 returning handled_at`, [a[0].id]);
  assert.ok(h[0].handled_at);
  await denied('founder', `update public.data_requests set kind='deletion' where id='${a[0].id}'`);
  await denied('founder', `update public.data_requests set client_id='${ids.c2}' where id='${a[0].id}'`);
  const again = await q('c1', ins, [ids.c1, 'export']); assert.equal(again.length, 1);   // after it is done, a new one may be filed
  const log = await q('founder', `select * from public.audit_log where table_name='data_requests'`);
  assert.ok(log.length >= 3 && !JSON.stringify(log).includes('@t.test'));
});

// ---------------- Phase 4: partner portal and management consoles ----------------
test('4.1 deactivating a partner removes ALL their access, not just new attribution; only their Director or the Founder can', async () => {
  await invite('p3@t.test', 'partner', ids.founder, ids.dir1); await signup('p3');
  await signup('c6', { partner_code: await code('p3') });
  await db.query(`insert into public.client_briefs(client_id) values ($1)`, [ids.c6]);
  assert.equal((await q('p3', `select 1 from public.clients`)).length, 1);
  assert.equal((await q('p3', `select 1 from public.client_briefs`)).length, 1);
  const off = `update public.partners set active=false where profile_id='${ids.p3}'`;
  await blocked('dir2', off); await blocked('p1', off); await blocked('p3', off); await blocked('c1', off);          // not another group, not a peer, not himself, not a client
  assert.equal((await q('dir1', off + ' returning 1')).length, 1);                                                   // his own Director
  for (const t of ['clients', 'client_briefs', 'notes', 'playbook']) assert.equal((await q('p3', `select 1 from public.${t}`)).length, 0, t);
  assert.equal((await q('p3', `select 1 from public.profiles`)).length, 0);                                         // not even his own profile
  assert.equal((await q('p3', `select 1 from public.partners`)).length, 0);
  await denied('p3', `insert into public.notes(client_id,author_id,body) values ($1,$2,'x')`, [ids.c6, ids.p3]);
  await signup('c7', { partner_code: await code('p3') });                                                            // the code no longer attributes
  assert.equal((await db.query(`select partner_id from public.clients where profile_id=$1`, [ids.c7])).rows[0].partner_id, null);
  assert.equal((await q('dir1', `select 1 from public.clients where profile_id=$1`, [ids.c6])).length, 1);          // the Director still sees the client
  await blocked('p3', `update public.partners set active=true where profile_id='${ids.p3}'`);                       // cannot switch himself back on
  assert.equal((await q('dir1', `update public.partners set active=true where profile_id='${ids.p3}' returning 1`)).length, 1);
  assert.equal((await q('p3', `select 1 from public.clients`)).length, 1);                                           // access is back
  // the Founder can deactivate a Director: they lose their group view at once
  await invite('dx@t.test', 'director', ids.founder); await signup('dx'); await invite('px@t.test', 'partner', ids.founder, ids.dx); await signup('px');
  assert.equal((await q('dx', `select 1 from public.partners where profile_id=$1`, [ids.px])).length, 1);
  assert.equal((await q('founder', `update public.partners set active=false where profile_id=$1 returning 1`, [ids.dx])).length, 1);
  assert.equal((await q('dx', `select 1 from public.partners where profile_id=$1`, [ids.px])).length, 0);
  assert.equal((await q('dx', `select 1 from public.profiles`)).length, 0);
});

test('4.2 Playbook: every active staff role reads it; clients, visitors and deactivated staff never; only the Founder edits', async () => {
  await denied('anon', `select * from public.playbook`);
  for (const u of ['c1', 'c4']) assert.equal((await q(u, `select 1 from public.playbook`)).length, 0, u);
  for (const u of ['founder', 'dir1', 'p1']) assert.equal((await q(u, `select 1 from public.playbook`)).length, 7, u);
  assert.equal((await q('founder', `select 1 from public.playbook where title ~* '\\$|usd|eur|price:'`)).length, 0, 'no prices in the seed');
  const body = JSON.stringify((await q('founder', `select body from public.playbook`)));
  assert.ok(!/whatsapp|gmail/i.test(body) && body.includes('1500+') && body.includes('45+'));
  for (const u of ['p1', 'dir1', 'c1']) await blocked(u, `update public.playbook set title='x' where key='about'`);
  const e = await q('founder', `update public.playbook set title='CULMERA in three sentences' where key='about' returning updated_at`); assert.equal(e.length, 1);
  await denied('founder', `update public.playbook set key='other' where key='about'`);
  await denied('founder', `insert into public.playbook(key,title) values ('new','x')`); await denied('founder', `delete from public.playbook`);
  await denied('p1', `insert into public.playbook(key,title) values ('new','x')`);
  await db.query(`update public.partners set active=false where profile_id=$1`, [ids.p2]);                       // a deactivated partner loses it too
  assert.equal((await q('p2', `select 1 from public.playbook`)).length, 0);
  await db.query(`update public.partners set active=true where profile_id=$1`, [ids.p2]);
});

test('4.3 console query shapes: brief status and meeting status are Director/Founder only, inside their group', async () => {
  const b = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c1])).rows[0].id;
  const b3 = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c3])).rows[0].id;
  const st = (u, id, s) => q(u, `update public.client_briefs set status=$2 where id=$1 returning status`, [id, s]);
  assert.equal((await st('dir1', b, 'in_review')).length, 1);                                         // own group
  assert.equal((await st('dir1', b3, 'in_review')).length, 0);                                        // other group: zero rows
  assert.equal((await st('dir2', b, 'won')).length, 0);
  assert.equal((await st('p1', b, 'won')).length, 0);                                                 // partners never change status
  assert.equal((await st('c1', b, 'won').catch(() => [])).length, 0);
  assert.equal((await st('founder', b3, 'scheduled')).length, 1);
  await db.query(`update public.client_briefs set status='submitted' where id in ($1,$2)`, [b, b3]);
  const when = new Date(Date.now() + 5 * 864e5).toISOString();
  const m = await q('c1', `insert into public.meetings(brief_id,client_id,starts_at,timezone,duration_min) values ($1,$2,$3,'Europe/Berlin',30) returning id`, [b, ids.c1, when]);
  const ms = (u, s) => q(u, `update public.meetings set status=$2 where id=$1 returning status`, [m[0].id, s]);
  assert.equal((await ms('p1', 'confirmed')).length, 0); assert.equal((await ms('dir2', 'confirmed')).length, 0);
  assert.equal((await ms('dir1', 'confirmed')).length, 1);                                            // the group Director confirms
  assert.equal((await q('p1', `select status from public.meetings where id=$1`, [m[0].id]))[0].status, 'confirmed'); // the partner can SEE it
  assert.equal((await ms('founder', 'done')).length, 1);
  assert.equal((await q('c1', `select status from public.meetings where id=$1`, [m[0].id]))[0].status, 'done');
  await denied('dir1', `update public.meetings set brief_id='${b3}' where id='${m[0].id}'`);          // identity columns stay fixed
});

test('4.4 notes: staff write inside their scope with a matching brief; authors are recorded; clients never see them', async () => {
  const b = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c1])).rows[0].id;
  const b3 = (await db.query(`select id from public.client_briefs where client_id=$1`, [ids.c3])).rows[0].id;
  const ins = (u, c, brief, who) => q(u, `insert into public.notes(client_id,brief_id,body) values ($1,$2,'follow up') returning author_id`, [c, brief]);
  assert.equal((await ins('dir1', ids.c1, b))[0].author_id, ids.dir1);                                // author defaults to the caller
  assert.equal((await ins('p1', ids.c1, null))[0].author_id, ids.p1);
  await denied('dir1', `insert into public.notes(client_id,brief_id,body) values ($1,$2,'x')`, [ids.c3, b3]);   // other group
  await denied('p1', `insert into public.notes(client_id,brief_id,body) values ($1,$2,'x')`, [ids.c1, b3]);       // brief of someone else
  await denied('p1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'x')`, [ids.c1, ids.dir1]); // cannot sign as another person
  await denied('p1', `insert into public.notes(client_id,body) values ($1,'')`, [ids.c1]);                         // empty
  assert.ok((await q('p1', `select 1 from public.notes where client_id=$1`, [ids.c1])).length >= 2);
  assert.equal((await q('p2', `select 1 from public.notes where client_id=$1`, [ids.c1])).length, 0);
  assert.equal((await q('c1', `select 1 from public.notes`)).length, 0);
  await denied('p1', `update public.notes set body='changed'`); await denied('p1', `delete from public.notes`);        // append-only for browser users
});

test('4.5 reassigning clients and moving partners between groups is Founder only; the sign-up code is kept as history', async () => {
  const own = async c => (await db.query(`select partner_id, code_used from public.clients where profile_id=$1`, [ids[c]])).rows[0];
  const re = (u, c, to) => q(u, `update public.clients set partner_id=$2 where profile_id=$1 returning partner_id`, [ids[c], to]).catch(() => []);
  assert.equal((await own('c4')).partner_id, null);
  assert.equal((await re('dir1', 'c4', ids.p1)).length, 0); assert.equal((await re('p1', 'c4', ids.p1)).length, 0);
  assert.equal((await re('founder', 'c4', ids.p1)).length, 1);
  assert.equal((await q('p1', `select 1 from public.clients where profile_id=$1`, [ids.c4])).length, 1);          // now visible to the new owner
  assert.equal((await q('p2', `select 1 from public.clients where profile_id=$1`, [ids.c4])).length, 0);
  assert.equal((await re('founder', 'c4', null)).length, 1); assert.equal((await q('p1', `select 1 from public.clients where profile_id=$1`, [ids.c4])).length, 0);
  assert.equal((await own('c1')).code_used !== null, true);                                                         // history of the typed code stays
  const mv = (u, p, g) => q(u, `update public.partners set director_id=$2 where profile_id=$1 returning director_id`, [ids[p], g]).catch(() => []);
  assert.equal((await mv('dir1', 'p1', ids.dir2)).length, 0); assert.equal((await mv('dir2', 'p1', ids.dir2)).length, 0);
  assert.equal((await mv('founder', 'p1', ids.dir2)).length, 1);
  assert.equal((await q('dir2', `select 1 from public.clients where profile_id=$1`, [ids.c1])).length, 1);          // the group view follows
  assert.equal((await q('dir1', `select 1 from public.clients where profile_id=$1`, [ids.c1])).length, 0);
  assert.equal((await mv('founder', 'p1', ids.dir1)).length, 1);                                                    // put it back
});

test('4.6 what every console screen reads: partners count only their clients, directors their group, the Founder everything', async () => {
  const n = async (u, sql) => (await q(u, sql)).length;
  assert.equal(await n('p1', `select 1 from public.clients`), 2);                                      // c1, c2
  assert.equal(await n('p1', `select 1 from public.profiles where role='client'`), 2);
  assert.equal(await n('p1', `select 1 from public.profiles where role<>'client'`), 1);               // only himself
  const dirClients = await n('dir1', `select 1 from public.clients`); assert.ok(dirClients >= 3);      // c1, c2, c5 (own), c6 (p3)
  assert.equal((await q('dir1', `select 1 from public.clients where profile_id=$1`, [ids.c3])).length, 0);
  assert.equal(await n('dir1', `select 1 from public.partners`), 3);                                   // himself, p1, p3
  assert.equal(await n('dir1', `select 1 from public.audit_log`), 0); assert.equal(await n('p1', `select 1 from public.audit_log`), 0);
  assert.ok(await n('founder', `select 1 from public.clients`) >= 8); assert.ok(await n('founder', `select 1 from public.audit_log`) > 20);
  assert.equal((await q('dir2', `select 1 from public.invitations where invited_by=$1`, [ids.founder])).length, 0); // a Director never sees the Founder's invitations
  await denied('dir1', `delete from public.invitations`); await denied('dir1', `update public.invitations set role='director'`);
});

test('5.1 notify_events: server-only claim table; the browser (any role, signed in or not) can neither read nor write it; the server can', async () => {
  const key = 'registered:' + ids.c1;
  await db.query(`insert into public.notify_events(key, kind) values ($1,'registered')`, [key]);   // the server side (superuser here, service_role on Supabase)
  for (const u of ['anon', 'c1', 'p1', 'dir1', 'founder']) {
    await denied(u, `select 1 from public.notify_events`);
    await denied(u, `insert into public.notify_events(key, kind) values ('x:1','registered')`);
    await denied(u, `update public.notify_events set result='{}'::jsonb`);
    await denied(u, `delete from public.notify_events`);
  }
  assert.equal((await db.query(`select 1 from public.notify_events`)).rows.length, 1);
  let dup = false; try { await db.query(`insert into public.notify_events(key, kind) values ($1,'registered')`, [key]); } catch (e) { dup = true; } assert.ok(dup, 'the same event can be claimed only once');
  let bad = false; try { await db.query(`insert into public.notify_events(key, kind) values ('k','nope')`); } catch (e) { bad = true; } assert.ok(bad, 'unknown kinds are refused');
  assert.equal((await db.query(`select has_table_privilege('service_role','public.notify_events','insert') s, has_table_privilege('authenticated','public.notify_events','select') a, has_table_privilege('anon','public.notify_events','select') n`)).rows[0].s, true);
  const r = (await db.query(`select has_table_privilege('authenticated','public.notify_events','select') a, has_table_privilege('anon','public.notify_events','select') n`)).rows[0];
  assert.deepEqual([r.a, r.n], [false, false]);
});

test('Phase 8: all eight site languages are accepted, anything else becomes en, old rows stay valid', async () => {
  for (const l of ['en', 'fr', 'de', 'zh', 'ru', 'pt', 'nl', 'ar']) {
    const id = await signup('loc_' + l, { locale: l });
    const r = await db.query(`select locale from public.profiles where id=$1`, [id]);
    assert.equal(r.rows[0].locale, l, 'sign-up with locale ' + l);
  }
  for (const bad of ['xx', 'EN', 'pt-PT', 'zh-CN', '']) {
    const id = await signup('locbad_' + (bad || 'empty'), { locale: bad });
    assert.equal((await db.query(`select locale from public.profiles where id=$1`, [id])).rows[0].locale, 'en', 'unknown locale "' + bad + '" falls back to en');
  }
  const none = await signup('loc_none');
  assert.equal((await db.query(`select locale from public.profiles where id=$1`, [none])).rows[0].locale, 'en');
  // an existing client can switch to the new languages through the allowed profile update
  await q('c1', `update public.profiles set locale='nl' where id=$1`, [ids.c1]);
  await q('c1', `update public.profiles set locale='pt' where id=$1`, [ids.c1]);
  await denied('c1', `update public.profiles set locale='xx' where id=$1`, [ids.c1]);
  // saved briefs can carry the new codes and still reject unknown ones
  for (const l of ['nl', 'pt']) await db.query(`insert into public.client_briefs(client_id,answers,locale) values ($1,'{}',$2)`, [ids.c2, l]);
  let rejected = false; try { await db.query(`insert into public.client_briefs(client_id,answers,locale) values ($1,'{}','xx')`, [ids.c2]); } catch (e) { rejected = true; }
  assert.ok(rejected, 'client_briefs rejects an unknown locale');
  // rows written before the migration (ar, de, zh, fr, ru) are still valid
  const cons = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname in ('profiles_locale_check','client_briefs_locale_check')`)).rows;
  assert.equal(cons.length, 2);
  for (const c of cons) for (const l of ['en', 'fr', 'de', 'zh', 'ru', 'pt', 'nl', 'ar']) assert.ok(c.d.includes("'" + l + "'"), 'constraint lists ' + l);
});

// ---------------- Phase 9, step 1: roles (migration 007) ----------------
// The tests above run on purpose against the schema as it was BEFORE 007 (they document the old rules and prove 002 to 006 still load).
// This last test loads 007 (twice) and proves the new rules: Partner and Director read through views and change nothing.
test('9.1 roles (007): Partner sees names, count, project and Playbook only; Director reads his group and changes nothing; Founder keeps everything', async () => {
  await db.exec(read('migration-007-roles.sql')); await db.exec(read('migration-007-roles.sql')); // twice: idempotent
  await db.query(`update public.client_briefs set status='submitted', selected_types='{brand-website}' where client_id=$1`, [ids.c1]);
  await db.query(`update public.client_briefs set status='draft', selected_types='{starter-store}' where client_id=$1`, [ids.c2]);
  const count = async (u, sql, p = []) => (await q(u, sql, p)).length;

  // ---- Partner ----
  assert.deepEqual(names(await q('p1', `select full_name n from public.partner_clients`)), ['C One', 'c2']);  // c1 was renamed 'C One' by an earlier test             // names + how many
  const pc = await q('p1', `select * from public.partner_clients order by (profile_id = $1) desc`, [ids.c1]);
  assert.deepEqual(pc[0].selected_types, ['brand-website']);                                                           // the project of a sent brief
  assert.deepEqual(pc[1].selected_types, []);                                                                          // a draft shows no project
  assert.deepEqual(Object.keys(pc[0]).sort(), ['created_at', 'full_name', 'profile_id', 'selected_types']);          // no email, phone, company, country, answers, status
  for (const t of ['clients', 'client_briefs', 'meetings', 'notes', 'invitations', 'data_requests', 'audit_log'])
    assert.equal(await count('p1', `select 1 from public.${t}`), 0, 'partner reads nothing from ' + t);
  assert.deepEqual(names(await q('p1', `select full_name n from public.profiles`)), ['p1']);                          // not even the clients' emails
  assert.equal(await count('p1', `select 1 from public.partners`), 1);                                                 // his own code only
  for (const v of ['director_team', 'director_clients', 'director_briefs', 'director_meetings'])
    assert.equal(await count('p1', `select 1 from public.${v}`), 0, 'partner has no Director view ' + v);
  assert.equal(await count('p1', `select 1 from public.playbook`), 7);
  await denied('p1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'x')`, [ids.c1, ids.p1]);
  await denied('p1', `update public.partner_clients set full_name='x'`);                                               // the view is read only
  await blocked('p1', `update public.client_briefs set status='won' where client_id=$1`, [ids.c1]);
  await blocked('p1', `update public.meetings set status='confirmed' where client_id=$1`, [ids.c1]);
  assert.equal(await count('dir1', `select 1 from public.partner_clients`), 0);                                        // not a Director's view
  assert.equal(await count('c1', `select 1 from public.partner_clients`), 0);                                          // nor a client's

  // ---- Director ----
  const team = names(await q('dir1', `select full_name n from public.director_team`));
  assert.ok(team.includes('p1') && !team.includes('p2') && !team.includes('dir1'), 'members of his group only');
  const dc = names(await q('dir1', `select full_name n from public.director_clients`));
  for (const n of ['C One', 'c2', 'c5']) assert.ok(dc.includes(n), n); assert.ok(!dc.includes('c3'), 'another group');
  assert.deepEqual(Object.keys((await q('dir1', `select * from public.director_clients limit 1`))[0]).sort(), ['created_at', 'full_name', 'partner_id', 'profile_id']);
  const db1 = await q('dir1', `select * from public.director_briefs where client_id=$1`, [ids.c1]);
  assert.equal(db1.length, 1); assert.deepEqual(db1[0].answers, { secret: 1 }); assert.deepEqual(db1[0].selected_types, ['brand-website']);
  assert.equal(await count('dir1', `select 1 from public.director_briefs where client_id=$1`, [ids.c3]), 0);
  assert.ok(await count('dir1', `select 1 from public.director_meetings where client_id=$1`, [ids.c1]) >= 1);
  assert.equal(await count('dir2', `select 1 from public.director_meetings where client_id=$1`, [ids.c1]), 0);
  assert.ok(!('note' in (await q('dir1', `select * from public.director_meetings limit 1`))[0]), 'the client note is not exposed');
  for (const t of ['clients', 'client_briefs', 'meetings', 'notes', 'invitations', 'data_requests', 'audit_log'])
    assert.equal(await count('dir1', `select 1 from public.${t}`), 0, 'director reads nothing directly from ' + t);
  assert.deepEqual(names(await q('dir1', `select full_name n from public.profiles`)), ['dir1']);
  assert.equal(await count('dir1', `select 1 from public.partners`), 1);
  assert.equal(await count('dir1', `select 1 from public.playbook`), 7);
  // read only: nothing he used to change can be changed now
  await blocked('dir1', `update public.client_briefs set status='won' where client_id=$1`, [ids.c1]);
  await blocked('dir1', `update public.meetings set status='cancelled' where client_id=$1`, [ids.c1]);
  await blocked('dir1', `update public.partners set active=false where profile_id=$1`, [ids.p1]);
  await denied('dir1', `insert into public.invitations(email,role,invited_by,director_id,token_hash) values ('late@t.test','partner',$1,$1,'h')`, [ids.dir1]);
  await denied('dir1', `insert into public.notes(client_id,author_id,body) values ($1,$2,'x')`, [ids.c1, ids.dir1]);
  await denied('dir1', `update public.director_briefs set status='won'`);
  await q('dir1', `update public.profiles set locale='fr' where id=$1`, [ids.dir1]);                                  // his own profile still works

  // ---- Founder and client are unchanged ----
  assert.ok(await count('founder', `select 1 from public.clients`) >= 5);
  assert.equal(await count('founder', `update public.client_briefs set status='in_review' where client_id=$1 returning 1`, [ids.c1]), 1);
  assert.equal(await count('founder', `update public.partners set active=true where profile_id=$1 returning 1`, [ids.p1]), 1);
  assert.equal(await count('founder', `insert into public.invitations(email,role,invited_by,token_hash) values ('f1@t.test','partner',$1,'h') returning 1`, [ids.founder]), 1);
  assert.ok(await count('founder', `select 1 from public.notes`) >= 1);
  assert.deepEqual((await q('c1', `select client_id from public.client_briefs`)).map(r => r.client_id), [ids.c1]);   // a client still reads his own brief only
});

// ---------------- Phase 2 (reply flow): migration 008 ----------------
// Loads 008 (twice) on top of 007 and proves: the client reads and answers only his own brief's messages, the Founder's messages come from the server,
// Partner and Director see nothing (no messages, no price, no Teams link), the Teams link is the Founder's and clears itself, visitors' replies are server + Founder only.
test('10.1 replies (008): client sees his own conversation only; Partner and Director see no message, price or Teams link; Teams link is Founder-only, https-only and clears itself', async () => {
  await db.exec(read('migration-008-replies.sql')); await db.exec(read('migration-008-replies.sql')); // twice: idempotent
  const count = async (u, sql, p = []) => (await q(u, sql, p)).length;
  const TEAMS = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc';
  await signup('c6', { partner_code: await code('p1'), company: 'Six', country: 'Egypt' });
  await signup('c7', { partner_code: await code('p1') });
  const brief = (await db.query(`insert into public.client_briefs(client_id,answers,status,selected_types) values ($1,'{"a":1}','in_review','{brand-website}') returning id`, [ids.c6])).rows[0].id;
  const brief7 = (await db.query(`insert into public.client_briefs(client_id,answers,status) values ($1,'{}','draft') returning id`, [ids.c7])).rows[0].id;
  const send = (cid, bid, extra = '', sender = 'founder') => db.query(`insert into public.brief_messages(brief_id,client_id,sender,body${extra ? ',' + extra.split('|')[0] : ''}) values ($1,$2,$3,'hello'${extra ? ',' + extra.split('|')[1] : ''}) returning id`, [bid, cid, sender]);

  // ---- the client cannot start a conversation; the Founder's browser cannot write either (the server does) ----
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','first!')`, [brief, ids.c6]);
  await denied('founder', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'founder','x')`, [brief, ids.c6]);
  const fm = (await send(ids.c6, brief, `price_text,proposes_meeting|'USD 4,500 fixed',true`)).rows[0].id;   // the server (service role) writes the Founder's reply
  const dm = (await send(ids.c7, brief7)).rows[0].id;                                                          // a message on a DRAFT brief
  await assert.rejects(() => send(ids.c7, brief), /does not belong/);                                           // client_id must match the brief

  // ---- the client's reply ----
  assert.equal(await count('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','thanks, Tuesday works') returning 1`, [brief, ids.c6]), 1);
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body,price_text) values ($1,$2,'client','x','USD 1')`, [brief, ids.c6]);           // no price from a client
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body,proposes_meeting) values ($1,$2,'client','x',true)`, [brief, ids.c6]);       // no meeting proposal
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body,kind) values ($1,$2,'client','x','meeting_confirmed')`, [brief, ids.c6]);   // no confirmation
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'founder','pretend to be the Founder')`, [brief, ids.c6]);   // no founder messages
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','')`, [brief, ids.c6]);                          // empty
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client',$3)`, [brief, ids.c6, 'x'.repeat(4001)]);       // too long
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','x')`, [brief7, ids.c7]);                         // another client's brief
  await denied('c7', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','x')`, [brief7, ids.c7]);                         // a DRAFT brief is not a conversation
  await denied('c7', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','x')`, [brief, ids.c6]);                          // as someone else
  const req = '11111111-1111-4111-8111-111111111111';
  await db.query(`insert into public.brief_messages(brief_id,client_id,sender,body,req_id) values ($1,$2,'founder','dup test',$3)`, [brief, ids.c6, req]);
  await assert.rejects(() => db.query(`insert into public.brief_messages(brief_id,client_id,sender,body,req_id) values ($1,$2,'founder','dup test',$3)`, [brief, ids.c6, req]), /duplicate|unique/i);  // a double click creates nothing

  // ---- who reads what ----
  assert.equal(await count('c6', `select 1 from public.brief_messages`), 3, 'the client reads his own conversation (Founder reply, his reply, the dup test)');
  assert.equal(await count('c7', `select 1 from public.brief_messages`), 1, 'another client reads only his own');
  assert.equal(await count('founder', `select 1 from public.brief_messages`), 4);
  const mine = await q('c6', `select price_text, proposes_meeting from public.brief_messages where id=$1`, [fm]);
  assert.equal(mine[0].price_text, 'USD 4,500 fixed'); assert.equal(mine[0].proposes_meeting, true);    // the price is the client's own business
  for (const u of ['p1', 'dir1', 'dir2', 'p2', 'c1']) {
    assert.equal(await count(u, `select 1 from public.brief_messages`), 0, u + ' reads no message');
    assert.equal(await count(u, `select 1 from public.briefs`), 0, u + ' reads no public brief');
    assert.equal(await count(u, `select 1 from public.visitor_replies`), 0, u + ' reads no visitor reply');
  }
  await denied('anon', `select 1 from public.brief_messages`); await denied('anon', `select 1 from public.briefs`); await denied('anon', `select 1 from public.visitor_replies`);
  // no browser role changes or deletes a message; the server may only record the email state
  await blocked('c6', `update public.brief_messages set body='edited' where client_id=$1`, [ids.c6]);
  await denied('founder', `update public.brief_messages set body='edited' where id=$1`, [fm]);
  await denied('c6', `delete from public.brief_messages where client_id=$1`, [ids.c6]);
  await denied('founder', `delete from public.brief_messages where id=$1`, [fm]);
  await db.query(`update public.brief_messages set email_status='sent', email_at=now() where id=$1`, [fm]);
  await assert.rejects(() => db.query(`update public.brief_messages set body='edited', email_status='sent' where id=$1`, [fm]), /immutable/);
  await assert.rejects(() => db.query(`update public.brief_messages set price_text='USD 1' where id=$1`, [fm]), /immutable/);
  assert.ok((await db.query(`select 1 from public.audit_log where table_name='brief_messages'`)).rows.length >= 3, 'rows are audited');
  assert.ok(!JSON.stringify((await db.query(`select changed from public.audit_log where table_name='brief_messages'`)).rows).includes('USD 4,500'), 'the audit log holds column names, never values');

  // ---- an open brief only ----
  await db.query(`update public.client_briefs set status='won' where id=$1`, [brief]);
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','after the end')`, [brief, ids.c6]);
  assert.equal(await count('c6', `select 1 from public.brief_messages`), 3, 'he still reads it');
  await db.query(`update public.client_briefs set status='in_review' where id=$1`, [brief]);

  // ---- at most 10 replies an hour ----
  for (let i = 0; i < 9; i++) await q('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','spam')`, [brief, ids.c6]);
  await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'client','one too many')`, [brief, ids.c6]);

  // ---- meetings: the client picks a time, only the Founder confirms and pastes the link ----
  const mid = (await q('c6', `insert into public.meetings(brief_id,client_id,starts_at,timezone,duration_min) values ($1,$2, now() + interval '3 days','Europe/Berlin',45) returning id`, [brief, ids.c6]))[0].id;
  await denied('c6', `insert into public.meetings(brief_id,client_id,starts_at,timezone,teams_url) values ($1,$2, now() + interval '4 days','Europe/Berlin',$3)`, [brief, ids.c6, TEAMS]);   // no link from a client
  assert.equal(await count('c6', `update public.meetings set teams_url=$2 where id=$1 returning 1`, [mid, TEAMS]), 1, 'on a requested call the link is cleared, not stored');
  assert.equal((await db.query(`select teams_url from public.meetings where id=$1`, [mid])).rows[0].teams_url, null);
  await denied('c6', `update public.meetings set status='confirmed' where id=$1`, [mid]);
  await denied('founder', `update public.meetings set status='confirmed', teams_url='http://teams.example/x' where id=$1`, [mid]);          // https only
  await denied('founder', `update public.meetings set status='confirmed', teams_url='https://a b.example/x' where id=$1`, [mid]);           // no spaces
  await denied('founder', `update public.meetings set status='confirmed', teams_url='javascript:alert(1)' where id=$1`, [mid]);
  await denied('founder', `update public.meetings set status='confirmed', teams_url=$2 where id=$1`, [mid, 'https://x.example/' + 'a'.repeat(500)]);   // too long
  assert.equal(await count('founder', `update public.meetings set status='confirmed', teams_url=$2 where id=$1 returning 1`, [mid, TEAMS]), 1);
  assert.equal((await q('c6', `select teams_url from public.meetings where id=$1`, [mid]))[0].teams_url, TEAMS, 'the client sees the link of his own call');
  assert.equal(await count('c7', `select 1 from public.meetings where id=$1`, [mid]), 0, 'nobody else does');
  await denied('c6', `update public.meetings set note='hello' where id=$1`, [mid]);                                                              // a confirmed call is the team's state
  assert.equal((await db.query(`select teams_url from public.meetings where id=$1`, [mid])).rows[0].teams_url, TEAMS, 'the client cannot blank or change the link of a confirmed call');
  await denied('c6', `update public.meetings set teams_url='https://evil.example/x' where id=$1`, [mid]);
  // a message may point at his own call, never at someone else's
  assert.equal(await count('c6', `select 1 from public.meetings`), 1);
  const other = (await db.query(`select id from public.meetings where client_id <> $1 limit 1`, [ids.c6])).rows[0];
  await db.query(`delete from public.brief_messages where sender='client' and client_id=$1`, [ids.c6]);   // (server housekeeping so the hourly limit does not get in the way below)
  await q('c6', `insert into public.brief_messages(brief_id,client_id,sender,body,meeting_id) values ($1,$2,'client','this time suits me',$3)`, [brief, ids.c6, mid]);
  if (other) await denied('c6', `insert into public.brief_messages(brief_id,client_id,sender,body,meeting_id) values ($1,$2,'client','x',$3)`, [brief, ids.c6, other.id]);
  // the Founder's confirmation message (written by the server) points at the call
  await db.query(`insert into public.brief_messages(brief_id,client_id,sender,kind,body,meeting_id) values ($1,$2,'founder','meeting_confirmed','',$3)`, [brief, ids.c6, mid]);
  // reschedule by the client: the link goes away by itself, the call is requested again; cancel keeps it empty
  await q('c6', `update public.meetings set starts_at = now() + interval '5 days', status='requested' where id=$1`, [mid]);
  assert.equal((await db.query(`select teams_url, status from public.meetings where id=$1`, [mid])).rows[0].teams_url, null, 'a moved call has no link until the Founder confirms again');
  await q('founder', `update public.meetings set status='confirmed', teams_url=$2 where id=$1`, [mid, TEAMS]);
  await q('c6', `update public.meetings set status='cancelled' where id=$1`, [mid]);
  assert.equal((await db.query(`select teams_url from public.meetings where id=$1`, [mid])).rows[0].teams_url, null, 'a cancelled call has no link');
  await q('founder', `update public.meetings set status='confirmed', teams_url=$2 where id=$1`, [mid, TEAMS]);
  await db.query(`update public.meetings set status='done' where id=$1`, [mid]);
  assert.equal((await db.query(`select teams_url from public.meetings where id=$1`, [mid])).rows[0].teams_url, TEAMS, 'a finished call keeps it');
  await db.query(`update public.meetings set status='confirmed' where id=$1`, [mid]);

  // ---- Partner and Director: nothing of this reaches them, not even through the 007 views ----
  for (const v of ['partner_clients', 'director_team', 'director_clients', 'director_briefs', 'director_meetings']) {
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [v])).rows.map(r => r.column_name);
    for (const bad of ['teams_url', 'price_text', 'body', 'proposes_meeting', 'email_status', 'req_id']) assert.ok(!cols.includes(bad), v + ' must not expose ' + bad);
  }
  assert.ok(!('teams_url' in (await q('dir1', `select * from public.director_meetings where client_id=$1`, [ids.c6]))[0]), 'the Director sees the call but not its link');
  assert.equal(await count('dir1', `select 1 from public.director_meetings where client_id=$1`, [ids.c6]), 1, 'he still sees that the call exists, as before');
  assert.equal(await count('p1', `select 1 from public.meetings`), 0);
  assert.equal(await count('p1', `select 1 from public.partner_clients where full_name='c6'`), 1);
  assert.deepEqual(Object.keys((await q('p1', `select * from public.partner_clients where full_name='c6'`))[0]).sort(), ['created_at', 'full_name', 'profile_id', 'selected_types']);
  await denied('p1', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'founder','x')`, [brief, ids.c6]);
  await denied('dir1', `insert into public.brief_messages(brief_id,client_id,sender,body) values ($1,$2,'founder','x')`, [brief, ids.c6]);
  await blocked('dir1', `update public.meetings set teams_url='https://x.example/abc' where id=$1`, [mid]);
  await blocked('p1', `update public.meetings set teams_url='https://x.example/abc' where id=$1`, [mid]);
  assert.equal(await count('founder', `select 1 from public.meetings where teams_url is not null`), 1);

  // ---- visitors: the reply is server + Founder only ----
  await db.query(`insert into public.briefs(ref,name,email,company,country,payload) values ('BR-VISIT2','Vera Visitor','vera@visitor.test','VCo','Egypt','{"locale":"ar"}')`);
  await db.query(`insert into public.visitor_replies(brief_ref,body,price_text,proposes_meeting,req_id) values ('BR-VISIT2','Hello Vera','EUR 3,000',true,'22222222-2222-4222-8222-222222222222')`);
  await assert.rejects(() => db.query(`insert into public.visitor_replies(brief_ref,body,req_id) values ('BR-VISIT2','again','22222222-2222-4222-8222-222222222222')`), /duplicate|unique/i);
  await assert.rejects(() => db.query(`insert into public.visitor_replies(brief_ref,body) values ('BR-NOPE99','x')`), /foreign key/i);
  assert.equal(await count('founder', `select 1 from public.visitor_replies`), 1);
  assert.equal(await count('founder', `select 1 from public.briefs where ref='BR-VISIT2'`), 1, 'the Founder lists the public briefs');
  for (const u of ['c6', 'p1', 'dir1']) { assert.equal(await count(u, `select 1 from public.visitor_replies`), 0); assert.equal(await count(u, `select 1 from public.briefs`), 0); }
  await denied('founder', `insert into public.visitor_replies(brief_ref,body) values ('BR-VISIT2','from the browser')`);
  await denied('founder', `update public.visitor_replies set body='x'`); await denied('founder', `delete from public.briefs`); await denied('founder', `insert into public.briefs(ref,name,email,company,country) values ('BR-FAKE22','x','x@x.co','c','e')`);

  // ---- notify_events knows the two new kinds, and still only those ----
  for (const k of ['brief_thanks', 'client_reply']) await db.query(`insert into public.notify_events(key,kind) values ($1,$2)`, ['t:' + k, k]);
  await assert.rejects(() => db.query(`insert into public.notify_events(key,kind) values ('t:x','nope')`), /check/i);
  await denied('c6', `select 1 from public.notify_events`);

  // ---- the old rules still stand after 008 ----
  assert.deepEqual((await q('c6', `select client_id from public.client_briefs`)).map(r => r.client_id), [ids.c6]);
  assert.deepEqual(names(await q('p1', `select full_name n from public.profiles`)), ['p1']);
  assert.equal(await count('p1', `select 1 from public.clients`), 0);
});

// ---------------- Client project status and amount: migration 009 ----------------
// Loads 009 (twice) on top of 008 and proves: only the Founder writes the stage and the amount; Partner and Director read the stage of THEIR clients
// through the two views, and the amount only when the project is delivered; clients and strangers see nothing; the old columns of the views are unchanged.
test('11.1 project status (009): Founder-only writes; Partner/Director see stage and (delivered only) amount of their own clients; clients see nothing', async () => {
  await db.exec(read('migration-009-project-status.sql')); await db.exec(read('migration-009-project-status.sql')); // twice: idempotent
  const count = async (u, sql, p = []) => (await q(u, sql, p)).length;
  const row = async (u, view, cid) => (await q(u, `select * from public.${view} where profile_id=$1`, [cid]))[0];

  // ---- before the Founder sets anything: every client is "pending" with no amount ----
  assert.equal((await row('p1', 'partner_clients', ids.c1)).project_stage, 'pending');
  assert.equal((await row('p1', 'partner_clients', ids.c1)).amount_usd, null);

  // ---- the Founder writes ----
  await as('founder', () => db.query(`insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',450.50)`, [ids.c1]));
  await as('founder', () => db.query(`insert into public.client_projects(profile_id,stage) values ($1,'building')`, [ids.c2]));
  await as('founder', () => db.query(`insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',999)`, [ids.c3]));
  await as('founder', () => db.query(`insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',0)`, [ids.c5]));     // zero is allowed
  // rules of the table
  await denied('founder', `insert into public.client_projects(profile_id,stage) values ($1,'bogus')`, [ids.c4]);                                  // unknown stage
  await denied('founder', `insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'building',10)`, [ids.c4]);              // an amount only on a delivered project
  await denied('founder', `insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',-1)`, [ids.c4]);             // no negative amount
  await denied('founder', `update public.client_projects set stage='building' where profile_id=$1`, [ids.c1]);                                    // would keep 450.50 on a building project
  await as('founder', () => db.query(`update public.client_projects set stage='building', amount_usd=null where profile_id=$1`, [ids.c1]));
  assert.equal((await row('p1', 'partner_clients', ids.c1)).amount_usd, null);                                                                    // moved back: the amount is gone
  await as('founder', () => db.query(`update public.client_projects set stage='delivered', amount_usd=450.50 where profile_id=$1`, [ids.c1]));

  // ---- Partner: his own clients only, stage always, amount only when delivered ----
  const pc = await q('p1', `select * from public.partner_clients order by full_name`);
  assert.deepEqual(Object.keys(pc[0]).sort(), ['amount_usd', 'created_at', 'full_name', 'profile_id', 'project_stage', 'selected_types']);
  const p1c1 = await row('p1', 'partner_clients', ids.c1), p1c2 = await row('p1', 'partner_clients', ids.c2);
  assert.equal(p1c1.project_stage, 'delivered'); assert.equal(Number(p1c1.amount_usd), 450.5);
  assert.equal(p1c2.project_stage, 'building'); assert.equal(p1c2.amount_usd, null);
  assert.equal(await row('p1', 'partner_clients', ids.c3), undefined, 'another partner\'s client');
  assert.equal(await count('p1', `select 1 from public.client_projects`), 0, 'a partner cannot read the table itself');
  await denied('p1', `insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',1)`, [ids.c4]);
  await blocked('p1', `update public.client_projects set amount_usd=999999 where profile_id=$1`, [ids.c1]);
  await blocked('p1', `delete from public.client_projects where profile_id=$1`, [ids.c1]);
  await denied('p1', `update public.partner_clients set amount_usd=1`);                                                                            // views are read only
  assert.equal(await count('p2', `select 1 from public.partner_clients where profile_id=$1`, [ids.c1]), 0);                                     // not his client

  // ---- Director: his partners' clients and his direct clients; nothing of another group ----
  assert.equal(Number((await row('dir1', 'director_clients', ids.c1)).amount_usd), 450.5);
  assert.equal((await row('dir1', 'director_clients', ids.c2)).project_stage, 'building');
  assert.equal((await row('dir1', 'director_clients', ids.c5)).project_stage, 'delivered');                                                       // his direct client
  assert.equal(Number((await row('dir1', 'director_clients', ids.c5)).amount_usd), 0);
  assert.equal(await row('dir1', 'director_clients', ids.c3), undefined, 'another group');
  assert.deepEqual(Object.keys((await q('dir1', `select * from public.director_clients limit 1`))[0]).sort(), ['amount_usd', 'created_at', 'full_name', 'partner_id', 'profile_id', 'project_stage']);
  assert.equal(await count('dir1', `select 1 from public.client_projects`), 0);
  await denied('dir1', `insert into public.client_projects(profile_id,stage) values ($1,'building')`, [ids.c4]);
  await blocked('dir1', `update public.client_projects set stage='pending'`);
  assert.equal(Number((await row('dir2', 'director_clients', ids.c3)).amount_usd), 999);                                                         // the other group sees its own

  // ---- clients and the Founder ----
  assert.equal(await count('c1', `select 1 from public.client_projects`), 0, 'a client never sees the amount');
  await denied('c1', `insert into public.client_projects(profile_id,stage,amount_usd) values ($1,'delivered',5)`, [ids.c1]);
  assert.equal(await count('c1', `select 1 from public.partner_clients`), 0);
  assert.equal(await count('founder', `select 1 from public.client_projects`), 4);
  // a delivered project's amount cannot leak by moving it (the view returns null for any other stage)
  await as('founder', () => db.query(`update public.client_projects set stage='pending', amount_usd=null where profile_id=$1`, [ids.c5]));
  assert.equal((await row('dir1', 'director_clients', ids.c5)).amount_usd, null);
  // the audit log keeps column names only, never the amount
  const au = await q('founder', `select changed from public.audit_log where table_name='client_projects' and action='update' and changed is not null`);
  assert.ok(au.length >= 1 && au.every(r => !JSON.stringify(r.changed).match(/\d{3}/)), 'no values in the audit log');
});
