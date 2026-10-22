# Einrichten: Werkzeuge direkt aus Claude Code (für Fabian, einmalig)

1. **PR mergen** (enthält App, SQL und Funktion).
2. **SQL ausführen:** Supabase → SQL Editor → Inhalt von `supabase/migrations/20261022090000_werkzeug_schluessel.sql` einfügen → Run.
   Danach zur Kontrolle `supabase/tests/werkzeug_schluessel_test.sql` ausführen (alle Zeilen sollen „ok“ zeigen).
3. **Edge Function anlegen:** Supabase → Edge Functions → neue Funktion `werkzeug-push` → Inhalt von `supabase/functions/werkzeug-push/index.ts` einfügen → **„Verify JWT“ ausschalten** (der Schlüssel ersetzt das Login) → Deploy.
4. **Kollege:** in ELONUKI Werkzeugkasten öffnen → „Direkt mit deiner KI arbeiten“ → Schlüssel erzeugen → Anweisung kopieren → in Claude Code einfügen.

Prüfen: Der Kollege sagt Claude Code „liste meine Werkzeuge auf“. Kommt eine Liste (auch leer), läuft alles.
Notfall: Schlüssel im Werkzeugkasten widerrufen (gilt sofort) oder Werkzeug sperren.
