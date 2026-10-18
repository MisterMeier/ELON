# Anleitung: Schulen trennen (Mehrlehrer-Pilot)

Für Fabian, Schritt für Schritt. Du brauchst nur den Browser und dein Supabase-Konto.
Alle SQL-Dateien öffnest du auf GitHub, klickst auf „Raw“, markierst alles (Cmd+A), kopierst es
und fügst es in Supabase unter **SQL Editor → New query** ein. Dann **Run**.

| Datei | Wozu |
|---|---|
| `supabase/migrations/20261015120000_schulen_trennen.sql` | die Umstellung |
| `supabase/tests/schulen_trennen_test.sql` | prüft alles mit Testkonten und räumt danach auf |
| `supabase/rollback/20261015120000_schulen_trennen_rollback.sql` | macht die Umstellung rückgängig |

Was die Umstellung bewirkt: Jede Lehrkraft gehört zu einer Schule. Sie sieht nur Klassen, Kolleginnen
und Kollegen, Kürzel, Stundenpläne, Börse und Tickets ihrer eigenen Schule. Dein Konto bleibt Admin
deiner Schule und sieht dort alles wie bisher. Bei anderen Schulen siehst du nichts mehr.

---

## Schritt 1: Sicherung (5 Minuten)

1. Supabase öffnen → dein Projekt → **SQL Editor → New query**.
2. Diesen Text einfügen und **Run** drücken. Er legt eine Kopie der wichtigsten Tabellen an:

```sql
create schema if not exists sicherung_20261015;
create table sicherung_20261015.schools        as table public.schools;
create table sicherung_20261015.classes        as table public.classes;
create table sicherung_20261015.profiles       as table public.profiles;
create table sicherung_20261015.class_teachers as table public.class_teachers;
create table sicherung_20261015.staff          as table public.staff;
create table sicherung_20261015.slots          as table public.slots;
create table sicherung_20261015.tickets        as table public.tickets;
create table sicherung_20261015.lesson_pool    as table public.lesson_pool;
```

3. Erwartet: „Success. No rows returned“. Die Kopie ist von außen nicht erreichbar.
   Nach zwei Wochen ohne Probleme löschst du sie mit `drop schema sicherung_20261015 cascade;`.
4. Hast du den Pro-Tarif: Unter **Database → Backups** steht die letzte automatische Sicherung. Merk dir die Uhrzeit.

## Schritt 2: Test an einer Kopie (20 Minuten, empfohlen)

So probierst du alles aus, ohne dass deine Klasse etwas merkt.

1. In Supabase oben links auf deine Organisation → **New project**, Name z. B. `elonuki-test`, Region Frankfurt. Der kostenlose Tarif reicht.
2. Im neuen Projekt im **SQL Editor** nacheinander diese Dateien aus dem Ordner `supabase/` ausführen:
   `schema.sql`, dann `blackbox.sql`, `elo_ki.sql`, `live_up.sql`, `push.sql`.
3. Jetzt die Umstellung ausführen: `migrations/20261015120000_schulen_trennen.sql` → **Run**. Erwartet: „Success“.
4. Den Test ausführen: `tests/schulen_trennen_test.sql` → **Run**.
   Erwartet: Eine Tabelle, ganz oben **GESAMT · true · 62 von 62 Tests bestanden**.
   Steht irgendwo `false`, hör hier auf und schick mir ein Bildschirmfoto der Tabelle.
5. Rückweg testen: `rollback/20261015120000_schulen_trennen_rollback.sql` → **Run**, danach die Umstellung noch einmal → **Run**.
   Beides muss „Success“ melden.
6. Das Test-Projekt danach löschen (**Project Settings → General → Delete project**).

## Schritt 3: Live schalten (10 Minuten)

Am besten nachmittags, wenn keine Stunde läuft.

1. Schritt 1 (Sicherung) erledigt? Dann im **echten** Projekt die Umstellung ausführen:
   `migrations/20261015120000_schulen_trennen.sql` → **Run**. Erwartet: „Success“.
2. Prüfen, ob dein Konto richtig zugeordnet ist. Ersetze `DEINE-EMAIL` durch deine Adresse:

