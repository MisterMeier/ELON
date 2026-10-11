// ELIO: Mitteilungen (Erinnerungen an Übungsaufträge) und Offline-Betrieb der Tafel.
// Immer zuerst aus dem Netz (damit neue Versionen sofort da sind), ohne Netz aus dem Zwischenspeicher.
// Gespeichert werden nur ELIOs eigene Dateien (Seite, Bilder, Schriften, Geräusche), keine Daten von Kindern und nichts von Supabase.
const C='elio-v1';
const CORE=['./','index.html','assets/fonts/fonts.css','assets/fonts/baloo2-latin-1.woff2','assets/fonts/baloo2-latin-ext-0.woff2','assets/fonts/nunito-latin-3.woff2','assets/fonts/nunito-latin-ext-2.woff2',
  'assets/folien/allgemein.webp','assets/folien/start.webp','assets/folien/idle.webp','assets/folien/rakete.webp','assets/elo/e.png','assets/elo/elo.png','assets/vendor/qrcode.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||/version\.txt$/.test(u.pathname))return;
  e.respondWith((async()=>{const c=await caches.open(C);
    try{const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),6000);const res=await fetch(r,{signal:ctl.signal});clearTimeout(t);if(res.ok&&res.type==='basic')c.put(r,res.clone()).catch(()=>{});return res}
    catch(x){const hit=await c.match(r,{ignoreSearch:true})||(r.mode==='navigate'?await c.match('index.html'):null);if(hit)return hit;throw x}})())});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{for(const c of L)if('focus' in c)return c.focus();return self.clients.openWindow('./')}))});
