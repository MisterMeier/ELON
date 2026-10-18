-- ELONUKI · Schulen voneinander trennen (Mehrlehrer-Pilot, Schritte 1–3)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher alle bisherigen Skripte (schema.sql usw.). Rückgängig: supabase/rollback/20261015120000_schulen_trennen_rollback.sql
-- Anleitung: supabase/ANLEITUNG-schulen-trennen.md
--
-- Was sich ändert:
-- 1. Neue Tabelle school_members: Wer gehört zu welcher Schule, als Admin oder Lehrkraft.
-- 2. Lehrkräfte sehen Klassen, Kolleginnen und Kollegen, Kürzel, Stundenpläne und Tickets nur ihrer eigenen Schule(n).
-- 3. Der Admin einer Schule verwaltet nur diese Schule. Der Konto-Admin (profiles.role = 'admin') schaltet neue Konten frei
--    und legt neue Schulen an, sieht aber nichts aus Schulen, in denen er nicht Mitglied ist.
-- 4. Klassen und Kürzel können nur in der eigenen Schule angelegt werden.
-- 5. Datenübernahme beim ersten Lauf: bisherige Lehrkräfte kommen in die Schulen ihrer Klassen und Kürzel,
--    jedes bisherige Admin-Konto wird Admin aller Schulen, die es zu diesem Zeitpunkt gibt.

begin;

-- ---------------------------------------------------------------- 1. Mitgliedschaft
create table if not exists public.school_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'teacher' check (role in ('admin','teacher')),
  created_at timestamptz default now(),
  primary key (school_id, profile_id)
);
create index if not exists school_members_profile on public.school_members (profile_id);
alter table public.school_members enable row level security;

alter table public.tickets add column if not exists school_id uuid references public.schools(id) on delete cascade;

