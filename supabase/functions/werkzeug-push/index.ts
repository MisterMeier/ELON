// ELONUKI · Edge Function „werkzeug-push“: die KI einer Lehrkraft schickt ein eigenes Werkzeug (eine HTML-Datei) direkt an ELONUKI.
// Aufruf mit persönlichem Schlüssel (in ELONUKI unter Werkzeugkasten erzeugt): Authorization: Bearer elk_…
//   POST  Body = die HTML-Datei (Content-Type: text/html), Name steht in der Kopfzeile <meta name="elonuki-tool"> oder in ?name=
//   POST  Body = JSON {name, fach, info, html, namen}
//   GET   ?name=…  holt die aktuelle Datei, ohne name: Liste der eigenen Werkzeuge
// Wie „Neue Version hochladen“: dieselben Regeln, bei freigegebenen Werkzeugen geht die Änderung sofort live.
// Einrichten: werkzeuge/EINRICHTEN-direkt.md (Verify JWT ausschalten, weil der Schlüssel das Login ersetzt).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8" } });
const sha = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))).map((b) => b.toString(16).padStart(2, "0")).join("");

function meta(h: string): Record<string, unknown> {
  const m = /<meta[^>]+name=["']elonuki-tool["'][^>]*>/i.exec(h);
  const c = m && /content=(["'])([\s\S]*?)\1/i.exec(m[0]);
  try { const j = c ? JSON.parse(c[2].replace(/&quot;/g, '"')) : null; return j && typeof j === "object" ? j : {}; } catch (_) { return {}; }
}
// Hinweise wie bei der Vorprüfung in der App (nur Rückmeldung an die KI, der Schutz ist der Schutzkasten)
function hinweise(h: string): string[] {
  const P: string[] = [];
  const T: [RegExp, string][] = [
    [/(src|href)\s*=\s*["']?\s*(https?:)?\/\//i, "Lädt etwas aus dem Internet. Alles muss in dieser einen Datei stecken."],
    [/url\(\s*["']?\s*(https?:)?\/\//i, "Lädt Bilder oder Schriften aus dem Internet."],
    [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, "Will etwas übers Internet schicken oder holen. Das ist gesperrt."],
    [/\bindexedDB\b/, "IndexedDB geht im Schutzkasten nicht."],
    [/\b(eval|Function)\s*\(/, "Benutzt eval oder new Function."],
    [/\b(top|parent|opener)\s*\.(?!postMessage)/, "Greift direkt auf ELONUKI zu. Nur über die Brücke erlaubt."],
    [/\b(window\.open|location\s*=|location\.(href|assign|replace))/, "Will die Seite wechseln. ELONUKI hält das Werkzeug dann an."],
    [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "Enthält Emojis. Im ELONUKI-Design bitte einfache SVG-Symbole."],
  ];
  for (const [r, t] of T) if (r.test(h)) P.push(t);
  if (!/elonuki\.(senden|wenn)/.test(h)) P.push("Benutzt die ELONUKI-Brücke nicht (elonuki.senden / elonuki.wenn).");
  if (!Object.keys(meta(h)).length) P.push('Die Kopfzeile <meta name="elonuki-tool"> fehlt.');
  return P;
}
const MSG: Record<string, string> = {
  key: "Der Schlüssel gilt nicht (falsch, widerrufen, oder das Konto darf keine Werkzeuge hochladen).",
  name: "Es fehlt ein Name. Im Kopf <meta name=\"elonuki-tool\" content='{\"name\":\"…\"}'> oder als ?name=… angeben.",
  gross: "Die Datei ist zu groß (höchstens 600 KB).", leer: "Die Datei ist leer.", denied: "Hochladen darf nur ein Co-Autor.",
  noschool: "Das Konto gehört zu keiner Schule.", unbekannt: "Dieses Werkzeug gibt es nicht.",
};

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") || "";
  const key = /^Bearer (elk_[0-9a-f]{64})$/.exec(auth)?.[1];
  if (!key) return J({ ok: false, fehler: MSG.key }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hash = await sha(key);
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const { data, error } = await sb.rpc("tool_pull", { p_hash: hash, p_name: url.searchParams.get("name") });
      if (error) throw error;
      if (data?.err) return J({ ok: false, fehler: MSG[data.err] || data.err }, data.err === "key" ? 401 : 404);
      return J({ ok: true, ...data });
    }
    if (req.method !== "POST") return J({ ok: false, fehler: "Nur GET oder POST." }, 405);
    const raw = await req.text();
    if (raw.length > 700000) return J({ ok: false, fehler: MSG.gross }, 413);
    let html = raw, name = url.searchParams.get("name") || "", fach: string | null = null, info: string | null = null, namen: boolean | null = null;
    if ((req.headers.get("content-type") || "").includes("json")) {
      const b = JSON.parse(raw);
      html = String(b.html || ""); name = String(b.name || name || ""); fach = b.fach ?? null; info = b.info ?? null; namen = typeof b.namen === "boolean" ? b.namen : null;
    }
    const m = meta(html);
    name = name || String(m.name || "");
    fach = fach ?? (m.fach ? String(m.fach) : null);
    info = info ?? (m.info || m.beschreibung ? String(m.info || m.beschreibung) : null);
    namen = namen ?? (typeof m.namen === "boolean" ? m.namen : null);
    const { data, error } = await sb.rpc("tool_push", { p_hash: hash, p_name: name, p_subject: fach, p_info: info, p_html: html, p_needs_names: namen });
    if (error) throw error;
    if (data?.err) return J({ ok: false, fehler: MSG[data.err] || data.err }, data.err === "key" ? 401 : 400);
    return J({ ok: true, ...data, hinweise: hinweise(html), nachricht: data.status === "freigegeben" ? "Neue Version ist live." : "Gespeichert. Noch nicht freigegeben: läuft in der Vorschau und der Testklasse." });
  } catch (e) {
    return J({ ok: false, fehler: "Server-Fehler: " + String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
