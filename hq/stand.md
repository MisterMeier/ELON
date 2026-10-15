# Stand ELONUKI (15.10.2026)

## Wo wir stehen
- Runde 1 der Bugfixes ist gemergt (PR #18): feste Folien-IDs, mehrere Werkzeuge pro Phase, sicherer Cloud-Sync, Cloud-Bibliothek.
- Tafel und iPads sind über Supabase live verbunden; die App läuft unter elio.schule.
- Blackbox erzeugt Texte und Animationen über AWS Claude.
- HQ-Dashboard mit Stadt, Bugs, Systemen und Effizienz ist eingerichtet (PR #19).

## Offene Probleme
- Blackbox-Bilder: AWS blockt Stability AI (403, Marketplace-Freigabe fehlt).
- Elo-Stimme über ElevenLabs: Schlüssel ELEVEN_KEY ist noch nicht gesetzt.
- bibliothek.sql in Supabase ausführen, sonst bleibt die Cloud-Bibliothek leer.
- PR #9 (PIN-Erkennung auf Schüler-iPads) ist noch Entwurf.

## Nächste 3 Schritte
1. Runde 1 auf iPad und Tafel testen, Fehler in hq/bugs.md eintragen.
2. AWS-Marketplace-Freigabe setzen und ELEVEN_KEY als Supabase-Secret eintragen.
3. Runde 2 Folieneditor starten.
