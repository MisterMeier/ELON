# Analyse: Repo privat und Code sichtbar (Stand 19.10.2026)

## Kurzantwort
- Das Repo `MisterMeier/ELON` ist **öffentlich** (GitHub-Abfrage vom 19.10.2026: `private: false`, Pages aktiv).
- Im Repo liegt nur der öffentliche Supabase-Schlüssel (`sb_publishable_…`). Der ist für den Browser gedacht, keine Geheimnisse gefunden.
- Der Frontend-Code (`app.html`) ist **immer** für jeden im Browser lesbar (Rechtsklick, Quelltext), auch bei privatem Repo. Privat schützt nur Verlauf, Notizen und Skripte im Repo.
- Entscheidend ist das Backend: Zugriffsregeln (RLS) in Supabase, geheime Schlüssel nur in Edge Functions.

## Option A: Repo privat machen
- Kosten: GitHub Pages aus privaten Repos braucht einen bezahlten Plan (Pro ca. 4 $/Monat, Quelle: github.com/pricing, Stand der Abfrage 19.10.2026, bitte vor Buchung prüfen).
- Domain elio.schule und CNAME bleiben; Pages-Einstellung muss danach neu geprüft werden.
- Klicks (Fabian): GitHub > Settings > Pro-Plan buchen > Repo > Settings > unten „Change visibility“ > Private > danach Settings > Pages prüfen, dass die Seite weiter erscheint.
- Risiko: Kurze Pages-Pause möglich. Vorher ein Backup (Download als ZIP).

## Option B: Repo öffentlich lassen (aktuell)
- Gratis. Voraussetzung: nie Schlüssel, Schülerdaten oder Sicherheitsdetails ins Repo.
- Der Verlauf bleibt öffentlich lesbar; was einmal drin war, gilt als bekannt.

## Option C: Hosting wechseln (später)
- Z. B. Cloudflare Pages oder Netlify mit privatem Repo (Preise dort vor Entscheidung prüfen).
- Sinnvoll erst, wenn Einnahmen da sind.

## Was den Code wirklich schützt
1. RLS in Supabase auf allen Tabellen (Schüler sehen nur eigene Klasse/Daten), regelmäßig prüfen.
2. Geheime Schlüssel (Bedrock, ElevenLabs, Stability) nur als Edge-Function-Secrets, nie im Frontend.
3. Verschlüsselte Schülerdaten und Bilder bleiben, was sie sind.
4. Kein Schutz durch „Verstecken“: Wer die App kopiert, bekommt nur die Oberfläche, keine Daten.
5. Später für den Verkauf: Lizenz/Nutzungsbedingungen, Marke (siehe `kommerz.md`), ggf. Code minimieren.

## Empfehlung
Jetzt Option B beibehalten, Backend-Prüfung (Punkt 1+2) regelmäßig. GitHub Pro und privat erst kurz vor dem ersten Verkauf.
