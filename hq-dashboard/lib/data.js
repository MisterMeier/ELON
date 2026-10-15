// Sammelt alle HQ-Daten: /hq-Markdown, GitHub (gh CLI) und Claude-Code-Verbrauch.
// Wird bei jedem Seitenaufruf neu ausgeführt. Ruft keine KI auf.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HQ = path.join(ROOT, 'hq');
const FIELDS = ['kommandozentrale', 'baumeister', 'bugs', 'design', 'sicherheit-recht', 'kommerz'];
const DAY = 864e5;

// ---------- Markdown ----------
function parseTable(lines) {
  const rows = lines.filter(l => /^\s*\|/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.toLowerCase());
  return rows.slice(2).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}
function statusOf(s) {
  s = (s || '').toLowerCase();
  if (/rot|red/.test(s)) return 'rot';
  if (/gr(ü|ue)n|green/.test(s)) return 'gruen';
  return 'gelb';
}
function parseField(name) {
  const file = path.join(HQ, name + '.md');
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return { id: name, missing: true, title: name, status: 'rot', progress: 0, goal: 'Datei hq/' + name + '.md fehlt.', next: [], doing: [], done: [] }; }
  const title = (txt.match(/^#\s+(.+)$/m) || [, name])[1].trim();
  const sec = {};
  let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { cur = m[1].trim().toLowerCase(); sec[cur] = []; continue; }
    if (cur) sec[cur].push(line);
  }
  const text = k => (sec[k] || []).join('\n').trim();
  const list = k => (sec[k] || []).filter(l => /^\s*[-*]\s+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim());
  const key = re => Object.keys(sec).find(k => re.test(k));
  const f = {
    id: name, title,
    goal: text('ziel'),
    status: statusOf(text('status')),
    progress: Math.max(0, Math.min(100, parseInt((text('fortschritt').match(/\d+/) || [0])[0], 10))),
    next: list(key(/n(ä|ae)chste/) || 'x'),
    doing: list('in arbeit'),
    done: list('erledigt'),
  };
  if (name === 'bugs') f.bugs = parseTable(sec[key(/^bugs?$/) || 'bugs'] || []);
  if (name === 'kommandozentrale') f.milestones = parseTable(sec[key(/meilenstein/) || 'meilensteine'] || []);
  return f;
}

