-- ELONUKI · Co-Autor und eigene Werkzeuge (HTML-Dateien von Lehrkräften)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher: schema.sql, tester.sql und die Migrationen 20261015120000_schulen_trennen.sql, 20261018120000_admin_konten.sql.
-- Danach zum Prüfen: supabase/tests/co_autor_werkzeuge_test.sql
--
-- Was das macht:
-- • Neue Rolle in der Schule: „author“ (Co-Autor). Ein Co-Autor ist eine normale Lehrkraft mit einem Zusatzrecht:
--   Er darf eigene Werkzeuge (eine HTML-Datei) hochladen. Admin-Rechte bekommt er dadurch nicht.
-- • Tabelle school_tools: die Werkzeuge, jeweils einer Schule und einem Autor zugeordnet, mit Versionsnummer.
-- • Ablauf: Entwurf → eingereicht → freigegeben. Freigeben kann nur der Konto-Admin (Fabian), einmal pro Werkzeug.
--   Danach gehen Änderungen des Autors direkt live (Entscheidung Fabian 21.10.2026). „gesperrt“ ist nur der Not-Aus.
-- • Vor der Freigabe läuft ein Werkzeug nur beim Autor und beim Konto-Admin: in der Vorschau und in der eigenen Testklasse.
-- • Niemand liest oder schreibt die Tabelle direkt. Alles läuft über die Funktionen unten, die selbst prüfen, wer was darf.
--   Andere Lehrkräfte bekommen nur freigegebene Werkzeuge ihrer eigenen Schule.
-- • Das Werkzeug selbst läuft in der App immer im Schutzkasten (ohne Internet, ohne Zugriff auf Konto und Speicher).

begin;

-- ---------------------------------------------------------------- 1. Rolle „author“
alter table public.school_members drop constraint if exists school_members_role_check;
alter table public.school_members add constraint school_members_role_check check (role in ('admin','author','teacher'));

