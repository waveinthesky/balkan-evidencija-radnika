const VERSION='balkan-firebase-v7-test-1';
const FILES=['./','./index.html','./admin.html','./firebase-config.js','./firebase-shared.js','./kiosk.js','./admin-firebase.js','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('balkan-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request,u=new URL(req.url);if(req.method!=='GET')return;
 if(u.origin===location.origin){e.respondWith(fetch(req).then(res=>{if(res.ok)caches.open(VERSION).then(c=>c.put(req,res.clone()));return res}).catch(()=>caches.match(req)));return}
 if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/')){
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok)caches.open(VERSION).then(c=>c.put(req,res.clone()));return res})));}
});
