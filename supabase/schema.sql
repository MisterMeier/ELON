-- ELIO · Datenbank-Aufbau für Supabase
-- Einmal komplett im Supabase „SQL Editor“ ausführen (Run).
-- Gespeichert werden nur Schulen, Klassen, Lehrkräfte, Stundenpläne und Stunden.
-- Keine Schülernamen, keine Beobachtungen: die bleiben auf dem Gerät der Lehrkraft.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place text default '',
  created_at timestamptz default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  size int not null default 24 check (size between 2 and 40),
  code text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text default '',
  role text not null default 'pending' check (role in ('pending','teacher','admin')),
  created_at timestamptz default now()
);

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  primary key (class_id, teacher_id)
);
-- Klassenleitung: darf die Klasse verwalten und Lehrkräfte dazuholen
alter table public.class_teachers add column if not exists lead boolean not null default false;

-- Kollegium: Kürzel/Pseudonyme je Schule, auch ohne eigenes Konto; später mit einem Konto verknüpfbar
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  short text not null check (length(short) between 1 and 12),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (school_id, short)
);

-- Schüler-Zugang je Klasse: Klassencode + Passwort, von der Klassenleitung vergeben
create table if not exists public.class_access (
  class_id uuid primary key references public.classes(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[0-9]{4,8}$'),
  pw text not null check (length(pw) between 4 and 20),
  updated_at timestamptz default now()
);

create table if not exists public.slots (
  class_id uuid not null references public.classes(id) on delete cascade,
  day int not null check (day between 0 and 4),
  period int not null check (period between 0 and 9),
  subject text not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  primary key (class_id, day, period)
);

alter table public.slots add column if not exists staff_id uuid references public.staff(id) on delete set null;

create table if not exists public.lessons (
  id text primary key,
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  subject text,
  title text,
  data jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  updated_at timestamptz default now()
);

create table if not exists public.plans (
  class_id uuid not null references public.classes(id) on delete cascade,
  date date not null,
  period int not null,
  lesson_id text not null references public.lessons(id) on delete cascade,
  teacher_id uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (class_id, date, period)
);

-- Geteilte Stunden: mehrere Gruppen (z. B. Religion / Ethik) in derselben Stunde, grp 0–3
alter table public.slots add column if not exists grp smallint not null default 0 check (grp between 0 and 3);
alter table public.plans add column if not exists grp smallint not null default 0 check (grp between 0 and 3);
do $$ begin
  if not exists (select 1 from information_schema.key_column_usage
                 where table_schema = 'public' and table_name = 'slots' and constraint_name = 'slots_pkey' and column_name = 'grp') then
    alter table public.slots drop constraint if exists slots_pkey;
    alter table public.slots add primary key (class_id, day, period, grp);
  end if;
  if not exists (select 1 from information_schema.key_column_usage
                 where table_schema = 'public' and table_name = 'plans' and constraint_name = 'plans_pkey' and column_name = 'grp') then
    alter table public.plans drop constraint if exists plans_pkey;
    alter table public.plans add primary key (class_id, date, period, grp);
  end if;
end $$;

-- Hilfsfunktionen (umgehen RLS gezielt, damit die Regeln sich nicht im Kreis drehen)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher','admin'));
$$;

create or replace function public.teaches(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = c and ct.teacher_id = auth.uid() and p.role in ('teacher','admin'));
$$;

create or replace function public.leads(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = c and ct.teacher_id = auth.uid() and ct.lead and p.role in ('teacher','admin'));
$$;

-- Wer eine Klasse anlegt, wird automatisch ihre Klassenleitung
create or replace function public.handle_new_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.class_teachers (class_id, teacher_id, lead) values (new.id, auth.uid(), true)
    on conflict (class_id, teacher_id) do update set lead = true;
  end if;
  return new;
end $$;

drop trigger if exists on_class_created on public.classes;
create trigger on_class_created after insert on public.classes
  for each row execute function public.handle_new_class();

-- Schüler melden sich mit Klassencode + Passwort an und bekommen nur ihre Klasse zurück
create or replace function public.join_class(p_code text, p_pw text)
returns table (id uuid, school_id uuid, school_name text, name text, size int, code text)
language sql stable security definer set search_path = public as $$
  select c.id, c.school_id, s.name, c.name, c.size, c.code
  from public.class_access a join public.classes c on c.id = a.class_id join public.schools s on s.id = c.school_id
  where a.join_code = p_code and a.pw = p_pw;
$$;
grant execute on function public.join_class(text, text) to anon, authenticated;

-- Stundenplan → Klassenzuordnung: Wer mit Konto im Plan einer Klasse steht, gehört automatisch zur Klasse
create or replace function public.slot_staff_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if new.staff_id is not null then
    select profile_id into pid from public.staff where id = new.staff_id;
    new.teacher_id := pid;
    if pid is not null then
      insert into public.class_teachers (class_id, teacher_id) values (new.class_id, pid) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_slot_staff on public.slots;
create trigger on_slot_staff before insert or update on public.slots
  for each row execute function public.slot_staff_sync();

-- Kürzel mit Konto verknüpft → Stunden und Klassen übernehmen
create or replace function public.staff_link_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is distinct from old.profile_id then
    update public.slots set teacher_id = new.profile_id where staff_id = new.id;
    if new.profile_id is not null then
      insert into public.class_teachers (class_id, teacher_id)
        select distinct class_id, new.profile_id from public.slots where staff_id = new.id
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_staff_link on public.staff;
create trigger on_staff_link after update on public.staff
  for each row execute function public.staff_link_sync();

-- Neues Konto → Profil. Das allererste Konto wird automatisch Admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
          case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Zeilenschutz (Row Level Security)
alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.profiles enable row level security;
alter table public.class_teachers enable row level security;
alter table public.slots enable row level security;
alter table public.class_access enable row level security;
alter table public.staff enable row level security;
alter table public.lessons enable row level security;
alter table public.plans enable row level security;

-- Schulen: Namen darf jeder sehen, ändern nur der Admin. Klassen sehen nur Lehrkräfte
-- (Schüler kommen über join_class in ihre Klasse).
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (true);
drop policy if exists schools_admin on public.schools;
create policy schools_admin on public.schools for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select using (public.is_teacher());
drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all using (public.is_admin()) with check (public.is_admin());
-- Freigeschaltete Lehrkräfte legen eigene Klassen an; die Klassenleitung ändert und löscht sie
drop policy if exists classes_teacher_add on public.classes;
create policy classes_teacher_add on public.classes for insert with check (public.is_teacher());
drop policy if exists classes_lead_upd on public.classes;
create policy classes_lead_upd on public.classes for update using (public.leads(id)) with check (public.leads(id));
drop policy if exists classes_lead_del on public.classes;
create policy classes_lead_del on public.classes for delete using (public.leads(id));

-- Profile: eigenes Profil, Kolleginnen und Kollegen (ohne Wartende), Admin alles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (public.is_teacher() and role <> 'pending'));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_admin_del on public.profiles;
create policy profiles_admin_del on public.profiles for delete using (public.is_admin());

