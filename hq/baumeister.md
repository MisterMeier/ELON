# Baumeister

## Ziel
Die Schüler-App ELONUKI stabil machen und in Runden ausbauen: Folieneditor, Bibliothek, Werkzeugkasten, KI-Animationen.

## Status
gelb

## Fortschritt
35%

## Nächste 3 Schritte
- Runde 2 testen: iPad in den Standby, wieder öffnen; Bereit-Check; Übung zweimal starten; Fußball mit falscher Antwort
- Runde 2 Folieneditor: Elo klein oben auf jeder Folie, Schriftfarben, Bilder per Drag & Drop und Cmd+V
- Runde 3 Bibliothek & Schreibtisch: Umbenennen, Fach verschieben, Fach-Tabs oben

## In Arbeit
- Datensparen Supabase (18.10., im Test): Heft und Inhalte nur noch bei Änderung im Live-Takt, iPad-Meldungen seltener und über einen Kanal, Klasseninhalt nur bei Änderung neu laden. Offen: Folienbilder in den Storage, Lehrer-Sync nur geänderte Stunden
- Runde 2 (Eingang 15.10.), im Test: automatisches Wiederverbinden nach Standby mit Aktualisieren-Knopf (hoch), „Bereit“ zeigt „Sendet …“ bis zur Bestätigung (hoch), Antworten in Übungen und Quiz gemischt (hoch), Fußball mit Nachschuss fürs andere Team und ruhigem Ball (mittel)
- Thread „Bugfix- und Ausbauplan“: Runden 1–6 laut elon/plan-elonuki.md
- PR #9 (Entwurf): Schüler-iPad erkennt neue PIN von einem anderen Gerät
- Mehrlehrer-Pilot (zweite Lehrkraft, andere Schule): Schritte 1–3 als Dateien fertig (Schule als Mandant, Datenübernahme, Rollback, Test mit 62 Prüfungen, lokal alle bestanden). Noch nicht live: Fabian führt sie nach supabase/ANLEITUNG-schulen-trennen.md aus. Schritt 4 (Freigabe pro Werkzeug, Admin-Ansicht für Schul-Admins) offen.

## Erledigt
- Ist-Analyse Mehrlehrer-Pilot (15.10.): Tabellen, Rollen, Blackbox, Börse, Bibliothek geprüft
- Runde 1 (PR #18): feste Folien-IDs, mehrere Werkzeuge pro Phase, sicherer Cloud-Sync, Cloud-Bibliothek, Elo-Stimme ohne Hängen
- Skizzenbuch Kunst (PR #7, #17)
- Geografiespiel „Wo liegt was?“ mit Globus (PR #15)
- Börsen-Startfolie mit Elo als Banker (PR #5)