```sql
select s.name as schule, m.role as rolle
from public.school_members m
join public.schools s on s.id = m.school_id
join public.profiles p on p.id = m.profile_id
where p.email = 'DEINE-EMAIL';
```

   Erwartet: deine Schule mit Rolle **admin**. Mit `select p.email, m.role from public.school_members m join public.profiles p on p.id = m.profile_id;`
   siehst du, dass alle Kolleginnen und Kollegen in deiner Schule stehen.
3. Den Test ausführen: `tests/schulen_trennen_test.sql` → **Run**. Erwartet: **GESAMT · true**.
   Der Test legt kurz Testschulen an und löscht sie am Ende wieder, deine echten Daten fasst er nicht an.
4. Dann die App prüfen (Liste unten).

**Wenn etwas nicht geht:** Rollback-Datei ausführen → **Run**. Danach ist alles wie vorher. Schreib mir, was nicht ging.

## Schritt 4: Nach dem Live-Gang testen

Am iPad oder Laptop, jeweils neu laden (Seite schließen und wieder öffnen):

- [ ] Als Lehrkraft anmelden: Startseite erscheint, deine Klasse ist da.
- [ ] Admin-Bereich: Schule, Klassen, Kürzel und Kolleginnen und Kollegen sind da.
- [ ] Stundenplan der Klasse öffnen und eine Stunde ändern.
- [ ] Wochenplanung und eine gespeicherte Stunde öffnen.
- [ ] Klasse → Schüler-Zugänge: Kürzel und PINs werden angezeigt, eine neue PIN vergeben klappt.
- [ ] Stunde an der Tafel starten: Ein Schüler-iPad meldet sich mit Kürzel und PIN an und ist im Live-Kanal.
- [ ] Schüler-iPad: Der Stundenplan wird angezeigt (wichtig: auch auf einem iPad, das schon länger angemeldet ist).
- [ ] Schüler-iPad: Hausaufgabe abgeben, sie kommt im Postfach an.
- [ ] Stundenbörse öffnen, eine Stunde teilen.
- [ ] Ein Problem-Ticket schicken, es erscheint im Admin-Bereich.
- [ ] Blackbox im Folieneditor einmal ausprobieren.

## Schritt 5: Zweite Lehrkraft für den Pilot einrichten

1. Admin-Bereich in der App: neue Schule anlegen (Name der Pilotschule).
2. Die zweite Lehrkraft registriert sich in der App. Du schaltest sie im Admin-Bereich frei (Rolle „teacher“).
3. Im **SQL Editor** holst du sie als Admin in ihre Schule. Name und E-Mail ersetzen:

```sql
insert into public.school_members (school_id, profile_id, role)
select s.id, p.id, 'admin' from public.schools s, public.profiles p
where s.name = 'NAME DER PILOTSCHULE' and p.email = 'EMAIL-DER-LEHRKRAFT' and p.role = 'teacher';
```

   Erwartet: „Success. 1 row“. Steht dort „0 rows“, stimmt der Name, die E-Mail oder die Freischaltung nicht.
   Ab jetzt siehst du diese Schule und die Lehrkraft in der App nicht mehr, und sie sieht deine Schule nicht.
4. Die zweite Lehrkraft legt unter „Meine Klassen“ ihre Klasse an und vergibt Schüler-Zugänge wie du.

Gut zu wissen für den Pilot:
- Den Admin-Bereich der App zeigt die Oberfläche nur Konten mit Rolle „admin“. Die zweite Lehrkraft arbeitet über „Meine Klassen“, das reicht für den Unterricht. Eine eigene Admin-Ansicht für Schul-Admins kommt später.
- Ihre Problem-Tickets landen in der Datenbank bei ihrer Schule. In der App sieht sie sie erst mit dieser Admin-Ansicht.
- Weitere Kolleginnen und Kollegen ihrer Schule trägst du mit derselben Zeile ein (Rolle `teacher` statt `admin`). In deiner eigenen Schule geht es wie bisher in der App: Wen du im Admin-Bereich einer Klasse zuordnest oder mit einem Kürzel verknüpfst, der gehört ab dann zu deiner Schule.
