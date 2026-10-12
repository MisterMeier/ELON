---
name: elio-digest
description: Use when a large PDF, DOCX or PPTX is uploaded or needed as a source: turn it once into a compact Markdown digest so later work never re-reads the big file.
---

# Große Dateien einmal zusammenfassen

1. Prüfe `/mnt/project-files/.notes/inputs.md` und ob neben der Datei schon `<name>.digest.md` liegt. Wenn ja: nur den Digest benutzen.
2. Sonst nur den Text extrahieren, ohne Bilder: PDF mit `pdftotext -layout`, DOCX mit `pandoc -t plain` oder python-docx, PPTX mit python-pptx. Bilder nur ansehen, wenn eine einzelne Abbildung ausdrücklich gebraucht wird.
3. Schreibe `<name>.digest.md` neben die Datei, höchstens etwa 2 Seiten: Gliederung, Kernaussagen, Definitionen, typische Schülerfehler, Seitenangaben für Details.
4. Trage die Datei in `/mnt/project-files/.notes/inputs.md` ein (Pfad, Größe, Format, 3 bis 5 Zeilen Inhalt, Verweis auf den Digest).
5. Danach nur noch den Digest lesen; die Originaldatei nur für eine konkrete Seite öffnen.
