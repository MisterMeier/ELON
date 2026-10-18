-- ELONUKI · Test „Schulen voneinander trennen“ mit zwei Testkonten in zwei Testschulen
-- Im Supabase „SQL Editor“ ausführen (Run), NACH der Migration 20261015120000_schulen_trennen.sql.
-- Das Skript legt Testschulen, Testkonten und Testdaten an, prüft als jedes Konto, was es sehen darf,
-- und löscht danach alles Testmaterial wieder. Echte Daten werden nicht gelesen und nicht verändert.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.
--
-- Konten im Test:
--   A = Admin wie Fabians Konto (profiles.role = admin), Admin von Testschule A, Klassenleitung Klasse A1
--   B = Lehrkraft, Admin von Testschule B, Klassenleitung Klasse B1
--   C = neues, noch nicht freigeschaltetes Konto ohne Schule
--   P = Schüler-iPad (anonyme Sitzung), beigetreten in Klasse A1
--   anon = nicht angemeldet

create temp table if not exists _test_ergebnis (nr int, test text, ok boolean, info text);
truncate _test_ergebnis;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); up uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; a1 uuid; b1 uuid; sa uuid; sb uuid;
  code_a text; code_b text; join_a text; uname_a text;
  res text[] := '{}';
  n int; t text; ok boolean;
