# Eigene Werkzeuge für ELONUKI bauen

Für Lehrkräfte, die eigene Werkzeuge (Tafelspiele, Übungen, Simulationen) als **eine HTML-Datei** bauen, z. B. mit einer KI.
Die Vorlage dazu ist [`vorlage.html`](vorlage.html). Sie ist gleichzeitig das Beispielwerkzeug „Preis-Check“ in ELONUKI.

## 1. So läuft ein Werkzeug in ELONUKI

- Dein Werkzeug läuft an der Tafel in einem **Schutzkasten**. Es sieht kein Konto, keine Namen und kein Internet.
- Es spricht mit ELONUKI nur über die **Brücke**: `elonuki.senden(typ, daten)` und `elonuki.wenn(typ, funktion)`.
- Vor der ersten Freigabe durch den Admin läuft es nur bei dir in der Vorschau und in deiner Testklasse.
  Danach bei allen Lehrkräften deiner Schule. Spätere Änderungen gehen direkt live.

## 2. Pflichtregeln

1. **Eine einzige Datei.** Bilder als `data:`-Adresse oder als SVG direkt in der Datei.
2. **Nichts aus dem Internet.** Keine fremden Bibliotheken, Schriften, Bilder, keine Links nach außen. Das wird ohnehin blockiert.
   Erlaubt sind nur ELONUKI-Schriften und ELONUKI-Figuren (siehe unten).
3. **Kein Speichern auf dem Gerät** (`localStorage`, Cookies, IndexedDB). Dafür gibt es `speichern` und `laden` über die Brücke.
4. **Keine Namen abfragen.** Die SuS sind „du“.
5. **Nicht wegnavigieren**, keine Fenster öffnen. Sonst hält ELONUKI das Werkzeug an.
6. **Kopfzeile** im `<head>`:
   ```html
   <meta name="elonuki-tool" content='{"name":"Preis-Check","fach":"W","phase":"uebung","version":"1.0","autor":"KÜRZEL","ipad":false,"namen":false}'>
   ```
   Fachkürzel wie in ELONUKI: M Mathe, E Englisch, D Deutsch, K Kunst, W Wirtschaft und Beruf, WK Wirtschaft und Kommunikation, G GPG, N Natur und Technik, I Informatik.
   Phase: `start`, `einstieg`, `erarbeitung`, `uebung`, `sicherung`, `abschluss`.

## 3. Design: so sieht ein ELONUKI-Werkzeug aus

Damit alle Werkzeuge wie aus einem Guss wirken (gilt auch für alles Material, siehe Designstandard):

- **Keine Emojis**, keine Clipart, keine Stockfotos. Symbole nur als einfaches SVG (Strichstärke 2, runde Ecken, `currentColor`).
- **Farben** kommen beim Start von ELONUKI (`start.farben`) und passen dann auch im Dunkelmodus. Rückfallwerte:

  | Rolle | Variable | Farbe |
  |---|---|---|
  | Hintergrund | `--bg` | `#eef1f8` |
  | Fläche (Karten) | `--surface` | `#ffffff` |
  | Text | `--ink` | `#18203d` |
  | Grau (Hinweise) | `--muted` | `#586082` |
  | Linien | `--line` | `#d8ddee` |
  | Kopfband, Akzent | `--navy` | `#26337a` |
  | Knopf „Weiter/Los“ | `--yellow` | `#f2b51d` |
  | Richtig | `--green` | `#177a4e` |
  | Falsch, Wichtiges | `--red` | `#cf3a2c` |
  | Neu / verschoben | `--orange` | `#e8743b` |

  Farbe ist nie allein: „Richtig“ und „Falsch“ stehen immer auch als Wort da.
- **Schrift:** Überschriften `var(--elo-display)` (Baloo 2, fett), Text `var(--elo-text)` (Nunito). ELONUKI stellt beide bereit.
- **Tafelgröße:** Grundschrift mit `clamp(16px, 2.4vw, 30px)`, Knöpfe mindestens 48 px hoch, viel Abstand. Muss an der Tafel per Touch
  und auf dem iPad hochkant und quer gehen. Keine Hover-Effekte als einzige Rückmeldung.
- **Aufbau:** oben ein Kopfband in `--navy` mit Titel und Stand (z. B. „Aufgabe 2 / 5“), darunter ein klarer Arbeitsbereich, ein Gedanke pro Bildschirm.
- **Sprache:** Du-Form, kurze Sätze (höchstens 12 Wörter), Fachwort fett und mit Alltagswort erklärt, Alltagskontexte der Klasse.
- **Leitfigur** (Elo oder die Figur deines Fachs) sparsam, höchstens als Tipp-Geber, nie als Deko.

## 4. Die Leitfigur: Elo oder deine eigene

Jedes Fach hat eine Leitfigur. Standard ist die Eule **Elo**, in Wirtschaft z. B. „Elo als Banker“.
ELONUKI gibt beim Start die Figur des Fachs mit: `start.figur = { id, name, bild }`. `bild` ist eine fertige Bildadresse, die im Schutzkasten erlaubt ist:

```js
elonuki.wenn('start', function (s) {
  if (s.figur) document.querySelector('#figur').src = s.figur.bild;
});
```

