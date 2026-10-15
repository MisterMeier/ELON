// ELONUKI HQ – lokaler, passwortgeschützter Server. Keine Zusatzpakete nötig.
// Start (im Repo-Ordner):  node hq-dashboard/server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// .env einlesen (liegt neben dieser Datei, ist in .gitignore)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {}

const { collect } = require('./lib/data');
const PASS = process.env.HQ_PASSWORD || '';
const PORT = +process.env.HQ_PORT || 4747;
const HOST = process.env.HQ_HOST || '127.0.0.1';

if (PASS.length < 8) {
  console.error('HQ_PASSWORD fehlt oder ist kürzer als 8 Zeichen.\nLege hq-dashboard/.env an (Vorlage: hq-dashboard/.env.example).');
  process.exit(1);
}

const same = (a, b) => { a = Buffer.from(a); b = Buffer.from(b); return a.length === b.length && crypto.timingSafeEqual(a, b); };
function authed(req) {
  const m = (req.headers.authorization || '').match(/^Basic (.+)$/);
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  return same(pass, PASS);
}

http.createServer((req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  if (!authed(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="ELONUKI HQ", charset="UTF-8"' });
    return res.end('Passwort nötig.');
  }
  const url = req.url.split('?')[0];
  if (url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(collect()));
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.writeHead(404); res.end('Nicht gefunden');
}).listen(PORT, HOST, () => {
  console.log(`ELONUKI HQ läuft: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (Benutzername beliebig, Passwort aus .env)`);
});
