-- ELIO · Eigener Zugang pro Kind: Kürzel (4 Buchstaben) + PIN (4 Ziffern)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher live.sql.
-- Die PIN liegt nur als bcrypt-Hash auf dem Server. Avatar, Name und Lernstand des Kindes liegen als
-- Zeichensalat daneben: verschlüsselt auf dem iPad mit einem Schlüssel aus Kürzel und PIN.
-- Schutz gegen Raten: nach 5 falschen PINs 10 Minuten Pause, nach 15 falschen gesperrt, bis die Lehrkraft eine neue PIN vergibt.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pupil_logins (
  uname text primary key check (uname ~ '^[A-Z]{4}$'),
  class_id uuid not null references public.classes(id) on delete cascade,
  nr int not null check (nr between 1 and 40),
  pin_hash text not null,
  fails int not null default 0,
  locked_until timestamptz,
  prof jsonb check (prof is null or char_length(prof::text) < 400000),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (class_id, nr)
);
alter table public.pupil_logins enable row level security;
-- keine Policies: nur über die Funktionen unten erreichbar

-- Lehrkraft: Zugang anlegen oder neue PIN vergeben (die alte Sicherung ist dann nicht mehr lesbar und wird gelöscht)
create or replace function public.pupil_login_set(p_class uuid, p_nr int, p_uname text, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.teaches(p_class) then return 'denied'; end if;
  if p_uname !~ '^[A-Z]{4}$' or p_pin !~ '^[0-9]{4}$' or p_nr is null or p_nr not between 1 and 40 then return 'invalid'; end if;
  if exists (select 1 from public.pupil_logins where uname = p_uname and not (class_id = p_class and nr = p_nr)) then return 'taken'; end if;
  delete from public.pupil_logins where class_id = p_class and nr = p_nr and uname <> p_uname;
  insert into public.pupil_logins (uname, class_id, nr, pin_hash) values (p_uname, p_class, p_nr, crypt(p_pin, gen_salt('bf', 8)))
    on conflict (uname) do update set pin_hash = excluded.pin_hash, fails = 0, locked_until = null, prof = null, updated_at = now();
  return 'ok';
end $$;

create or replace function public.pupil_login_list(p_class uuid)
returns table (nr int, uname text, blocked boolean, saved boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.nr, l.uname, (l.fails >= 15 or coalesce(l.locked_until > now(), false)), l.prof is not null, l.updated_at
  from public.pupil_logins l where l.class_id = p_class and public.teaches(p_class) order by l.nr;
$$;

create or replace function public.pupil_login_del(p_class uuid, p_nr int)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.teaches(p_class) then return 'denied'; end if;
  delete from public.pupil_logins where class_id = p_class and nr = p_nr;
  return 'ok';
end $$;

-- PIN prüfen und Fehlversuche zählen. Gibt die Zeile nur bei richtiger PIN zurück.
create or replace function public.pupil_pin_check(p_uname text, p_pin text)
returns public.pupil_logins language plpgsql security definer set search_path = public, extensions as $$
declare r public.pupil_logins;
begin
  select * into r from public.pupil_logins where uname = upper(coalesce(p_uname, '')) for update;
  if not found then perform pg_sleep(0.03); return null; end if;
  if r.fails >= 15 or (r.locked_until is not null and r.locked_until > now()) then return null; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    update public.pupil_logins set fails = fails + 1,
      locked_until = case when (fails + 1) % 5 = 0 then now() + interval '10 minutes' else locked_until end
      where uname = r.uname;
    return null;
  end if;
  if r.fails > 0 or r.locked_until is not null then
    update public.pupil_logins set fails = 0, locked_until = null where uname = r.uname;
  end if;
  return r;
end $$;
revoke all on function public.pupil_pin_check(text, text) from public, anon, authenticated;

-- iPad: mit Kürzel + PIN anmelden. Bindet die anonyme Sitzung an die Klasse (wie bind_class) und gibt die Sicherung zurück.
create or replace function public.pupil_login(p_uname text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.pupil_logins; c record; st text;
begin
  if auth.uid() is null then return jsonb_build_object('err', 'auth'); end if;
  r := public.pupil_pin_check(p_uname, p_pin);
  if r.uname is null then
    select case when l.fails >= 15 then 'blocked' when l.locked_until > now() then 'wait' else 'wrong' end into st
      from public.pupil_logins l where l.uname = upper(coalesce(p_uname, ''));
    return jsonb_build_object('err', coalesce(st, 'wrong'));
  end if;
  insert into public.class_members (uid, class_id) values (auth.uid(), r.class_id)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  select cl.id, cl.school_id, s.name as school_name, cl.name, cl.size, cl.code into c
    from public.classes cl join public.schools s on s.id = cl.school_id where cl.id = r.class_id;
  return jsonb_build_object('id', c.id, 'school_id', c.school_id, 'school_name', c.school_name, 'name', c.name,
    'size', c.size, 'code', c.code, 'nr', r.nr, 'prof', r.prof);
end $$;

-- iPad: verschlüsselte Sicherung (Avatar, Name, Lernstand) speichern
create or replace function public.pupil_prof_save(p_uname text, p_pin text, p_prof jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare r public.pupil_logins;
begin
  if auth.uid() is null then return 'auth'; end if;
  if p_prof is null or char_length(p_prof::text) >= 400000 then return 'invalid'; end if;
  r := public.pupil_pin_check(p_uname, p_pin);
  if r.uname is null then return 'wrong'; end if;
  update public.pupil_logins set prof = p_prof, updated_at = now() where uname = r.uname;
  return 'ok';
end $$;

grant execute on function public.pupil_login_set(uuid, int, text, text), public.pupil_login_list(uuid), public.pupil_login_del(uuid, int),
  public.pupil_login(text, text), public.pupil_prof_save(text, text, jsonb) to authenticated;
