-- ELIO · Rückkanal iPads → Tafel („Bereit“, Hilfe, Stimmung)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Wirkung: Neben dem Kanal „elon-<Klassencode>“ gibt es „elon-<Klassencode>-up“.
-- Dort dürfen beigetretene iPads der Klasse senden, die Lehrkraft hört mit.

create or replace function public.live_class(t text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.classes where 'elon-' || code = t or 'elon-' || code || '-up' = t limit 1;
$$;

drop policy if exists elio_live_read on realtime.messages;
create policy elio_live_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and (public.live_teacher(realtime.topic()) or public.live_member(realtime.topic())));
drop policy if exists elio_live_send on realtime.messages;
create policy elio_live_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
              and (public.live_teacher(realtime.topic())
                   or ((realtime.messages.event = 'msg' or realtime.topic() like '%-up')
                       and public.live_member(realtime.topic()))));
