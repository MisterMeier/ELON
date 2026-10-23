# Skills (Claude Code, nur in diesem Repo)

Projektbezogen installiert unter `.claude/skills/` (nicht global). Geprüft am 23.10.2026: SKILL.md und alle Dateien gelesen.
Keiner der installierten Skills enthält ausführbare Skripte. Weggelassen wurden die Hilfsskripte der Quelle
(Screenshot-Werkzeug lädt Playwright aus dem Netz) und die GSAP-Beispiele (laden GSAP von einem CDN).

| Skill | Quelle (Stand) | Lizenz | Wofür in ELONUKI |
|---|---|---|---|
| frontend-design | anthropics/skills (dbd4588) | Apache 2.0 | Gestaltung neuer Ansichten: Typografie, Abstände, eigenständiger Stil statt Vorlagen-Look |
| motion-design | lottiefiles/motion-design-skill (f9a8a04) | MIT | Grundregeln für Bewegung: Dauer, Easing, Choreografie, Rückmeldung bei richtig/falsch |
| svg-animation | iart-ai/web-animation-skills (b6dba3e) | MIT | Elo und Abbildungen als SVG animieren (Linien zeichnen, Teile bewegen) |
| micro-interaction | iart-ai/web-animation-skills (b6dba3e) | MIT | Knopf-Rückmeldung, Toasts, Fenster auf/zu, mit reinem CSS |
| gsap-web | iart-ai/web-animation-skills (b6dba3e) | MIT | Nur Wissen über GSAP; GSAP selbst ist NICHT eingebunden |
| lottie-animation | iart-ai/web-animation-skills (b6dba3e) | MIT | Nur Wissen über Lottie; Lottie selbst ist NICHT eingebunden |

## Bibliotheken (nicht eingebunden, wartet auf Fabians Freigabe)
- GSAP 3.15: kostenlos, auch kommerziell, aber eigene Lizenz (GreenSock „Standard no charge“), kein Open Source.
  Einschränkung laut Lizenz: nicht für Produkte, die mit Webflows visuellem Animations-Baukasten konkurrieren.
- lottie-web 5.13 und @lottiefiles/dotlottie-web: MIT, kommerziell frei.
- Bis zur Freigabe gilt: Animationen nur mit reinem CSS, SVG und JavaScript.