Für eigene Fächer kann es eine **eigene Leitfigur** geben (Vorschlag: **Nuki**, Eisbär oder Fuchs). Sobald sie eingetragen ist,
bekommen deine Werkzeuge automatisch sie statt Elo, ohne dass du etwas ändern musst. Wie eine Figur entsteht, steht in `assets/elo/figuren.json`
(Bild 512 × 512 Pixel, freigestellt, Figur steht unten auf dem Rand).

## 5. Die Brücke

| Richtung | Typ | Daten | Bedeutung |
|---|---|---|---|
| ELONUKI → Werkzeug | `start` | `{ rolle, fach, sprache, einstellungen, farben, figur, basis, plaetze, version, freigegeben }` | Los geht's. `einstellungen` ist der Text, den die Lehrkraft in der Planung einträgt. `plaetze` = Anzahl SuS. |
| Werkzeug → ELONUKI | `ton` | `{ name }` | ELONUKI-Ton: `richtig`, `falsch`, `fertig`, `jubel`, `wechsel`, `an` |
| Werkzeug → ELONUKI | `elo` | `{ text }` | Kurzer Hinweis von ELONUKI (höchstens 160 Zeichen) |
| Werkzeug → ELONUKI | `speichern` | beliebige kleine Daten | Zwischenstand merken (nur auf diesem Gerät, höchstens 8 KB). Antwort: `gespeichert` |
| Werkzeug → ELONUKI | `laden` | – | Gemerkten Stand holen. Antwort: `geladen` mit den Daten oder `null` |
| Werkzeug → ELONUKI | `fertig` | z. B. `{ punkte }` | Werkzeug ist abgeschlossen |
| ELONUKI → Werkzeug | `hinweis` | Text | Etwas geht (noch) nicht |

**Kommt in der nächsten Stufe (iPads):** `an_ipads`, `an_ipad` (`{ nr, daten }`), `an_gruppe` (`{ gruppe, daten }`), `an_tafel`, `ergebnis`.
Die SuS haben dann Platznummern und Gruppen, keine Namen. Vornamen gibt es nur, wenn der Admin das bei der Freigabe ausdrücklich erlaubt.

Grenzen: Jede Nachricht höchstens 8 KB, höchstens 20 Nachrichten pro Sekunde. Mehr wird verworfen.

## 6. Ausprobieren ohne ELONUKI

`vorlage.html` lässt sich auch direkt im Browser öffnen. Sie tut dann so, als käme ein `start` von ELONUKI.

## 6b. Hochladen, testen, einreichen

1. **Werkzeugkasten → Eigene Werkzeuge der Schule → Werkzeug hochladen (.html)**. Das geht, sobald der Admin dich zum Co-Autor gemacht hat.
2. ELONUKI liest Name und Fach aus der Kopfzeile und zeigt, was ihm auffällt (z. B. Internet, Emojis). Du kannst trotzdem speichern.
3. **Ansehen** startet es sofort in der Vorschau. In einer Stunde wählst du das Werkzeug „Eigenes Werkzeug“ und darin deins. Vor der Freigabe läuft es nur in deiner Testklasse (Knopf „Test“).
4. **Einreichen**: Der Admin prüft es einmal und gibt es frei. Danach sieht es deine ganze Schule.
5. **Neue Version**: einfach die geänderte Datei hochladen. Nach der Freigabe geht sie sofort live.

## 7. Prompt-Vorlage für deine KI

Hänge `vorlage.html` und dieses Handbuch an und schreibe:

> Baue mir ein Unterrichtswerkzeug für ELONUKI als **eine einzige HTML-Datei**.
> Fach: [z. B. Wirtschaft und Beruf], Klasse [7], Thema: [z. B. Preise vergleichen].
> Was es tun soll: [2 bis 4 Sätze: Was passiert an der Tafel? Was tun die SuS?].
>
> Halte dich streng an das angehängte HANDBUCH.md:
> 1. Nimm `vorlage.html` als Grundlage und ändere nur die Teile zwischen INHALT ANFANG und INHALT ENDE sowie die Kopfzeile `<meta name="elonuki-tool">`.
> 2. Design nach Abschnitt 3: keine Emojis, Farben über die CSS-Variablen, Schriften `var(--elo-display)` und `var(--elo-text)`, große Touch-Knöpfe, Kopfband in `--navy`, Richtig/Falsch auch als Wort.
> 3. Nichts aus dem Internet, keine fremden Bibliotheken. Bilder als SVG in der Datei.
> 4. Kein localStorage, keine Cookies, kein fetch, kein eval. Mit ELONUKI nur über `elonuki.senden` und `elonuki.wenn`.
> 5. Frage nie nach Namen. Du-Form, kurze Sätze.
> 6. Leitfigur nur über `start.figur.bild`, höchstens als Tipp-Geber.
> 7. Gib mir am Ende die komplette Datei in einem Stück aus, ohne Auslassungen.

**Ein vorhandenes Werkzeug anpassen:** gleiche Anhänge, dazu deine Datei, und schreibe:
„Passe dieses Werkzeug an das ELONUKI-Handbuch an (Abschnitt 2 und 3), ohne die Funktion zu ändern. Baue es dafür in die Vorlage ein.“
