// ELIO: nur für Mitteilungen (Erinnerungen an Übungsaufträge). Speichert nichts zwischen.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{for(const c of L)if('focus' in c)return c.focus();return self.clients.openWindow('./')}))});
