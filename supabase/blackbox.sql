-- ELIO · Blackbox (KI für die Planung): Tageslimit und Protokoll für die Edge Function blackbox
-- Einmal im Supabase „SQL Editor“ ausführen. Schadet nicht, es mehrfach auszuführen.
-- Gespeichert wird nur: welche Lehrkraft, welche Art, wann. Kein Wunschtext, keine Antworten.

create table if not exists public.blackbox_log (
  id bigint generated always as identity primary key,
  uid uuid not null default auth.uid(),
  kind text not null check (char_length(kind) <= 20),
  at timestamptz not null default now()
);
create index if not exists blackbox_log_uid on public.blackbox_log (uid, at);
alter table public.blackbox_log enable row level security;
drop policy if exists bb_insert on public.blackbox_log;
create policy bb_insert on public.blackbox_log for insert to authenticated with check (uid = auth.uid() and public.is_teacher());
drop policy if exists bb_read on public.blackbox_log;
create policy bb_read on public.blackbox_log for select to authenticated using (uid = auth.uid() or public.is_admin());

create or replace function public.blackbox_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.blackbox_log where uid = auth.uid() and at > date_trunc('day', now());
$$;
grant execute on function public.blackbox_count() to authenticated;
-- Alte Einträge nach 90 Tagen löschen (z. B. per Supabase Cron): delete from public.blackbox_log where at < now() - interval '90 days';
