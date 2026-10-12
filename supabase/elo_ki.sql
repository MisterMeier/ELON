-- ELIO · Vorbereitung „Elo als KI“: Tageslimit und Protokoll für die Edge Function elo-ki
-- Einmal im Supabase „SQL Editor“ ausführen, erst wenn die KI angeschaltet wird. Schadet nicht, es mehrfach auszuführen.
-- Gespeichert wird nur: wer (anonyme iPad-Sitzung), welche Klasse, welche Art von Frage, wann. Kein Inhalt, keine Antworten.

create table if not exists public.elo_ki_log (
  id bigint generated always as identity primary key,
  uid uuid not null default auth.uid(),
  class_id uuid,
  kind text not null check (char_length(kind) <= 20),
  at timestamptz not null default now()
);
create or replace function public.elo_ki_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.uid := auth.uid();
  select class_id into new.class_id from public.class_members where uid = auth.uid();
  return new;
end $$;
drop trigger if exists on_elo_ki on public.elo_ki_log;
create trigger on_elo_ki before insert on public.elo_ki_log for each row execute function public.elo_ki_fill();
create index if not exists elo_ki_log_uid on public.elo_ki_log (uid, at);
alter table public.elo_ki_log enable row level security;
drop policy if exists eki_insert on public.elo_ki_log;
create policy eki_insert on public.elo_ki_log for insert to authenticated with check (uid = auth.uid());
-- Protokoll für die Lehrkraft der Klasse
drop policy if exists eki_read on public.elo_ki_log;
create policy eki_read on public.elo_ki_log for select to authenticated using (uid = auth.uid() or public.teaches(class_id));

create or replace function public.elo_ki_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.elo_ki_log where uid = auth.uid() and at > date_trunc('day', now());
$$;
grant execute on function public.elo_ki_count() to authenticated;
-- Alte Einträge nach 30 Tagen löschen (z. B. per Supabase Cron): delete from public.elo_ki_log where at < now() - interval '30 days';
