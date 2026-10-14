// ELIO · Edge Function „blackbox“: erzeugt auf Wunsch der Lehrkraft Grafiken, Animationen, Erklär-Animationen, Geräusche, Musik, Fotos, Kurzvideos, Hördialoge, Folientexte, Übungen und Dialoge.
// Nur für Admins. Es werden keine Schülerdaten geschickt, nur der Wunsch der Lehrkraft und das Fach.
// KI: Claude über Amazon Bedrock, Rechenzentrum Frankfurt (eu-central-1). Der Schlüssel liegt NUR hier als Secret:
//   supabase secrets set BLACKBOX_KEY=<Bedrock-API-Schlüssel>
//   supabase functions deploy blackbox
// Geräusch, Musik, Hördialog, Foto und Kurzvideo: ElevenLabs. Nur der Wunsch der Lehrkraft geht raus. Schlüssel wie bei „elo-stimme“:
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

// ---------- ElevenLabs (Geräusch, Musik, Hördialog, Foto, Kurzvideo) ----------
// Es geht nur der Wunsch der Lehrkraft raus bzw. der von Claude geschriebene Dialog, nie Schülerdaten.
const XI = "https://api.elevenlabs.io";
const IMG_MODEL = Deno.env.get("ELEVEN_IMAGE_MODEL") || "gpt-image-2.5-sunburst";
const VID_MODEL = Deno.env.get("ELEVEN_VIDEO_MODEL") || "ltx-v2-fast"; // ca. 1500 Credits für einige Sekunden
// Stimmen für Hördialoge (A, B). Englisch: britisch (Ash, Delilah). Sonst: Elo-Oswald und Juna.
const VOICES = {
  en: [Deno.env.get("ELEVEN_VOICE_EN_A") || "7DPK3BeItL9bXzJuCOEn", Deno.env.get("ELEVEN_VOICE_EN_B") || "7r0CYbZh4LPOmUL2MCq3"],
  de: [Deno.env.get("ELEVEN_VOICE_DE_A") || "YyYOpSknZlewhHezK5bv", Deno.env.get("ELEVEN_VOICE_DE_B") || "uZCiMraXvGgdBPlDzm6l"],
};
const ELEVEN_KINDS = ["ton", "musik", "foto", "film", "hoer"];

function b64(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kurze englische Beschreibung für Geräusch-, Musik-, Bild- und Video-KI (die verstehen Englisch am besten).
const EN: Record<string, string> = {
  ton: "Turn the teacher's wish into one short English sound-effect description (max. 25 words). No speech, no music with lyrics.",
  musik: "Turn the teacher's wish into one short English music prompt (genre, mood, instruments, tempo; max. 40 words). Instrumental, suitable for a classroom.",
  foto: "Turn the teacher's wish into one English image prompt for a school slide (max. 60 words): subject, setting, style, light. Child-friendly, no real persons, no brands. End with: No text, no letters, no numbers in the image.",
  film: "Turn the teacher's wish into one English prompt for a 5-second video clip for a school slide (max. 60 words): subject, motion, camera, style. Child-friendly, calm, no real persons, no brands, no text in the video.",
};
async function english(kind: string, prompt: string, bedrockKey: string | undefined): Promise<string> {
  if (!bedrockKey) return prompt + (kind === "foto" ? " No text in the image." : "");
  try {
    const c = new Anthropic({ apiKey: bedrockKey, baseURL: `https://bedrock-mantle.${REGION}.api.aws/anthropic` });
    const m = await c.messages.create({ model: MODEL.small, max_tokens: 300, system: EN[kind] + " Answer with the prompt only.", messages: [{ role: "user", content: prompt }] });
    const t = m.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return t ? t.slice(0, 800) : prompt;
  } catch (_) { return prompt; }
}

async function xiAudio(path: string, key: string, payload: unknown): Promise<string | null> {
  const r = await fetch(`${XI}${path}${path.includes("?") ? "&" : "?"}output_format=mp3_44100_64`, {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(payload),
  });
  if (!r.ok) { console.error("blackbox xi", path, r.status, (await r.text()).slice(0, 300)); return null; }
  return b64(new Uint8Array(await r.arrayBuffer()));
}

// Bild und Video laufen als Auftrag: anlegen, dann nachsehen, bis fertig. Dauert es länger, bekommt die App die Auftragsnummer und fragt nochmal.
async function flowStart(type: "image" | "video", key: string, prompt: string): Promise<string | null> {
  const r = await fetch(`${XI}/v1/flows/${type}`, {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: type === "image" ? IMG_MODEL : VID_MODEL, prompt, aspect_ratio: "16:9" }),
  });
  if (!r.ok) { console.error("blackbox flow", type, r.status, (await r.text()).slice(0, 300)); return null; }
  const d = await r.json();
  return String(d.generation_id || d.id || "") || null;
}
async function flowWait(type: "image" | "video", key: string, gid: string, maxMs: number): Promise<{ data?: string; mime?: string; wait?: boolean; fail?: boolean }> {
  const t0 = Date.now(), step = type === "image" ? 3000 : 10000;
  while (Date.now() - t0 < maxMs) {
    const r = await fetch(`${XI}/v1/flows/${type}/${encodeURIComponent(gid)}`, { headers: { "xi-api-key": key } });
    if (r.ok) {
      const d = await r.json();
      if (d.status === "failed") { console.error("blackbox flow failed", d.failure_reason || d.error_message); return { fail: true }; }
      if (d.status === "completed" && d.content_url) {
        const f = await fetch(d.content_url);
        if (!f.ok) return { fail: true };
        const buf = new Uint8Array(await f.arrayBuffer());
        if (buf.length > 25e6) return { fail: true };
        return { data: b64(buf), mime: d.content_mime_type || f.headers.get("content-type") || (type === "image" ? "image/png" : "video/mp4") };
      }
    } else if (r.status !== 404 && r.status !== 429) { console.error("blackbox flow get", r.status); return { fail: true }; }
    await sleep(step);
  }
  return { wait: true };
}

