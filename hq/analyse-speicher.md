# Analyse Speicher (Stand 19.10.2026)

Frage von Fabian (P4, Punkt 13): Wo liegen Bilder, Videos, Audio und PDFs wirklich, und wo sind die Grenzen?

## Wo liegt was (aus dem Code geprüft)
| Was | Wo | Code |
|---|---|---|
| Bibliothek der Lehrkraft (Bilder, PDFs, Audio, Video) | Browser des Geräts, IndexedDB „elio-lib“ (Tabellen meta und blob) | `libOpen`, `idb`, `libAddFiles` in app.html |
| Kopie der Bibliothek | Supabase Storage, privater Bucket „lib“, Ordner = Nutzer-ID, höchstens 50 MB pro Datei; Meta in Tabelle `teacher_lib` | `lcUp`, `libCloudSync`, supabase/bibliothek.sql |
| Verlags-Audio und -Video (`lic:'verlag'`) | nur auf dem Gerät, wird nicht hochgeladen (Lizenz) | `libCloudSync` |
| Bilder für die iPads der Klasse | Supabase-Tabelle `class_media`, verschlüsselt mit dem Klassenschlüssel, eine Zeile pro Bild (unter 3,5 MB, Bild nach Verschlüsselung höchstens 2,5 MB) | `mediaPush`, `mediaGet`, supabase/media.sql |
| Videos, Audio, PDFs an der Tafel | nur vom Gerät der Lehrkraft (oder aus der Cloud-Kopie), nicht an die iPads verteilt | `class_media` nimmt nur Bilder |
| Stunden, Hefteinträge, Sitzplan | Browser (localStorage, verschlüsselt) plus Cloud-Sync der Stunden | `tsave`, Tabellen `lessons`, `class_content` |
| Skizzenbuch der Kinder | IndexedDB „elio-skizze“ auf dem iPad; Abgaben verschlüsselt an die Lehrkraft | assets/skizze/skizze.js |

Es ist also beides: Browser-Speicher auf dem Gerät **und** Supabase. Der Browser ist die Hauptkopie, Supabase die Sicherung und der Weg zu anderen Geräten.

## Reale Grenzen (Safari/iPad)
Quelle: [WebKit „Updates to Storage Policy“](https://webkit.org/?p=14403), gesucht am 19.10.2026. In dieser Sitzung konnte ich die Seite nicht selbst öffnen, nur den Suchauszug lesen.
- Seit Safari 17 / iPadOS 17 darf eine Website in Safari bis zu 60 % des Speichers des Geräts belegen. Eingebettete Web-Ansichten bekommen bis 15 %. Ein Eintrag „zum Home-Bildschirm“ soll dieselbe Grenze wie Safari haben (nur aus einer Zweitquelle).
- Nicht belegt, aber bekannt aus der Praxis (bitte am iPad prüfen): localStorage etwa 5 MB pro Adresse; Safari kann Website-Daten löschen, wenn man sie lange nicht benutzt oder „Verlauf und Website-Daten löschen“ drückt. Die App fragt deshalb `navigator.storage.persist()` an.
- Die Adresse zählt: Wechselt die Adresse (z. B. Umzug auf elio.schule), ist der Browser-Speicher leer. Deshalb gibt es die Cloud-Bibliothek.
- Offline-Cache (Service Worker `sw.js`) lädt die Dateien aus `assets/offline.json` ohne Videos vor.

## Was passiert bei großen Dateien (Zustand vor und nach dieser Runde)
**Bild mit 3–4 MB**
- Vorher: Bibliothek speicherte das Original (3–4 MB) im Browser und lud es unverändert in die Cloud (Limit 50 MB). Für die iPads wurde es in `mediaPush` auf höchstens 1600 px als WebP verkleinert (meist 150–400 KB), das klappte also.
- Nachher (neu in dieser Runde): Schon beim Hochladen in die Bibliothek und beim Bild in der Folie wird verkleinert: längste Seite höchstens 1600 px, WebP (altes Safari: JPEG, bei PNG mit Transparenz PNG), Ziel unter 300 KB, nie größer als das Original. Die Meldung sagt „x Bilder wurden automatisch verkleinert“. Test: ein 4000 × 3000 Pixel großes JPEG mit 1,2 MB wurde zu 240 KB.
- Ausnahme: SVG und GIF bleiben unverändert.

**Video mit 15 MB**
- Wird als Original im Browser gespeichert (Grenze beim Hinzufügen: 100 MB in der Bibliothek, 300 MB im Folieneditor).
- Videos aus dem Unterricht sind als `lic:'verlag'` markiert und gehen **nicht** in die Cloud. Sie liegen nur auf dem Gerät. Gerätewechsel, gelöschte Website-Daten oder eine neue Adresse bedeuten: Video weg, wieder hochladen.
- Die iPads bekommen keine Videos. Das Video läuft nur an der Tafel (Gerät der Lehrkraft).
- Neu: Über 50 MB kommt ein Hinweis („bleibt nur auf diesem Gerät“).
- Eigene Videos ohne Verlagsrechte werden nicht anders behandelt, weil die App Audio und Video immer als Verlagsmaterial markiert. Das ist sicher, aber heißt: kein Cloud-Backup für Videos.

## Schätzwerte (Annahmen: 30 SuS, 3 Fächer, ca. 100 Stunden pro Fach und Jahr)
- Bilder pro Stunde 5 bis 10, nach Verkleinerung je 250 KB → 1,2 bis 2,5 MB pro Stunde → 120 bis 250 MB pro Fach und Jahr, 0,4 bis 0,8 GB bei drei Fächern. Ohne Verkleinerung (3 MB pro Bild) wären es etwa das Zehnfache.
- PDFs und Arbeitsblätter: 0,2 bis 2 MB pro Datei, 100 Dateien pro Fach → bis 200 MB.
- Videos: 10 bis 30 Stück à 15 MB → 150 bis 450 MB pro Fach, nur Gerät.
- Für die iPads: pro Klasse nur die Bilder der laufenden Stunden. 300 Bilder × 250 KB × 1,33 (Verschlüsselung und Base64) ≈ 100 MB in `class_media`. Jedes iPad lädt jedes Bild einmal (30 × 250 KB ≈ 8 MB pro Bildsatz).
- Supabase Free: 500 MB Datenbank, 1 GB Dateispeicher, 5 GB Datenverbrauch pro Monat ([supabase.com/pricing.md](https://supabase.com/pricing.md), über Suche am 19.10.2026, nicht auf der Seite selbst gelesen). Die Klassen-Bilder (Datenbank) werden bei mehreren Klassen und Fächern der Engpass, nicht die Cloud-Bibliothek.

## Empfehlung
1. Bilder verkleinern beim Hochladen: **umgesetzt** (Bibliothek und Folien-Bild; Hefteintrag-Fotos und Sitzplan-Fotos waren schon verkleinert).
2. Video-Hinweis über 50 MB: **umgesetzt**. Nächster kleiner Schritt (nicht gebaut): bei Videos über 100 MB „Bitte kürzen“ schon vor dem Speichern.
3. Nicht gebaut: PDFs verkleinern (Aufwand hoch, braucht eine Bibliothek). Erst bei Bedarf.
4. Sicherung: Die Funktion „Stunde als .elonuki sichern“ packt Bilder mit ein (Verlagsmedien nicht). Einmal pro Monat sichern.
5. Zu messen (am iPad, 5 Minuten): wie viel Speicher die App belegt (Einstellungen → Safari / App-Speicher) und ob localStorage mit vielen Stunden an die Grenze stößt.
