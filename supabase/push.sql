-- ELIO · Erinnerungen per Push aufs iPad (z. B. „Elternzettel bis Mittwoch“: Dienstag um 18 Uhr)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Datenschutz: Der Server speichert nur die Push-Adresse eines Geräts und die Klasse, keine Namen.
-- Die Mitteilung selbst hat keinen Inhalt („Denk an deine Erinnerung in ELIO“), den Text sieht das Kind erst in ELIO.

-- 1) Push-Adressen der iPads (eine pro Gerät, an die Klasse der Anmeldung gebunden)
create table if not exists public.push_subs (
  endpoint text primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  uid uuid,
  created_at timestamptz default now()
);
alter table public.push_subs enable row level security;
-- keine Policies: nur über die Funktionen unten und die Edge Function (Service-Rolle) erreichbar

create or replace function public.push_save(p_endpoint text) returns text
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000 then return 'bad'; end if;
  select class_id into c from public.class_members where uid = auth.uid();
  if c is null then return 'noclass'; end if;
  insert into public.push_subs (endpoint, class_id, uid) values (p_endpoint, c, auth.uid())
    on conflict (endpoint) do update set class_id = excluded.class_id, uid = excluded.uid, created_at = now();
  return 'ok';
end $$;
grant execute on function public.push_save(text) to authenticated;

create or replace function public.push_del(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint and uid = auth.uid();
$$;
grant execute on function public.push_del(text) to authenticated;

-- 2) Geplante Erinnerungen: nur Klasse und Zeitpunkt, kein Text
create table if not exists public.push_jobs (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  send_at timestamptz not null,
  sent_at timestamptz,
  created_by uuid default auth.uid()
);
alter table public.push_jobs enable row level security;
drop policy if exists push_jobs_teacher on public.push_jobs;
create policy push_jobs_teacher on public.push_jobs for all to authenticated
  using (public.teaches(class_id)) with check (public.teaches(class_id));

-- 3) Öffentlicher Push-Schlüssel (VAPID), den die iPads zum Anmelden brauchen. Wert unten eintragen.
create table if not exists public.push_cfg (id int primary key default 1 check (id = 1), vapid_pub text);
alter table public.push_cfg enable row level security;
drop policy if exists push_cfg_read on public.push_cfg;
create policy push_cfg_read on public.push_cfg for select to anon, authenticated using (true);
-- insert into public.push_cfg (id, vapid_pub) values (1, 'ÖFFENTLICHER_SCHLÜSSEL') on conflict (id) do update set vapid_pub = excluded.vapid_pub;

-- 4) Zeitplan: alle 15 Minuten fällige Erinnerungen verschicken (pg_cron + pg_net, beide in Supabase enthalten)
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- GEHEIMWORT durch dasselbe Wort ersetzen, das du als Secret CRON_SECRET bei der Edge Function einträgst:
-- select cron.schedule('elio-push', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://yljzqjnvfoxzkhjsnawn.supabase.co/functions/v1/elio-push',
--     headers := jsonb_build_object('Content-Type','application/json','x-elio-cron','GEHEIMWORT'),
--     body := '{}'::jsonb)
-- $$);
