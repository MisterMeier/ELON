-- ELONUKI · Test „Klassen voneinander trennen“ (zwei Klassen in DERSELBEN Schule)
-- Im Supabase „SQL Editor“ ausführen (Run). Ändert nichts an echten Daten: Das Skript legt eine Testschule,
-- zwei Testklassen, Testkonten und Testinhalte an, prüft als jedes Konto, was es sehen darf, und löscht danach alles wieder.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.
-- Braucht: schema.sql und die Migrationen in supabase/migrations (wie der Test schulen_trennen_test.sql).
--
-- Konten im Test:
--   TA = Lehrkraft nur in Klasse A (z. B. 7bG)      TC = Lehrkraft nur in Klasse C (z. B. 7cdG)
--   PA = Schüler-iPad in Klasse A (mit Kürzel + PIN angemeldet)      PC = Schüler-iPad in Klasse C

create temp table if not exists _test_ergebnis (nr int, test text, ok boolean, info text);
truncate _test_ergebnis;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  uta uuid := gen_random_uuid(); utc uuid := gen_random_uuid(); upa uuid := gen_random_uuid(); upc uuid := gen_random_uuid();
  s1 uuid; ka uuid; kc uuid; code_a text; code_c text; uname_a text; j jsonb;
  res text[] := '{}';
  n int; ok boolean;