-- ---------------------------------------------------------------- 2. Hilfsfunktionen (umgehen RLS gezielt)
create or replace function public.class_school(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.classes where id = c;
$$;

create or replace function public.in_school(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (select 1 from public.school_members where school_id = s and profile_id = auth.uid());
$$;

create or replace function public.school_admin(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (select 1 from public.school_members where school_id = s and profile_id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_school(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_members where profile_id = p);
$$;

create or replace function public.school_has_members(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_members where school_id = s);
$$;

create or replace function public.same_school(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.school_members a join public.school_members b on b.school_id = a.school_id
                 where a.profile_id = auth.uid() and b.profile_id = p);
$$;

-- Wen darf ich sehen? Mich selbst, Kolleginnen und Kollegen meiner Schule(n), als Konto-Admin auch Konten ohne Schule
create or replace function public.sees_profile(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or (public.is_teacher() and public.same_school(p)) or (public.is_admin() and not public.has_school(p));
$$;

-- Klasse unterrichten: eingetragen in class_teachers, oder Admin der Schule dieser Klasse (nicht mehr: Admin irgendeiner Schule)
create or replace function public.teaches(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = c and ct.teacher_id = auth.uid() and p.role in ('teacher','admin'))
    or public.school_admin(public.class_school(c));
$$;

create or replace function public.leads(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = c and ct.teacher_id = auth.uid() and ct.lead and p.role in ('teacher','admin'))
    or public.school_admin(public.class_school(c));
$$;

-- Schulen, an denen ich unterrichte: nur noch über die Mitgliedschaft
create or replace function public.my_school(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.in_school(s);
$$;

-- Wer einer Klasse zugeordnet wird, gehört ab dann zu ihrer Schule
create or replace function public.ct_member_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.school_members (school_id, profile_id, role)
    select c.school_id, new.teacher_id, 'teacher' from public.classes c where c.id = new.class_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_ct_member on public.class_teachers;
create trigger on_ct_member after insert on public.class_teachers
  for each row execute function public.ct_member_sync();

-- Stundenplan: nur Kürzel aus der Schule der Klasse
create or replace function public.slot_staff_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; sid uuid;
begin
  if new.staff_id is not null then
    select profile_id, school_id into pid, sid from public.staff where id = new.staff_id;
    if sid is distinct from public.class_school(new.class_id) then raise exception 'kuerzel_schule'; end if;
    new.teacher_id := pid;
    if pid is not null then
      insert into public.class_teachers (class_id, teacher_id) values (new.class_id, pid) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- Kürzel mit Konto verknüpft → Stunden, Klassen und Schule übernehmen
create or replace function public.staff_link_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is distinct from old.profile_id then
    update public.slots set teacher_id = new.profile_id where staff_id = new.id;
    if new.profile_id is not null then
      insert into public.school_members (school_id, profile_id, role) values (new.school_id, new.profile_id, 'teacher')
        on conflict do nothing;
      insert into public.class_teachers (class_id, teacher_id)
        select distinct class_id, new.profile_id from public.slots where staff_id = new.id
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- Mitglied per E-Mail in eine Schule holen. Darf: der Admin dieser Schule, oder der Konto-Admin bei einer Schule ohne Mitglieder.
-- Nur freigeschaltete Konten, die noch zu keiner anderen Schule gehören.
create or replace function public.school_add_member(p_school uuid, p_email text, p_role text default 'teacher')
returns text language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not (public.school_admin(p_school) or (public.is_admin() and not public.school_has_members(p_school)
          and exists (select 1 from public.schools where id = p_school))) then return 'denied'; end if;
  if p_role not in ('admin','teacher') then return 'invalid'; end if;
  select id into pid from public.profiles where lower(email) = lower(trim(coalesce(p_email, ''))) and role in ('teacher','admin');
  if pid is null or exists (select 1 from public.school_members where profile_id = pid and school_id <> p_school) then
    return 'unbekannt';
  end if;
  insert into public.school_members (school_id, profile_id, role) values (p_school, pid, p_role)
    on conflict (school_id, profile_id) do update set role = excluded.role;
  return 'ok';
end $$;
revoke all on function public.school_add_member(uuid, text, text) from public, anon;
grant execute on function public.school_add_member(uuid, text, text) to authenticated;

-- Tickets landen beim Admin der Schule
create or replace function public.submit_ticket(p_role text, p_class uuid, p_view text, p_body text, p_shot text, p_ctx jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_who text := ''; v_school uuid;
begin
  if (select count(*) from public.tickets where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Zu viele Meldungen gerade. Bitte später nochmal.';
  end if;
  if p_role = 'teacher' then
    if not public.is_teacher() then raise exception 'Nur mit Lehrer-Konto.'; end if;
    select coalesce(nullif(name,''), email) into v_who from public.profiles where id = auth.uid();
  end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class) then p_class := null; end if;
  v_school := public.class_school(p_class);
  if v_school is null and p_role = 'teacher' then
    select school_id into v_school from public.school_members where profile_id = auth.uid() order by role, created_at limit 1;
  end if;
  if char_length(coalesce(p_ctx::text,'')) > 20000 then p_ctx := '{}'::jsonb; end if;
  insert into public.tickets(role, class_id, school_id, who, view, body, shot, ctx)
  values (case when p_role = 'teacher' then 'teacher' else 'student' end, p_class, v_school, coalesce(v_who,''), left(coalesce(p_view,''),200), p_body, p_shot, coalesce(p_ctx,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_ticket(text, uuid, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- 3. Datenübernahme (nur beim allerersten Lauf)
do $$
begin
  if not exists (select 1 from public.school_members) then
    -- Lehrkräfte in die Schulen ihrer Klassen, Kürzel und Börsen-Einträge
    insert into public.school_members (school_id, profile_id, role)
      select x.school_id, x.pid, 'teacher' from (
        select c.school_id, ct.teacher_id as pid from public.class_teachers ct join public.classes c on c.id = ct.class_id
        union select st.school_id, st.profile_id from public.staff st where st.profile_id is not null
        union select lp.school_id, lp.owner from public.lesson_pool lp
      ) x join public.profiles p on p.id = x.pid where p.role in ('teacher','admin')
    on conflict do nothing;
    -- Gibt es nur eine Schule, gehören alle freigeschalteten Lehrkräfte zu ihr
    if (select count(*) from public.schools) = 1 then
      insert into public.school_members (school_id, profile_id, role)
        select s.id, p.id, 'teacher' from public.profiles p cross join public.schools s where p.role in ('teacher','admin')
      on conflict do nothing;
    end if;
    -- Bisherige Admin-Konten werden Admin aller Schulen, die es jetzt gibt
    insert into public.school_members (school_id, profile_id, role)
      select s.id, p.id, 'admin' from public.profiles p cross join public.schools s where p.role = 'admin'
    on conflict (school_id, profile_id) do update set role = 'admin';
  end if;
end $$;

update public.tickets t set school_id = c.school_id from public.classes c where c.id = t.class_id and t.school_id is null;

-- ---------------------------------------------------------------- 4. Regeln (Row Level Security)
-- Mitgliedschaft: eigene Zeilen und die eigene Schule sehen; ändern nur der Admin der Schule
drop policy if exists sm_read on public.school_members;
create policy sm_read on public.school_members for select to authenticated
  using (profile_id = auth.uid() or public.in_school(school_id));
drop policy if exists sm_admin on public.school_members;
create policy sm_admin on public.school_members for all to authenticated
  using (public.school_admin(school_id))
  with check (public.school_admin(school_id) and public.sees_profile(profile_id));

-- Schulen: nur die eigenen. Der Konto-Admin legt neue an und sieht sie, bis sie Mitglieder hat.
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select
  using (public.in_school(id) or (public.is_admin() and not public.school_has_members(id)));
drop policy if exists schools_admin on public.schools;
drop policy if exists schools_add on public.schools;
create policy schools_add on public.schools for insert with check (public.is_admin());
drop policy if exists schools_upd on public.schools;
create policy schools_upd on public.schools for update
  using (public.school_admin(id) or (public.is_admin() and not public.school_has_members(id)))
  with check (public.school_admin(id) or public.is_admin());
drop policy if exists schools_del on public.schools;
create policy schools_del on public.schools for delete
  using (public.school_admin(id) or (public.is_admin() and not public.school_has_members(id)));

-- Klassen: sehen alle Lehrkräfte der Schule; anlegen nur in der eigenen Schule
drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select using (public.in_school(school_id));
drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all
  using (public.school_admin(school_id)) with check (public.school_admin(school_id));
drop policy if exists classes_teacher_add on public.classes;
create policy classes_teacher_add on public.classes for insert with check (public.in_school(school_id));
drop policy if exists classes_lead_upd on public.classes;
create policy classes_lead_upd on public.classes for update
  using (public.leads(id)) with check (public.leads(id) and public.in_school(school_id));
drop policy if exists classes_lead_del on public.classes;
create policy classes_lead_del on public.classes for delete using (public.leads(id));

-- Profile: ich, meine Schule(n), der Konto-Admin zusätzlich Konten ohne Schule (zum Freischalten)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or (public.is_teacher() and role <> 'pending' and public.same_school(id))
         or (public.is_admin() and not public.has_school(id)));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update
  using (public.is_admin() and (not public.has_school(id) or public.same_school(id)))
  with check (public.is_admin());
drop policy if exists profiles_admin_del on public.profiles;
create policy profiles_admin_del on public.profiles for delete
  using (public.is_admin() and (not public.has_school(id) or public.same_school(id)));

-- Zuordnung Lehrkraft ↔ Klasse: nur innerhalb der Schule
drop policy if exists ct_read on public.class_teachers;
create policy ct_read on public.class_teachers for select using (public.in_school(public.class_school(class_id)));
drop policy if exists ct_admin on public.class_teachers;
create policy ct_admin on public.class_teachers for all
  using (public.school_admin(public.class_school(class_id)))
  with check (public.school_admin(public.class_school(class_id)) and public.sees_profile(teacher_id));
drop policy if exists ct_lead_add on public.class_teachers;
create policy ct_lead_add on public.class_teachers for insert
  with check (public.leads(class_id) and not lead and public.sees_profile(teacher_id)
    and exists (select 1 from public.profiles p where p.id = teacher_id and p.role in ('teacher','admin')));
drop policy if exists ct_lead_del on public.class_teachers;
create policy ct_lead_del on public.class_teachers for delete
  using (public.leads(class_id) and teacher_id <> auth.uid());

-- Kollegium (Kürzel): nur die eigene Schule
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select using (public.in_school(school_id));
drop policy if exists staff_add on public.staff;
create policy staff_add on public.staff for insert
  with check (public.in_school(school_id) and (profile_id is null or public.school_admin(school_id)));
drop policy if exists staff_admin on public.staff;
create policy staff_admin on public.staff for all
  using (public.school_admin(school_id))
  with check (public.school_admin(school_id) and (profile_id is null or public.sees_profile(profile_id)));

-- Stundenplan: nur mit Anmeldung, Lehrkräfte der Schule und iPads der Klasse
drop policy if exists slots_read on public.slots;
create policy slots_read on public.slots for select to authenticated
  using (public.in_school(public.class_school(class_id)) or public.is_member(class_id));
drop policy if exists slots_write on public.slots;
create policy slots_write on public.slots for all using (public.teaches(class_id)) with check (public.teaches(class_id));

-- Stunden: eigene, oder geteilte Stunden der eigenen Klassen
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select
  using (owner = auth.uid() or (shared and class_id is not null and public.teaches(class_id)));

-- Tickets: der Admin der Schule; Tickets ohne Schule der Konto-Admin
drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for all
  using (public.school_admin(school_id) or (public.is_admin() and school_id is null))
  with check (public.school_admin(school_id) or (public.is_admin() and school_id is null));

-- Stundenbörse: Löschen durch Absender, Empfänger oder Admin dieser Schule
drop policy if exists pool_delete on public.lesson_pool;
create policy pool_delete on public.lesson_pool for delete to authenticated
  using (owner = auth.uid() or to_profile = auth.uid() or public.school_admin(school_id));

commit;
