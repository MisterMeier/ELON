-- ELONUKI · Test „Testklasse und SuS-Tester“
-- Im Supabase „SQL Editor“ ausführen (Run), NACH supabase/tester.sql.
-- Legt eine Testschule mit zwei Testkonten an, prüft und löscht alles wieder. Echte Daten werden nicht gelesen oder verändert.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.

create temp table if not exists _test3_ergebnis (nr int, test text, ok boolean, info text);
truncate _test3_ergebnis;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  s1 uuid; real_c uuid; j jsonb; j2 jsonb; ca uuid;
  res text[] := '{}';
  n int; t text;
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-a-' || r || '@elonuki.test', false),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-b-' || r || '@elonuki.test', false);
  insert into public.profiles (id, email, role) values
    (ua, 'tester-a-' || r || '@elonuki.test', 'teacher'), (ub, 'tester-b-' || r || '@elonuki.test', 'teacher')
  on conflict (id) do update set role = excluded.role;
  insert into public.schools (name) values ('TEST Schule T ' || r) returning id into s1;
  insert into public.school_members (school_id, profile_id) values (s1, ua), (s1, ub);
  insert into public.classes (school_id, name, size, code) values (s1, 'TEST 7x', 24, 'TST' || upper(r)) returning id into real_c;

  -- Lehrkraft A holt ihre Testklasse
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  j := public.my_test_class();
  ca := (j->>'id')::uuid;
  res := res || format('A bekommt eine Testklasse|%s|%s', ca is not null, j::text);
  res := res || format('Code der Testklasse ist test-<Konto>|%s|%s', j->>'code' = 'test-' || ua::text, j->>'code');
  res := res || format('A unterrichtet die Testklasse|%s|', public.teaches(ca));
  res := res || format('A ist als iPad an die Testklasse gebunden (Postfach)|%s|', public.is_member(ca));
  res := res || format('A ist an keine echte Klasse gebunden|%s|', not public.is_member(real_c));
  j2 := public.my_test_class();
  res := res || format('Zweiter Aufruf gibt dieselbe Klasse|%s|', (j2->>'id')::uuid = ca);
  res := res || format('Live-Kanal der Testklasse: A darf hinein|%s|', public.live_teacher('elon-test-' || ua::text));
  res := res || format('Klassenschlüssel der Testklasse anlegen|%s|', public.set_class_key('test-' || ua::text, repeat('a', 43)) = repeat('a', 43));

  -- Lehrkraft B: kommt nicht in die Testklasse von A und kann den Code nicht vorwegnehmen
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  res := res || format('B unterrichtet die Testklasse von A nicht|%s|', not public.teaches(ca));
  res := res || format('B kommt nicht in den Live-Kanal von A|%s|', not public.live_teacher('elon-test-' || ua::text) and not public.live_member('elon-test-' || ua::text));
  res := res || format('B bekommt den Schlüssel von A nicht|%s|', public.class_key('test-' || ua::text) is null);
  begin
    insert into public.classes (school_id, name, size, code) values (s1, 'Falle', 24, 'test-' || ub::text || 'x');
    res := res || format('Code test-… von Hand ist gesperrt|%s|', false);
  exception when others then res := res || format('Code test-… von Hand ist gesperrt|%s|', true); end;

  -- Nicht angemeldet
  perform set_config('request.jwt.claims', '', true);
  res := res || format('Ohne Anmeldung keine Testklasse|%s|', public.my_test_class()->>'err' = 'denied');

  -- Ergebnis speichern, Testdaten löschen
  insert into _test3_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test3_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test3_ergebnis e;

  delete from public.schools where id = s1;
  delete from auth.users where id in (ua, ub);
end
$test$;

select nr, test, ok, info from _test3_ergebnis order by nr;
