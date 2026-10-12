-- ELIO · Stundenbörse und „Teilen mit Kürzel“
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher schema.sql.
-- Geteilt wird eine Kopie der Stunde (nur Unterrichtsmaterial, keine Schülerdaten, keine eigenen Bilder).
-- scope: person = an ein Kürzel der eigenen Schule, school = Börse der Schule, public = später schulübergreifend (noch nicht freigeschaltet).

create table if not exists public.lesson_pool (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  scope text not null check (scope in ('person','school','public')),
  to_short text check (to_short is null or char_length(to_short) <= 12),
  to_profile uuid references public.profiles(id) on delete cascade,
  from_short text default '',
  subject text default '',
  grade int check (grade is null or grade between 1 and 13),
  topic text default '' check (char_length(topic) <= 120),
  lp text default '' check (char_length(lp) <= 400),
  note text default '' check (char_length(note) <= 600),
  title text not null check (char_length(title) <= 160),
  data jsonb not null check (char_length(data::text) < 400000),
  created_at timestamptz default now()
);
create index if not exists lesson_pool_school on public.lesson_pool (school_id, scope);
create index if not exists lesson_pool_to on public.lesson_pool (to_profile);
alter table public.lesson_pool enable row level security;

-- Schulen, an denen ich unterrichte (über Klassen oder ein verknüpftes Kürzel)
create or replace function public.my_school(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and (public.is_admin()
    or exists (select 1 from public.class_teachers ct join public.classes c on c.id = ct.class_id where ct.teacher_id = auth.uid() and c.school_id = s)
    or exists (select 1 from public.staff st where st.profile_id = auth.uid() and st.school_id = s));
$$;

-- Beim Freigeben: Empfänger aus dem Kürzel suchen, Absender-Kürzel eintragen
create or replace function public.lesson_pool_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  new.owner := auth.uid();
  if new.scope = 'public' then raise exception 'public_spaeter'; end if;
  if not public.my_school(new.school_id) then raise exception 'schule'; end if;
  select coalesce((select short from public.staff where profile_id = auth.uid() and school_id = new.school_id limit 1),
                  (select nullif(name, '') from public.profiles where id = auth.uid()), 'LK') into new.from_short;
  if new.scope = 'person' then
    select profile_id into pid from public.staff where school_id = new.school_id and upper(short) = upper(trim(coalesce(new.to_short, ''))) limit 1;
    if pid is null then raise exception 'kuerzel'; end if;
    new.to_profile := pid; new.to_short := upper(trim(new.to_short));
  else
    new.to_profile := null; new.to_short := null;
  end if;
  return new;
end $$;
drop trigger if exists on_lesson_pool on public.lesson_pool;
create trigger on_lesson_pool before insert on public.lesson_pool for each row execute function public.lesson_pool_fill();

drop policy if exists pool_read on public.lesson_pool;
create policy pool_read on public.lesson_pool for select to authenticated using (
  owner = auth.uid() or to_profile = auth.uid() or (scope = 'school' and public.my_school(school_id)));
drop policy if exists pool_insert on public.lesson_pool;
create policy pool_insert on public.lesson_pool for insert to authenticated with check (public.is_teacher());
-- Zurückziehen (Absender) oder Ausblenden (Empfänger)
drop policy if exists pool_delete on public.lesson_pool;
create policy pool_delete on public.lesson_pool for delete to authenticated using (owner = auth.uid() or to_profile = auth.uid() or public.is_admin());
