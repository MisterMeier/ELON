// ELIO · Edge Function „elo-stimme“: spricht einen Satz, den die Lehrkraft Elo auf einer Folie gibt, mit Elos Stimme („Oswald“, ElevenLabs).
// Nur für Admins (Kosten). Es geht nur der Satz der Lehrkraft raus, keine Schülerdaten. Die App speichert die Aufnahme auf dem Gerät der Lehrkraft.
// Einrichten:
//   supabase secrets set ELEVEN_KEY=<ElevenLabs-API-Schlüssel>
//   supabase functions deploy elo-stimme
// Optional: ELEVEN_VOICE (Stimme), ELEVEN_MODEL (Modell)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VOICE = Deno.env.get("ELEVEN_VOICE") || "YyYOpSknZlewhHezK5bv"; // „Oswald – Kind & Gentle Grandpa“, wie die festen Elo-Sätze
const MODEL = Deno.env.get("ELEVEN_MODEL") || "eleven_multilingual_v2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  let body: { text?: string; lang?: string } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (text.length < 2) return json({ err: "leer" });
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, language_code: body.lang === "en" ? "en" : "de", voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
  });
  if (!r.ok) return json({ err: "tts", status: r.status });
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return json({ audio: btoa(bin) });
});