-- Zuordnung Lehrkraft ↔ Klasse: lesen für Lehrkräfte; Admin alles;
-- die Klassenleitung holt freigeschaltete Lehrkräfte dazu oder entfernt sie (nicht sich selbst)
drop policy if exists ct_read on public.class_teachers;
create policy ct_read on public.class_teachers for select using (public.is_teacher());
drop policy if exists ct_admin on public.class_teachers;
create policy ct_admin on public.class_teachers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists ct_lead_add on public.class_teachers;
create policy ct_lead_add on public.class_teachers for insert
  with check (public.leads(class_id) and not lead
    and exists (select 1 from public.profiles p where p.id = teacher_id and p.role in ('teacher','admin')));
drop policy if exists ct_lead_del on public.class_teachers;
create policy ct_lead_del on public.class_teachers for delete
  using (public.leads(class_id) and teacher_id <> auth.uid());

-- Kollegium: sehen alle Lehrkräfte; anlegen alle Lehrkräfte; verknüpfen und löschen nur der Admin
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select using (public.is_teacher());
drop policy if exists staff_add on public.staff;
create policy staff_add on public.staff for insert with check (public.is_teacher() and (profile_id is null or public.is_admin()));
drop policy if exists staff_admin on public.staff;
create policy staff_admin on public.staff for all using (public.is_admin()) with check (public.is_admin());

