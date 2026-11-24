-- CULMERA platform, Phase 5 (email notifications): the claim table that keeps every notification to ONE email set per real event.
-- Run ONCE in the Supabase SQL Editor, after migration-004-team.sql. Safe to run again (idempotent).
-- Nothing here changes or deletes existing data. The browser can never read or write this table: only the server (service key) can.

create table if not exists public.notify_events (
  key text primary key check (char_length(key) between 1 and 160),      -- e.g. registered:<user>, brief:<brief>:<time>, meeting:<meeting>:<status>:<time>
  kind text not null check (kind in ('registered','brief_submitted','meeting')),
  result jsonb,                                                           -- {sent, failed, skipped} counts only: no names, no emails
  created_at timestamptz not null default now()
);
create index if not exists notify_events_created_idx on public.notify_events (created_at desc);

alter table public.notify_events enable row level security;               -- on, with NO policy = nobody from the browser
revoke all on public.notify_events from anon, authenticated;
grant all on public.notify_events to service_role;
