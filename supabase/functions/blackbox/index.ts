// ELIO · Edge Function „blackbox“: erzeugt auf Wunsch der Lehrkraft Grafiken, Animationen, Erklär-Animationen, Geräusche, Folientexte, Übungen und Dialoge.
// Nur für Admins. Es werden keine Schülerdaten geschickt, nur der Wunsch der Lehrkraft und das Fach.
// KI: Claude über Amazon Bedrock, Rechenzentrum Frankfurt (eu-central-1). Der Schlüssel liegt NUR hier als Secret:
//   supabase secrets set BLACKBOX_KEY=<Bedrock-API-Schlüssel>
//   supabase functions deploy blackbox
// Geräusche: ElevenLabs (Sound Effects). Nur der Wunsch der Lehrkraft geht raus. Schlüssel wie bei „elo-stimme“:
//   supabase secrets set ELEVEN_KEY=<ElevenLabs-API-Schlüssel>
// Tabelle für Tageslimit und Protokoll: supabase/blackbox.sql
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";

const LIMIT = 30; // Anfragen pro Admin und Tag
const REGION = "eu-central-1";
const MODEL = { big: "anthropic.claude-sonnet-5-5", small: "anthropic.claude-haiku-5-5" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUBJ: Record<string, string> = { M: "Mathematik", D: "Deutsch", E: "Englisch", K: "Kunst", G: "Geschichte/Politik/Geographie", N: "Natur und Technik", R: "Religion/Ethik", S: "Sport", W: "Wirtschaft und Beruf", I: "Informatik", Mu: "Musik" };
const BASE = "Du arbeitest für ELIO, eine Lern-App einer bayerischen Mittelschule (Klassen 5 bis 10). Schreib einfach, klar und kindgerecht. Keine Emojis. Keine echten Personennamen.";
const KINDS: Record<string, { model: string; max: number; sys: string }> = {
  bild: {
    model: MODEL.big, max: 12000,
    sys: BASE + `
Erzeuge genau EIN eigenständiges SVG für eine Tafelfolie. Antworte nur mit dem SVG-Code, ohne Erklärung, ohne Markdown.
Regeln:
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">, transparenter Hintergrund außer es passt eine ruhige Fläche.
- Flacher, klarer Stil. Farben: Indigo #4f46e5, Navy #1e3a8a, Himmelblau #38bdf8, Orange #f59e0b, Weiß, helles Grau #e5e7eb, dunkler Text #1f2937. Kein Grün.
- Schrift: font-family="system-ui, sans-serif", mindestens 22px, wenig Text, deutsche Beschriftung (bei Englisch englisch).
- Bewegung nur, wenn gewünscht oder sinnvoll: SMIL (<animate>, <animateTransform>, <animateMotion>) oder CSS @keyframes in <style>. Ruhig, in Schleife, keine Blitze.
- Verboten: <script>, Event-Attribute (on...), <foreignObject>, <image>, externe Links, @import, Schriften von außen.
- Höchstens ca. 15 KB. Fachlich korrekt.`,
  },
  szene: {
    model: MODEL.big, max: 16000,
    sys: BASE + `
Erzeuge genau EIN eigenständiges SVG als kurze Erklär-Animation für eine Tafelfolie, wie ein kleiner Erklärfilm. Antworte nur mit dem SVG-Code, ohne Erklärung, ohne Markdown.
Aufbau:
- Plane zuerst 3 bis 5 Schritte, die nacheinander erscheinen und aufeinander aufbauen (z. B. Ausgangslage, Veränderung, Ergebnis). Jeder Schritt ca. 3 bis 5 Sekunden.
- Alle Animationen hängen an EINER gemeinsamen Zeitleiste: Gesamtdauer 12 bis 24 Sekunden, am Ende 3 Sekunden Standbild, dann von vorn (repeatCount="indefinite" bzw. animation-iteration-count: infinite mit gleicher Dauer und keyTimes bzw. Prozent-Stufen).
- Pro Schritt höchstens eine kurze Beschriftung (max. 6 Wörter), die Kernidee als Bewegung zeigen, nicht als Text.
- Ruhige, weiche Übergänge (Einblenden, Gleiten, Drehen, Wachsen), keine Blitze, kein Flackern.
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">, ruhige helle Fläche oder transparent.
- Flacher, klarer Stil. Farben: Indigo #4f46e5, Navy #1e3a8a, Himmelblau #38bdf8, Orange #f59e0b, Weiß, helles Grau #e5e7eb, dunkler Text #1f2937. Kein Grün.
- Schrift: font-family="system-ui, sans-serif", mindestens 22px, deutsche Beschriftung (bei Englisch englisch).
- Technik: SMIL (<animate>, <animateTransform>, <animateMotion>, <set>) oder CSS @keyframes in <style>.
- Verboten: <script>, Event-Attribute (on...), <foreignObject>, <image>, externe Links, @import, Schriften von außen, Start per Klick (begin="click").
- Höchstens ca. 25 KB. Fachlich korrekt.`,
  },
  folie: { model: MODEL.small, max: 1500, sys: BASE + "\nSchreib den Inhalt einer Tafelfolie. Zeile 1: kurzer Titel. Danach 2 bis 6 kurze Zeilen Folientext, je ein Gedanke pro Zeile, ganze Sätze, ohne Aufzählungszeichen. Nur dieser Text, kein Markdown." },
  uebung: { model: MODEL.small, max: 1500, sys: BASE + "\nSchreib eine Übung für eine Tafelfolie. Zeile 1: kurzer Titel. Danach 3 bis 6 Aufgaben, je eine Zeile, beginnend mit ●○○, ●●○ oder ●●● für leicht, mittel, schwer. Nur dieser Text, kein Markdown, keine Lösungen." },
  dialog: { model: MODEL.small, max: 1500, sys: BASE + "\nSchreib einen kurzen Dialog zum Nachspielen für zwei Personen. Zeile 1: kurzer Titel. Danach 6 bis 10 Zeilen, abwechselnd beginnend mit \"A: \" und \"B: \". Bei Englisch auf Englisch (Niveau A1 bis A2). Nur dieser Text, kein Markdown." },
};

// Geräusch über ElevenLabs. Der Wunsch wird vorher mit Claude kurz ins Englische übersetzt (falls BLACKBOX_KEY da ist), weil die Geräusch-KI Englisch am besten versteht.
async function sound(prompt: string, bedrockKey: string | undefined): Promise<Response | { audio: string }> {
  const key = Deno.env.get("ELEVEN_KEY");
  if (!key) return json({ err: "nokey11" });
  let text = prompt;
  if (bedrockKey) {
    try {
      const c = new Anthropic({ apiKey: bedrockKey, baseURL: `https://bedrock-mantle.${REGION}.api.aws/anthropic` });
      const m = await c.messages.create({
        model: MODEL.small, max_tokens: 200,
        system: "Translate the teacher's wish into one short English sound-effect description for a sound generator (max. 25 words). No speech, no music with lyrics. Answer with the description only.",
        messages: [{ role: "user", content: prompt }],
      });
      const t = m.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (t) text = t.slice(0, 400);
    } catch (_) { /* dann eben der Originaltext */ }
  }
  const r = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_64", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, prompt_influence: 0.5 }),
  });
  if (!r.ok) { console.error("blackbox ton", r.status); return json({ err: "ton" }); }
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { audio: btoa(bin) };
}

