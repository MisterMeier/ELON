-- ELONUKI · Test „Admin-Bereich: Konten löschen, Schule auswählen, Wunschschule“
-- Im Supabase „SQL Editor“ ausführen (Run), NACH den Migrationen 20261015120000_schulen_trennen.sql und 20261018120000_admin_konten.sql.
-- Legt Testschulen und Testkonten an, prüft und löscht alles Testmaterial wieder. Echte Daten werden nicht gelesen oder verändert.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.

create temp table if not exists _test2_ergebnis (nr int, test text, ok boolean, info text);
truncate _test2_ergebnis;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  s1 uuid; s2 uuid; a1 uuid;
  res text[] := '{}';
  n int; t text; w text;
begin
  -- ============================================================ Testdaten (als Datenbank-Besitzer)
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_user_meta_data) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a-' || r || '@elonuki.test', false, null),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b-' || r || '@elonuki.test', false, null),
    (ue, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-e-' || r || '@elonuki.test', false, null);
  insert into public.profiles (id, email, role) values
    (ua, 'test-a-' || r || '@elonuki.test', 'admin'), (ub, 'test-b-' || r || '@elonuki.test', 'teacher'), (ue, 'test-e-' || r || '@elonuki.test', 'admin')
  on conflict (id) do update set role = excluded.role;
  -- neues Konto D: wie bei „Konto erstellen“ mit angegebener Schule
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_user_meta_data)
    values (ud, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-d-' || r || '@elonuki.test', false,
            '{"school":"  Mittelschule Testhausen  "}'::jsonb);
  insert into public.schools (name) values ('TEST Schule A ' || r) returning id into s1;
  insert into public.schools (name) values ('TEST Schule B ' || r) returning id into s2;
  insert into public.school_members (school_id, profile_id, role) values (s1, ua, 'admin'), (s2, ub, 'teacher');
  insert into public.classes (school_id, name, code) values (s1, 'TA' || r, 'testA-' || r) returning id into a1;

  select wish_school into w from public.profiles where id = ud;
  res := res || format('Registrierung: angegebene Schule landet als Wunschschule (ohne Leerzeichen)|%s|%s', w = 'Mittelschule Testhausen', w);
  select role into t from public.profiles where id = ud;
  res := res || format('Registrierung: neues Konto ist „wartend“|%s|%s', t = 'pending', t);

  -- ============================================================ Lehrkraft B darf das alles nicht
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  res := res || format('B kann keine Schule zuweisen|%s|', public.admin_set_school(ud, s2) = 'denied');
  res := res || format('B kann kein Konto löschen|%s|', public.admin_delete_user(ud) = 'denied');
  select count(*) into n from public.profiles where id = ud;
  res := res || format('B sieht das wartende Konto D nicht|%s|', n = 0);

  -- ============================================================ Nicht angemeldet
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_delete_user(ud); res := res || format('Nicht angemeldet: Konto löschen ist gesperrt|%s|', false);
  exception when others then res := res || format('Nicht angemeldet: Konto löschen ist gesperrt|%s|', true); end;

  -- ============================================================ Konto-Admin A
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select wish_school into w from public.profiles where id = ud;
  res := res || format('Admin A sieht die Wunschschule von D|%s|', w is not null);
  res := res || format('Admin A wählt für D die Schule A|%s|', public.admin_set_school(ud, s1) = 'ok');
  select role into t from public.profiles where id = ud;
  res := res || format('D ist dadurch freigeschaltet (Lehrkraft)|%s|%s', t = 'teacher', t);
  select count(*) into n from public.school_members where profile_id = ud and school_id = s1 and role = 'teacher';
  res := res || format('D ist Mitglied von Schule A|%s|', n = 1);
  insert into public.class_teachers (class_id, teacher_id) values (a1, ud);
  res := res || format('Admin A wechselt D in Schule B|%s|', public.admin_set_school(ud, s2) = 'ok');
  select (select count(*) from public.class_teachers where teacher_id = ud) + (select count(*) from public.school_members where profile_id = ud and school_id = s1) into n;
  res := res || format('D hat nach dem Wechsel nichts mehr aus Schule A|%s|%s Zeilen', n = 0, n);
  select count(*) into n from public.school_members where profile_id = ud and school_id = s2;
  res := res || format('D ist Mitglied von Schule B|%s|', n = 1);
  res := res || format('Admin A entfernt D aus allen Schulen|%s|', public.admin_set_school(ud, null) = 'ok');
  select count(*) into n from public.school_members where profile_id = ud;
  res := res || format('D gehört danach zu keiner Schule|%s|', n = 0);
  res := res || format('Unbekannte Schule wird abgelehnt|%s|', public.admin_set_school(ud, gen_random_uuid()) = 'unbekannt');
  res := res || format('Das eigene Konto lässt sich hier nicht ändern|%s|', public.admin_set_school(ua, s1) = 'self');
  res := res || format('Das eigene Konto lässt sich nicht löschen|%s|', public.admin_delete_user(ua) = 'self');
  res := res || format('Ein anderes Admin-Konto lässt sich hier nicht ändern|%s|', public.admin_set_school(ue, s1) = 'admin');
  res := res || format('Ein anderes Admin-Konto lässt sich nicht löschen|%s|', public.admin_delete_user(ue) = 'admin');
  res := res || format('Unbekanntes Konto wird abgelehnt|%s|', public.admin_delete_user(gen_random_uuid()) = 'unbekannt');
  res := res || format('Admin A löscht das Konto D|%s|', public.admin_delete_user(ud) = 'ok');

  -- ============================================================ Ergebnis speichern, Testdaten löschen
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  select (select count(*) from public.profiles where id = ud) + (select count(*) from auth.users where id = ud) into n;
  res := res || format('Das Konto D ist samt Anmeldung weg|%s|%s Zeilen', n = 0, n);
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-d-' || r || '@elonuki.test', false);
  res := res || format('Die E-Mail-Adresse von D lässt sich neu registrieren|%s|', true);
  delete from auth.users where email = 'test-d-' || r || '@elonuki.test';

  insert into _test2_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test2_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test2_ergebnis e;

  delete from public.schools where id in (s1, s2);
  delete from auth.users where id in (ua, ub, ud, ue);
end
$test$;

select nr, test, ok, info from _test2_ergebnis order by nr;
