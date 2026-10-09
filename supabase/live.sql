-- ELIO · Geschützter Live-Kanal (Tafel ↔ iPads)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Danach in Supabase: Authentication → Sign In / Providers → „Allow anonymous sign-ins“ einschalten,
-- und Realtime → Settings → „Allow public access“ ausschalten.
-- Wirkung: Nur Lehrkräfte der Klasse dürfen den Klassenzustand senden. Nur iPads, die mit Klassencode und
-- Passwort beigetreten sind, hören mit und dürfen Schüler-Nachrichten schicken. Fremde kommen nicht in den Kanal.

-- Schüler-iPads bekommen eine anonyme Sitzung ohne Namen und ohne E-Mail. Sie sind keine Konten im Admin-Bereich.
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

-- Welches iPad (anonyme Sitzung) gehört zu welcher Klasse
create table if not exists public.class_members (
  uid uuid primary key references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  joined_at timestamptz default now()
);
alter table public.class_members enable row level security;
-- keine Policies: nur über die Funktionen unten erreichbar

create or replace function public.bind_class(p_code text, p_pw text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then return null; end if;
  select a.class_id into v from public.class_access a where a.join_code = p_code and a.pw = p_pw;
  if v is null then return null; end if;
  insert into public.class_members(uid, class_id) values (auth.uid(), v)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  return v;
end $$;
grant execute on function public.bind_class(text, text) to authenticated;

create or replace function public.live_class(t text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.classes where 'elon-' || code = t limit 1;
$$;
create or replace function public.live_teacher(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.teaches(public.live_class(t));
$$;
create or replace function public.live_member(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = public.live_class(t));
$$;
grant execute on function public.live_teacher(text), public.live_member(text) to authenticated;

-- Regeln für den privaten Kanal „elon-<Klassencode>“
drop policy if exists elio_live_read on realtime.messages;
create policy elio_live_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and (public.live_teacher(realtime.topic()) or public.live_member(realtime.topic())));
drop policy if exists elio_live_send on realtime.messages;
create policy elio_live_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
              and (public.live_teacher(realtime.topic())
                   or (realtime.messages.event = 'msg' and public.live_member(realtime.topic()))));