// Entfernt alles Ausführbare aus dem SVG. Die App prüft ein zweites Mal und zeigt es nur als <img>.
function cleanSvg(s: string): string | null {
  const m = s.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  let v = m[0];
  v = v.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "").replace(/<(image|iframe|embed|object)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(xlink:)?href\s*=\s*("|')\s*(?!#)[^"']*\2/gi, "")
    .replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
  return v.length <= 90000 ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ err: "auth" }, 401);
  const { data: admin } = await sb.rpc("is_admin");
  if (!admin) return json({ err: "admin" }, 403); // nur Admins
  const key = Deno.env.get("BLACKBOX_KEY");
  let body: { kind?: string; prompt?: string; subj?: string } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  const ton = String(body.kind) === "ton";
  if (!key && !ton) return json({ err: "nokey" });
  const kind = ton ? "ton" : KINDS[String(body.kind)] ? String(body.kind) : "bild", K = KINDS[kind];
  const prompt = String(body.prompt || "").trim().slice(0, 600), subj = SUBJ[String(body.subj || "")] || "";
  if (prompt.length < 3) return json({ err: "leer" });
  const { data: n } = await sb.rpc("blackbox_count");
  if ((n ?? 0) >= LIMIT) return json({ err: "limit", limit: LIMIT });
  await sb.from("blackbox_log").insert({ kind });
  if (ton) {
    const o = await sound(prompt, key);
    return o instanceof Response ? o : json({ kind, audio: o.audio, n: (n ?? 0) + 1, limit: LIMIT });
  }

  const client = new Anthropic({ apiKey: key, baseURL: `https://bedrock-mantle.${REGION}.api.aws/anthropic` });
  try {
    const stream = client.messages.stream({
      model: K.model, max_tokens: K.max, system: K.sys,
      messages: [{ role: "user", content: (subj ? `Fach: ${subj}\n` : "") + `Wunsch der Lehrkraft: ${prompt}` }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return json({ err: "refusal" });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (kind === "bild" || kind === "szene") {
      const svg = cleanSvg(text);
      return svg ? json({ kind, svg, n: (n ?? 0) + 1, limit: LIMIT }) : json({ err: "kaputt" });
    }
    const ls = text.replace(/^```\w*|```$/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
    return json({ kind, title: (ls[0] || "").replace(/^#+\s*/, "").slice(0, 200), text: ls.slice(1).join("\n").slice(0, 4000), n: (n ?? 0) + 1, limit: LIMIT });
  } catch (e) {
    console.error("blackbox", (e as Error).message);
    return json({ err: "ki" });
  }
});
