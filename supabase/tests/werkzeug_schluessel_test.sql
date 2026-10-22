-- ELONUKI · Test „Persönliche Schlüssel für eigene Werkzeuge“
-- Im Supabase „SQL Editor“ ausführen (Run), NACH 20261022090000_werkzeug_schluessel.sql.
-- Legt Testschulen und Testkonten an, prüft und löscht alles Testmaterial wieder.
-- Ergebnis: eine Tabelle. Oben steht „GESAMT“, darunter jeder Test mit ok = true/false.

create temp table if not exists _test4_ergebnis (nr int, test text, ok boolean, info text);
truncate _test4_ergebnis;
grant all on _test4_ergebnis to authenticated, anon, service_role;

do $test$
declare
  r text := lower(substr(md5(random()::text), 1, 6));
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  s1 uuid; j jsonb; kb text; hb text; kb2 text; kid uuid; n int; t text;
  res text[] := '{}';
  h1 text := '<!doctype html><html><body>Version 1</body></html>';
  h2 text := '<!doctype html><html><body>Version 2</body></html>';
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a-' || r || '@elonuki.test', false),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b-' || r || '@elonuki.test', false),
    (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-c-' || r || '@elonuki.test', false);
  insert into public.profiles (id, email, role) values
    (ua, 'test-a-' || r || '@elonuki.test', 'admin'), (ub, 'test-b-' || r || '@elonuki.test', 'teacher'), (uc, 'test-c-' || r || '@elonuki.test', 'teacher')
  on conflict (id) do update set role = excluded.role;
  insert into public.schools (name) values ('TEST Schule ' || r) returning id into s1;
  insert into public.school_members (school_id, profile_id, role) values (s1, ua, 'admin'), (s1, ub, 'author'), (s1, uc, 'teacher');

  -- Lehrkraft C (kein Co-Autor)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  j := public.tool_key_create('c');
  res := res || format('Lehrkraft ohne Co-Autor-Rolle bekommt keinen Schlüssel|%s|%s', j->>'err' = 'denied', j);

  -- Co-Autor B
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.tool_key_create('Mein Claude');
  kb := j->>'key';
  res := res || format('Co-Autor B bekommt einen Schlüssel (elk_ + 64 Zeichen)|%s|', kb ~ '^elk_[0-9a-f]{64}$');
  hb := encode(sha256(convert_to(kb, 'UTF8')), 'hex');
  begin perform 1 from public.tool_keys limit 1; res := res || format('Tabelle mit Schlüsseln ist für Nutzer gesperrt|%s|', false);
  exception when insufficient_privilege then res := res || format('Tabelle mit Schlüsseln ist für Nutzer gesperrt|%s|', true); end;
  select count(*) into n from public.tool_key_list() l where l.label = 'Mein Claude' and not l.revoked;
  res := res || format('B sieht seinen Schlüssel in der Liste (ohne den Schlüssel selbst)|%s|', n = 1);
  perform public.tool_key_create('2'); perform public.tool_key_create('3');
  j := public.tool_key_create('4');
  res := res || format('Höchstens 3 aktive Schlüssel|%s|%s', j->>'err' = 'zuviele', j);
  begin perform public.tool_push(hb, 'X', null, null, h1); res := res || format('B kann tool_push nicht selbst aufrufen|%s|', false);
  exception when insufficient_privilege then res := res || format('B kann tool_push nicht selbst aufrufen|%s|', true); end;
  begin perform public.tool_key_user(hb); res := res || format('B kann tool_key_user nicht aufrufen|%s|', false);
  exception when insufficient_privilege then res := res || format('B kann tool_key_user nicht aufrufen|%s|', true); end;

  -- Edge Function (service_role) schickt mit dem Schlüssel
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  j := public.tool_push('00' || hb, 'Preisvergleich', 'W', 'info', h1);
  res := res || format('Falscher Schlüssel wird abgelehnt|%s|%s', j->>'err' = 'key', j);
  j := public.tool_push(hb, 'Preisvergleich', 'W', 'Preise vergleichen', h1);
  res := res || format('Push legt neues Werkzeug an (Entwurf, Version 1)|%s|%s', j->>'status' = 'entwurf' and (j->>'ver')::int = 1 and (j->>'neu')::boolean, j);
  select count(*) into n from public.school_tools where owner = ub and name = 'Preisvergleich';
  res := res || format('Das Werkzeug gehört B|%s|', n = 1);
  j := public.tool_push(hb, 'preisvergleich', null, null, h2);
  res := res || format('Zweiter Push (Name egal ob groß/klein) = Version 2, kein Duplikat|%s|%s', (j->>'ver')::int = 2 and not (j->>'neu')::boolean, j);
  select count(*) into n from public.school_tools where owner = ub;
  res := res || format('Es gibt nur ein Werkzeug|%s|', n = 1);
  select subject || '|' || info into t from public.school_tools where owner = ub;
  res := res || format('Fach und Info bleiben bei fehlenden Feldern erhalten|%s|%s', t = 'W|Preise vergleichen', t);
  j := public.tool_push(hb, ' ', 'W', '', h1);
  res := res || format('Ohne Namen wird abgelehnt|%s|%s', j->>'err' = 'name', j);
  j := public.tool_push(hb, 'Groß', 'W', '', repeat('x', 600001));
  res := res || format('Zu große Datei wird abgelehnt|%s|%s', j->>'err' = 'gross', j);
  j := public.tool_pull(hb, null);
  res := res || format('Liste der eigenen Werkzeuge|%s|%s', jsonb_array_length(j->'tools') = 1, j);
  j := public.tool_pull(hb, 'Preisvergleich');
  res := res || format('Pull holt die aktuelle Datei|%s|', j->>'html' = h2);
  j := public.tool_pull(hb, 'Gibtsnicht');
  res := res || format('Unbekanntes Werkzeug beim Pull|%s|%s', j->>'err' = 'unbekannt', j);

  -- Freigegeben: Push geht sofort live
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('role', 'none', true);
  select id into kid from public.school_tools where owner = ub;
  perform set_config('role', 'authenticated', true);
  perform public.tool_submit(kid);   -- nicht Besitzer: bleibt wirkungslos
  perform public.tool_review(kid, 2, true, '');
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  j := public.tool_push(hb, 'Preisvergleich', null, null, h1);
  res := res || format('Freigegeben: Push ist sofort live (Version 3, bleibt freigegeben)|%s|%s', j->>'status' = 'freigegeben' and (j->>'ver')::int = 3, j);
  res := res || format('Push kann nichts freigeben oder sperren (keine solche Funktion)|%s|', not exists (select 1 from pg_proc where proname in ('tool_push_review','tool_push_block')));

  -- Widerrufen
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'none', true);
  select id into kid from public.tool_keys where key_hash = hb;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  res := res || format('C kann den Schlüssel von B nicht widerrufen|%s|', public.tool_key_revoke(kid) = 'unbekannt');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  res := res || format('B widerruft seinen Schlüssel|%s|', public.tool_key_revoke(kid) = 'ok');
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  j := public.tool_push(hb, 'Preisvergleich', null, null, h2);
  res := res || format('Widerrufener Schlüssel geht nicht mehr|%s|%s', j->>'err' = 'key', j);

  -- Rolle weg = Schlüssel wirkungslos
  perform set_config('role', 'none', true);
  select encode(sha256(convert_to(k, 'UTF8')), 'hex') into hb from (select 'elk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as k) x;
  insert into public.tool_keys (profile_id, key_hash, label) values (ub, hb, 'neu');
  update public.school_members set role = 'teacher' where profile_id = ub;
  perform set_config('role', 'service_role', true);
  j := public.tool_push(hb, 'Preisvergleich', null, null, h2);
  res := res || format('Ohne Co-Autor-Rolle wirkt der Schlüssel nicht mehr|%s|%s', j->>'err' = 'key', j);

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  insert into _test4_ergebnis (nr, test, ok, info)
    select i, split_part(res[i], '|', 1), split_part(res[i], '|', 2)::boolean, nullif(split_part(res[i], '|', 3), '')
    from generate_subscripts(res, 1) i;
  insert into _test4_ergebnis (nr, test, ok, info)
    select 0, 'GESAMT', bool_and(e.ok), count(*) filter (where e.ok) || ' von ' || count(*) || ' Tests bestanden' from _test4_ergebnis e;
  delete from public.schools where id = s1;
  delete from auth.users where id in (ua, ub, uc);
end
$test$;

select nr, test, ok, info from _test4_ergebnis order by nr;
