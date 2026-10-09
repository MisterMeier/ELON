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
