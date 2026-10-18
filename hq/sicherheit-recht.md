# Sicherheit & Recht

## Ziel
DSGVO-konform und sicher: keine Schülerdaten an KI, Schlüssel nur als Secrets, Marke ELONUKI geschützt.

## Status
gelb

## Fortschritt
60%

## Nächste 3 Schritte
- Vor dem Mehrlehrer-Pilot: Datentrennung zwischen Schulen in der Datenbank umsetzen und mit zwei Konten testen
- Realtime-Einstellungen in Supabase nachschärfen, sobald der Live-Kanal stabil läuft
- Marke ELONUKI prüfen (DPMAregister, TMview; Klassen 9, 41, 42) und anmelden

## In Arbeit
- Markenprüfung nach recherche/anleitung-markenpruefung-elio.md
- Supabase-SQL-Skripte prüfen und ausführen (bibliothek.sql, t39)

## Erledigt
- Mandantentrennung geprüft (15.10.): Bibliothek privat je Lehrkraft, Blackbox serverseitig nur Admin, kein KI-Schlüssel im Browser; Trennung nach Schule fehlt noch (Details nur im Chat)
- Sicherheitslücken A1, A2, A4, B1, C1 behoben; A3 größtenteils
- EXIF/GPS wird aus Fotos immer entfernt (PR #4)
- Blackbox nur für Admin, Tageslimit, SVG doppelt bereinigt
- Elternbrief und Rechts-Checkliste erstellt

## Entscheidungen
- 15.10.2026: Das Repo bleibt vorerst öffentlich, weil die App über GitHub Pages läuft.
  Später GitHub Pro (ca. 4 $/Monat) und Repo privat, oder Hosting-Wechsel.
  Bis dahin: keine Schlüssel, keine internen Details und keine Sicherheitslücken im Repo.
