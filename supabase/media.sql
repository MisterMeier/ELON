-- ELIO · Bilder der Folien für die iPads der Klasse
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher content.sql.
-- Die Bilder sind verkleinert und mit dem Klassenschlüssel verschlüsselt. Supabase speichert nur Zeichensalat.
-- Lesen dürfen Lehrkräfte der Klasse und beigetretene iPads, schreiben nur Lehrkräfte der Klasse.

create table if not exists public.class_media (
  class_id uuid not null references public.classes(id) on delete cascade,
  id text not null check (char_length(id) <= 80),
  body jsonb not null check (char_length(body::text) < 3500000),
  updated_at timestamptz default now(),
  primary key (class_id, id)
);
alter table public.class_media enable row level security;

drop policy if exists media_read on public.class_media;
create policy media_read on public.class_media for select to authenticated
  using (public.teaches(class_id) or public.is_member(class_id));
drop policy if exists media_insert on public.class_media;
create policy media_insert on public.class_media for insert to authenticated
  with check (public.teaches(class_id));
drop policy if exists media_update on public.class_media;
create policy media_update on public.class_media for update to authenticated
  using (public.teaches(class_id)) with check (public.teaches(class_id));
drop policy if exists media_delete on public.class_media;
create policy media_delete on public.class_media for delete to authenticated
  using (public.teaches(class_id));
