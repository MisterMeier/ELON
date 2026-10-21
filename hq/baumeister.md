# Baumeister

## Ziel
Die Schüler-App ELONUKI stabil machen und in Runden ausbauen: Folieneditor, Bibliothek, Werkzeugkasten, KI-Animationen.

## Status
gelb

## Fortschritt
42%

## Nächste 3 Schritte
- Vokabeltrainer in der Stunde testen: „Was üben die SuS?“ auf „Im eigenen Vokabelheft weiterlernen“ stellen und Phase starten; zweite Phase mit „Bestimmte Wörter“ und einer Liste aus dem Vokabelheft
- Folien-Editor testen (Runde 5): Textfeld und Tabelle einfügen, Textfeld löschen, Bild freistellen, Folie unter „Meine Folien“ speichern und in einer anderen Stunde einfügen
- SuS-Tester einrichten: supabase/tester.sql einmal im SQL Editor ausführen, dann Lehreransicht „Test“ und am iPad im SuS-Login „Lehrkraft · als Test-Schüler/in anmelden“
- Admin-Ansicht testen: Schule antippen, Reiter Klassen und Kollegium, neue Konten mit „Zu … holen“ freischalten
- Wochenrituale testen: In der Wochenplanung „Verfassungsviertelstunde“ und „Text der Woche“ antippen, Muster wählen, offizielles Logo selbst hochladen
- Runde 3 testen: Morgens „Wer fehlt?“ antippen, Rakete selbst starten, WLAN-Anzeige am iPad, Irregular Verbs mit Korrektur
- Runde 2 testen: Skizzenphase mit Vorlage (Donnerstag Produktdesign), Testmodus, Zuschauer-Zugang, Nächste Stunde
- supabase/media_storage.sql einmal im SQL Editor ausführen (Folienbilder als Dateien)
- Montag 7a: Sitzplan für 7a anlegen, DaZ-Ordner nur für 7cdG sichtbar lassen, Elo auf den Folien prüfen
- Runde 2 Folieneditor: Elo klein oben auf jeder Folie, Schriftfarben, Bilder per Drag & Drop und Cmd+V
- Runde 3 Bibliothek & Schreibtisch: Umbenennen, Fach verschieben, Fach-Tabs oben

