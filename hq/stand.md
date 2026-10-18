# Stand ELONUKI (18.10.2026)

## Wo wir stehen
- Runde 1 der Bugfixes ist gemergt (PR #18): feste Folien-IDs, mehrere Werkzeuge pro Phase, sicherer Cloud-Sync, Cloud-Bibliothek.
- Tafel und iPads sind über Supabase live verbunden; die App läuft unter elio.schule.
- Blackbox erzeugt Texte und Animationen über AWS Claude.
- Runde 1b (18.10.) im Test: Werkzeuge pro Folie sicher, YouTube und Bibliothek an der Tafel, Elo-Stimme ohne Hängen, klare Foto-Meldung.
- HQ-Dashboard mit Stadt, Bugs, Systemen und Effizienz ist eingerichtet (PR #19).
- Runde 7a-Start (18.10.) im PR: Sitzplan pro Klasse auf jedem Gerät, Ordner pro Klasse freigeben, Elo-Stimme (CORS), Elo auf jeder Folie.

## Offene Probleme
- Blackbox-Bilder: AWS blockt Stability AI (403, Marketplace-Freigabe fehlt); Anleitung „Fotos“ ist anfängertauglich ergänzt.
- Elo-Stimme: Funktion „elo-stimme“ nach dem Merge neu deployen (CORS-Fix) und prüfen, ob ELEVEN_KEY als Secret gesetzt ist.
- bibliothek.sql in Supabase ausführen, sonst bleibt die Cloud-Bibliothek leer.
- PR #9 (PIN-Erkennung auf Schüler-iPads) ist noch Entwurf.

## Nächste 3 Schritte
1. Runde 1 auf iPad und Tafel testen, Fehler in hq/bugs.md eintragen.
2. AWS-Marketplace-Freigabe setzen und ELEVEN_KEY als Supabase-Secret eintragen.
3. Runde 2 Folieneditor starten.
