-- ELIO · Freigegebene Inhalte der Klasse auf dem Server (Regelheft, Module, Hausaufgaben, Übungsaufträge, Mitteilungen)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher live.sql und keys.sql.
-- Damit bekommen die iPads die Inhalte auch dann, wenn die Lehrkraft gerade nicht online ist.
-- Der Inhalt ist mit dem Klassenschlüssel verschlüsselt. Supabase speichert nur Zeichensalat.

create table if not exists public.class_content (
  class_id uuid primary key references public.classes(id) on delete cascade,
  body jsonb not null check (char_length(body::text) < 3000000),
  updated_at timestamptz default now()
);
alter table public.class_content enable row level security;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members m where m.uid = auth.uid() and m.class_id = c);
$$;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists content_read on public.class_content;
create policy content_read on public.class_content for select to authenticated
  using (public.teaches(class_id) or public.is_member(class_id));
drop policy if exists content_insert on public.class_content;
create policy content_insert on public.class_content for insert to authenticated
  with check (public.teaches(class_id));
drop policy if exists content_update on public.class_content;
create policy content_update on public.class_content for update to authenticated
  using (public.teaches(class_id)) with check (public.teaches(class_id));
