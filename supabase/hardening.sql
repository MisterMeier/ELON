-- ELIO: Klassencode-Zugang absichern (alter Weg neben Kürzel + PIN)
-- Passwort nur noch gehasht speichern, Fehlversuche pro Klassencode begrenzen.
-- Kann mehrfach ausgeführt werden.
create extension if not exists pgcrypto with schema extensions;

alter table public.class_access add column if not exists pw_hash text;
alter table public.class_access add column if not exists fails int not null default 0;
alter table public.class_access add column if not exists locked_until timestamptz;
alter table public.class_access alter column pw drop not null;

-- Klartext-Passwort beim Speichern sofort in einen Hash umwandeln
create or replace function public.class_access_hash() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.pw is not null then
    new.pw_hash := extensions.crypt(new.pw, extensions.gen_salt('bf', 8));
    new.pw := null; new.fails := 0; new.locked_until := null;
  end if;
  return new;
end $$;
drop trigger if exists on_class_access_hash on public.class_access;
create trigger on_class_access_hash before insert or update on public.class_access
  for each row execute function public.class_access_hash();
-- vorhandene Passwörter umstellen (der Trigger hasht sie)
update public.class_access set pw = pw where pw is not null;

-- Prüft Code + Passwort. Nach je 5 Fehlversuchen ist der Code 10 Minuten gesperrt.
create or replace function public.access_check(p_code text, p_pw text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r public.class_access;
begin
  select * into r from public.class_access where join_code = p_code limit 1;
  if r.class_id is null then perform pg_sleep(0.3); return null; end if;
  if r.locked_until is not null and r.locked_until > now() then return null; end if;
  if r.pw_hash is null or coalesce(p_pw, '') = '' or r.pw_hash <> extensions.crypt(p_pw, r.pw_hash) then
    update public.class_access set fails = fails + 1,
      locked_until = case when (fails + 1) % 5 = 0 then now() + interval '10 minutes' else locked_until end
      where class_id = r.class_id;
    return null;
  end if;
  if r.fails > 0 then update public.class_access set fails = 0, locked_until = null where class_id = r.class_id; end if;
  return r.class_id;
end $$;
revoke all on function public.access_check(text, text) from public, anon, authenticated;

create or replace function public.join_class(p_code text, p_pw text)
returns table (id uuid, school_id uuid, school_name text, name text, size int, code text)
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  v := public.access_check(p_code, p_pw);
  if v is null then return; end if;
  return query select c.id, c.school_id, s.name, c.name, c.size, c.code
    from public.classes c join public.schools s on s.id = c.school_id where c.id = v;
end $$;
grant execute on function public.join_class(text, text) to anon, authenticated;

create or replace function public.bind_class(p_code text, p_pw text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then return null; end if;
  v := public.access_check(p_code, p_pw);
  if v is null then return null; end if;
  insert into public.class_members(uid, class_id) values (auth.uid(), v)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  return v;
end $$;
grant execute on function public.bind_class(text, text) to authenticated;
