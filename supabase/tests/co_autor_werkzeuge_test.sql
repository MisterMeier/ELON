-- ELONUKI · Test „Co-Autor und eigene Werkzeuge“
-- Im Supabase „SQL Editor“ ausführen (Run), NACH tester.sql und der Migration 20261021180000_co_autor_werkzeuge.sql.
-- Legt Testschulen und Testkonten an, prüft und löscht alles Testmaterial wieder. Echte Daten werden nicht gelesen oder verändert.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.

create temp table if not exists _test3_ergebnis (nr int, test text, ok boolean, info text);
truncate _test3_ergebnis;
grant all on _test3_ergebnis to authenticated, anon;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  s1 uuid; s2 uuid; a1 uuid; tb uuid; j jsonb; tid uuid;
  res text[] := '{}';
  n int; t text; ok boolean;
  h1 text := '<!doctype html><html><head><meta name="elonuki-tool" content=''{"name":"Test"}''></head><body>Version 1</body></html>';
  h2 text := '<!doctype html><html><body>Version 2</body></html>';
begin
  -- ============================================================ Testdaten (als Datenbank-Besitzer)
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a-' || r || '@elonuki.test', false),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b-' || r || '@elonuki.test', false),
    (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-c-' || r || '@elonuki.test', false),
    (ud, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-d-' || r || '@elonuki.test', false);
  insert into public.profiles (id, email, role) values
    (ua, 'test-a-' || r || '@elonuki.test', 'admin'), (ub, 'test-b-' || r || '@elonuki.test', 'teacher'),
    (uc, 'test-c-' || r || '@elonuki.test', 'teacher'), (ud, 'test-d-' || r || '@elonuki.test', 'teacher')
  on conflict (id) do update set role = excluded.role;
  insert into public.schools (name) values ('TEST Schule A ' || r) returning id into s1;
  insert into public.schools (name) values ('TEST Schule B ' || r) returning id into s2;
  insert into public.school_members (school_id, profile_id, role) values (s1, ua, 'admin'), (s1, ub, 'author'), (s1, uc, 'teacher'), (s2, ud, 'author');
  insert into public.classes (school_id, name, code) values (s1, 'TA' || r, 'testA-' || r) returning id into a1;
  insert into public.class_teachers (class_id, teacher_id, lead) values (a1, ub, true), (a1, uc, false);

  begin insert into public.school_members (school_id, profile_id, role) values (s2, ua, 'chef');
    res := res || format('Unbekannte Rolle in der Schule wird abgelehnt|%s|', false);
  exception when check_violation then res := res || format('Unbekannte Rolle in der Schule wird abgelehnt|%s|', true); end;

  -- ============================================================ Lehrkraft C (keine Co-Autorin)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_save(null, 'C-Werkzeug', 'G', '', h1);
  res := res || format('Lehrkraft ohne Co-Autor-Rolle kann nichts hochladen|%s|%s', j->>'err' = 'denied', j);
  res := res || format('Lehrkraft kann niemanden zum Co-Autor machen|%s|', public.school_set_role(uc, 'author') = 'denied');

  -- ============================================================ Co-Autor B lädt hoch
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_save(null, 'Preisvergleich', 'W', 'Preise vergleichen', h1);
  tb := (j->>'id')::uuid;
  res := res || format('Co-Autor B lädt ein Werkzeug hoch (Entwurf, Version 1)|%s|%s', tb is not null and j->>'status' = 'entwurf' and (j->>'ver')::int = 1, j);
  j := public.tool_save(null, 'Zu groß', 'W', '', repeat('x', 600001));
  res := res || format('Zu große Datei wird abgelehnt|%s|%s', j->>'err' = 'gross', j);
  j := public.tool_save(null, '  ', 'W', '', h1);
  res := res || format('Werkzeug ohne Namen wird abgelehnt|%s|%s', j->>'err' = 'name', j);
  begin perform 1 from public.school_tools limit 1; res := res || format('Co-Autor liest die Tabelle nicht direkt|%s|', false);
  exception when insufficient_privilege then res := res || format('Co-Autor liest die Tabelle nicht direkt|%s|', true); end;
  begin update public.school_tools set status = 'freigegeben' where id = tb; res := res || format('Co-Autor kann den Status nicht direkt setzen|%s|', false);
  exception when insufficient_privilege then res := res || format('Co-Autor kann den Status nicht direkt setzen|%s|', true); end;
  select count(*) into n from public.tool_list() l where l.id = tb and l.mine;
  res := res || format('Co-Autor sieht seinen Entwurf in der Liste|%s|', n = 1);
  j := public.tool_html(tb, null);
  res := res || format('Co-Autor startet seinen Entwurf in der Vorschau|%s|', j->>'html' = h1 and not (j->>'live')::boolean);
  j := public.tool_html(tb, a1);
  res := res || format('Entwurf läuft nicht in einer echten Klasse|%s|%s', j->>'err' = 'testklasse', j);
  j := public.my_test_class();
  j := public.tool_html(tb, (j->>'id')::uuid);
  res := res || format('Entwurf läuft in der eigenen Testklasse|%s|%s', j->>'html' = h1, left(j::text, 60));
  res := res || format('Co-Autor kann nicht selbst freigeben|%s|', public.tool_review(tb, 1, true) = 'denied');
  res := res || format('Co-Autor kann nicht sperren|%s|', public.tool_block(tb, false) = 'denied');

  -- ============================================================ Vor der Freigabe sehen andere nichts
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tool_list() l where l.id = tb;
  res := res || format('Kollegin C sieht den Entwurf nicht|%s|', n = 0);
  j := public.tool_html(tb, a1);
  res := res || format('Kollegin C kann den Entwurf nicht starten|%s|%s', j->>'err' = 'denied', j);
  res := res || format('Kollegin C kann den Entwurf nicht einreichen|%s|', public.tool_submit(tb) = 'denied');
  res := res || format('Kollegin C kann den Entwurf nicht löschen|%s|', public.tool_delete(tb) = 'denied');
  j := public.tool_save(tb, 'Gekapert', 'W', '', h2);
  res := res || format('Kollegin C kann das Werkzeug nicht ändern|%s|%s', j->>'err' = 'denied', j);

  -- ============================================================ Admin sieht Entwürfe schon während der Entwicklung
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tool_list() l where l.id = tb and l.status = 'entwurf';
  res := res || format('Admin sieht den Entwurf in der Liste|%s|', n = 1);
  j := public.tool_html(tb, null);
  res := res || format('Admin probiert den Entwurf in der Vorschau aus|%s|', j->>'html' = h1);
  j := public.my_test_class();
  j := public.tool_html(tb, (j->>'id')::uuid);
  res := res || format('Admin probiert den Entwurf in seiner Testklasse aus|%s|%s', j->>'html' = h1, left(j::text, 60));
  j := public.tool_html(tb, a1);
  res := res || format('Admin startet den Entwurf nicht in einer echten Klasse|%s|%s', j->>'err' = 'denied', j);

  -- ============================================================ Einreichen und Freigabe
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  res := res || format('Co-Autor reicht ein|%s|', public.tool_submit(tb) = 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select l.status into t from public.tool_list() l where l.id = tb;
  res := res || format('Admin sieht das Werkzeug als eingereicht|%s|%s', t = 'eingereicht', t);
  j := public.tool_html(tb, null);
  res := res || format('Admin öffnet es zur Prüfung in der Vorschau|%s|', j->>'html' = h1);
  res := res || format('Freigabe einer anderen Version wird abgelehnt|%s|', public.tool_review(tb, 7, true) = 'geaendert');
  res := res || format('Admin gibt frei|%s|', public.tool_review(tb, 1, true, 'Passt') = 'ok');

  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tool_list() l where l.id = tb and l.status = 'freigegeben' and l.note = '';
  res := res || format('Kollegin C sieht das freigegebene Werkzeug (ohne Prüfnotiz)|%s|', n = 1);
  j := public.tool_html(tb, a1);
  res := res || format('Kollegin C startet es in ihrer Klasse|%s|', j->>'html' = h1 and (j->>'live')::boolean);
  res := res || format('Ohne Fabians Ja gibt es keine Vornamen|%s|', not (j->>'names')::boolean);

  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tool_list() l where l.id = tb;
  res := res || format('Co-Autor D (andere Schule) sieht es nicht|%s|', n = 0);
  j := public.tool_html(tb, null);
  res := res || format('Co-Autor D (andere Schule) kann es nicht starten|%s|%s', j->>'err' = 'denied', j);

  -- ============================================================ Weiterentwickeln ohne neue Prüfung
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_save(tb, 'Preisvergleich', 'W', 'Preise vergleichen', h2);
  res := res || format('Änderung nach der Freigabe: Version 2, bleibt freigegeben|%s|%s', (j->>'ver')::int = 2 and j->>'status' = 'freigegeben', j);
  j := public.tool_save(tb, 'Preisvergleich', 'W', 'Preise vergleichen', h2);
  res := res || format('Gleicher Inhalt zählt die Version nicht hoch|%s|%s', (j->>'ver')::int = 2, j);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_html(tb, a1);
  res := res || format('Kollegin C bekommt sofort Version 2|%s|', j->>'html' = h2 and (j->>'ver')::int = 2);

  -- ============================================================ Vornamen nur mit Fabians Ja
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_save(tb, 'Preisvergleich', 'W', '', h2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_html(tb, a1);
  res := res || format('Werkzeug will Vornamen: ohne Ja keine Namen|%s|', not (j->>'names')::boolean);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  res := res || format('Admin erlaubt Vornamen|%s|', public.tool_review(tb, 2, true, '', true) = 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_html(tb, a1);
  res := res || format('Danach bekommt das Werkzeug Vornamen|%s|', (j->>'names')::boolean);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_save(tb, 'Preisvergleich', 'W', '', h1, false);
  j := public.tool_save(tb, 'Preisvergleich', 'W', '', h2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_html(tb, a1);
  res := res || format('Namen aus- und wieder anschalten braucht ein neues Ja|%s|', not (j->>'names')::boolean);

  -- ============================================================ Not-Aus
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  res := res || format('Admin sperrt das Werkzeug|%s|', public.tool_block(tb, true, 'Fehler an der Tafel') = 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_html(tb, a1);
  res := res || format('Gesperrt: startet bei Kollegin C nicht|%s|%s', j->>'err' = 'gesperrt', j);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_save(tb, 'Preisvergleich', 'W', '', h1);
  res := res || format('Gesperrt: Speichern hebt die Sperre nicht auf|%s|%s', j->>'status' = 'gesperrt', j);
  res := res || format('Gesperrt: Einreichen hebt die Sperre nicht auf|%s|', public.tool_submit(tb) = 'denied');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  res := res || format('Admin hebt die Sperre auf|%s|', public.tool_block(tb, false) = 'ok');
  select l.status into t from public.tool_list() l where l.id = tb;
  res := res || format('Danach wieder freigegeben|%s|%s', t = 'freigegeben', t);

  -- ============================================================ Rollen umstellen
  res := res || format('Admin macht C zur Co-Autorin|%s|', public.school_set_role(uc, 'author') = 'ok');
  res := res || format('Admin-Rolle lässt sich so nicht vergeben|%s|', public.school_set_role(uc, 'admin') = 'invalid');
  res := res || format('Das eigene Konto lässt sich nicht umstellen|%s|', public.school_set_role(ua, 'teacher') = 'self');
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_save(null, 'C-Werkzeug', 'G', '', h1);
  tid := (j->>'id')::uuid;
  res := res || format('Co-Autorin C kann jetzt hochladen|%s|%s', tid is not null, j);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform public.school_set_role(uc, 'teacher');
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_save(tid, 'C-Werkzeug', 'G', '', h2);
  res := res || format('Rolle weg: C kann ihr Werkzeug nicht mehr ändern|%s|%s', j->>'err' = 'denied', j);
  res := res || format('Ihr eigenes Werkzeug löschen geht weiter|%s|', public.tool_delete(tid) = 'ok');

  -- ============================================================ Löschen und nicht angemeldet
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  res := res || format('Co-Autor B löscht sein Werkzeug|%s|', public.tool_delete(tb) = 'ok');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin perform public.tool_list(); res := res || format('Nicht angemeldet: Liste ist gesperrt|%s|', false);
  exception when insufficient_privilege then res := res || format('Nicht angemeldet: Liste ist gesperrt|%s|', true); end;
  begin perform public.tool_html(tb, null); res := res || format('Nicht angemeldet: Starten ist gesperrt|%s|', false);
  exception when insufficient_privilege then res := res || format('Nicht angemeldet: Starten ist gesperrt|%s|', true); end;

  -- ============================================================ Ergebnis speichern, Testdaten löschen
  perform set_config('role', 'none', true);
  insert into _test3_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test3_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test3_ergebnis e;

  delete from public.schools where id in (s1, s2);
  delete from auth.users where id in (ua, ub, uc, ud);
end
$test$;

select nr, test, ok, info from _test3_ergebnis order by nr;
