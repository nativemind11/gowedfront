-- CULMERA migration 006: languages (Phase 8)
-- Adds Portuguese (pt) and Dutch (nl) to the allowed site languages. Final list: en, fr, de, zh, ru, pt, nl, ar.
-- Safe to run more than once. Existing rows stay valid (only new codes are added, none removed).
-- Run it once in the Supabase SQL editor of the CULMERA project, after migration-005-notify.sql.

-- 1) Drop the old locale check on profiles and client_briefs (whatever its name is), then re-create it with the full list.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.profiles'::regclass, 'public.client_briefs'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%locale%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('en','fr','de','zh','ru','pt','nl','ar'));

alter table public.client_briefs
  add constraint client_briefs_locale_check
  check (locale in ('en','fr','de','zh','ru','pt','nl','ar'));

-- 2) Sign-up trigger: same logic as migration 002, with the new language list.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        inv public.invitations%rowtype; v_code text; v_partner uuid; v_loc text; v_name text; v_mail text;
begin
  v_mail := lower(btrim(coalesce(new.email, '')));
  v_loc  := case when md->>'locale' in ('en','fr','de','zh','ru','pt','nl','ar') then md->>'locale' else 'en' end;
  v_name := left(btrim(coalesce(md->>'full_name', '')), 120);
  select * into inv from public.invitations
   where lower(email) = v_mail and accepted_at is null and expires_at > now()
   order by created_at desc limit 1;
  if found then
    insert into public.profiles (id, role, full_name, email, locale) values (new.id, inv.role, v_name, v_mail, v_loc);
    insert into public.partners (profile_id, code, director_id)
      values (new.id, private.new_code(), case when inv.role = 'partner' then inv.director_id end);
    update public.invitations set accepted_at = now() where id = inv.id;
  else
    insert into public.profiles (id, role, full_name, email, locale) values (new.id, 'client', v_name, v_mail, v_loc);
    v_code := upper(btrim(left(coalesce(md->>'partner_code', ''), 40)));
    select p.profile_id into v_partner from public.partners p join public.profiles pr on pr.id = p.profile_id
     where p.code = v_code and p.active and pr.status = 'active' and pr.role in ('partner','director');
    insert into public.clients (profile_id, partner_id, code_used, company, country, phone)
      values (new.id, v_partner, nullif(v_code, ''), left(btrim(coalesce(md->>'company','')),160),
              left(btrim(coalesce(md->>'country','')),100), nullif(left(btrim(coalesce(md->>'phone','')),40),''));
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Check after running (optional): both rows must show the 8 codes.
-- select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where conname in ('profiles_locale_check','client_briefs_locale_check');
