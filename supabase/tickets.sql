-- ELIO · Problem-Tickets (Postfach für den Admin)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Schüler/innen melden ohne Namen, nur mit Klasse. Lesen, ändern und löschen darf nur der Admin.

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  role text not null check (role in ('student','teacher')),
  class_id uuid references public.classes(id) on delete set null,
  who text default '',
  view text default '',
  body text not null check (char_length(body) between 3 and 4000),
  shot text check (shot is null or (char_length(shot) <= 1500000 and shot like 'data:image/%')),
  ctx jsonb default '{}'::jsonb,
  status text not null default 'neu' check (status in ('neu','dran','erledigt')),
  note text default ''
);
alter table public.tickets enable row level security;
drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for all using (public.is_admin()) with check (public.is_admin());

-- Melden geht nur über diese Funktion: Längen werden geprüft, bei Lehrkräften kommt der Name vom Konto
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
