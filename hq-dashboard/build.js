// Baut einen Schnappschuss als eine einzige HTML-Datei (Daten eingebettet).
// Gedacht zum Veröffentlichen als private claude.ai-Seite.
// Aufruf (im Repo-Ordner):  node hq-dashboard/build.js
'use strict';
const fs = require('fs');
const path = require('path');
const { collect } = require('./lib/data');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const data = JSON.stringify(collect()).replace(/</g, '\\u003c');
const out = html.replace('<!--HQ_DATA-->', `<script>window.HQ_DATA=${data};</script>`);
const dir = path.join(__dirname, 'dist');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'elonuki-hq.html'), out);
console.log('Geschrieben: hq-dashboard/dist/elonuki-hq.html');
