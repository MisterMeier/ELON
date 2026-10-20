-- ELONUKI · Folienbilder als Dateien im Speicher statt als Text in der Datenbank (spart Supabase-Egress)
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen. Braucht vorher media.sql.
-- Privater Speicher „cmedia“, Ordner = Klassen-ID. Die Bilder bleiben mit dem Klassenschlüssel verschlüsselt.
-- Lesen dürfen Lehrkräfte der Klasse und beigetretene iPads, schreiben nur Lehrkräfte der Klasse.
-- Ohne dieses Skript arbeitet die App wie bisher mit der Tabelle class_media weiter.

insert into storage.buckets (id, name, public, file_size_limit)
values ('cmedia', 'cmedia', false, 3000000)
on conflict (id) do update set public = false, file_size_limit = 3000000;

create or replace function public.cmedia_class(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    then ((storage.foldername(name))[1])::uuid else null end
$$;
grant execute on function public.cmedia_class(text) to authenticated;

drop policy if exists cmedia_read on storage.objects;
create policy cmedia_read on storage.objects for select to authenticated
  using (bucket_id = 'cmedia' and public.cmedia_class(name) is not null
    and (public.teaches(public.cmedia_class(name)) or public.is_member(public.cmedia_class(name))));
drop policy if exists cmedia_insert on storage.objects;
create policy cmedia_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cmedia' and public.cmedia_class(name) is not null and public.teaches(public.cmedia_class(name)));
drop policy if exists cmedia_update on storage.objects;
create policy cmedia_update on storage.objects for update to authenticated
  using (bucket_id = 'cmedia' and public.cmedia_class(name) is not null and public.teaches(public.cmedia_class(name)))
  with check (bucket_id = 'cmedia' and public.cmedia_class(name) is not null and public.teaches(public.cmedia_class(name)));
drop policy if exists cmedia_delete on storage.objects;
create policy cmedia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cmedia' and public.cmedia_class(name) is not null and public.teaches(public.cmedia_class(name)));

-- Alte Bilder in class_media bleiben lesbar (Rückfall). Wenn alles läuft, kann man sie später löschen:
-- delete from public.class_media;
