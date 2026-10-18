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
- Runde 2 (Eingang 15.10.), im Test: automatisches Wiederverbinden nach Standby mit Aktualisieren-Knopf (hoch), „Bereit“ zeigt „Sendet …“ bis zur Bestätigung (hoch), Antworten in Übungen und Quiz gemischt (hoch), Fußball mit Nachschuss fürs andere Team und ruhigem Ball (mittel)
- Thread „Bugfix- und Ausbauplan“: Runden 1–6 laut elon/plan-elonuki.md
- PR #9 (Entwurf): Schüler-iPad erkennt neue PIN von einem anderen Gerät
- Mehrlehrer-Pilot (zweite Lehrkraft, andere Schule): Schulen-Trennung ist im Test erfolgreich und live eingespielt (Fabian, 18.10.). Neu im PR (Entwurf): Admin-Bereich mit Konto löschen, Schule auswählen (schaltet frei und nimmt auf), Wunschschule bei Registrierung; dazu zweite SQL-Umstellung, Reihenfolge laut supabase/ANLEITUNG-schulen-trennen.md (Schritt 3b). Offen: Freigabe pro Werkzeug.

## Erledigt
- Ist-Analyse Mehrlehrer-Pilot (15.10.): Tabellen, Rollen, Blackbox, Börse, Bibliothek geprüft
- Runde 1 (PR #18): feste Folien-IDs, mehrere Werkzeuge pro Phase, sicherer Cloud-Sync, Cloud-Bibliothek, Elo-Stimme ohne Hängen
- Skizzenbuch Kunst (PR #7, #17)
- Geografiespiel „Wo liegt was?“ mit Globus (PR #15)
- Börsen-Startfolie mit Elo als Banker (PR #5)