async function eleven(kind: string, prompt: string, subj: string, gid: string, bedrockKey: string | undefined, extra: Record<string, unknown>): Promise<Response> {
  const key = Deno.env.get("ELEVEN_KEY");
  if (!key) return json({ err: "nokey11" });
  if (kind === "ton" || kind === "musik") {
    const text = await english(kind, prompt, bedrockKey);
    const audio = kind === "ton"
      ? await xiAudio("/v1/sound-generation", key, { text, prompt_influence: 0.5 })
      : await xiAudio("/v1/music", key, { prompt: text, music_length_ms: 30000, force_instrumental: true });
    return audio ? json({ ...extra, kind, audio }) : json({ err: kind });
  }
  if (kind === "foto" || kind === "film") {
    const type = kind === "foto" ? "image" : "video";
    let id = gid;
    if (!id) {
      id = (await flowStart(type, key, await english(kind, prompt, bedrockKey))) || "";
      if (!id) return json({ err: kind });
    }
    const o = await flowWait(type, key, id, type === "image" ? 90000 : 110000);
    if (o.fail) return json({ err: kind });
    if (o.wait) return json({ ...extra, kind, err: "warten", gid: id });
    return json({ ...extra, kind, data: o.data, mime: o.mime });
  }
  if (kind === "hoer") {
    if (!bedrockKey) return json({ err: "nokey" });
    const c = new Anthropic({ apiKey: bedrockKey, baseURL: `https://bedrock-mantle.${REGION}.api.aws/anthropic` });
    const m = await c.messages.create({
      model: MODEL.small, max_tokens: 1500, system: KINDS.dialog.sys,
      messages: [{ role: "user", content: (subj ? `Fach: ${subj}\n` : "") + `Wunsch der Lehrkraft: ${prompt}` }],
    });
    if (m.stop_reason === "refusal") return json({ err: "refusal" });
    const ls = m.content.map((b) => (b.type === "text" ? b.text : "")).join("").replace(/^```\w*|```$/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
    const title = (ls[0] || "").replace(/^#+\s*/, "").slice(0, 200), lines = ls.slice(1);
    const en = subj === SUBJ.E, V = en ? VOICES.en : VOICES.de;
    const inputs = lines.map((l) => { const x = l.match(/^([AB])\s*:\s*(.+)$/); return x ? { text: x[2].slice(0, 300), voice_id: V[x[1] === "A" ? 0 : 1] } : null; }).filter(Boolean) as { text: string; voice_id: string }[];
    let chars = 0;
    const cut = inputs.filter((i) => (chars += i.text.length) <= 1900);
    if (!cut.length) return json({ err: "kaputt" });
    const audio = await xiAudio("/v1/text-to-dialogue", key, { inputs: cut });
    return json({ ...extra, kind, title, text: lines.join("\n").slice(0, 4000), audio: audio || "", audioErr: !audio });
  }
  return json({ err: "leer" });
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
  let body: { kind?: string; prompt?: string; subj?: string; gid?: string } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  const xi = ELEVEN_KINDS.includes(String(body.kind));
  if (!key && !xi) return json({ err: "nokey" });
  const kind = xi ? String(body.kind) : KINDS[String(body.kind)] ? String(body.kind) : "bild", K = KINDS[kind];
  const prompt = String(body.prompt || "").trim().slice(0, 600), subj = SUBJ[String(body.subj || "")] || "";
  const gid = /^[\w-]{4,100}$/.test(String(body.gid || "")) ? String(body.gid) : "";
  if (gid && (kind === "foto" || kind === "film")) {
    // Nachfragen zu einem laufenden Bild- oder Video-Auftrag zählen nicht noch einmal fürs Tageslimit.
    try { return await eleven(kind, prompt, subj, gid, key, {}); } catch (e) { console.error("blackbox", (e as Error).message); return json({ err: kind }); }
  }
  if (prompt.length < 3) return json({ err: "leer" });
  const { data: n } = await sb.rpc("blackbox_count");
  if ((n ?? 0) >= LIMIT) return json({ err: "limit", limit: LIMIT });
  await sb.from("blackbox_log").insert({ kind });
  if (xi) {
    try { return await eleven(kind, prompt, subj, "", key, { n: (n ?? 0) + 1, limit: LIMIT }); } catch (e) { console.error("blackbox", (e as Error).message); return json({ err: kind }); }
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
