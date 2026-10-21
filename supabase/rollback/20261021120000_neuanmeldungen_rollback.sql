-- ELONUKI · Rückgängig: „Neuanmeldungen“ (supabase/migrations/20261021120000_neuanmeldungen.sql)
-- Im Supabase „SQL Editor“ ausführen (Run). Konten und bereits bestätigte E-Mail-Adressen bleiben, wie sie sind.

begin;

drop function if exists public.admin_konten();
drop function if exists public.admin_confirm_mail(uuid);

commit;
