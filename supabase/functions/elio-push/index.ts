// ELIO · Edge Function „elio-push“: verschickt fällige Erinnerungen als Push an die iPads der Klasse.
// Wird alle 15 Minuten vom Zeitplan in supabase/push.sql aufgerufen.
// Secrets (Supabase → Edge Functions → Secrets): VAPID_JWK (privater Schlüssel als JSON), VAPID_PUB, CRON_SECRET.
// Die Mitteilung hat keinen Inhalt. Das iPad zeigt selbst „Denk an deine Erinnerung in ELIO.“ (siehe sw.js).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();
let KEY: CryptoKey | null = null;

// VAPID: kurzer, signierter Ausweis des Servers für den Push-Dienst (ES256)
async function vapid(endpoint: string): Promise<string> {
  if (!KEY) KEY = await crypto.subtle.importKey("jwk", JSON.parse(Deno.env.get("VAPID_JWK")!), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://elio.schule" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, KEY, enc.encode(head + "." + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${Deno.env.get("VAPID_PUB")}`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-elio-cron") !== Deno.env.get("CRON_SECRET")) return new Response("nein", { status: 401 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: jobs } = await sb.from("push_jobs").select("id,class_id").is("sent_at", null).lte("send_at", new Date().toISOString()).gte("send_at", since);
  let sent = 0, gone = 0;
  for (const j of jobs || []) {
    const { data: subs } = await sb.from("push_subs").select("endpoint").eq("class_id", j.class_id);
    for (const s of subs || []) {
      try {
        const r = await fetch(s.endpoint, { method: "POST", headers: { Authorization: await vapid(s.endpoint), TTL: "43200", Urgency: "normal", "Content-Length": "0" } });
        if (r.status === 404 || r.status === 410) { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); gone++; } else if (r.ok) sent++;
      } catch (_) { /* nächstes Gerät */ }
    }
    await sb.from("push_jobs").update({ sent_at: new Date().toISOString() }).eq("id", j.id);
  }
  // Alte Aufträge aufräumen
  await sb.from("push_jobs").delete().lt("send_at", new Date(Date.now() - 14 * 86400 * 1000).toISOString());
  return new Response(JSON.stringify({ jobs: (jobs || []).length, sent, gone }), { headers: { "Content-Type": "application/json" } });
});