begin
  -- ============================================================ Testdaten (als Datenbank-Besitzer)
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a-' || r || '@elonuki.test', false),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b-' || r || '@elonuki.test', false),
    (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-c-' || r || '@elonuki.test', false),
    (up, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true);
  insert into public.profiles (id, email, role) values
    (ua, 'test-a-' || r || '@elonuki.test', 'admin'), (ub, 'test-b-' || r || '@elonuki.test', 'teacher'),
    (uc, 'test-c-' || r || '@elonuki.test', 'pending')
  on conflict (id) do update set role = excluded.role;

  insert into public.schools (name) values ('TEST Schule A ' || r) returning id into s1;
  insert into public.schools (name) values ('TEST Schule B ' || r) returning id into s2;
  insert into public.school_members (school_id, profile_id, role) values (s1, ua, 'admin'), (s2, ub, 'admin');
  code_a := 'testA-' || r; code_b := 'testB-' || r;
  insert into public.classes (school_id, name, code) values (s1, 'TA' || r, code_a) returning id into a1;
  insert into public.classes (school_id, name, code) values (s2, 'TB' || r, code_b) returning id into b1;
  insert into public.class_teachers (class_id, teacher_id, lead) values (a1, ua, true), (b1, ub, true);
  insert into public.staff (school_id, short, profile_id) values (s1, 'TA' || r, ua) returning id into sa;
  insert into public.staff (school_id, short, profile_id) values (s2, 'TB' || r, ub) returning id into sb;
  insert into public.slots (class_id, day, period, subject, staff_id) values (a1, 0, 0, 'Mathe', sa), (b1, 0, 0, 'Englisch', sb);
  loop
    join_a := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (select 1 from public.class_access where join_code = join_a);
  end loop;
  insert into public.class_access (class_id, join_code, pw) values (a1, join_a, 'geheim1');
  insert into public.class_keys (class_id, k) values (a1, repeat('a', 43)), (b1, repeat('b', 43));
  insert into public.class_mail (class_id, sender, dir, nr, body) values (a1, ua, 'down', 1, '{}'), (b1, ub, 'down', 1, '{}');
  insert into public.class_content (class_id, body) values (a1, '{}'), (b1, '{}');
  insert into public.class_media (class_id, id, body) values (a1, 'test', '{}'), (b1, 'test', '{}');
  loop
    uname_a := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 4));
    exit when not exists (select 1 from public.pupil_logins where uname = uname_a);
  end loop;
  insert into public.pupil_logins (uname, class_id, nr, pin_hash) values (uname_a, a1, 1, extensions.crypt('1234', extensions.gen_salt('bf', 8)));
  insert into public.lessons (id, owner, class_id, title, shared) values ('test-a-' || r, ua, a1, 'Test A', true), ('test-b-' || r, ub, b1, 'Test B', true);
  insert into public.tickets (role, class_id, school_id, body) values ('teacher', a1, s1, 'Test A'), ('teacher', b1, s2, 'Test B');
  insert into public.teacher_lib (owner, id, meta) values (ua, 'test-' || r, '{}'), (ub, 'test-' || r, '{}');
  insert into public.class_members (uid, class_id) values (up, a1);

  -- Börse: A und B stellen je eine Stunde in die eigene Schule (geht nur angemeldet)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin
    insert into public.lesson_pool (school_id, scope, title, data) values (s1, 'school', 'Test A', '{}');
    res := res || format('A stellt eine Stunde in die Börse der eigenen Schule|%s|', true);
  exception when others then res := res || format('A stellt eine Stunde in die Börse der eigenen Schule|%s|%s', false, sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  insert into public.lesson_pool (school_id, scope, title, data) values (s2, 'school', 'Test B', '{}');

  -- ============================================================ Nicht angemeldet
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  select (select count(*) from public.schools) + (select count(*) from public.classes) + (select count(*) from public.slots)
       + (select count(*) from public.profiles) + (select count(*) from public.staff) + (select count(*) from public.class_teachers)
       + (select count(*) from public.tickets) + (select count(*) from public.lesson_pool) + (select count(*) from public.school_members)
       + (select count(*) from public.class_access) + (select count(*) from public.lessons)
    into n;
  res := res || format('Nicht angemeldet liest nichts (Schulen, Klassen, Stundenpläne, Profile, Kürzel, Tickets, Börse …)|%s|%s Zeilen', n = 0, n);
  select count(*) into n from public.join_class(join_a, 'geheim1');
  res := res || format('Nicht angemeldet: Schüler-Anmeldung mit Klassencode und Passwort klappt weiter|%s|', n = 1);

  -- ============================================================ B gegen Schule A
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.schools where id = s1;
  res := res || format('B sieht Schule A nicht|%s|', n = 0);
  select count(*) into n from public.classes where school_id = s1 or code = code_a;
  res := res || format('B sieht keine Klassen und Klassencodes von A|%s|', n = 0);
  select count(*) into n from public.class_teachers where class_id = a1;
  res := res || format('B sieht nicht, wer in Klasse A1 unterrichtet|%s|', n = 0);
  select count(*) into n from public.profiles where id = ua;
  res := res || format('B sieht das Profil (Name, E-Mail) von A nicht|%s|', n = 0);
  select count(*) into n from public.staff where school_id = s1;
  res := res || format('B sieht keine Kürzel von Schule A|%s|', n = 0);
  select count(*) into n from public.slots where class_id = a1;
  res := res || format('B sieht den Stundenplan von A1 nicht|%s|', n = 0);
  select count(*) into n from public.class_access where class_id = a1;
  res := res || format('B sieht Schüler-Zugang (Code, Passwort) von A1 nicht|%s|', n = 0);
  res := res || format('B bekommt den Klassenschlüssel von A1 nicht|%s|', public.class_key(code_a) is null);
  select count(*) into n from public.class_mail where class_id = a1;
  res := res || format('B liest keine Post von A1|%s|', n = 0);
  select (select count(*) from public.class_content where class_id = a1) + (select count(*) from public.class_media where class_id = a1) into n;
  res := res || format('B liest keine Inhalte und Bilder von A1|%s|', n = 0);
  select count(*) into n from public.pupil_login_list(a1);
  res := res || format('B sieht keine Schüler-PINs/Kürzel von A1|%s|', n = 0);
  res := res || format('B setzt keine Schüler-PIN in A1|%s|', public.pupil_login_set(a1, 2, 'ZZZZ', '1111') = 'denied');
  select count(*) into n from public.lessons where owner = ua;
  res := res || format('B liest keine Stunden von A (auch keine geteilten)|%s|', n = 0);
  select count(*) into n from public.lesson_pool where school_id = s1;
  res := res || format('B sieht die Börse von Schule A nicht|%s|', n = 0);
  select count(*) into n from public.tickets where school_id = s1;
  res := res || format('B sieht keine Tickets von Schule A|%s|', n = 0);
  select count(*) into n from public.teacher_lib where owner = ua;
  res := res || format('B sieht die Bibliothek von A nicht|%s|', n = 0);
  res := res || format('B kommt nicht in den Live-Kanal von A1|%s|', not public.live_teacher('elon-' || code_a));
  select count(*) into n from public.school_members where school_id = s1;
  res := res || format('B sieht die Mitglieder von Schule A nicht|%s|', n = 0);

  begin insert into public.classes (school_id, name, code) values (s1, 'X', 'x-' || r); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann keine Klasse in Schule A anlegen|%s|', ok);
  begin insert into public.staff (school_id, short) values (s1, 'XB' || substr(r, 1, 4)); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann kein Kürzel in Schule A anlegen|%s|', ok);
  begin insert into public.lesson_pool (school_id, scope, to_short, title, data) values (s1, 'person', 'TA' || r, 'X', '{}'); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann A keine Stunde per Kürzel schicken|%s|', ok);
  begin insert into public.lesson_pool (school_id, scope, title, data) values (s1, 'school', 'X', '{}'); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann nichts in die Börse von Schule A stellen|%s|', ok);
  update public.classes set name = 'gehackt' where id = a1; get diagnostics n = row_count;
  res := res || format('B kann Klasse A1 nicht umbenennen|%s|', n = 0);
  begin insert into public.class_teachers (class_id, teacher_id) values (a1, ub); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann sich nicht in Klasse A1 eintragen|%s|', ok);
  begin insert into public.slots (class_id, day, period, subject, staff_id) values (b1, 1, 1, 'X', sa); ok := false;
  exception when others then ok := true; end;
  res := res || format('B kann kein Kürzel von Schule A in seinen Stundenplan setzen|%s|', ok);
  res := res || format('B kann sich nicht selbst in Schule A holen|%s|', public.school_add_member(s1, 'test-b-' || r || '@elonuki.test') = 'denied');
  update public.profiles set role = 'admin' where id = ub; get diagnostics n = row_count;
  res := res || format('B kann sich nicht selbst zum Konto-Admin machen|%s|', n = 0);
  ok := true;
  begin
    update public.school_members set school_id = s1 where profile_id = ub; get diagnostics n = row_count;
    if n > 0 then ok := false; end if;
  exception when others then null; end;
  begin
    insert into public.school_members (school_id, profile_id, role) values (s1, ub, 'admin'); ok := false;
  exception when others then null; end;
  res := res || format('B kann seine Mitgliedschaft nicht auf Schule A umschreiben|%s|', ok);
  res := res || format('B holt A nicht in seine Schule (A gehört schon zu Schule A)|%s|', public.school_add_member(s2, 'test-a-' || r || '@elonuki.test') = 'unbekannt');

  -- B in der eigenen Schule: alles da
  select count(*) into n from public.classes where id = b1;
  res := res || format('B sieht die eigene Klasse B1|%s|', n = 1);
  select count(*) into n from public.slots where class_id = b1;
  res := res || format('B sieht den eigenen Stundenplan|%s|', n = 1);
  res := res || format('B bekommt den eigenen Klassenschlüssel|%s|', public.class_key(code_b) is not null);

  -- ============================================================ Admin A (wie Fabian) gegen Schule B
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select count(*) into n from public.schools where id = s2;
  res := res || format('Admin A sieht Schule B nicht|%s|', n = 0);
  select (select count(*) from public.classes where school_id = s2) + (select count(*) from public.class_teachers where class_id = b1)
       + (select count(*) from public.staff where school_id = s2) + (select count(*) from public.slots where class_id = b1)
       + (select count(*) from public.school_members where school_id = s2) + (select count(*) from public.profiles where id = ub)
    into n;
  res := res || format('Admin A sieht keine Klassen, Lehrkräfte, Kürzel, Stundenpläne von Schule B|%s|%s Zeilen', n = 0, n);
  select (select count(*) from public.class_access where class_id = b1) + (select count(*) from public.class_mail where class_id = b1)
       + (select count(*) from public.class_content where class_id = b1) + (select count(*) from public.class_media where class_id = b1)
       + (select count(*) from public.pupil_login_list(b1))
    into n;
  res := res || format('Admin A liest keine Codes, Post, Inhalte, PINs von B1|%s|%s Zeilen', n = 0, n);
  res := res || format('Admin A bekommt den Klassenschlüssel von B1 nicht|%s|', public.class_key(code_b) is null);
  select (select count(*) from public.lessons where owner = ub) + (select count(*) from public.lesson_pool where school_id = s2)
       + (select count(*) from public.tickets where school_id = s2) + (select count(*) from public.teacher_lib where owner = ub)
    into n;
  res := res || format('Admin A liest keine Stunden, Börse, Tickets, Bibliothek von B|%s|%s Zeilen', n = 0, n);
  res := res || format('Admin A kommt nicht in den Live-Kanal von B1|%s|', not public.live_teacher('elon-' || code_b));
  delete from public.schools where id = s2; get diagnostics n = row_count;
  res := res || format('Admin A kann Schule B nicht löschen|%s|', n = 0);
  begin insert into public.classes (school_id, name, code) values (s2, 'X', 'y-' || r); ok := false;
  exception when others then ok := true; end;
  res := res || format('Admin A kann keine Klasse in Schule B anlegen|%s|', ok);
  res := res || format('Admin A kann sich nicht in Schule B holen|%s|', public.school_add_member(s2, 'test-a-' || r || '@elonuki.test') = 'denied');

  -- Admin A in der eigenen Schule: App funktioniert weiter
  select count(*) into n from public.schools where id = s1;
  res := res || format('Admin A sieht die eigene Schule|%s|', n = 1);
  select count(*) into n from public.classes where id = a1 and code = code_a;
  res := res || format('Admin A sieht Klasse A1 mit Klassencode|%s|', n = 1);
  select count(*) into n from public.slots where class_id = a1;
  res := res || format('Admin A sieht den Stundenplan von A1|%s|', n = 1);
  select count(*) into n from public.class_access where class_id = a1;
  res := res || format('Admin A sieht den Schüler-Zugang von A1|%s|', n = 1);
  select count(*) into n from public.pupil_login_list(a1);
  res := res || format('Admin A sieht die Schüler-Kürzel von A1|%s|', n = 1);
  res := res || format('Admin A bekommt den Klassenschlüssel von A1|%s|', public.class_key(code_a) is not null);
  res := res || format('Admin A kommt in den Live-Kanal von A1|%s|', public.live_teacher('elon-' || code_a));
  select count(*) into n from public.tickets where school_id = s1;
  res := res || format('Admin A sieht die Tickets der eigenen Schule|%s|', n = 1);
  select count(*) into n from public.staff where school_id = s1;
  res := res || format('Admin A sieht die Kürzel der eigenen Schule|%s|', n = 1);
  begin
    insert into public.classes (school_id, name, code) values (s1, 'TN' || r, 'testN-' || r);
    insert into public.staff (school_id, short) values (s1, 'TN' || substr(r, 1, 4));
    update public.class_access set pw = 'neu123' where class_id = a1; get diagnostics n = row_count;
    res := res || format('Admin A legt Klasse und Kürzel an und ändert das Schüler-Passwort|%s|', n = 1);
  exception when others then res := res || format('Admin A legt Klasse und Kürzel an und ändert das Schüler-Passwort|%s|%s', false, sqlerrm); end;
  select count(*) into n from public.profiles where id = uc;
  res := res || format('Admin A sieht das neue, wartende Konto C (zum Freischalten)|%s|', n = 1);
  update public.profiles set role = 'teacher' where id = uc; get diagnostics n = row_count;
  res := res || format('Admin A schaltet C frei|%s|', n = 1);

  -- Neue Schule für den Pilot: A legt sie an, holt C als ersten Admin hinein, sieht sie danach nicht mehr
  insert into public.schools (name) values ('TEST Schule C ' || r) returning id into s3;
  res := res || format('Admin A holt C als ersten Admin in eine neue, leere Schule|%s|', public.school_add_member(s3, 'test-c-' || r || '@elonuki.test', 'admin') = 'ok');
  select (select count(*) from public.schools where id = s3) + (select count(*) from public.profiles where id = uc) into n;
  res := res || format('Danach sieht Admin A weder Schule C noch das Konto C|%s|%s Zeilen', n = 0, n);

  -- ============================================================ Schüler-iPad (anonyme Sitzung in A1)
  perform set_config('request.jwt.claims', json_build_object('sub', up, 'role', 'authenticated')::text, true);
  select count(*) into n from public.slots where class_id = a1;
  res := res || format('iPad in A1 sieht den Stundenplan seiner Klasse|%s|', n = 1);
  select count(*) into n from public.slots where class_id = b1;
  res := res || format('iPad in A1 sieht den Stundenplan von B1 nicht|%s|', n = 0);
  select count(*) into n from public.class_content where class_id = a1;
  res := res || format('iPad in A1 bekommt die Inhalte seiner Klasse|%s|', n = 1);
  select count(*) into n from public.classes;
  res := res || format('iPad sieht keine Klassenliste|%s|', n = 0);

  -- ============================================================ Ergebnis speichern, Testdaten löschen
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  insert into _test_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test_ergebnis e;

  delete from public.schools where id in (s1, s2, s3);
  delete from public.lessons where owner in (ua, ub, uc);
  delete from auth.users where id in (ua, ub, uc, up);
end
$test$;

select nr, test, ok, info from _test_ergebnis order by nr;
