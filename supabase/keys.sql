-- ELIO · Klassenschlüssel automatisch verteilen
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Der Schlüssel, mit dem die Live-Daten einer Klasse verschlüsselt werden, liegt hier.
-- Lesen dürfen ihn nur Lehrkräfte der Klasse und iPads, die mit Klassencode und Passwort beigetreten sind.

create table if not exists public.class_keys (
  class_id uuid primary key references public.classes(id) on delete cascade,
  k text not null check (k ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz default now()
);
alter table public.class_keys enable row level security;
-- keine Policies: nur über die Funktionen unten erreichbar

create or replace function public.class_key(p_code text) returns text
language plpgsql stable security definer set search_path = public as $$
declare c uuid; v text;
begin
  select id into c from public.classes where code = p_code;
  if c is null then return null; end if;
  if not (public.teaches(c) or exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = c)) then return null; end if;
  select k into v from public.class_keys where class_id = c;
  return v;
end $$;

-- Die erste Lehrkraft legt den Schlüssel an; danach bekommen alle denselben zurück
create or replace function public.set_class_key(p_code text, p_k text) returns text
language plpgsql security definer set search_path = public as $$
declare c uuid; v text;
begin
  select id into c from public.classes where code = p_code;
  if c is null or not public.teaches(c) then return null; end if;
  insert into public.class_keys(class_id, k) values (c, p_k) on conflict (class_id) do nothing;
  select k into v from public.class_keys where class_id = c;
  return v;
end $$;
grant execute on function public.class_key(text), public.set_class_key(text, text) to authenticated;