// ---------- GitHub über gh CLI (Token bleibt bei gh, nie im Code) ----------
function repoSlug() {
  if (process.env.HQ_REPO) return process.env.HQ_REPO;
  try {
    const url = execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const m = url.match(/([\w.-]+)\/([\w.-]+?)(\.git)?$/);
    if (m) return m[1] + '/' + m[2];
  } catch (e) {}
  return '';
}
function gh(apiPath) {
  const out = execFileSync('gh', ['api', apiPath], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}
function github() {
  const repo = repoSlug();
  const res = { repo, issues: [], prs: [], commits: [], recentPrs: [], error: null };
  if (!repo) { res.error = 'Kein GitHub-Repo erkannt (HQ_REPO in .env setzen).'; return res; }
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  try {
    res.issues = gh(`repos/${repo}/issues?state=open&per_page=50`).filter(i => !i.pull_request)
      .map(i => ({ number: i.number, title: i.title, url: i.html_url, labels: i.labels.map(l => l.name), created: i.created_at }));
    const pulls = gh(`repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=30`);
    res.prs = pulls.filter(p => p.state === 'open').map(p => ({ number: p.number, title: p.title, url: p.html_url, draft: p.draft }));
    res.recentPrs = pulls.filter(p => p.updated_at >= since).map(p => ({ number: p.number, title: p.title, url: p.html_url, state: p.merged_at ? 'merged' : p.state, updated: p.updated_at }));
    res.commits = gh(`repos/${repo}/commits?since=${since}&per_page=50`)
      .map(c => ({ sha: c.sha.slice(0, 7), msg: c.commit.message.split('\n')[0], date: c.commit.author.date, url: c.html_url }));
  } catch (e) {
    res.error = 'GitHub nicht erreichbar: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 200) + ' (gh installiert und mit „gh auth login“ angemeldet?)';
  }
  return res;
}

// ---------- Effizienz: lokale Claude-Code-Protokolle (nur lesen) ----------
function logDirs() {
  if (process.env.CLAUDE_LOGS_DIR) return [process.env.CLAUDE_LOGS_DIR];
  const base = path.join(os.homedir(), '.claude', 'projects');
  const want = ROOT.replace(/[^A-Za-z0-9]/g, '-');
  try { return fs.readdirSync(base).filter(d => d === want).map(d => path.join(base, d)); } catch (e) { return []; }
}
function family(model) {
  model = model || '';
  if (/opus/i.test(model)) return 'opus';
  if (/sonnet/i.test(model)) return 'sonnet';
  if (/haiku/i.test(model)) return 'haiku';
  if (/fable/i.test(model)) return 'fable';
  return 'andere';
}
// Relative Kostenpunkte (Input = 1): Output 5, Cache-Schreiben 1,25, Cache-Lesen 0,1.
const weight = u => u.input + 5 * u.output + 1.25 * u.cacheWrite + 0.1 * u.cacheRead;

function claudeMdLines() {
  try { return fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').split('\n').length; } catch (e) { return 0; }
}
function efficiency() {
  const dirs = logDirs();
  const sessions = {};
  const days = {};
  const seen = new Set();
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch (e) {}
    for (const f of files) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
      for (const line of txt.split('\n')) {
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        if (o.type !== 'assistant' || !o.message) continue;
        const sid = o.sessionId || f.replace('.jsonl', '');
        const s = sessions[sid] || (sessions[sid] = { id: sid, title: '', start: o.timestamp, end: o.timestamp, turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, models: {}, reads: {} });
        if (o.timestamp < s.start) s.start = o.timestamp;
        if (o.timestamp > s.end) s.end = o.timestamp;
        for (const c of o.message.content || []) {
          if (c.type === 'tool_use' && c.name === 'Read' && c.input && c.input.file_path) s.reads[c.input.file_path] = (s.reads[c.input.file_path] || 0) + 1;
        }
        const u = o.message.usage;
        const mid = o.message.id || o.uuid;
        if (!u || seen.has(mid)) continue;
        seen.add(mid);
        const add = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
        s.turns++;
        for (const k in add) s[k] += add[k];
        const fam = family(o.message.model);
        s.models[fam] = (s.models[fam] || 0) + add.input + add.output + add.cacheRead + add.cacheWrite;
        const d = (o.timestamp || '').slice(0, 10);
        const dd = days[d] || (days[d] = { day: d, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
        for (const k in add) dd[k] += add[k];
      }
      // Titel der Sitzung, falls protokolliert
      const t = txt.match(/"type":"ai-title"[^\n]*?"(?:aiTitle|title)":"([^"]{1,120})"/);
      const sid = f.replace('.jsonl', '');
      if (t && sessions[sid]) sessions[sid].title = t[1];
    }
  }
  const list = Object.values(sessions).map(s => {
    const total = s.input + s.output + s.cacheRead + s.cacheWrite;
    const big = Object.entries(s.reads).filter(([p, n]) => {
      if (n < 3) return false;
      try { return fs.statSync(p).size > 100 * 1024; } catch (e) { return n >= 5; }
    }).map(([p, n]) => ({ path: p, count: n }));
    return { id: s.id, title: s.title, start: s.start, end: s.end, turns: s.turns, total, points: Math.round(weight(s)),
      cacheShare: total ? (s.cacheRead / (s.input + s.cacheRead + s.cacheWrite || 1)) : 0,
      hours: (new Date(s.end) - new Date(s.start)) / 36e5, models: s.models, bigReads: big };
  }).sort((a, b) => b.points - a.points);

  const sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  Object.values(days).forEach(d => { for (const k in sum) sum[k] += d[k]; });
  const models = {};
  list.forEach(s => { for (const m in s.models) models[m] = (models[m] || 0) + s.models[m]; });
  const total = sum.input + sum.output + sum.cacheRead + sum.cacheWrite;
  const lines = claudeMdLines();

  const warnings = [];
  for (const s of list) {
    const name = s.title || s.id.slice(0, 8);
    if (s.turns > 150 || s.hours > 3) warnings.push({ kind: 'Lange Sitzung', detail: `${name}: ${s.turns} Antworten, ${s.hours.toFixed(1)} h`, tip: 'Pro Aufgabe einen neuen Thread starten; lange Verläufe werden bei jeder Antwort neu mitgeschickt.' });
    for (const b of s.bigReads) warnings.push({ kind: 'Große Datei mehrfach gelesen', detail: `${path.basename(b.path)} ${b.count}× in ${name}`, tip: 'Große Dateien einmal in ein kurzes Digest zusammenfassen und danach nur noch gezielte Stellen lesen.' });
    const opus = s.models.opus || 0;
    if (opus && opus / (s.total || 1) > 0.5 && s.turns <= 15) warnings.push({ kind: 'Opus für Kleinaufgabe', detail: `${name}: nur ${s.turns} Antworten mit Opus`, tip: 'Kleine Änderungen und Fragen mit Sonnet erledigen; Opus für große Umbauten aufheben.' });
  }
  if (lines > 150) warnings.push({ kind: 'CLAUDE.md zu groß', detail: `${lines} Zeilen`, tip: 'Details aus CLAUDE.md nach /hq auslagern, damit die Datei unter 150 Zeilen bleibt.' });
  if (total > 0) {
    const share = sum.cacheRead / (sum.input + sum.cacheRead + sum.cacheWrite || 1);
    if (share < 0.5) warnings.push({ kind: 'Wenig Cache', detail: `Cache-Anteil ${Math.round(share * 100)} %`, tip: 'Längere Pausen mitten in einer Aufgabe vermeiden; der Zwischenspeicher verfällt sonst und alles wird neu gelesen.' });
  }

  return {
    source: dirs.length ? dirs.join(', ') : null,
    sessionsFound: list.length,
    days: Object.values(days).sort((a, b) => a.day < b.day ? -1 : 1),
    sessions: list.slice(0, 20),
    totals: { ...sum, total, points: Math.round(weight(sum)) },
    models,
    cacheShare: total ? sum.cacheRead / (sum.input + sum.cacheRead + sum.cacheWrite || 1) : 0,
    claudeMdLines: lines,
    warnings,
  };
}

// ---------- Systeme und Stand ----------
function readMd(name) { try { return fs.readFileSync(path.join(HQ, name + '.md'), 'utf8'); } catch (e) { return ''; } }
function systems() {
  const sec = {}; let cur = null;
  for (const line of readMd('systeme').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { cur = m[1].trim().toLowerCase(); sec[cur] = []; continue; }
    if (cur) sec[cur].push(line);
  }
  const services = parseTable(sec['dienste'] || []).map(r => ({
    name: r.name, purpose: r.zweck, status: (r.status || '').toLowerCase(), costText: r['kosten pro monat'] || '?',
    cost: /\d/.test(r['kosten pro monat'] || '') ? parseFloat((r['kosten pro monat'].match(/\d+([.,]\d+)?/) || ['0'])[0].replace(',', '.')) : null,
    home: r['hauptgebäude'] || r.hauptgebaeude || '',
  }));
  const links = parseTable(sec['verbindungen'] || []).map(r => ({
    from: r.von, to: r.nach, purpose: r.zweck, status: (r.status || '').toLowerCase(), reason: r.grund, last: r['letzte aktivität'] || '',
  }));
  return { services, links };
}

function collect() {
  return {
    generated: new Date().toISOString(),
    fields: FIELDS.map(parseField),
    systems: systems(),
    stand: readMd('stand'),
    github: github(),
    efficiency: efficiency(),
  };
}

module.exports = { collect };
