import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
// Run: npm i && npm run test:migrations   (uses an in-memory Postgres, nothing is touched on your real database)
const dir = new URL('../supabase/', import.meta.url).pathname;
const schema = fs.readFileSync(dir + 'schema.sql', 'utf8'), mig = fs.readFileSync(dir + 'migration-001.sql', 'utf8');
const ROLES = `do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;`;
const OLD_SCHEMA = `create extension if not exists pgcrypto;
create table public.briefs (id uuid primary key default gen_random_uuid(), ref text not null unique check (ref ~ '^BR-[A-Z0-9]{6}$'), created_at timestamptz not null default now(),
 name text not null check (char_length(name) between 2 and 120), email text not null check (char_length(email) <= 200), company text not null check (char_length(company) <= 160), country text not null check (char_length(country) <= 100),
 items_count int not null check (items_count between 1 and 20), payload jsonb not null check (octet_length(payload::text) <= 100000));`;
const VERY_OLD = `create table public.briefs (id uuid primary key default gen_random_uuid(), ref text not null unique, name text not null, email text not null, company text not null, country text not null);
 insert into public.briefs(ref,name,email,company,country) values ('LEGACY1','Old Row','o@x.com','Co','Egypt');`;
async function mk() { const db = new PGlite({ extensions: { pgcrypto } }); await db.exec(ROLES); return db; }
const cols = async (db, t) => (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by 1`, [t])).rows.map(r => r.column_name).join(',');
const cons = async db => (await db.query(`select conrelid::regclass::text t, conname from pg_constraint where connamespace='public'::regnamespace and contype in ('c','u') order by 1,2`)).rows.map(r => r.t + '.' + r.conname).join('\n');
const idx = async db => (await db.query(`select indexname from pg_indexes where schemaname='public' order by 1`)).rows.map(r => r.indexname).join(',');
const results = {};
async function scenario(name, setup) {
  const db = await mk(); if (setup) await db.exec(setup);
  await db.exec(mig); await db.exec(mig); // twice: idempotent
  const r = { briefs: await cols(db, 'briefs'), contacts: await cols(db, 'contacts'), cons: await cons(db), idx: await idx(db) };
  // behaviour checks
  const ok = [];
  await db.query(`insert into public.briefs(ref,name,email,company,country,timezone,items_count,payload,status) values ('BR-ABCD23','Ahmed','a@b.co','Co','Egypt','Africa/Cairo',0,'{"a":1}','new')`); ok.push('items_count 0 allowed');
  for (const [label, sql] of [['bad status', `insert into public.briefs(ref,name,email,company,country,status) values ('BR-ABCD24','Ahmed','a@b.co','Co','Egypt','bogus')`],['items 21', `insert into public.briefs(ref,name,email,company,country,items_count) values ('BR-ABCD25','Ahmed','a@b.co','Co','Egypt',21)`],['bad ref', `insert into public.briefs(ref,name,email,company,country) values ('XX','Ahmed','a@b.co','Co','Egypt')`],['dup ref', `insert into public.briefs(ref,name,email,company,country) values ('BR-ABCD23','Ahmed','a@b.co','Co','Egypt')`],['contact bad status', `insert into public.contacts(ref,name,email,message,status) values ('CT-ABCD23','Ahmed','a@b.co','hi','bogus')`]]) {
    try { await db.query(sql); ok.push('!! ' + label + ' NOT rejected'); } catch (e) { ok.push(label + ' rejected'); }
  }
  await db.query(`insert into public.contacts(ref,name,email,message) values ('CT-ABCD23','Ahmed','a@b.co','hi')`); ok.push('contact insert ok');
  await db.query(`update public.briefs set notify='{"owner":"sent"}' where ref='BR-ABCD23'`); ok.push('notify column ok');
  const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname in ('briefs','contacts') order by 1`)).rows.map(r => r.relname + ':' + r.relrowsecurity).join(',');
  const anon = (await db.query(`select has_table_privilege('anon','public.briefs','select') a, has_table_privilege('service_role','public.briefs','insert') s`)).rows[0];
  r.checks = ok.join(' | ') + ' | rls ' + rls + ' | anon select=' + anon.a + ' service insert=' + anon.s;
  results[name] = r; await db.close();
}
await scenario('FRESH (migration only, empty db)', null);
await scenario('OLD (original schema.sql from repo, no timezone/status/contacts)', OLD_SCHEMA);
await scenario('VERY OLD (legacy columns + existing row)', VERY_OLD);
// fresh via schema.sql then migration (same end state?)
{ const db = await mk(); await db.exec(schema); await db.exec(mig); const a = { briefs: await cols(db,'briefs'), contacts: await cols(db,'contacts'), cons: await cons(db), idx: await idx(db) }; results['FRESH schema.sql + migration'] = a; const db2 = await mk(); await db2.exec(schema); results['_schema-only'] = { briefs: await cols(db2,'briefs'), contacts: await cols(db2,'contacts'), cons: await cons(db2), idx: await idx(db2) }; }
const ref = results['FRESH schema.sql + migration'];
for (const [k, v] of Object.entries(results)) {
  console.log('==', k); if (v.checks) console.log(v.checks);
  console.log('same columns as schema:', v.briefs === ref.briefs && v.contacts === ref.contacts, '| same constraints:', v.cons === ref.cons, '| same indexes:', v.idx === ref.idx);
  if (v.cons !== ref.cons) console.log(v.cons);
}
console.log('schema.sql-only == schema+migration:', JSON.stringify(results['_schema-only']) === JSON.stringify(ref));
