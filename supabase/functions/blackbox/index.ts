// ELIO · Edge Function „blackbox“: erzeugt auf Wunsch der Lehrkraft Grafiken, Animationen, Erklär-Animationen, Geräusche, Musik, Fotos, Kurzvideos, Hördialoge, Folientexte, Übungen und Dialoge.
// Nur für Admins. Es werden keine Schülerdaten geschickt, nur der Wunsch der Lehrkraft und das Fach.
// KI: Claude über Amazon Bedrock, Rechenzentrum Frankfurt (eu-central-1). Der Schlüssel liegt NUR hier als Secret:
//   supabase secrets set BLACKBOX_KEY=<Bedrock-API-Schlüssel>
//   supabase functions deploy blackbox
// Foto: zuerst Amazon Nova Canvas über Bedrock in der EU (Irland), gleiche AWS-Schlüssel. Sonst ElevenLabs (braucht dort den Pro-Tarif).
// Geräusch, Musik, Hördialog, Foto und Kurzvideo: ElevenLabs. Nur der Wunsch der Lehrkraft geht raus. Schlüssel wie bei „elo-stimme“:
//   supabase secrets set ELEVEN_KEY=<ElevenLabs-API-Schlüssel>
// Tabelle für Tageslimit und Protokoll: supabase/blackbox.sql
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import AnthropicBedrock, { AnthropicBedrockMantle } from "npm:@anthropic-ai/bedrock-sdk@0.34.4";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const LIMIT = 30; // Anfragen pro Admin und Tag
// Frankfurt zuerst, dann Irland und Stockholm (dort laufen Modelle auch ohne Inferenzprofil). Alles EU.
const REGIONS = ["eu-central-1", "eu-west-1", "eu-north-1"];
// Erst die neuesten Modelle, dann die, die AWS jedem Konto freigibt (Sonnet 5, Haiku 4.5).
const MODEL = { big: ["anthropic.claude-sonnet-5-5", "anthropic.claude-sonnet-5", "anthropic.claude-haiku-4-5"], small: ["anthropic.claude-haiku-5-5", "anthropic.claude-haiku-4-5"] };
// Frankfurt bedient Claude nur über ein Inferenzprofil: zuerst EU-Profil (Daten bleiben in der EU), dann global, dann die reine ID.
const ROUTES = ["eu.", "global.", ""];
// Klassischer Bedrock-Weg (wie das AWS-Testfenster), mit EU-Inferenzprofil ab Frankfurt. Läuft, wenn Mantle das Modell nicht kennt.
const CLASSIC = {
  big: ["eu.anthropic.claude-sonnet-4-5-20250929-v1:0", "eu.anthropic.claude-haiku-4-5-20251001-v1:0"],
  small: ["eu.anthropic.claude-haiku-4-5-20251001-v1:0"],
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUBJ: Record<string, string> = { M: "Mathematik", D: "Deutsch", E: "Englisch", K: "Kunst", G: "Geschichte/Politik/Geographie", N: "Natur und Technik", R: "Religion/Ethik", S: "Sport", W: "Wirtschaft und Beruf", I: "Informatik", Mu: "Musik" };
const BASE = "Du arbeitest für ELIO, eine Lern-App einer bayerischen Mittelschule (Klassen 5 bis 10). Schreib einfach, klar und kindgerecht. Keine Emojis. Keine echten Personennamen.";
const KINDS: Record<string, { model: string[]; classic: string[]; max: number; sys: string }> = {
  bild: {
    model: MODEL.big, classic: CLASSIC.big, max: 12000,
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
    model: MODEL.big, classic: CLASSIC.big, max: 16000,
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
  folie: { model: MODEL.small, classic: CLASSIC.small, max: 1500, sys: BASE + "\nSchreib den Inhalt einer Tafelfolie. Zeile 1: kurzer Titel. Danach 2 bis 6 kurze Zeilen Folientext, je ein Gedanke pro Zeile, ganze Sätze, ohne Aufzählungszeichen. Nur dieser Text, kein Markdown." },
  uebung: { model: MODEL.small, classic: CLASSIC.small, max: 1500, sys: BASE + "\nSchreib eine Übung für eine Tafelfolie. Zeile 1: kurzer Titel. Danach 3 bis 6 Aufgaben, je eine Zeile, beginnend mit ●○○, ●●○ oder ●●● für leicht, mittel, schwer. Nur dieser Text, kein Markdown, keine Lösungen." },
  dialog: { model: MODEL.small, classic: CLASSIC.small, max: 1500, sys: BASE + "\nSchreib einen kurzen Dialog zum Nachspielen für zwei Personen. Zeile 1: kurzer Titel. Danach 6 bis 10 Zeilen, abwechselnd beginnend mit \"A: \" und \"B: \". Bei Englisch auf Englisch (Niveau A1 bis A2). Nur dieser Text, kein Markdown." },
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
// Claude-Aufruf mit allen Bedrock-Wegen (siehe unten in Deno.serve); null, wenn kein Bedrock-Schlüssel da ist.
type Ask = (K: { model: string[]; classic: string[]; max: number; sys: string }, user: string) => Promise<{ stop_reason?: string; content: { type: string; text?: string }[] }>;
const msgText = (m: { content: { type: string; text?: string }[] }) => m.content.map((b) => (b.type === "text" ? b.text || "" : "")).join("").trim();
async function english(kind: string, prompt: string, claude: Ask | null): Promise<string> {
  if (!claude) return prompt + (kind === "foto" ? " No text in the image." : "");
  try {
    const t = msgText(await claude({ model: MODEL.small, classic: CLASSIC.small, max: 300, sys: EN[kind] + " Answer with the prompt only." }, prompt));
    return t ? t.slice(0, 800) : prompt;
  } catch (_) { return prompt; }
}

// Längenangabe aus dem Wunsch lesen: „5 Sekunden“, „5 s“, „2 Minuten“, „1,5 min“. Ohne Angabe wählt die KI selbst (Geräusch) bzw. 30 s (Musik).
function seconds(p: string): number {
  const m = p.match(/(\d+(?:[.,]\d+)?)\s*(sekunden|sekunde|sek|sec|seconds?|s|minuten|minute|min|m)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(",", "."));
  return /^m/i.test(m[2]) ? v * 60 : v;
}

async function xiAudio(path: string, key: string, payload: unknown): Promise<string | null> {
  const r = await fetch(`${XI}${path}${path.includes("?") ? "&" : "?"}output_format=mp3_44100_64`, {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(payload),
  });
  if (!r.ok) { console.error("blackbox xi", path, r.status, (await r.text()).slice(0, 300)); return null; }
  return b64(new Uint8Array(await r.arrayBuffer()));
}

// Bild und Video laufen als Auftrag: anlegen, dann nachsehen, bis fertig. Dauert es länger, bekommt die App die Auftragsnummer und fragt nochmal.
// Modelle der Reihe nach: das eingestellte zuerst, dann bewährte Ausweichmodelle. Fehlertext geht (nur an Admins) zurück in die App.
const FLOW_MODELS = { image: [IMG_MODEL, "bytedance-seedream-5-lite", "gpt-image-2"], video: [VID_MODEL, "ltx-v2", "bytedance-seedance-v2-fast"] };
type FlowErr = { st?: number; detail?: string };
async function flowStart(type: "image" | "video", key: string, prompt: string): Promise<{ id?: string } & FlowErr> {
  let last: FlowErr = {};
  for (const model_id of [...new Set(FLOW_MODELS[type])]) {
    for (const body of [{ model_id, prompt, aspect_ratio: "16:9" }, { model_id, prompt }]) {
      const r = await fetch(`${XI}/v1/flows/${type}`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const t = await r.text();
      if (r.ok) {
        let d: Record<string, unknown> = {};
        try { d = JSON.parse(t); } catch (_) { /* leer */ }
        const id = String(d.id || d.generation_id || "");
        if (id) { console.log("blackbox flow ok", type, model_id); return { id }; }
      }
      console.error("blackbox flow", type, model_id, r.status, t.slice(0, 300));
      last = { st: r.status, detail: `${model_id}: ${t.slice(0, 200)}` };
      if (r.status === 401 || r.status === 402 || r.status === 403 || r.status === 429) return last; // 402: Tarif reicht nicht (Bild/Video per API erst ab ElevenLabs Pro) // Schlüssel/Rechte/Guthaben: Weiterprobieren hilft nicht
    }
  }
  return last;
}
// Adresse des fertigen Ergebnisses finden (die Antwort ist noch Beta, daher mehrere mögliche Felder)
// deno-lint-ignore no-explicit-any
const flowUrl = (d: any): string => d.content_url || d.output?.content_url || d.output?.url || d.url || (Array.isArray(d.outputs) && (d.outputs[0]?.content_url || d.outputs[0]?.url)) || "";
async function flowWait(type: "image" | "video", key: string, gid: string, maxMs: number): Promise<{ data?: string; mime?: string; wait?: boolean; fail?: boolean } & FlowErr> {
  const t0 = Date.now(), step = type === "image" ? 3000 : 10000;
  while (Date.now() - t0 < maxMs) {
    const r = await fetch(`${XI}/v1/flows/${type}/${encodeURIComponent(gid)}`, { headers: { "xi-api-key": key } });
    if (r.ok) {
      const d = await r.json();
      if (d.status === "failed") { const why = String(d.failure_reason || d.error_message || ""); console.error("blackbox flow failed", why); return { fail: true, detail: why.slice(0, 200) }; }
      const url = flowUrl(d);
      if (d.status === "completed" || url) {
        if (!url) { console.error("blackbox flow ohne url", JSON.stringify(d).slice(0, 300)); return { fail: true, detail: "fertig, aber ohne Adresse: " + JSON.stringify(d).slice(0, 150) }; }
        const f = await fetch(url);
        if (!f.ok) return { fail: true, st: f.status, detail: "Download" };
        const buf = new Uint8Array(await f.arrayBuffer());
        if (buf.length > 25e6) return { fail: true, detail: "Datei größer als 25 MB" };
        return { data: b64(buf), mime: d.content_mime_type || d.output?.content_mime_type || f.headers.get("content-type") || (type === "image" ? "image/png" : "video/mp4") };
      }
    } else if (r.status !== 404 && r.status !== 429) { const t = await r.text(); console.error("blackbox flow get", r.status, t.slice(0, 200)); return { fail: true, st: r.status, detail: t.slice(0, 200) }; }
    await sleep(step);
  }
  return { wait: true };
}

async function eleven(kind: string, prompt: string, subj: string, gid: string, claude: Ask | null, extra: Record<string, unknown>): Promise<Response> {
  const key = Deno.env.get("ELEVEN_KEY");
  if (!key) return json({ err: "nokey11" });
  if (kind === "ton" || kind === "musik") {
    const text = await english(kind, prompt, claude), sec = seconds(prompt);
    const audio = kind === "ton"
      ? await xiAudio("/v1/sound-generation", key, { text, prompt_influence: 0.5, ...(sec ? { duration_seconds: Math.min(30, Math.max(0.5, sec)) } : {}) })
      : await xiAudio("/v1/music", key, { prompt: text, music_length_ms: Math.round(Math.min(600, Math.max(5, sec || 30)) * 1000), force_instrumental: true });
    return audio ? json({ ...extra, kind, audio }) : json({ err: kind });
  }
  if (kind === "foto" || kind === "film") {
    const type = kind === "foto" ? "image" : "video";
    let id = gid;
    if (!id) {
      const st = await flowStart(type, key, await english(kind, prompt, claude));
      if (!st.id) return json({ err: st.st === 402 ? "plan" : kind, st: st.st, detail: st.st === 402 ? "" : st.detail });
      id = st.id;
    }
    const o = await flowWait(type, key, id, type === "image" ? 90000 : 110000);
    if (o.fail) return json({ err: kind, st: o.st, detail: o.detail });
    if (o.wait) return json({ ...extra, kind, err: "warten", gid: id });
    return json({ ...extra, kind, data: o.data, mime: o.mime });
  }
  if (kind === "hoer") {
    if (!claude) return json({ err: "nokey" });
    const m = await claude(KINDS.dialog, (subj ? `Fach: ${subj}\n` : "") + `Wunsch der Lehrkraft: ${prompt}`);
    if (m.stop_reason === "refusal") return json({ err: "refusal" });
    const ls = msgText(m).replace(/^```\w*|```$/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
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

// ---------- Foto über AWS (Amazon Nova Canvas, EU) ----------
// Nova Canvas läuft in Irland (eu-west-1). Modell und Regionen lassen sich per Secret ändern.
const IMG_AWS = (Deno.env.get("BLACKBOX_IMG_MODEL") || "amazon.nova-canvas-v1:0").split(",").map((x) => x.trim()).filter(Boolean);
const IMG_REGIONS = (Deno.env.get("BLACKBOX_IMG_REGIONS") || "eu-west-1,eu-central-1").split(",").map((x) => x.trim()).filter(Boolean);
async function awsFoto(prompt: string, key: string, awsId: string, awsSecret: string): Promise<{ data?: string; st?: number; detail?: string }> {
  const aws = awsId && awsSecret ? new AwsClient({ accessKeyId: awsId, secretAccessKey: awsSecret, service: "bedrock" }) : null;
  const body = JSON.stringify({
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: prompt.slice(0, 1000), negativeText: "text, letters, words, numbers, watermark, logo, signature" },
    imageGenerationConfig: { numberOfImages: 1, width: 1280, height: 720, quality: "standard", cfgScale: 6.5 },
  });
  let last: { st?: number; detail?: string } = {};
  for (const reg of IMG_REGIONS) for (const m of IMG_AWS) {
    const url = `https://bedrock-runtime.${reg}.amazonaws.com/model/${encodeURIComponent(m)}/invoke`;
    const init = { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body };
    try {
      const r = aws ? await aws.fetch(url, { ...init, aws: { region: reg } } as RequestInit) : await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}` } });
      const t = await r.text();
      if (r.ok) {
        const o = JSON.parse(t) as { images?: string[]; error?: string };
        if (o.images?.[0]) { console.log("blackbox foto ok", reg, m); return { data: o.images[0] }; }
        last = { st: r.status, detail: o.error || "kein Bild" };
      } else last = { st: r.status, detail: t.slice(0, 300) };
      console.error("blackbox foto", reg, m, last.st, String(last.detail).slice(0, 200));
      // Inhaltsfilter oder zu viele Anfragen: andere Region hilft nicht.
      if (r.status === 429 || (r.status === 400 && /blocked|filter|content/i.test(t))) return last;
    } catch (e) { last = { detail: String((e as Error).message || e).slice(0, 200) }; console.error("blackbox foto", reg, m, last.detail); }
  }
  return last;
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
  const clean = (n: string) => (Deno.env.get(n) || "").trim().replace(/^["']|["']$/g, ""); // Leerzeichen/Anführungszeichen vom Einfügen weg
  const key = clean("BLACKBOX_KEY"), awsId = clean("BLACKBOX_AWS_ID"), awsSecret = clean("BLACKBOX_AWS_SECRET");
  const hasAws = !!(key || (awsId && awsSecret));
  let body: { kind?: string; prompt?: string; subj?: string; gid?: string } = {};
  try { body = await req.json(); } catch (_) { /* leer */ }
  const xi = ELEVEN_KINDS.includes(String(body.kind));
  if (!hasAws && !xi) return json({ err: "nokey" });
  const kind = xi ? String(body.kind) : KINDS[String(body.kind)] ? String(body.kind) : "bild", K = KINDS[kind];
  const prompt = String(body.prompt || "").trim().slice(0, 600), subj = SUBJ[String(body.subj || "")] || "";
  const gid = /^[\w-]{4,100}$/.test(String(body.gid || "")) ? String(body.gid) : "";

  // Offizieller Bedrock-Client. Bevorzugt IAM-Zugangsschlüssel (SigV4), sonst Bedrock-API-Schlüssel als Bearer.
  const mk = (awsRegion: string) => awsId && awsSecret
    ? new AnthropicBedrockMantle({ awsAccessKey: awsId, awsSecretAccessKey: awsSecret, awsRegion })
    : new AnthropicBedrockMantle({ apiKey: key, awsRegion });
  // deno-lint-ignore no-explicit-any
  const ask = (c: any, model: string, k: { max: number; sys: string }, user: string) => c.messages.stream({
    model, max_tokens: k.max, system: k.sys, messages: [{ role: "user", content: user }],
  }).finalMessage();
  // Alle Wege der Reihe nach: erst klassisch (wie das AWS-Testfenster, läuft sicher), dann Mantle.
  const claude: Ask = async (k, user) => {
    // deno-lint-ignore no-explicit-any
    const tries: [string, () => any, string][] = [];
    if (awsId && awsSecret) for (const m of k.classic) tries.push(["eu-central-1 klassisch", () => new AnthropicBedrock({ awsAccessKey: awsId, awsSecretKey: awsSecret, awsRegion: "eu-central-1" }), m]);
    for (const reg of REGIONS) for (const m of k.model) for (const r of ROUTES) tries.push([reg, () => mk(reg), r + m]);
    let last: unknown;
    const tried: string[] = [];
    for (const [reg, c, m] of tries) {
      try { const msg = await ask(c(), m, k, user); console.log("blackbox ok", reg, m); return msg; } catch (e) {
        last = e;
        const st = (e as { status?: number }).status;
        tried.push(`${reg} ${m} ${st ?? String((e as Error).message || e).slice(0, 60)}`);
        if (st === 429) throw e; // zu viele Anfragen: nicht weiter durchprobieren
      }
    }
    console.error("blackbox versucht:", tried.join(" | "));
    throw last;
  };

  if (xi) {
    try {
      // Nachfragen zu einem laufenden Bild- oder Video-Auftrag zählen nicht noch einmal fürs Tageslimit.
      if (kind === "foto" && !gid && hasAws) {
        if (prompt.length < 3) return json({ err: "leer" });
        const { data: n } = await sb.rpc("blackbox_count");
        if ((n ?? 0) >= LIMIT) return json({ err: "limit", limit: LIMIT });
        await sb.from("blackbox_log").insert({ kind });
        const o = await awsFoto(await english("foto", prompt, claude), key, awsId, awsSecret);
        if (o.data) return json({ kind, data: o.data, mime: "image/png", n: (n ?? 0) + 1, limit: LIMIT });
        return json({ err: o.st === 400 && /blocked|filter|content/i.test(String(o.detail)) ? "filter" : "awsfoto", st: o.st, detail: o.detail });
      }
      if (gid && (kind === "foto" || kind === "film")) return await eleven(kind, prompt, subj, gid, hasAws ? claude : null, {});
      if (prompt.length < 3) return json({ err: "leer" });
      const { data: n } = await sb.rpc("blackbox_count");
      if ((n ?? 0) >= LIMIT) return json({ err: "limit", limit: LIMIT });
      await sb.from("blackbox_log").insert({ kind });
      return await eleven(kind, prompt, subj, "", hasAws ? claude : null, { n: (n ?? 0) + 1, limit: LIMIT });
    } catch (e) { const m = String((e as Error).message || e).slice(0, 200); console.error("blackbox", kind, m); return json({ err: kind, detail: m }); }
  }
  if (prompt.length < 3) return json({ err: "leer" });
  const { data: n } = await sb.rpc("blackbox_count");
  if ((n ?? 0) >= LIMIT) return json({ err: "limit", limit: LIMIT });
  await sb.from("blackbox_log").insert({ kind });
  try {
    const msg = await claude(K, (subj ? `Fach: ${subj}\n` : "") + `Wunsch der Lehrkraft: ${prompt}`);
    if (msg.stop_reason === "refusal") return json({ err: "refusal" });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (kind === "bild" || kind === "szene") {
      const svg = cleanSvg(text);
      return svg ? json({ kind, svg, n: (n ?? 0) + 1, limit: LIMIT }) : json({ err: "kaputt" });
    }
    const ls = text.replace(/^```\w*|```$/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
    return json({ kind, title: (ls[0] || "").replace(/^#+\s*/, "").slice(0, 200), text: ls.slice(1).join("\n").slice(0, 4000), n: (n ?? 0) + 1, limit: LIMIT });
  } catch (e) {
    const st = (e as { status?: number }).status, m = String((e as Error).message || e).slice(0, 300);
    console.error("blackbox", st, m);
    return json({ err: "ki", st, detail: m }); // nur Admins sehen das; enthält keinen Schlüssel
  }
});
