# Systeme

Kosten sind Schätzungen pro Monat; „?“ = noch unbekannt. Gebäude: Baumeister, Bug HQ, Design, Sicherheit & Recht, Kommerz, Kommandozentrale, Effizienz-Behörde.

## Dienste
| Name | Zweck | Status | Kosten pro Monat | Hauptgebäude |
|---|---|---|---|---|
| Supabase | Login, Live-Kanal Tafel ↔ iPads, Cloud-Sync, Bibliothek, Edge Functions | verbunden | 0 € (Free) | Sicherheit & Recht |
| AWS Claude | Blackbox: Texte, Übungen und SVG-Animationen (Bedrock Frankfurt) | verbunden | ca. 10 € | Baumeister |
| AWS Stability AI | Blackbox: Fotos und Bilder (Bedrock us-west-2) | nicht nutzbar | ca. 2 € | Design |
| ElevenLabs | Elo-Stimme und Hörtexte; keine Bilder in der App | geplant | ? | Baumeister |
| GitHub & Pages | Code, PRs und Auslieferung der App unter elio.schule | verbunden | 0 € | Kommandozentrale |
| Claude Code | Programmieren und Pflege des HQ in den Projekt-Threads | verbunden | ? (Claude-Abo) | Effizienz-Behörde |

## Verbindungen
| Von | Nach | Zweck | Status | Grund | Letzte Aktivität |
|---|---|---|---|---|---|
| ELONUKI-App | Supabase | Live-Kanal, Cloud-Sync, Cloud-Bibliothek | aktiv | | 2026-10-14 |
| Supabase | AWS Claude | Blackbox-Texte und Animationen | aktiv | | 2026-10-14 |
| Supabase | AWS Stability AI | Blackbox-Bilder | geblockt | AWS antwortet mit 403: Dem Bedrock-Schlüssel fehlt die Marketplace-Freigabe für Stability AI. Schritt in der AWS-Konsole steht in elon/anleitungen/bedrock-einrichten.md (Abschnitt Fotos). | 2026-10-14 |
| ELONUKI-App | ElevenLabs | Bildgenerierung | geblockt | ElevenLabs-Bildgenerierung ist in der App nicht möglich (der Anschluss liefert nur Sprache). Bilder laufen über AWS und Stability AI. | 2026-10-14 |
| Supabase | ElevenLabs | Elo-Stimme | geplant | | – |
| Claude Code | GitHub & Pages | Commits und PRs | aktiv | | 2026-10-15 |
| GitHub & Pages | ELONUKI-App | Auslieferung unter elio.schule | aktiv | | 2026-10-15 |
