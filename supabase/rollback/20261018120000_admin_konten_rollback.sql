-- ELONUKI · Rückgängig: „Admin-Bereich: Konten löschen, Schule auswählen“ (supabase/migrations/20261018120000_admin_konten.sql)
-- Im Supabase „SQL Editor“ ausführen (Run). Konten und Schulen bleiben erhalten; nur die Wunschschule-Angaben gehen verloren.

begin;

drop function if exists public.admin_set_school(uuid, uuid);
drop function if exists public.admin_delete_user(uuid);

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

alter table public.profiles drop column if exists wish_school;

commit;
