# Bug HQ

## Ziel
Jeder bekannte Fehler steht hier mit Fundort, bis er behoben und getestet ist.

## Status
gelb

## Fortschritt
70%

## Nächste 3 Schritte
- Runde 1 auf dem iPad testen und neue Fehler hier eintragen
- B-05 (PIN-Erkennung) mit PR #9 abschließen
- B-06 (Live-Kanal härten) im Baumeister-Thread beheben

## In Arbeit
- B-05, B-06

## Erledigt
- B-01 bis B-04, B-07 bis B-09

## Bugs
| ID | Beschreibung | Priorität | Status | Fundort |
|---|---|---|---|---|
| B-01 | Folieneditor schreibt nach dem Verschieben in die falsche Folie | hoch | erledigt | app.html Folieneditor (PR #18) |
| B-02 | „＋ Werkzeug“ ersetzt das vorhandene Werkzeug | hoch | erledigt | app.html Werkzeuge pro Phase (PR #18) |
| B-03 | Gerät mit altem Stand überschreibt neuere Stunden in der Cloud | hoch | erledigt | app.html Cloud-Sync (PR #18) |
| B-04 | Material „nicht gefunden“ nach Domain-Umzug | hoch | erledigt | Bibliothek IndexedDB (PR #18, bibliothek.sql) |
| B-05 | Schüler-iPad erkennt neue PIN von einem anderen Gerät nicht | mittel | in Arbeit | app.html Login (PR #9) |
| B-06 | Live-Kanal: Verhalten bei Verbindungsfehlern härten | mittel | offen | app.html Realtime, Supabase-Einstellungen |
| B-07 | Elo-Stimme hängt, doppelte Bezahl-Aufrufe | mittel | erledigt | supabase/functions/elo-stimme (PR #18) |
| B-08 | Fotos behielten EXIF/GPS-Daten | hoch | erledigt | app.html medSmall (PR #4) |
| B-09 | AWS 403 ohne verständliche Meldung | niedrig | erledigt | supabase/functions/blackbox (PR #18) |
