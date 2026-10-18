# Bug HQ

## Ziel
Jeder bekannte Fehler steht hier mit Fundort, bis er behoben und getestet ist.

## Status
gelb

## Fortschritt
70%

## Nächste 3 Schritte
- Runde 2 (B-10 bis B-13) auf iPads und Tafel testen, dann auf „erledigt“ setzen
- B-05 (PIN-Erkennung) mit PR #9 abschließen
- B-06 (Live-Kanal härten) nach dem Test von B-11 neu bewerten

## In Arbeit
- B-05, B-06
- B-10 bis B-13 im Test (Runde 2)

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
| B-10 | Kopfrechen-Fußball: Ball springt beim Neuzeichnen und überspringt scheinbar ein Feld | mittel | in Test | app.html kfAnimate (Runde 2) |
| B-11 | Verbindung bricht nach Standby oder schwachem WLAN ab, nur Neustart der App hilft | hoch | in Test | app.html Live-Kanal, Wiederverbinden (Runde 2) |
| B-12 | „Bereit“ kommt morgens nicht bei allen an | hoch | in Test | app.html Bereit-Check, Folge von B-11; iPad zeigt „Sendet …“, dann „Angekommen“ (Runde 2, PR #22 + Nachtrag) |
| B-13 | Übungen: richtige Antwort steht immer an erster Stelle (A, rot) | hoch | in Test | app.html Multiple Choice, Millionenspiel, Quiz; Zuordnen, Lückentext, Zahlenstrahl waren schon gemischt (Runde 2) |
| B-14 | Hoher Supabase-Datenverbrauch im Live-Unterricht: Tafel schickt alle 3 s das ganze Heft, iPads melden sich alle 3 s doppelt, Klasseninhalt wird alle 2 min komplett geladen | hoch | in Test | app.html pushCS, Herzschlag, ccPull; Analyse elon/egress-analyse.md |
