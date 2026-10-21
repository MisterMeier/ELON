-- ELONUKI · Testklasse und SuS-Tester mit dem Lehrerkonto
-- Einmal im Supabase „SQL Editor“ ausführen (Run). Schadet nicht, es mehrfach auszuführen.
-- Braucht vorher: schema.sql, live.sql, keys.sql, content.sql und die Migration 20261015120000_schulen_trennen.sql.
--
-- Jede Lehrkraft bekommt eine eigene, unsichtbare Testklasse (Code „test-<Konto-ID>“) in ihrer Schule.
-- Der Knopf „Test“ in der Lehreransicht und das Tester-iPad (im SuS-Login mit dem Lehrerkonto angemeldet)
-- landen beide in dieser Klasse. Sie läuft über genau dieselben Wege wie jede echte Klasse:
-- geschützter Live-Kanal, Klassenschlüssel, Inhalte, Medien, Postfach.
-- Echte Klassen und echte Schülerdaten werden dabei weder gelesen noch verändert.

-- Codes „test-…“ darf nur die Funktion unten vergeben, niemand von Hand (sonst könnte jemand die Testklasse einer anderen Lehrkraft vorwegnehmen)
create or replace function public.test_code_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code like 'test-%' and coalesce(current_setting('elonuki.test_class', true), '') <> '1'
     and (tg_op = 'INSERT' or new.code is distinct from old.code) then
    raise exception 'Codes, die mit test- beginnen, sind für Testklassen reserviert';
  end if;
  return new;
end $$;
drop trigger if exists classes_test_code on public.classes;
create trigger classes_test_code before insert or update of code on public.classes
  for each row execute function public.test_code_guard();

-- Eigene Testklasse holen (beim ersten Mal anlegen). Bindet das Konto auch als „iPad“ an die Testklasse,
-- damit das Tester-iPad wie ein Kind ins Postfach schreiben darf (class_mail, dir = 'up').
create or replace function public.my_test_class() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text; c record; sid uuid;
begin
  if me is null or not public.is_teacher() then return jsonb_build_object('err', 'denied'); end if;
  v_code := 'test-' || me::text;
  select id, school_id, name, size, code into c from public.classes where code = v_code;
  if c.id is null then
    select m.school_id into sid from public.school_members m where m.profile_id = me order by (m.role = 'admin') desc, m.school_id limit 1;
    if sid is null then return jsonb_build_object('err', 'noschool'); end if;
    perform set_config('elonuki.test_class', '1', true);
    insert into public.classes (school_id, name, size, code) values (sid, 'Test', 25, v_code)
      returning id, school_id, name, size, code into c;
    perform set_config('elonuki.test_class', '', true);
  end if;
  insert into public.class_teachers (class_id, teacher_id, lead) values (c.id, me, true)
    on conflict (class_id, teacher_id) do update set lead = true;
  insert into public.class_members (uid, class_id) values (me, c.id)
    on conflict (uid) do update set class_id = excluded.class_id, joined_at = now();
  return jsonb_build_object('id', c.id, 'school_id', c.school_id, 'name', c.name, 'size', c.size, 'code', c.code);
end $$;
revoke all on function public.my_test_class() from public, anon;
grant execute on function public.my_test_class() to authenticated;

-- Tester-iPad: Es ist mit dem Lehrerkonto angemeldet und unterrichtet die Testklasse. Den Klassenschlüssel
-- darf es deshalb auch anlegen, falls die Lehreransicht den Testmodus noch nie geöffnet hat (set_class_key prüft teaches()).
