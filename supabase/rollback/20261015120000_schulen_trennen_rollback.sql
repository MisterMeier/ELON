-- ELONUKI · Rückgängig: „Schulen voneinander trennen“ (supabase/migrations/20261015120000_schulen_trennen.sql)
-- Im Supabase „SQL Editor“ ausführen (Run), wenn nach der Migration etwas nicht funktioniert.
-- Stellt Regeln und Funktionen genau wie in schema.sql / boerse.sql wieder her.
-- Achtung: Die Tabelle school_members und die Spalte tickets.school_id werden gelöscht.
-- Klassen, Stunden, Kürzel, Tickets und alle anderen Daten bleiben erhalten.

begin;

-- ---------------------------------------------------------------- Regeln wie vorher
drop policy if exists schools_add on public.schools;
drop policy if exists schools_upd on public.schools;
drop policy if exists schools_del on public.schools;
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (true);
drop policy if exists schools_admin on public.schools;
create policy schools_admin on public.schools for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select using (public.is_teacher());
drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists classes_teacher_add on public.classes;
create policy classes_teacher_add on public.classes for insert with check (public.is_teacher());
drop policy if exists classes_lead_upd on public.classes;
create policy classes_lead_upd on public.classes for update using (public.leads(id)) with check (public.leads(id));
drop policy if exists classes_lead_del on public.classes;
create policy classes_lead_del on public.classes for delete using (public.leads(id));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (public.is_teacher() and role <> 'pending'));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_admin_del on public.profiles;
create policy profiles_admin_del on public.profiles for delete using (public.is_admin());

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

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select using (public.is_teacher());
drop policy if exists staff_add on public.staff;
create policy staff_add on public.staff for insert with check (public.is_teacher() and (profile_id is null or public.is_admin()));
drop policy if exists staff_admin on public.staff;
create policy staff_admin on public.staff for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists slots_read on public.slots;
create policy slots_read on public.slots for select using (true);
drop policy if exists slots_write on public.slots;
create policy slots_write on public.slots for all using (public.teaches(class_id)) with check (public.teaches(class_id));

drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select
  using (owner = auth.uid() or public.is_admin() or (shared and class_id is not null and public.teaches(class_id)));

drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pool_delete on public.lesson_pool;
create policy pool_delete on public.lesson_pool for delete to authenticated using (owner = auth.uid() or to_profile = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- Funktionen wie vorher
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

create or replace function public.my_school(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and (public.is_admin()
    or exists (select 1 from public.class_teachers ct join public.classes c on c.id = ct.class_id where ct.teacher_id = auth.uid() and c.school_id = s)
    or exists (select 1 from public.staff st where st.profile_id = auth.uid() and st.school_id = s));
$$;

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

-- ---------------------------------------------------------------- Neues wieder entfernen
drop trigger if exists on_ct_member on public.class_teachers;
drop function if exists public.ct_member_sync();
drop function if exists public.school_add_member(uuid, text, text);
alter table public.tickets drop column if exists school_id;
drop table if exists public.school_members;
drop function if exists public.sees_profile(uuid);
drop function if exists public.same_school(uuid);
drop function if exists public.school_has_members(uuid);
drop function if exists public.has_school(uuid);
drop function if exists public.school_admin(uuid);
drop function if exists public.in_school(uuid);
drop function if exists public.class_school(uuid);

commit;
