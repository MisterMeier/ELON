# Analyse: HTML/JavaScript oder Java? (Stand 19.10.2026)

Hinweis: Java und JavaScript sind zwei völlig verschiedene Sprachen, trotz ähnlichem Namen.

## Vergleich
| Kriterium | Web (HTML/CSS/JS, evtl. TypeScript) | Java (Web-Backend oder App) |
|---|---|---|
| iPad/Mac/Tafel | läuft in Safari/Chrome, als Startbild-App (PWA), ohne Installation | auf iPad nicht direkt; nativ nur Swift, Java nur mit Umwegen |
| Sicherheit | Gut, wenn das Backend (RLS, Edge Functions) sauber ist | Gut im Backend, aber kein Vorteil für die Oberfläche |
| Wartbarkeit | Eine Codebasis für alle Geräte; `app.html` ist sehr groß, Aufteilung in Module lohnt | Mehr Struktur, aber zwei Welten (Java-Server plus Web-Oberfläche) |
| Aufwand | Vorhanden und läuft; Umbau nur schrittweise | Komplett neu, Monate, Server nötig |
| Kosten | Hosting gratis/günstig (Pages, Supabase) | Server/Hosting laufend, Entwicklerzeit |
| Offline/Updates | Service Worker, Update beim Öffnen | Eigener Weg nötig |

## Empfehlung (max. 10 Zeilen)
1. Beim Web-Stack bleiben (HTML/CSS/JavaScript). Er läuft auf iPad, Mac und Tafel ohne Installation.
2. Java bringt für eine iPad-Klasse keinen Vorteil und würde einen Neubau bedeuten.
3. Schrittweise TypeScript einführen (nur für neue Module), damit Fehler früher auffallen.
4. `app.html` später in Module aufteilen (wie `skizze.js`), ein Bereich pro Runde.
5. Sicherheit im Backend halten: RLS, Edge Functions, keine Schlüssel im Frontend.
6. Für den späteren Verkauf: eigener Build-Schritt (Minimierung), Mehrschulen-Trennung (siehe Pilot-Anleitung).
7. Eine native iPad-App (Swift) erst prüfen, wenn Schulen das ausdrücklich wollen (App Store, 99 $/Jahr Developer-Konto, Quelle: developer.apple.com, vor Buchung prüfen).
