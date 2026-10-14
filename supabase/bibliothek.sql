-- ELIO · Bibliothek der Lehrkraft in der Cloud (Arbeitsblätter, Bilder, Videos, Links)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher schema.sql.
-- Privat: Jede Lehrkraft sieht und ändert nur ihre eigenen Dateien. So ist das Material auf jedem Gerät und unter jeder Adresse da.
-- Verlags-Audio/-Video lädt die App nicht hoch, das bleibt auf dem Gerät.

create table if not exists public.teacher_lib (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (char_length(id) <= 80),
  meta jsonb not null check (char_length(meta::text) < 20000),
  updated_at timestamptz default now(),
  primary key (owner, id)
);
alter table public.teacher_lib enable row level security;
drop policy if exists lib_own on public.teacher_lib;
create policy lib_own on public.teacher_lib for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid() and public.is_teacher());

-- Dateien: privater Speicher „lib“, Ordner = eigene Nutzer-ID, höchstens 50 MB pro Datei
insert into storage.buckets (id, name, public, file_size_limit)
values ('lib', 'lib', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists lib_read on storage.objects;
create policy lib_read on storage.objects for select to authenticated
  using (bucket_id = 'lib' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists lib_insert on storage.objects;
create policy lib_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lib' and (storage.foldername(name))[1] = auth.uid()::text and public.is_teacher());
drop policy if exists lib_update on storage.objects;
create policy lib_update on storage.objects for update to authenticated
  using (bucket_id = 'lib' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'lib' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists lib_delete on storage.objects;
create policy lib_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lib' and (storage.foldername(name))[1] = auth.uid()::text);
