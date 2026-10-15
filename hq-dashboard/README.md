# ELONUKI HQ

Internes Dashboard als isometrische Stadt. Getrennt von der Schüler-App, ruft keine KI auf.

- **Daten:** `/hq/*.md`, GitHub über die `gh` CLI, lokale Claude-Code-Protokolle (nur lesen).
- **Lokal starten:** `.env.example` nach `.env` kopieren, Passwort setzen, dann im Repo-Ordner `node hq-dashboard/server.js` und http://localhost:4747 öffnen.
- **Schnappschuss:** `node hq-dashboard/build.js` schreibt `hq-dashboard/dist/elonuki-hq.html` (nicht eingecheckt).

Hinweis: GitHub Pages liefert alle Dateien des Repos aus. Ohne Server zeigt `hq-dashboard/index.html` dort nur eine Fehlermeldung, aber keine Daten.