-- Ich darf in dieser Schule Werkzeuge hochladen (Co-Autor, Schul-Admin oder Konto-Admin als Mitglied)
create or replace function public.school_author(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (select 1 from public.school_members
    where school_id = s and profile_id = auth.uid() and (role in ('admin','author') or public.is_admin()));
$$;

-- Aufnehmen per E-Mail kennt jetzt auch „author“ (sonst unverändert)
create or replace function public.school_add_member(p_school uuid, p_email text, p_role text default 'teacher')
returns text language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_role not in ('admin','author','teacher') then return 'invalid'; end if;
  if not exists (select 1 from public.schools where id = p_school) then return 'unbekannt'; end if;
  select id into pid from public.profiles where lower(email) = lower(trim(coalesce(p_email, ''))) and role in ('teacher','admin');
  if pid is null or exists (select 1 from public.school_members where profile_id = pid and school_id <> p_school) then
    return 'unbekannt';
  end if;
  insert into public.school_members (school_id, profile_id, role) values (p_school, pid, p_role)
    on conflict (school_id, profile_id) do update set role = excluded.role;
  return 'ok';
end $$;

-- Rolle einer Lehrkraft in ihrer Schule umstellen (Lehrkraft ↔ Co-Autor). Nur Konto-Admin.
create or replace function public.school_set_role(p_profile uuid, p_role text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_role not in ('author','teacher') then return 'invalid'; end if;
  if p_profile = auth.uid() then return 'self'; end if;
  update public.school_members set role = p_role where profile_id = p_profile and role <> 'admin';
  if not found then return 'unbekannt'; end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- 2. Tabelle Werkzeuge
create table if not exists public.school_tools (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  owner uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  subject text not null default '' check (char_length(subject) <= 8),
  info text not null default '' check (char_length(info) <= 400),
  html text not null check (octet_length(html) <= 600000),
  sha text not null default '',
  ver int not null default 1,
  status text not null default 'entwurf' check (status in ('entwurf','eingereicht','freigegeben','abgelehnt','gesperrt')),
  approved_ver int,                       -- erste freigegebene Version; danach bleibt das Werkzeug freigegeben
  needs_names boolean not null default false,  -- der Autor sagt: mein Werkzeug braucht Vornamen
  names_ok boolean not null default false,     -- Fabian hat das bei der Freigabe erlaubt
  note text not null default '' check (char_length(note) <= 600),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists school_tools_school on public.school_tools (school_id, status);
create index if not exists school_tools_owner on public.school_tools (owner);
alter table public.school_tools enable row level security;
-- Keine Regeln (Policies) = niemand liest oder schreibt direkt. Nur die Funktionen unten.
revoke all on public.school_tools from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. Funktionen
-- Speichern: neues Werkzeug (p_id null) oder neue Version eines eigenen. Gibt die ID zurück oder einen Fehlertext.
create or replace function public.tool_save(p_id uuid, p_name text, p_subject text, p_info text, p_html text, p_needs_names boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sid uuid; t record; h text;
begin
  if me is null or not public.is_teacher() then return jsonb_build_object('err', 'denied'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('err', 'name'); end if;
  if p_html is null or octet_length(p_html) = 0 then return jsonb_build_object('err', 'leer'); end if;
  if octet_length(p_html) > 600000 then return jsonb_build_object('err', 'gross'); end if;
  h := encode(sha256(convert_to(p_html, 'UTF8')), 'hex');
  if p_id is null then
    select m.school_id into sid from public.school_members m where m.profile_id = me order by (m.role = 'admin') desc, m.school_id limit 1;
    if sid is null then return jsonb_build_object('err', 'noschool'); end if;
    if not public.school_author(sid) then return jsonb_build_object('err', 'denied'); end if;
    insert into public.school_tools (school_id, owner, name, subject, info, html, sha, needs_names)
      values (sid, me, left(trim(p_name), 80), left(coalesce(p_subject, ''), 8), left(coalesce(p_info, ''), 400), p_html, h, coalesce(p_needs_names, false))
      returning * into t;
  else
    select * into t from public.school_tools where id = p_id;
    if t.id is null or t.owner <> me then return jsonb_build_object('err', 'denied'); end if;
    if not public.school_author(t.school_id) then return jsonb_build_object('err', 'denied'); end if;
    update public.school_tools set name = left(trim(p_name), 80), subject = left(coalesce(p_subject, ''), 8), info = left(coalesce(p_info, ''), 400),
      html = p_html, sha = h, ver = case when h = t.sha then t.ver else t.ver + 1 end,
      -- einmal freigegeben bleibt freigegeben; abgelehnt wird wieder Entwurf; gesperrt bleibt gesperrt
      status = case when t.status = 'abgelehnt' then 'entwurf' else t.status end,
      -- wer erst jetzt Vornamen braucht, braucht dafür wieder Fabians Ja
      names_ok = t.names_ok and coalesce(p_needs_names, false),
      needs_names = coalesce(p_needs_names, false), updated_at = now()
      where id = p_id returning * into t;
  end if;
  return jsonb_build_object('id', t.id, 'ver', t.ver, 'status', t.status);
end $$;

-- Zur Prüfung einreichen (nur eigener Entwurf)
create or replace function public.tool_submit(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.school_tools set status = 'eingereicht', updated_at = now()
    where id = p_id and owner = auth.uid() and status in ('entwurf','abgelehnt') and public.school_author(school_id);
  if not found then return 'denied'; end if;
  return 'ok';
end $$;

-- Prüfen: freigeben (p_ok true) oder mit Notiz zurückgeben. p_ver = die Version, die Fabian angesehen hat. Nur Konto-Admin.
create or replace function public.tool_review(p_id uuid, p_ver int, p_ok boolean, p_note text default '', p_names boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.is_admin() then return 'denied'; end if;
  select * into t from public.school_tools where id = p_id;
  if t.id is null then return 'unbekannt'; end if;
  if t.ver <> p_ver then return 'geaendert'; end if;   -- inzwischen neue Version: bitte nochmal ansehen
  if p_ok then
    update public.school_tools set status = 'freigegeben', approved_ver = coalesce(approved_ver, t.ver),
      names_ok = t.needs_names and coalesce(p_names, false), note = left(coalesce(p_note, ''), 600),
      reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  else
    update public.school_tools set status = case when t.approved_ver is null then 'abgelehnt' else t.status end,
      note = left(coalesce(p_note, ''), 600), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  end if;
  return 'ok';
end $$;

-- Not-Aus: sperren (p_on true) oder wieder freigeben. Nur Konto-Admin.
create or replace function public.tool_block(p_id uuid, p_on boolean, p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return 'denied'; end if;
  update public.school_tools set
    status = case when p_on then 'gesperrt' when approved_ver is not null then 'freigegeben' else 'entwurf' end,
    note = case when coalesce(p_note, '') = '' then note else left(p_note, 600) end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if not found then return 'unbekannt'; end if;
  return 'ok';
end $$;

-- Löschen: eigener Eintrag oder Konto-Admin
create or replace function public.tool_delete(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  delete from public.school_tools where id = p_id and (public.is_admin() or (owner = auth.uid() and public.is_teacher()));
  if not found then return 'denied'; end if;
  return 'ok';
end $$;

-- Liste ohne HTML. Konto-Admin: alle. Sonst: eigene plus freigegebene der eigenen Schule.
create or replace function public.tool_list()
returns table (id uuid, school_id uuid, name text, subject text, info text, ver int, status text, mine boolean,
               author text, needs_names boolean, names_ok boolean, note text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.school_id, t.name, t.subject, t.info, t.ver, t.status, t.owner = auth.uid(),
         coalesce(nullif(st.short, ''), split_part(p.email, '@', 1)),
         t.needs_names, t.names_ok, case when t.owner = auth.uid() or public.is_admin() then t.note else '' end, t.updated_at
  from public.school_tools t join public.profiles p on p.id = t.owner
  left join lateral (select s.short from public.staff s where s.profile_id = t.owner limit 1) st on true
  where public.is_teacher() and (public.is_admin() or t.owner = auth.uid() or (t.status = 'freigegeben' and public.in_school(t.school_id)))
  order by t.status = 'eingereicht' desc, t.name;
$$;

-- Das HTML zum Starten holen. p_class = die Klasse, in der es gerade läuft (null = Vorschau beim Autor oder beim Admin).
-- • freigegeben + eigene Schule: überall
-- • sonst nur der Autor selbst und der Konto-Admin (Fabian sieht Entwürfe schon während der Entwicklung):
--   in der Vorschau oder in der eigenen Testklasse
-- • gesperrt: nirgends
create or replace function public.tool_html(p_id uuid, p_class uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t record; test boolean;
begin
  if me is null or not public.is_teacher() then return jsonb_build_object('err', 'denied'); end if;
  select * into t from public.school_tools where id = p_id;
  if t.id is null then return jsonb_build_object('err', 'unbekannt'); end if;
  test := p_class is not null and exists (select 1 from public.classes where id = p_class and code = 'test-' || me::text);
  if t.status = 'freigegeben' and public.in_school(t.school_id) and (p_class is null or public.class_school(p_class) = t.school_id) then
    null;
  elsif public.is_admin() and t.status <> 'gesperrt' and (p_class is null or test) then
    null;
  elsif t.owner = me and t.status <> 'gesperrt' and (p_class is null or test) then
    null;
  elsif t.status = 'gesperrt' then
    return jsonb_build_object('err', 'gesperrt');
  elsif t.owner = me then
    return jsonb_build_object('err', 'testklasse');
  else
    return jsonb_build_object('err', 'denied');
  end if;
  return jsonb_build_object('id', t.id, 'name', t.name, 'ver', t.ver, 'html', t.html, 'sha', t.sha,
    'live', t.status = 'freigegeben', 'names', t.status = 'freigegeben' and t.names_ok);
end $$;

revoke all on function public.school_author(uuid), public.school_set_role(uuid, text),
  public.tool_save(uuid, text, text, text, text, boolean), public.tool_submit(uuid), public.tool_review(uuid, int, boolean, text, boolean),
  public.tool_block(uuid, boolean, text), public.tool_delete(uuid), public.tool_list(), public.tool_html(uuid, uuid) from public, anon;
grant execute on function public.school_author(uuid), public.school_set_role(uuid, text),
  public.tool_save(uuid, text, text, text, text, boolean), public.tool_submit(uuid), public.tool_review(uuid, int, boolean, text, boolean),
  public.tool_block(uuid, boolean, text), public.tool_delete(uuid), public.tool_list(), public.tool_html(uuid, uuid) to authenticated;

commit;
