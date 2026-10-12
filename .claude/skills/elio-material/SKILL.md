---
name: elio-material
description: Use when creating or upgrading ELIO teaching material (Hefteintrag, Arbeitsblatt, Folie, Übung) in any subject, so it follows the ELIO design standard.
---

# ELIO-Material erstellen

1. Lies zuerst `/mnt/project-files/elon/designstandard-material.md` (kurz). Er ist verbindlich.
2. Muster: `/mnt/project-files/elon/material/mathe7-1.4-rechengesetze/arbeitsblatt.html`. Aufbau, Farben und CSS-Klassen übernehmen.
3. Quellen: `/mnt/project-files/.notes/inputs.md` und vorhandene `*.digest.md`. Große PDF/DOCX nur gezielt (einzelne Seiten) öffnen.
4. Aufbau: Kopfband in Fachfarbe, Titel, max. 3 Regel-Blöcke, gelber Merke-Kasten, Falsch/Richtig-Kasten, Aufgaben in Stufen ●○○ / ●●○ / ●●●, Lösungen getrennt.
5. Abbildungen: nur selbst gezeichnetes SVG, nur wenn es etwas erklärt, Bildunterschrift als ganzer Satz. Keine Emojis, keine Clipart, keine fremden Bilder.
6. ELIO-Hefteinträge: Text in `assets/heft/<fach>.json`, Abbildung als Funktion in `FIGS` (app.html), im Eintrag `[Bild: name]`, `HEFT_V` erhöhen. Druck/PDF kommt automatisch über `heftDruck` in app.html.
7. Eigene Druckblätter: HTML mit Schriften aus `assets/fonts` (Baloo 2, Nunito), per Playwright als A4-PDF rendern, Seiten auf Überlauf prüfen, Vorschau-PNG ansehen.
8. Vor dem Abgeben den Skill `elio-pruefen` anwenden.
9. Ablage: `/mnt/project-files/elon/material/<fach><jgst>-<kapitel>-<thema>/`.
