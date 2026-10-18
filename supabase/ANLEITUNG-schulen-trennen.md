# Anleitung: Schulen trennen (Mehrlehrer-Pilot)

Für Fabian, Schritt für Schritt. Du brauchst nur den Browser und dein Supabase-Konto.
Alle SQL-Dateien öffnest du auf GitHub, klickst auf „Raw“, markierst alles (Cmd+A), kopierst es
und fügst es in Supabase unter **SQL Editor → New query** ein. Dann **Run**.

| Datei | Wozu |
|---|---|
| `supabase/migrations/20261015120000_schulen_trennen.sql` | die Umstellung |
| `supabase/tests/schulen_trennen_test.sql` | prüft alles mit Testkonten und räumt danach auf |
| `supabase/rollback/20261015120000_schulen_trennen_rollback.sql` | macht die Umstellung rückgängig |

Was die Umstellung bewirkt:
- **Du behältst die Kontrolle.** Dein Konto bleibt der einzige Admin. Du siehst alle Konten (auch wartende), alle Schulen,
  wer zu welcher Schule und Klasse gehört, und alle Kürzel. Du schaltest Lehrkräfte frei, nimmst sie in eine Schule auf,
  entfernst oder sperrst sie. Alle Problem-Tickets aller Schulen kommen bei dir an.
- **Du siehst keine Inhalte fremder Schulen.** Klassen und Klassencodes, Schüler-Zugänge und PINs, Schlüssel, Post, Folien,
  Bilder, Stunden, Bibliothek, Börse und Stundenpläne anderer Schulen bleiben dort. In deiner eigenen Schule und deinen
  eigenen Klassen siehst und tust du alles wie bisher.
- **Jede Lehrkraft** sieht nur ihre eigene Schule. Wer aus der Schule entfernt oder gesperrt wird, verliert sofort jeden Zugriff.

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
   Erwartet: Eine Tabelle, ganz oben **GESAMT · true · 74 von 74 Tests bestanden**.
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

## Schritt 3b: Zweite Umstellung für den Admin-Bereich

Erst die erste Umstellung (Schritt 3), dann diese.

1. Den Pull Request mit der neuen App mergen. Die Seite aktualisiert sich nach ein bis zwei Minuten (am iPad die Seite einmal neu laden).
   Bis die SQL-Datei läuft, zeigt der Admin-Bereich bei den neuen Knöpfen eine Fehlermeldung. Sonst bleibt alles wie bisher.
2. [Zweite Umstellung](https://raw.githubusercontent.com/MisterMeier/ELON/main/supabase/migrations/20261018120000_admin_konten.sql) in eine neue Abfrage einfügen → **Run**. Erwartet „Success“.
3. [Test dazu](https://raw.githubusercontent.com/MisterMeier/ELON/main/supabase/tests/admin_konten_test.sql) einfügen → **Run**. Erwartet oben **GESAMT · true · 24 von 24 Tests bestanden**.

Wenn etwas nicht geht: die Datei „Rückgängig dazu“ ausführen.

## Schritt 5: Zweite Lehrkraft für den Pilot einrichten (ohne SQL)

1. **Schule anlegen:** In der App im Admin-Bereich unter „Schulen und Klassen“ unten Name und Ort eingeben → „Schule anlegen“.
2. **Registrieren:** Die Lehrkraft erstellt in der App ein Konto („Für Lehrkräfte: Anmelden“ → „Konto erstellen“) und gibt dabei ihre **Schule** an.
   Sie sieht danach den Warte-Bildschirm.
3. **Aufnehmen:** Im Admin-Bereich unter „Lehrkräfte“ steht das neue Konto mit der **Wunschschule**. Wähle bei „Schule“ die richtige Schule aus.
   Das Konto wird damit freigeschaltet und aufgenommen. Die Lehrkraft tippt „Nochmal prüfen“ und legt unter „Meine Klassen“ ihre Klasse an.
4. Sie sieht nur ihre Schule. Du siehst im Admin-Bereich ihr Konto und ihre Schule, aber nicht ihre Klasse.

**Wenn du eingreifen musst**, alles im Admin-Bereich unter „Lehrkräfte“:
- **Sperren:** Rolle auf „wartet“ stellen. Die Lehrkraft hat sofort keinen Zugriff mehr, ihre Daten bleiben.
- **Aus der Schule nehmen oder in eine andere Schule setzen:** bei „Schule“ „– keine –“ oder die andere Schule wählen. Klassen und Kürzel der alten Schule fallen dabei weg.
- **Konto löschen:** „Konto löschen“ → „Wirklich löschen“. Das Konto samt Anmeldung ist weg, die E-Mail-Adresse lässt sich danach neu registrieren.
  Dein eigenes Konto und Admin-Konten lassen sich hier nicht löschen.

Gut zu wissen:
- Eine Lehrkraft gehört zu **einer** Schule. Ordnest du sie einer Klasse in einer anderen Schule zu, lehnt die Datenbank das ab.
- Die Klassen anderer Schulen erscheinen nicht in deiner Klassenliste.
- Noch offen für später: Freigabe einzelner Werkzeuge pro Lehrkraft.
- Fügst du dich selbst per SQL in eine fremde Schule ein, siehst du dort alles. Mach das nur, wenn es nötig ist.
