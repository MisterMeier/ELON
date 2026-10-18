-- ELONUKI · Admin-Bereich: Konten löschen, Lehrkräfte per Auswahl einer Schule aufnehmen, Wunschschule bei der Registrierung
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher supabase/migrations/20261015120000_schulen_trennen.sql. Rückgängig: supabase/rollback/20261018120000_admin_konten_rollback.sql
--
-- • Neue Lehrkräfte geben bei „Konto erstellen“ ihre Schule an. Der Admin sieht sie als „Wunschschule“.
-- • Der Konto-Admin wählt im Admin-Bereich die Schule aus: Das Konto wird freigeschaltet und in diese Schule aufgenommen.
--   Beim Wechsel oder Entfernen verliert die Lehrkraft die Klassen und Kürzel der alten Schule.
-- • Der Konto-Admin kann ein Lehrer-Konto samt E-Mail-Adresse löschen. Admin-Konten und das eigene Konto nicht.

begin;

alter table public.profiles add column if not exists wish_school text check (wish_school is null or char_length(wish_school) <= 80);

-- Neues Konto → Profil (wie bisher) + angegebene Schule. Das allererste Konto wird automatisch Admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  insert into public.profiles (id, email, role, wish_school)
  values (new.id, new.email,
          case when exists (select 1 from public.profiles where role = 'admin') then 'pending' else 'admin' end,
          nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'school', '')), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$;

-- Schule festlegen (null = aus allen Schulen entfernen). Wartende Konten werden dabei freigeschaltet.
create or replace function public.admin_set_school(p_profile uuid, p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare rl text;
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_profile = auth.uid() then return 'self'; end if;
  select role into rl from public.profiles where id = p_profile;
  if rl is null then return 'unbekannt'; end if;
  if rl = 'admin' then return 'admin'; end if;
  if p_school is not null and not exists (select 1 from public.schools where id = p_school) then return 'unbekannt'; end if;
  -- alte Schule(n): Klassenzuordnungen, Kürzel-Verknüpfungen und Mitgliedschaft entfernen
  delete from public.class_teachers where teacher_id = p_profile
    and class_id in (select id from public.classes where school_id is distinct from p_school);
  update public.staff set profile_id = null where profile_id = p_profile and school_id is distinct from p_school;
  delete from public.school_members where profile_id = p_profile and school_id is distinct from p_school;
  if p_school is not null then
    if rl = 'pending' then update public.profiles set role = 'teacher' where id = p_profile; end if;
    insert into public.school_members (school_id, profile_id, role) values (p_school, p_profile, 'teacher') on conflict do nothing;
  end if;
  return 'ok';
end $$;

-- Lehrer-Konto samt Anmeldung löschen (die E-Mail-Adresse ist danach wieder frei)
create or replace function public.admin_delete_user(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare rl text;
begin
  if not public.is_admin() then return 'denied'; end if;
  if p_id = auth.uid() then return 'self'; end if;
  select role into rl from public.profiles where id = p_id;
  if rl is null then return 'unbekannt'; end if;
  if rl = 'admin' then return 'admin'; end if;
  delete from auth.users where id = p_id;
  return 'ok';
end $$;

revoke all on function public.admin_set_school(uuid, uuid), public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_school(uuid, uuid), public.admin_delete_user(uuid) to authenticated;

commit;
