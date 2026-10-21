# Bug HQ

## Ziel
Jeder bekannte Fehler steht hier mit Fundort, bis er behoben und getestet ist.

## Status
gelb

## Fortschritt
70%

## Nächste 3 Schritte
- Runde 7a-Start (B-15 bis B-20) am Montag in 7a testen: Sitzplan, Ordner-Freigabe, Elo-Stimme nach neuem Deploy
- Runde 2 (B-10 bis B-13) auf iPads und Tafel testen, dann auf „erledigt“ setzen
- B-05 (PIN-Erkennung) mit PR #9 abschließen
- B-06 (Live-Kanal härten) nach dem Test von B-11 neu bewerten

## In Arbeit
- B-05, B-06
- B-10 bis B-13 im Test (Runde 2)
- B-15 bis B-20 im Test (Runde 7a-Start, 18.10.)

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
| B-15 | Sitzplan lag nur auf dem Gerät, auf dem er angelegt wurde; auf anderen Geräten fehlte er (wirkte, als gäbe es ihn nur für 7bG) | hoch | in Test | app.html Sitzplan (spSet, spCloudGet), jetzt auch im eigenen Konto |
| B-16 | Ordner (z. B. DaZ) ließen sich nicht pro Klasse freigeben; ältere Einträge ohne Klasse erschienen in jeder Klasse | hoch | in Test | app.html Schreibtisch (deskOn, heftFor, modPush) |
| B-17 | Folieneditor, Elo-Stimme: „Keine Verbindung zum Server“, weil die Funktion den Header x-client-info nicht erlaubte (CORS) | hoch | in Test | supabase/functions/elo-stimme, muss neu deployt werden |
| B-18 | Planung, „Hefteintrag zeigen“: Titel in der Auswahl im dunklen Modus unsichtbar, Kapitel dunkelblau auf dunkel | mittel | in Test | app.html .tp-h, .tp-ch |
| B-19 | Skizzen-Auftrag blieb nach „Stunde beenden“ in der Steuerung und als Hinweis auf den iPads | mittel | in Test | app.html l-stop, skzOff, skzSync |
| B-20 | Steuerungs-Kacheln (Timer, Abstimmung …) im dunklen Modus hellblau auf weiß | mittel | in Test | app.html .ct-b |
| B-21 | Quiz und Millionenspiel: Antworten standen an Tafel und iPads in verschiedener Reihenfolge | hoch | in Test | app.html akMix, jetzt gemeinsamer Seed pro Frage |
| B-22 | Skizzenbuch: Herauszoomen hängt die Ansicht, Schaltflächen nicht mehr bedienbar | hoch | in Test | assets/skizze/skizze.js Zoomgrenzen, Zoom-zurücksetzen-Knopf, Zwei-Finger-Doppeltipp |
| B-23 | Skizzenbuch: aus dem Vollbild kommt man nicht mehr heraus | hoch | in Test | assets/skizze/skizze.js Schließen-Knopf, Esc und Pfeiltaste |
| B-24 | Vokabeltrainer: Groß- und Kleinschreibung wurde ignoriert | mittel | in Test | app.html vokOk (strikt bei getippten Antworten) |
| B-25 | Vokabeltrainer: Einsprechen klappt nur beim ersten Wort | mittel | in Test | app.html srListen, vok-mic (Ursache nur vermutet, am iPad prüfen) |
| B-26 | Memory-Werkzeug: Paare konnten nicht eingegeben werden | mittel | in Test | app.html Werkzeug-Editor Memory |
| B-27 | Freeze war beim Anmelden der SuS die erste Ansicht | hoch | in Test | app.html initTeacher, onClassState |
| B-28 | Elos Sprechblasen wurden mit der Computerstimme statt Oswald vorgelesen | mittel | in Test | app.html eloSay, eloAuto |
| B-29 | Hefteinträge in der Lehrer-Ansicht: Schrift zu dunkel auf Knöpfen im dunklen Modus | mittel | in Test | app.html .page .btn |
| B-30 | Vorlesen in Arbeitsaufträgen: Oswald-Stimme kommt nicht, Meldung „Problem beim Server“ | hoch | in Test | supabase/functions/elo-stimme, app.html voCheck (Ursache vermutlich Einrichtung, Prüf-Knopf ergänzt) |
| B-31 | Futuristic-Sound kam bei vielen Tipps und nach Folienwechsel | mittel | in Test | app.html UIS, assets/sounds/ui/ui-sounds.json |
| B-32 | Hefteintrag, Übung, Hilfestation: Schrift im dunklen Modus zu dunkel | mittel | in Test | app.html .page Farb-Token |
| B-33 | Abgelaufene Erinnerungen und Übungsaufträge blieben auf dem Schüler-Dashboard | mittel | in Test | app.html aufLive, aufRemNow |
| B-34 | Neue Bilder (Tafel-Startbild, Freeze, Logos) erschienen nach dem Update nicht, alter Stand aus dem Zwischenspeicher; Logo fehlte auf dem Tafel-Startbild | hoch | in Test | app.html Bild-Versionen ?v=, .idle-lg |
| B-35 | Lehrkraft arbeitet am Admin/Planung, SuS der Klasse sehen live mit (kein Testmodus) | hoch | in Test | app.html testOn, Live.start (Testklasse nur auf dem Gerät) |
| B-36 | Im Lehrer-Schreibtisch fehlten Fächer ohne Lehrplan-Module | mittel | in Test | app.html VIEWS.tdesk, DESK_SUBJ |
| B-37 | Werkbetrachtung: Bild im Tafel-Fenster kam nicht immer, weil der Tafel-Abgleich es nicht beachtete | niedrig | in Test | app.html boardSig (skzShow, skzGal, wechsel) |
| B-38 | Mikrofon verweigert: nur „nicht erlaubt“ ohne Hilfe, Aufnahme klappt nicht bei allen SuS | mittel | in Test | app.html micErr, MIC_NO (Ursache am iPad: Safari-Freigabe) |
| B-39 | Rakete startete zu früh, sobald alle gerade verbundenen iPads bereit waren (Fehlende und Nachzügler zählten nicht) | hoch | in Test | app.html rdGo, expN, absList |
| B-40 | Irregular Verbs: bei falscher Eingabe war die Korrektur zu unauffällig | mittel | in Test | app.html gramQuiz, AKT.irreg |
| B-41 | Nach dem Entfernen der Emojis waren Knöpfe leer: SuS-Seitenleiste (Tafel, Hilfe, Bereit), „Problem melden“ unten links, Vorlesen, Planung, Werkzeuge | hoch | in Test | app.html ico(), ICO_SVG, updRail, #tk-fab |
| B-35 | Elo-Stimme: „Keine Verbindung“ nach dem Neu-Deployen; App zeigt jetzt per Test die genaue Ursache (vermutet: JWT-Prüfung im Dashboard an) | hoch | in Test | app.html voProbe, supabase/functions/elo-stimme |
| B-42 | Schüler-iPads blieben während einer laufenden Stunde auf altem Code, obwohl die Lehrkraft schon die neue Version hatte | hoch | in Test | app.html verChk, pushCS (bv) |
| B-43 | E-Mail-Feld im Lehrer-Login hatte keine Gestaltung (kleines graues Kästchen) | niedrig | in Test | app.html CSS input[type=email] |
| B-44 | Stunde starten im Testmodus wechselte still in die echte Klasse; der Tester-Schüler bekam nichts | hoch | in Test | app.html Stunde starten (testOn-Prüfung) |
| B-45 | Freigestellte Bilder zeigten in der Folie noch Rahmen/Schatten und leere Ränder | mittel | in Test | app.html slBgRemove, .sl-imc.nb |
| B-46 | Textfeld löschen leerte nur den Inhalt, das Feld blieb | mittel | in Test | app.html slElDel (noT/noB) |
| B-47 | Testmodus blieb auf dem Gerät hängen (alter gespeicherter Test-Code), „Test“ tat nichts; Tester-iPad bekam kein Signal | hoch | in Test | app.html testEnter |
| B-50 | Vokabeltrainer in der Stunde zeigte den SuS nur die 6 Beispielwörter statt des eigenen Vokabelhefts; keine Wahl zwischen vorgegebenen Wörtern und Heft | hoch | in Test | app.html AKT.vok, toolEditor, toolDefaults |
| B-48 | Skizzenphase: SuS sahen nur die Tafel-Folie, das Skizzenbuch mit Auftrag und Vorlage ging nicht auf | hoch | in Test | app.html liveOverlay (Skizzenphase), .lov über Skizzenbuch |
| B-49 | Weltkugel-Startfolie: Lehrer-Vorschau zeigte die Erdkugel still, und mit Stimmungswörtern rutschte „Welcome to English class“ auf die Kugel | mittel | in Test | app.html updPrev, .st-geo.has-cw |