## In Arbeit
- Vokabeltrainer in der Stunde (21.10.), im Test: Auswahl „Im eigenen Vokabelheft weiterlernen“ (jedes Kind bekommt seine fälligen Wörter, Lernstand bleibt) oder „Bestimmte Wörter wiederholen“ (Listen aus dem Vokabelheft aller Klassen einsetzen, fällige Wörter nur auf Wunsch dazu); neue Phasen starten ohne Beispielwörter
- Folien-Editor aufgeräumt (21.10.), im Test: Anweisung an die SuS steht oben bei Phase und Minuten, Folientyp-Auswahl entfernt, feste Knöpfe Bild, Audio/Video, Textfeld, Tabelle, Elo, Blackbox, Übergang; Löschen entfernt das ganze Textfeld; freigestellte Bilder ohne Rand und auf den sichtbaren Teil zugeschnitten; „Folie speichern“ und „Meine Folien“ zum Wiederverwenden in anderen Stunden
- SuS-Tester mit dem Lehrerkonto (21.10.), im Test: Lehrkraft meldet sich im SuS-Login mit dem eigenen Konto an und ist Kind Nr. 1 ihrer eigenen, unsichtbaren Testklasse; der Knopf „Test“ in der Lehreransicht nutzt dieselbe Testklasse über den Server (gleicher Kanal, Schlüssel, Inhalte, Postfach wie echte Klassen). Ersetzt den Pseudonym-Schüleraccount. Dazu: iPads laden sich sofort neu, wenn die Lehrkraft eine neuere ELONUKI-Version hat, auch mitten in der Stunde; Hinweis im Dashboard, solange iPads noch alt laufen
- Runde 4 (20.10.), im Test: Vokabellisten auch für andere Klassen (Häkchen beim Senden, Knopf „+ Klasse“ an bestehenden Listen), „Meine Klassen“ und Bibliothek als große Kacheln wie die Schulen-Ansicht im Admin (Bibliothek: Hochladen, Material, Archiv, Börse, Audio, Video), Klassenziel oben im Schüler-Dashboard mit Fortschritt, Reststernen und Elo
- Admin-Ansicht nach Schulen (20.10.), im Test: zuerst Schule wählen, dann Reiter Klassen (anlegen, Klassenleitung, Stundenplan, löschen; auch von Lehrkräften angelegte Klassen) und Kollegium (neu angemeldete Konten oben mit „Zu … holen“, Lehrkräfte der Schule mit Passwort-Link, Rolle, Klassen, Konto löschen; Kürzel). Push-Einrichtung nur noch eingeklappt, wenn noch kein Schlüssel hinterlegt ist
- Wer-fehlt-Nachtrag (20.10.), im Test: Glücksrad, Gruppen und „Kind drannehmen“ (Fußball) lassen als fehlend markierte Kinder aus
- Wochenrituale (20.10.), im Test: Verfassungsviertelstunde (15 Min, Muster Gesprächsrunde, Grundrecht der Woche, Aktuelles Thema) und Text der Woche (Muster Wochenplan 5 Tage, Tageseinheit, Lese- und Arbeitslotse) als Buttons über dem Stundenplan, je Woche planbar wie eine Stunde, eigenes Logo hochladbar, frühere Themen wiederverwenden
- Runde 3 (20.10.), im Test: Morgenstart mit Anwesenheit (Fehlende antippen, zählen nicht mit), Rakete startet nur auf Knopf der Lehrkraft, Liste „noch nicht bereit / nicht verbunden“, Nachzügler steigen direkt in die Folie ein, Verbindungsanzeige am iPad („Verbunden“ / „Kein WLAN“ mit Hilfe); Irregular Verbs: falsche Eingabe durchgestrichen mit richtiger Form, im Grammatikheft einmal richtig abschreiben
- Runde 2 (20.10.), im Test: Skizzenbuch-Vorlage für alle (Bild hochladen, Blatt „Produktdesign“ öffnet sich bei jedem Kind), Testmodus ohne Klasse, Zuschauer-iPad für die Prüfungskommission, Stundenwechsel mit Song und Countdown, Werkzeugkasten aufgeräumt (Phasenmuster beim Phase-Hinzufügen, ein Werkzeug „Hefteintrag“), Neue Stunde mit Fach-Gerüsten und eigenen Vorlagen, alle Fächer im Schreibtisch, Geometrie & Koordinatensystem (JSXGraph), Farbmischung nach Itten, Skizzen-Galerie an der Tafel, Grammatikheft (Irregular Verbs), klare Mikrofon-Meldung, Datensparen Teil 2 (Folienbilder als Dateien, Stunden-Sync nur Geänderte)
- Sammelrunde 20.10., im Test: abgelaufene Aufträge verschwinden bei den SuS, Übung und Hausaufgabe als ein „Auftrag“ (Frist optional) mit Abschließen/Weiter, Vokabeln per Foto/PDF einlesen, Skizzenbuch ohne Dauer-Auftrag, Stundenarchiv mit Export und Börse (Lehrkraft auswählen), Bibliothek mit Hochladen oben und Fächern als Zeilen, Schreibtisch Fach > Jahrgang > Lernmodule mit Bearbeiten und Freigabe pro Klasse, Sounds neu (Start nur einmal, Werkzeug-Start, Fehler-Ton), Knopf „Elo-Stimme prüfen“
- Sammelauftrag P4/P5 (19.10.), im Test: Bilder werden beim Hochladen automatisch verkleinert (höchstens 1600 Pixel, WebP, meist unter 300 KB), Hinweis bei Videos über 50 MB. Analysen: hq/analyse-speicher.md, analyse-kosten.md, analyse-code-privat.md, analyse-technik-vergleich.md; Backlog (Startfolien aller Fächer, Lehrpläne, Pilot Mathematik 7): hq/backlog.md
- Sammelauftrag P3 (19.10.), im Test: neues Werkzeug „Irregular Verbs“ (Liste mit Beispielverben, Wiederholung falscher Verben, eigene Listen speichern) und „Tabelle abfragen“ (Tabellen-Editor, Einfügen aus Excel, 8 zufällige Abfragen pro Runde, Richtung wählbar)
- Sammelauftrag 19.10. (P1 und P2), im Test: Stunde als .elonuki-Datei sichern und einspielen, Quiz-Reihenfolge an Tafel und iPads gleich (Seed), Skizzenbuch Zoom und Vollbild, Elo auf Folien 30 % kleiner, Vokabeltrainer Groß-/Kleinschreibung und Einsprechen, Memory-Paar-Editor, Schüleransicht ohne Emojis, Freeze nur auf Knopfdruck, Oswald für Elos Sprechblasen (Admin), Hefteinträge Kontrast und Block-Editor (Etappe 1)
- Runde 7a-Start (18.10.), im Test: Sitzplan pro Klasse auch im Konto gespeichert (auf jedem Gerät), Ordner pro Klasse ein- und ausblenden, Elo standardmäßig auf jeder Folie (aus pro Folie oder Stunde, Figur nach Fach aus assets/elo/figuren.json), Skizzen-Auftrag beenden mit Vorschau. Pläne: Stunde als Datei exportieren (.elonuki), neues Notizbuch statt Skizzenbuch (wartet auf Fabians Wahl)
- Datensparen Supabase (18.10., im Test): Heft und Inhalte nur noch bei Änderung im Live-Takt, iPad-Meldungen seltener und über einen Kanal, Klasseninhalt nur bei Änderung neu laden. Teil 2 in Runde 2 (Folienbilder in den Storage, Lehrer-Sync nur geänderte Stunden)
- Runde 1b Kritische Bugs (18.10.), im Test: „Kein Werkzeug“ löscht kein Werkzeug mehr, Werkzeug per Auswahl an jede Folie hängen (hoch); YouTube-Material lädt an der Tafel ohne Bibliothek, Dateien im Tafel-Fenster laden nach (hoch); Elo-Stimme mit 25-s-Limit, Abbrechen und ohne doppelte Bezahl-Aufrufe (mittel); klarere Foto-Meldung bei fehlender AWS-Marketplace-Freigabe, präziserer Bildprompt (mittel)
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
