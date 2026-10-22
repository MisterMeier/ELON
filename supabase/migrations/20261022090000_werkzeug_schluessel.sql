-- ELONUKI · Persönliche Schlüssel für eigene Werkzeuge (die KI der Lehrkraft schickt Änderungen direkt an ELONUKI)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher: die Migration 20261021180000_co_autor_werkzeuge.sql.
-- Danach zum Prüfen: supabase/tests/werkzeug_schluessel_test.sql. Dann die Edge Function „werkzeug-push“ einrichten (werkzeuge/EINRICHTEN-direkt.md).
--
-- Was das macht:
-- • Co-Autoren (und Admins) erzeugen sich in ELONUKI einen persönlichen Schlüssel. Er wird nur einmal angezeigt.
--   In der Datenbank liegt nur ein Fingerabdruck (SHA-256), nie der Schlüssel selbst.
-- • Mit dem Schlüssel schickt die KI der Lehrkraft eine Werkzeug-Datei an die Edge Function „werkzeug-push“.
--   Das ist genau das Gleiche wie „Neue Version hochladen“: dieselben Regeln, dieselbe Freigabe, dieselbe Größenbremse.
--   Ein Werkzeug wird über seinen Namen gefunden. Ist es schon freigegeben, geht die Änderung sofort live.
-- • Der Schlüssel gehört zu einer Person und kann nichts anderes als eigene Werkzeuge schicken, lesen und listen.
--   Er kann kein Werkzeug freigeben oder sperren und kommt an keine Schülerdaten. Widerrufen geht jederzeit.
-- • Die Funktionen zum Schicken dürfen nur von der Edge Function (service_role) aufgerufen werden, nicht aus dem Browser.

begin;

create table if not exists public.tool_keys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  key_hash text not null unique,
  label text not null default '' check (char_length(label) <= 60),
  created_at timestamptz default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists tool_keys_profile on public.tool_keys (profile_id);
alter table public.tool_keys enable row level security;
revoke all on public.tool_keys from public, anon, authenticated;

-- Darf diese Person Werkzeuge hochladen? (Co-Autor oder Admin in irgendeiner Schule, oder Konto-Admin)
create or replace function public.can_upload_tools(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and role in ('teacher','admin'))
     and (exists (select 1 from public.profiles where id = p and role = 'admin')
          or exists (select 1 from public.school_members where profile_id = p and role in ('admin','author')));
$$;
revoke all on function public.can_upload_tools(uuid) from public, anon, authenticated;

-- Neuen Schlüssel erzeugen. Der Klartext steht nur in dieser Antwort und wird nirgends gespeichert.
create or replace function public.tool_key_create(p_label text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text; n int;
begin
  if me is null or not public.can_upload_tools(me) then return jsonb_build_object('err', 'denied'); end if;
  select count(*) into n from public.tool_keys where profile_id = me and revoked_at is null;
  if n >= 3 then return jsonb_build_object('err', 'zuviele'); end if;
  tok := 'elk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.tool_keys (profile_id, key_hash, label)
    values (me, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), left(coalesce(trim(p_label), ''), 60));
  return jsonb_build_object('key', tok);
end $$;

create or replace function public.tool_key_list()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz, revoked boolean)
language sql stable security definer set search_path = public as $$
  select k.id, k.label, k.created_at, k.last_used_at, k.revoked_at is not null
  from public.tool_keys k where k.profile_id = auth.uid() and public.is_teacher() order by k.created_at desc;
$$;

create or replace function public.tool_key_revoke(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.tool_keys set revoked_at = now() where id = p_id and profile_id = auth.uid() and revoked_at is null;
  if not found then return 'unbekannt'; end if;
  return 'ok';
end $$;

-- Nur für die Edge Function: Person zum Schlüssel finden (und „zuletzt benutzt“ merken)
create or replace function public.tool_key_user(p_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select profile_id into pid from public.tool_keys where key_hash = p_hash and revoked_at is null;
  if pid is null or not public.can_upload_tools(pid) then return null; end if;
  update public.tool_keys set last_used_at = now() where key_hash = p_hash;
  return pid;
end $$;

-- Nur für die Edge Function: Werkzeug über den Namen anlegen oder aktualisieren (wie „Neue Version hochladen“).
-- Felder, die fehlen (null), bleiben bei einem bestehenden Werkzeug unverändert.
create or replace function public.tool_push(p_hash text, p_name text, p_subject text, p_info text, p_html text, p_needs_names boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid := public.tool_key_user(p_hash); t record; r jsonb;
begin
  if pid is null then return jsonb_build_object('err', 'key'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('err', 'name'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  select * into t from public.school_tools where owner = pid and lower(name) = lower(trim(p_name)) order by created_at limit 1;
  r := public.tool_save(t.id, trim(p_name), coalesce(p_subject, t.subject, ''), coalesce(p_info, t.info, ''), p_html, coalesce(p_needs_names, t.needs_names, false));
  perform set_config('request.jwt.claims', '', true);
  return r || jsonb_build_object('neu', t.id is null);
end $$;

-- Nur für die Edge Function: eigene Werkzeuge listen (p_name leer) oder eines samt Datei holen
create or replace function public.tool_pull(p_hash text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid := public.tool_key_user(p_hash); t record;
begin
  if pid is null then return jsonb_build_object('err', 'key'); end if;
  if coalesce(trim(p_name), '') = '' then
    return jsonb_build_object('tools', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'ver', s.ver, 'status', s.status, 'fach', s.subject) order by s.name)
      from public.school_tools s where s.owner = pid), '[]'::jsonb));
  end if;
  select * into t from public.school_tools where owner = pid and lower(name) = lower(trim(p_name)) order by created_at limit 1;
  if t.id is null then return jsonb_build_object('err', 'unbekannt'); end if;
  return jsonb_build_object('name', t.name, 'ver', t.ver, 'status', t.status, 'fach', t.subject, 'info', t.info, 'html', t.html);
end $$;

revoke all on function public.tool_key_create(text), public.tool_key_list(), public.tool_key_revoke(uuid) from public, anon;
grant execute on function public.tool_key_create(text), public.tool_key_list(), public.tool_key_revoke(uuid) to authenticated;
revoke all on function public.tool_key_user(text), public.tool_push(text, text, text, text, text, boolean), public.tool_pull(text, text) from public, anon, authenticated;
grant execute on function public.tool_key_user(text), public.tool_push(text, text, text, text, text, boolean), public.tool_pull(text, text) to service_role;

commit;
