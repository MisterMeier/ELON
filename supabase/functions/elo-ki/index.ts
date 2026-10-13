// ELIO · Edge Function „elo-ki“ (Platzhalter)
// Später ruft diese Funktion die KI auf. Der API-Schlüssel liegt dann NUR hier als Secret (supabase secrets set KI_KEY=…), nie im Code von ELIO.
// Bis dahin antwortet sie regelbasiert. Sie bekommt nur pseudonyme Daten (Nummer, Thema, Aufgabe), keine Namen, keine Fotos von Gesichtern.
// Einrichten: supabase functions deploy elo-ki   ·   Tabelle für Tageslimit und Protokoll: supabase/elo_ki.sql
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const LIMIT = 30; // Anfragen pro Kind und Tag
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// Regeln aus dem Fehlerkatalog: Stichwort im Thema → Hinweis. Elo hilft und ermutigt, Elo bewertet nicht.
const RULES: [RegExp, string][] = [
  [/negativ|rational|vorzeichen/i, "Schau auf die Vorzeichen. Plus mal Minus ergibt Minus. Zeichne dir einen Zahlenstrahl, wenn du unsicher bist."],
  [/bruch|brüche/i, "Beim Addieren brauchst du einen gemeinsamen Nenner. Beim Multiplizieren rechnest du Zähler mal Zähler und Nenner mal Nenner."],
  [/term|gleichung/i, "Mach auf beiden Seiten dasselbe. Schreib jeden Schritt in eine neue Zeile."],
  [/prozent/i, "Schreib dir auf: Grundwert, Prozentsatz, Prozentwert. Welche zwei kennst du schon?"],
  [/englisch|vocab|vokabel/i, "Sprich das Wort laut und schreib es dann. Achte auf die Endung."],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return new Response(JSON.stringify({ err: "auth" }), { status: 401, headers: cors });
  let body: { kind?: string; topic?: string; text?: string } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  const kind = String(body.kind || "hint").slice(0, 20), topic = String(body.topic || "").slice(0, 200);
  // Tageslimit und Protokoll (nur Art und Zeit, kein Inhalt)
  const { data: n } = await sb.rpc("elo_ki_count");
  if ((n ?? 0) >= LIMIT) return new Response(JSON.stringify({ answer: "Für heute hast du Elo schon oft gefragt. Frag morgen wieder oder deine Lehrkraft.", source: "limit" }), { headers: { ...cors, "Content-Type": "application/json" } });
  await sb.from("elo_ki_log").insert({ kind });
  const hit = RULES.find(([re]) => re.test(topic));
  const answer = hit ? hit[1] : "Lies die Aufgabe noch einmal langsam. Was ist gegeben, was ist gesucht? Probier den ersten Schritt, ich glaube an dich.";
  return new Response(JSON.stringify({ answer, source: "regeln" }), { headers: { ...cors, "Content-Type": "application/json" } });
});