-- Schüler-Zugang: sehen alle Lehrkräfte der Klasse, ändern die Klassenleitung
drop policy if exists ca_read on public.class_access;
create policy ca_read on public.class_access for select using (public.teaches(class_id));
drop policy if exists ca_write on public.class_access;
create policy ca_write on public.class_access for all using (public.leads(class_id)) with check (public.leads(class_id));

-- Klassen-Stundenplan: jeder darf lesen (Schüler-Stundenplan), ändern alle Lehrkräfte der Klasse
drop policy if exists slots_read on public.slots;
create policy slots_read on public.slots for select using (true);
drop policy if exists slots_write on public.slots;
create policy slots_write on public.slots for all using (public.teaches(class_id)) with check (public.teaches(class_id));

-- Stunden: eigene Stunden, oder geteilte Stunden der eigenen Klassen
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select
  using (owner = auth.uid() or public.is_admin() or (shared and class_id is not null and public.teaches(class_id)));
drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons for all
  using (owner = auth.uid()) with check (owner = auth.uid() and public.is_teacher());

-- Wochenplanung: alle Lehrkräfte der Klasse
drop policy if exists plans_rw on public.plans;
create policy plans_rw on public.plans for all using (public.teaches(class_id)) with check (public.teaches(class_id));

-- ELIO · Problem-Tickets (Postfach für den Admin)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Schüler/innen melden ohne Namen, nur mit Klasse. Lesen, ändern und löschen darf nur der Admin.

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  role text not null check (role in ('student','teacher')),
  class_id uuid references public.classes(id) on delete set null,
  who text default '',
  view text default '',
  body text not null check (char_length(body) between 3 and 4000),
  shot text check (shot is null or (char_length(shot) <= 1500000 and shot like 'data:image/%')),
  ctx jsonb default '{}'::jsonb,
  status text not null default 'neu' check (status in ('neu','dran','erledigt')),
  note text default ''
);
alter table public.tickets enable row level security;
drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for all using (public.is_admin()) with check (public.is_admin());

