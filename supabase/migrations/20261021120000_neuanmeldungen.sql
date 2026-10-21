-- ELONUKI · Admin-Feld „Neuanmeldungen“: Anmeldestand neuer Konten sehen und die E-Mail-Bestätigung übernehmen
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher supabase/migrations/20261018120000_admin_konten.sql. Rückgängig: supabase/rollback/20261021120000_neuanmeldungen_rollback.sql
--
-- • Der Konto-Admin sieht bei jedem Konto: angemeldet am, E-Mail bestätigt ja/nein, zuletzt eingeloggt.
-- • Hat eine neue Lehrkraft den Bestätigungslink nicht bekommen (Spam, Link abgelaufen), kann der Konto-Admin
--   die Adresse selbst bestätigen. Danach kann sie sich mit E-Mail und Passwort anmelden.

begin;

create or replace function public.admin_konten()
returns table (id uuid, created_at timestamptz, confirmed boolean, last_login timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.created_at, u.email_confirmed_at is not null, u.last_sign_in_at
  from auth.users u join public.profiles p on p.id = u.id
  where public.is_admin();
$$;

create or replace function public.admin_confirm_mail(p_profile uuid)
returns text language plpgsql security definer set search_path = public as $$
declare rl text;
begin
  if not public.is_admin() then return 'denied'; end if;
  select role into rl from public.profiles where id = p_profile;
  if rl is null then return 'unbekannt'; end if;
  if rl = 'admin' then return 'admin'; end if;
  update auth.users set email_confirmed_at = now() where id = p_profile and email_confirmed_at is null;
  return 'ok';
end $$;

revoke all on function public.admin_konten(), public.admin_confirm_mail(uuid) from public, anon;
grant execute on function public.admin_konten(), public.admin_confirm_mail(uuid) to authenticated;

commit;
