# Kostenaufstellung externer Dienste (Stand 19.10.2026)

Rahmen von Fabian: Claude 20 € pro Monat, zusätzlich höchstens 30 € pro Monat, und nur, wenn ein Weg besteht, mit ELONUKI Geld zu verdienen.

**Wichtig zu den Preisen:** Die Preisseiten (supabase.com, elevenlabs.io, docs.github.com) waren aus dieser Sitzung nicht abrufbar. Die Zahlen unten stammen aus Suchergebnissen (Quelle und Datum je Zeile) und stimmen zwischen den Quellen nicht immer überein. Nur die GitHub-Preise habe ich direkt auf github.com/pricing gelesen. **Vor jeder Bestellung die Preisseite selbst öffnen.** Preise in Dollar sind nicht umgerechnet.

## Gefundene Dienste im Code
Geprüft: app.html, index.html, sw.js, supabase/functions, CNAME, hq/systeme.md.

| Dienst | Wofür | Preis heute | muss / kann |
|---|---|---|---|
| Supabase | Anmeldung, Live-Kanal Tafel und iPads, Cloud-Stunden, Cloud-Bibliothek, Funktionen | Free: 0 $; 500 MB Datenbank, 5 GB Datenverbrauch (Egress), 50.000 aktive Nutzer, Projekt pausiert nach 7 Tagen Inaktivität. Pro: 25 $ pro Organisation und Monat (inkl. 10 $ Rechenguthaben). Quelle: [supabase.com/pricing.md](https://supabase.com/pricing.md) laut Suche, 19.10.2026; Pro-Kontingente in den Quellen widersprüchlich | **muss**. Free reicht für eine Klasse. Pro erst bei mehreren Klassen/Schulen oder wenn das Pausieren stört |
| GitHub (Code) | Code, PRs, Auslieferung | Free: 0 $, unbegrenzt öffentliche und private Repos. Team: 4 $ pro Nutzer und Monat für die ersten 12 Monate (Aktionspreis). Quelle: [github.com/pricing](https://github.com/pricing), direkt gelesen am 19.10.2026 | **muss** |
| GitHub Pages | Webseite elio.schule | Im Free-Konto nur für öffentliche Repos; für private Repos Pro/Team nötig (Quelle: GitHub-Community-Diskussion und Blogs, nicht die offizielle Doku, 19.10.2026) | **muss** (Auslieferung), Ersatz möglich |
| Domain elio.schule | Adresse der App (Datei CNAME) | .schule: Verlängerung ca. 19 bis 50 € pro Jahr je nach Anbieter (Gandi 50 €, günstigster Anbieter laut Aggregator ca. 19 $), Quelle: [gandi.net](https://www.gandi.net/en/domain/tld/schule) und [domainoffer.net](https://domainoffer.net/tld/schule?page=1), Suche 19.10.2026. Was du wirklich zahlst, weiß ich nicht (Rechnung ansehen) | **muss** solange die Adresse gilt; „ELONUKI“-Domain später, vor Einnahmen |
| AWS Bedrock (Claude) | Blackbox: Texte, Übungen, Animationen (Frankfurt) | nach Verbrauch. Aggregatoren nennen für Claude Sonnet 5 (EU) 2,20 $ pro Million Eingabe-Token und 11 $ pro Million Ausgabe-Token; kein AWS-Preis gelesen. Quelle: [requesty.ai](https://www.requesty.ai/models-new/bedrock/claude-sonnet-5-eu-central-1), 19.10.2026. HQ schätzt ca. 10 € pro Monat | **kann** (nur Admin, Tageslimit) |
| AWS Stability AI (Bilder) | Blackbox-Bilder | derzeit gesperrt (403, Marketplace-Freigabe fehlt), ca. 2 € geschätzt | **kann**, nicht nutzbar |
| ElevenLabs | Elos Stimme „Oswald“ (Edge Function elo-stimme), Hörtexte | Free: 10.000 Zeichen pro Monat, **ohne** Nutzung für Geld. Starter ca. 5 bis 6 $ pro Monat (30.000 Credits, Gewerbelizenz), Creator ca. 22 $ (100.000 bis 121.000 Credits), Pro ca. 99 $. Quelle: Vergleichsseiten wie [smallest.ai](https://smallest.ai/blog/elevenlabs-pricing-plans-cost-what-you-get-in-2026), 19.10.2026; Zahlen widersprechen sich | **kann**. Feste Elo-Sätze sind schon als MP3 im Repo; es kostet nur beim Erzeugen neuer Sätze |
| Web Push | Erinnerungen an iPads (VAPID, Funktion elio-push) | kein Anbieterpreis (Apple/Browser-Dienste), 0 € | **kann** |
| YouTube (nocookie), Vimeo, LearningApps | eingebettete Videos/Übungen in Stunden | 0 €, Inhalte Dritter, Datenschutz prüfen | **kann** |
| esm.sh (CDN) | lädt die Supabase-Bibliothek in den Browser | 0 € | **muss** technisch; Risiko: Abhängigkeit von einem Fremd-Server, später selbst hosten |
| Claude (Abo) | Programmieren und Betrieb dieser Threads | 20 € pro Monat laut Fabian | **muss** für die Entwicklung |
| Schriften | selbst gehostet (assets/fonts) | 0 € | – |

Nicht gefunden im Code: Netlify, eigener Server, E-Mail-Dienst, Zahlungsdienst, Analytics. Falls du Netlify o. Ä. nutzt, steht es nicht im Repo.

## Was den Verbrauch treibt
- **Supabase:** Datenverbrauch (Egress) durch Live-Kanal und das Nachladen der Klasseninhalte (Analyse und Gegenmaßnahmen: elon/egress-analyse.md, B-14), Dateispeicher (Bibliothek), Datenbankgröße (Bilder für iPads).
- **ElevenLabs:** Zeichen. Ein Satz von 100 Zeichen kostet 100 Credits, das erneute Erzeugen kostet nochmal; die App merkt sich erzeugte Sätze (ab dieser Runde auch beim automatischen Erzeugen).
- **Bedrock:** Token pro Anfrage. Tageslimit und Admin-Beschränkung deckeln das.
- **Domain:** feste Jahresgebühr.

## Mein Vorschlag zum Rahmen (20 € + höchstens 30 €)
- Heute: nur Claude (20 €), Supabase Free, GitHub Free, ElevenLabs Free oder Starter nur wenn nötig. Dazu Domain und Bedrock (ca. 10 € geschätzt) → die 30 € sind knapp im Rahmen, **ohne** Pro-Tarife.
- Pro-Tarife (Supabase 25 $, GitHub Pro/Team ca. 4 $, ElevenLabs Starter ca. 6 $) zusammen ca. 35 $ passen **nicht** mehr in 30 €. Erst buchen, wenn Einnahmen belegt sind.
- Einnahmen: Marktrecherche liegt in hq/kommerz.md. Ohne zahlende Kunden (z. B. Lizenz für eine zweite Schule) bleibt es beim Free-Stack.
