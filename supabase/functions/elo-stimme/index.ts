// ELIO · Edge Function „elo-stimme“: spricht einen Satz, den die Lehrkraft Elo auf einer Folie gibt, mit Elos Stimme („Oswald“, ElevenLabs).
// Nur für Admins (Kosten). Es geht nur der Satz der Lehrkraft raus, keine Schülerdaten. Die App speichert die Aufnahme auf dem Gerät der Lehrkraft.
// Einrichten:
//   supabase secrets set ELEVEN_KEY=<ElevenLabs-API-Schlüssel>
//   supabase functions deploy elo-stimme --no-verify-jwt
// Im Dashboard: bei elo-stimme unter „Details“ „Verify JWT with legacy secret“ AUS. Die Funktion prüft Anmeldung und Admin selbst (unten);
// mit dem neuen Publishable Key lässt die alte JWT-Prüfung den Aufruf sonst nicht durch, und die App meldet „Keine Verbindung“.
// Optional: ELEVEN_VOICE (Stimme), ELEVEN_MODEL (Modell)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VOICE = Deno.env.get("ELEVEN_VOICE") || "YyYOpSknZlewhHezK5bv"; // „Oswald – Kind & Gentle Grandpa“, wie die festen Elo-Sätze
const MODEL = Deno.env.get("ELEVEN_MODEL") || "eleven_multilingual_v2";
// x-client-info muss erlaubt sein: supabase-js schickt diesen Header immer mit. Fehlt er, blockt der Browser schon die Vorab-Anfrage (CORS)
// und die App meldet „Keine Verbindung zum Server“, obwohl der Server läuft (Fehler B-Stimme vom 18.10.2026).
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
// V: Stand dieser Funktion. Die App zeigt beim „Prüfen“ an, ob auf dem Server noch eine ältere Fassung läuft (dann neu deployen).
const V = "2026-10-20";
const json = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify({ ...o, v: V }), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ err: "auth" }, 401);
  const { data: admin } = await sb.rpc("is_admin");
  if (!admin) return json({ err: "admin" }, 403);
  const key = Deno.env.get("ELEVEN_KEY");
  if (!key) return json({ err: "nokey" });
  let body: { text?: string; lang?: string; check?: boolean } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  // Prüfen ohne Kosten: fragt bei ElevenLabs nur Konto und Stimme ab (kein Sprechen).
  // Ein eingeschränkter Schlüssel darf das evtl. nicht lesen („missing_permissions“); das ist kein Fehler.
  if (body.check) {
    try {
      const get = async (u: string) => { const c = await fetch("https://api.elevenlabs.io" + u, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10000) }); return { st: c.status, d: await c.json().catch(() => ({})) }; };
      const why = (d: any) => String(d?.detail?.status || d?.detail?.code || "");
      const sub = await get("/v1/user/subscription");
      if (sub.st === 401 && why(sub.d) !== "missing_permissions") return json({ err: "tts", status: 401, detail: why(sub.d) });
      const vc = await get("/v1/voices/" + VOICE);
      if (vc.st !== 200 && !(vc.st === 401 && why(vc.d) === "missing_permissions")) return json({ err: "voice", status: vc.st, detail: why(vc.d) });
      const rest = sub.st === 200 ? Math.max(0, (sub.d.character_limit || 0) - (sub.d.character_count || 0)) : null;
      return json({ ok: true, rest });
    } catch (_) { return json({ err: "timeout" }); }
  }
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (text.length < 2) return json({ err: "leer" });
  // Zeitlimit, damit die App nicht hängt (die App wartet 25 s). Kein automatischer zweiter Versuch: jeder Aufruf kostet.
  let r: Response;
  try {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: "POST",
    signal: AbortSignal.timeout(22000),
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, language_code: body.lang === "en" ? "en" : "de", voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
  });
  } catch (_) {
    return json({ err: "timeout" });
  }
  if (!r.ok) { const d = await r.json().catch(() => ({})); return json({ err: "tts", status: r.status, detail: String(d?.detail?.status || d?.detail?.code || "").slice(0, 60) }); }
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return json({ audio: btoa(bin) });
});
