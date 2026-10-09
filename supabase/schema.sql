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

create table if not exists public.slots (
  class_id uuid not null references public.classes(id) on delete cascade,
  day int not null check (day between 0 and 4),
  period int not null check (period between 0 and 9),
  subject text not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  primary key (class_id, day, period)
);

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

-- Neues Konto → Profil. Das allererste Konto wird automatisch Admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
alter table public.lessons enable row level security;
alter table public.plans enable row level security;

-- Schulen und Klassen: Namen darf jeder sehen (Startbildschirm), ändern nur der Admin
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (true);
drop policy if exists schools_admin on public.schools;
create policy schools_admin on public.schools for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select using (true);
drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all using (public.is_admin()) with check (public.is_admin());

-- Profile: eigenes Profil, Kolleginnen und Kollegen (ohne Wartende), Admin alles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (public.is_teacher() and role <> 'pending'));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_admin_del on public.profiles;
create policy profiles_admin_del on public.profiles for delete using (public.is_admin());

-- Zuordnung Lehrkraft ↔ Klasse: lesen für Lehrkräfte, ändern nur Admin
drop policy if exists ct_read on public.class_teachers;
create policy ct_read on public.class_teachers for select using (public.is_teacher());
drop policy if exists ct_admin on public.class_teachers;
create policy ct_admin on public.class_teachers for all using (public.is_admin()) with check (public.is_admin());

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