begin
  -- ============================================================ Testdaten (als Datenbank-Besitzer)
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
    (uta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-ta-' || r || '@elonuki.test', false),
    (utc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-tc-' || r || '@elonuki.test', false),
    (upa, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true),
    (upc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true);
  insert into public.profiles (id, email, role) values
    (uta, 'test-ta-' || r || '@elonuki.test', 'teacher'), (utc, 'test-tc-' || r || '@elonuki.test', 'teacher')
  on conflict (id) do update set role = excluded.role;

  insert into public.schools (name) values ('TEST Klassentrennung ' || r) returning id into s1;
  insert into public.school_members (school_id, profile_id, role) values (s1, uta, 'teacher'), (s1, utc, 'teacher');
  code_a := 'testKA-' || r; code_c := 'testKC-' || r;
  insert into public.classes (school_id, name, code) values (s1, 'KA' || r, code_a) returning id into ka;
  insert into public.classes (school_id, name, code) values (s1, 'KC' || r, code_c) returning id into kc;
  insert into public.class_teachers (class_id, teacher_id, lead) values (ka, uta, true), (kc, utc, true);
  insert into public.class_keys (class_id, k) values (ka, repeat('a', 43)), (kc, repeat('c', 43));
  insert into public.class_content (class_id, body) values (ka, '{}'), (kc, '{}');
  insert into public.class_media (class_id, id, body) values (ka, 'test', '{}'), (kc, 'test', '{}');
  insert into public.class_mail (class_id, sender, dir, nr, body) values (ka, uta, 'down', 1, '{}'), (kc, utc, 'down', 1, '{}');
  insert into realtime.messages (topic, extension, event, payload) values
    ('elon-' || code_a, 'broadcast', 'state', '{}'), ('elon-' || code_c, 'broadcast', 'state', '{}');
  loop
    uname_a := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.pupil_logins where uname = uname_a);
  end loop;
  insert into public.pupil_logins (uname, class_id, nr, pin_hash) values (uname_a, ka, 1, extensions.crypt('1234', extensions.gen_salt('bf', 8)));
  insert into public.class_members (uid, class_id) values (upc, kc);

  -- ============================================================ Schüler-iPad PA meldet sich mit Kürzel + PIN an
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', upa, 'role', 'authenticated')::text, true);
  j := public.pupil_login(uname_a, '1234');
  res := res || format('iPad PA: Anmeldung mit Kürzel und PIN landet in Klasse A|%s|', (j->>'id')::uuid = ka);
  select count(*) into n from public.class_content where class_id = ka;
  res := res || format('iPad PA bekommt die Inhalte (Regelheft, Ordner) seiner Klasse A|%s|', n = 1);
  select count(*) into n from public.class_content where class_id = kc;
  res := res || format('iPad PA bekommt die Inhalte von Klasse C NICHT|%s|%s Zeilen', n = 0, n);
  select count(*) into n from public.class_media where class_id = kc;
  res := res || format('iPad PA bekommt die Bilder von Klasse C nicht|%s|', n = 0);
  select count(*) into n from public.class_mail where class_id = kc;
  res := res || format('iPad PA liest keine Post von Klasse C|%s|', n = 0);
  res := res || format('iPad PA bekommt den Schlüssel von Klasse A|%s|', public.class_key(code_a) is not null);
  res := res || format('iPad PA bekommt den Schlüssel von Klasse C nicht|%s|', public.class_key(code_c) is null);
  perform set_config('realtime.topic', 'elon-' || code_c, true);
  select count(*) into n from realtime.messages where topic = 'elon-' || code_c;
  res := res || format('iPad PA hört den Live-Kanal von Klasse C nicht mit|%s|', n = 0);
  perform set_config('realtime.topic', 'elon-' || code_a, true);
  select count(*) into n from realtime.messages where topic = 'elon-' || code_a;
  res := res || format('iPad PA hört den Live-Kanal seiner Klasse A|%s|', n = 1);
  begin
    insert into public.class_content (class_id, body) values (kc, '{}') on conflict (class_id) do update set body = '{"x":1}';
    ok := false;
  exception when others then ok := true; end;
  res := res || format('iPad PA kann keine Inhalte in Klasse C schreiben|%s|', ok);
  res := res || format('iPad PA kommt ohne Passwort nicht in Klasse C|%s|', public.bind_class(code_c, 'falsch') is null);
  select count(*) into n from public.classes;
  res := res || format('iPad PA sieht keine Klassenliste|%s|', n = 0);

  -- ============================================================ Schüler-iPad PC (Klasse C)
  perform set_config('request.jwt.claims', json_build_object('sub', upc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.class_content where class_id = kc;
  res := res || format('iPad PC bekommt die Inhalte seiner Klasse C|%s|', n = 1);
  select count(*) into n from public.class_content where class_id = ka;
  res := res || format('iPad PC bekommt die Inhalte von Klasse A nicht|%s|', n = 0);
  res := res || format('iPad PC bekommt den Schlüssel von Klasse A nicht|%s|', public.class_key(code_a) is null);

  -- ============================================================ Lehrkraft TC (nur Klasse C, gleiche Schule)
  perform set_config('request.jwt.claims', json_build_object('sub', utc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.class_content where class_id = ka;
  res := res || format('Lehrkraft nur in C liest die Inhalte von A nicht|%s|', n = 0);
  res := res || format('Lehrkraft nur in C bekommt den Schlüssel von A nicht|%s|', public.class_key(code_a) is null);
  select count(*) into n from public.pupil_login_list(ka);
  res := res || format('Lehrkraft nur in C sieht keine Kürzel/PINs von A|%s|', n = 0);
  update public.class_content set body = '{"x":1}' where class_id = ka; get diagnostics n = row_count;
  res := res || format('Lehrkraft nur in C kann die Inhalte von A nicht ändern|%s|', n = 0);
  select count(*) into n from public.class_content where class_id = kc;
  res := res || format('Lehrkraft in C liest die Inhalte ihrer Klasse|%s|', n = 1);

  -- ============================================================ Ergebnis speichern, Testdaten löschen
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  insert into _test_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test_ergebnis e;

  delete from realtime.messages where topic in ('elon-' || code_a, 'elon-' || code_c);
  delete from public.schools where id = s1;
  delete from auth.users where id in (uta, utc, upa, upc);
end
$test$;

select nr, test, ok, info from _test_ergebnis order by nr;