-- Melden geht nur über diese Funktion: Längen werden geprüft, bei Lehrkräften kommt der Name vom Konto
create or replace function public.submit_ticket(p_role text, p_class uuid, p_view text, p_body text, p_shot text, p_ctx jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_who text := '';
begin
  if (select count(*) from public.tickets where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Zu viele Meldungen gerade. Bitte später nochmal.';
  end if;
  if p_role = 'teacher' then
    if not public.is_teacher() then raise exception 'Nur mit Lehrer-Konto.'; end if;
    select coalesce(nullif(name,''), email) into v_who from public.profiles where id = auth.uid();
  end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class) then p_class := null; end if;
  if char_length(coalesce(p_ctx::text,'')) > 20000 then p_ctx := '{}'::jsonb; end if;
  insert into public.tickets(role, class_id, who, view, body, shot, ctx)
  values (case when p_role = 'teacher' then 'teacher' else 'student' end, p_class, coalesce(v_who,''), left(coalesce(p_view,''),200), p_body, p_shot, coalesce(p_ctx,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_ticket(text, uuid, text, text, text, jsonb) to anon, authenticated;

-- ELIO · Geschützter Live-Kanal (Tafel ↔ iPads)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Danach in Supabase: Authentication → Sign In / Providers → „Allow anonymous sign-ins“ einschalten,
-- und Realtime → Settings → „Allow public access“ ausschalten.
-- Wirkung: Nur Lehrkräfte der Klasse dürfen den Klassenzustand senden. Nur iPads, die mit Klassencode und
-- Passwort beigetreten sind, hören mit und dürfen Schüler-Nachrichten schicken. Fremde kommen nicht in den Kanal.

-- Schüler-iPads bekommen eine anonyme Sitzung ohne Namen und ohne E-Mail. Sie sind keine Konten im Admin-Bereich.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
          case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Welches iPad (anonyme Sitzung) gehört zu welcher Klasse
create table if not exists public.class_members (
  uid uuid primary key references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  joined_at timestamptz default now()
);
alter table public.class_members enable row level security;
-- keine Policies: nur über die Funktionen unten erreichbar

create or replace function public.bind_class(p_code text, p_pw text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then return null; end if;
  select a.class_id into v from public.class_access a where a.join_code = p_code and a.pw = p_pw;
  if v is null then return null; end if;
  insert into public.class_members(uid, class_id) values (auth.uid(), v)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  return v;
end $$;
grant execute on function public.bind_class(text, text) to authenticated;

create or replace function public.live_class(t text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.classes where 'elon-' || code = t limit 1;
$$;
create or replace function public.live_teacher(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.teaches(public.live_class(t));
$$;
create or replace function public.live_member(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = public.live_class(t));
$$;
grant execute on function public.live_teacher(text), public.live_member(text) to authenticated;

-- Regeln für den privaten Kanal „elon-<Klassencode>“
drop policy if exists elio_live_read on realtime.messages;
create policy elio_live_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and (public.live_teacher(realtime.topic()) or public.live_member(realtime.topic())));
drop policy if exists elio_live_send on realtime.messages;
create policy elio_live_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
              and (public.live_teacher(realtime.topic())
                   or (realtime.messages.event = 'msg' and public.live_member(realtime.topic()))));

-- ELIO · Klassenschlüssel automatisch verteilen
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Der Schlüssel, mit dem die Live-Daten einer Klasse verschlüsselt werden, liegt hier.
-- Lesen dürfen ihn nur Lehrkräfte der Klasse und iPads, die mit Klassencode und Passwort beigetreten sind.

create table if not exists public.class_keys (
  class_id uuid primary key references public.classes(id) on delete cascade,
  k text not null check (k ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz default now()
);
alter table public.class_keys enable row level security;
-- keine Policies: nur über die Funktionen unten erreichbar

create or replace function public.class_key(p_code text) returns text
language plpgsql stable security definer set search_path = public as $$
declare c uuid; v text;
begin
  select id into c from public.classes where code = p_code;
  if c is null then return null; end if;
  if not (public.teaches(c) or exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = c)) then return null; end if;
  select k into v from public.class_keys where class_id = c;
  return v;
end $$;

-- Die erste Lehrkraft legt den Schlüssel an; danach bekommen alle denselben zurück
create or replace function public.set_class_key(p_code text, p_k text) returns text
language plpgsql security definer set search_path = public as $$
declare c uuid; v text;
begin
  select id into c from public.classes where code = p_code;
  if c is null or not public.teaches(c) then return null; end if;
  insert into public.class_keys(class_id, k) values (c, p_k) on conflict (class_id) do nothing;
  select k into v from public.class_keys where class_id = c;
  return v;
end $$;
grant execute on function public.class_key(text), public.set_class_key(text, text) to authenticated;

-- ELIO · Postfach zwischen SuS und Lehrkraft (Hausaufgaben-Abgaben, Chat, Lernstand)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher live.sql.
-- Alles hier ist Ende-zu-Ende verschlüsselt: Die iPads verschlüsseln mit dem Schlüssel der Lehrkraft,
-- die Lehrkraft antwortet mit dem Schlüssel des iPads. Supabase speichert nur Zeichensalat.
-- Die Lehrkraft holt Nachrichten ab und löscht sie danach vom Server. Antworten an SuS werden nach 30 Tagen gelöscht.

create table if not exists public.class_mail (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  sender uuid default auth.uid(),
  dir text not null check (dir in ('up','down')),
  nr int not null check (nr between 1 and 40),
  fp text default '' check (char_length(fp) <= 20),
  body jsonb not null check (char_length(body::text) < 1600000),
  created_at timestamptz default now()
);
create index if not exists class_mail_box on public.class_mail(class_id, dir, nr, id);
alter table public.class_mail enable row level security;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = c);
$$;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists mail_insert on public.class_mail;
create policy mail_insert on public.class_mail for insert to authenticated
  with check ((dir = 'up' and sender = auth.uid() and public.is_member(class_id))
           or (dir = 'down' and public.teaches(class_id)));
drop policy if exists mail_read on public.class_mail;
create policy mail_read on public.class_mail for select to authenticated
  using (public.teaches(class_id) or (dir = 'down' and public.is_member(class_id)));
drop policy if exists mail_delete on public.class_mail;
create policy mail_delete on public.class_mail for delete to authenticated
  using (public.teaches(class_id) or sender = auth.uid());

-- Bremse gegen Fluten: höchstens 60 Nachrichten pro Gerät in 10 Minuten
create or replace function public.mail_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.class_mail where sender = auth.uid() and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Zu viele Nachrichten gerade. Bitte später nochmal.';
  end if;
  return new;
end $$;
drop trigger if exists mail_limit on public.class_mail;
create trigger mail_limit before insert on public.class_mail for each row execute function public.mail_limit();

-- ===================== logins.sql =====================
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

-- ELIO · Freigegebene Inhalte der Klasse auf dem Server (Regelheft, Module, Hausaufgaben, Übungsaufträge, Mitteilungen)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher live.sql und keys.sql.
-- Damit bekommen die iPads die Inhalte auch dann, wenn die Lehrkraft gerade nicht online ist.
-- Der Inhalt ist mit dem Klassenschlüssel verschlüsselt. Supabase speichert nur Zeichensalat.

create table if not exists public.class_content (
  class_id uuid primary key references public.classes(id) on delete cascade,
  body jsonb not null check (char_length(body::text) < 3000000),
  updated_at timestamptz default now()
);
alter table public.class_content enable row level security;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = c);
$$;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists content_read on public.class_content;
create policy content_read on public.class_content for select to authenticated
  using (public.teaches(class_id) or public.is_member(class_id));
drop policy if exists content_insert on public.class_content;
create policy content_insert on public.class_content for insert to authenticated
  with check (public.teaches(class_id));
drop policy if exists content_update on public.class_content;
create policy content_update on public.class_content for update to authenticated
  using (public.teaches(class_id)) with check (public.teaches(class_id));
-- ELIO: Klassencode-Zugang absichern (alter Weg neben Kürzel + PIN)
-- Passwort nur noch gehasht speichern, Fehlversuche pro Klassencode begrenzen.
-- Kann mehrfach ausgeführt werden.
create extension if not exists pgcrypto with schema extensions;

alter table public.class_access add column if not exists pw_hash text;
alter table public.class_access add column if not exists fails int not null default 0;
alter table public.class_access add column if not exists locked_until timestamptz;
alter table public.class_access alter column pw drop not null;

-- Klartext-Passwort beim Speichern sofort in einen Hash umwandeln
create or replace function public.class_access_hash() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.pw is not null then
    new.pw_hash := extensions.crypt(new.pw, extensions.gen_salt('bf', 8));
    new.pw := null; new.fails := 0; new.locked_until := null;
  end if;
  return new;
end $$;
drop trigger if exists on_class_access_hash on public.class_access;
create trigger on_class_access_hash before insert or update on public.class_access
  for each row execute function public.class_access_hash();
-- vorhandene Passwörter umstellen (der Trigger hasht sie)
update public.class_access set pw = pw where pw is not null;

-- Prüft Code + Passwort. Nach je 5 Fehlversuchen ist der Code 10 Minuten gesperrt.
create or replace function public.access_check(p_code text, p_pw text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r public.class_access;
begin
  select * into r from public.class_access where join_code = p_code limit 1;
  if r.class_id is null then perform pg_sleep(0.3); return null; end if;
  if r.locked_until is not null and r.locked_until > now() then return null; end if;
  if r.pw_hash is null or coalesce(p_pw, '') = '' or r.pw_hash <> extensions.crypt(p_pw, r.pw_hash) then
    update public.class_access set fails = fails + 1,
      locked_until = case when (fails + 1) % 5 = 0 then now() + interval '10 minutes' else locked_until end
      where class_id = r.class_id;
    return null;
  end if;
  if r.fails > 0 then update public.class_access set fails = 0, locked_until = null where class_id = r.class_id; end if;
  return r.class_id;
end $$;
revoke all on function public.access_check(text, text) from public, anon, authenticated;

create or replace function public.join_class(p_code text, p_pw text)
returns table (id uuid, school_id uuid, school_name text, name text, size int, code text)
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public.access_check(p_code, p_pw);
  if v is null then return; end if;
  return query select c.id, c.school_id, s.name, c.name, c.size, c.code
    from public.classes c join public.schools s on s.id = c.school_id where c.id = v;
end $$;
grant execute on function public.join_class(text, text) to anon, authenticated;

create or replace function public.bind_class(p_code text, p_pw text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then return null; end if;
  v := public.access_check(p_code, p_pw);
  if v is null then return null; end if;
  insert into public.class_members(uid, class_id) values (auth.uid(), v)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  return v;
end $$;
grant execute on function public.bind_class(text, text) to authenticated;
