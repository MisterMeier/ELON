# ELONUKI – Hinweise für Claude

ELONUKI (früher ELIO) ist die Lernplattform einer 7. Klasse (iPad-Klasse, Mittelschule Bayern).
Leitfigur ist die Eule Elo. Ansprechpartner: Fabian (Lehrer, kein Entwickler). Antworten auf Deutsch.

## Aufbau
- `index.html`, `app.html`: Schüler- und Lehrer-App (GitHub Pages, Domain elio.schule)
- `supabase/`: SQL-Skripte und Edge Functions
- `hq/`: Projektstand je Feld (Markdown) – Quelle für das HQ-Dashboard
- `hq-dashboard/`: internes Dashboard, getrennt von der App, passwortgeschützt

## Nach jeder Änderung
- Die passende `/hq`-Datei aktualisieren: Status, Fortschritt, Nächste 3 Schritte, In Arbeit, Erledigt.
  - App-Funktionen → `hq/baumeister.md`, Aussehen/Material → `hq/design.md`,
    Datenschutz/Recht → `hq/sicherheit-recht.md`, Name/Preise/Hosting → `hq/kommerz.md`,
    Meilensteine → `hq/kommandozentrale.md`.
- Jeden gefundenen Bug in `hq/bugs.md` eintragen (ID, Beschreibung, Priorität, Status, Fundort);
  behobene Bugs auf „erledigt“ setzen, nicht löschen.
- Das Repo ist öffentlich: in `/hq` keine Schlüssel, Schülerdaten oder Details zu offenen Sicherheitslücken.
- Format der Felder nicht ändern, das Dashboard liest es: `## Ziel`, `## Status` (grün/gelb/rot),
  `## Fortschritt` (Zahl mit %), `## Nächste 3 Schritte`, `## In Arbeit`, `## Erledigt`.

## Effizienzregeln
- Diese Datei unter 150 Zeilen halten; Details in `/hq` auslagern.
- `node_modules`, Build-Ordner (`hq-dashboard/dist`) und große Assets (`assets/`, Audio, Video, Bilder) nicht lesen.
- Nur gezielt die Dateien lesen, die für die Aufgabe nötig sind; in `app.html` mit Suche und Zeilenbereich arbeiten.
- Antworten knapp halten, keine vollständigen Dateien wiederholen.
- Große PDFs/DOCX einmal als Digest zusammenfassen und danach nur das Digest lesen.

## Eingang sortieren
Schreibt Fabian „Eingang sortieren:“ mit Notizen:
- Die Rohnotizen unverändert mit Datum unter `## Notizen` in `hq/eingang.md` anhängen.
- Jeden Punkt in `hq/bugs.md`, `hq/design.md`, `hq/baumeister.md`, `hq/sicherheit-recht.md` oder `hq/kommerz.md` einsortieren,
  jeweils mit Priorität (hoch/mittel/niedrig).
- Danach Fabian die 3 wichtigsten nächsten Schritte nennen.
- Keine Sicherheitsdetails in öffentliche Dateien; solche Punkte nur allgemein eintragen und Details im Chat nennen.

## HQ-Dashboard
- Lokal: `node hq-dashboard/server.js` (Passwort in `hq-dashboard/.env`, Vorlage `.env.example`).
- Schnappschuss für Fabian: `node hq-dashboard/build.js`, dann `hq-dashboard/dist/elonuki-hq.html`
  als private claude.ai-Seite auf denselben Link neu veröffentlichen (wenn Fabian „HQ aktualisieren“ schreibt).
- Bei „HQ aktualisieren“ auch `hq/systeme.md` (Dienste, Kosten, Verbindungen) und `hq/stand.md` (max. 25 Zeilen) aktuell halten.
- Keine Zugangsdaten im Code; GitHub-Daten nur über die `gh` CLI.

## Arbeitsweise
- Ein PR pro Testrunde; Fabian bekommt eine Zeile, was sich ändert, und seinen einen nächsten Schritt.
