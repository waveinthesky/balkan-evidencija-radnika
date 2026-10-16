// BALKAN: offline pokretanje kase, bez keširanja administratorskih i privatnih podataka.
const CACHE='balkan-kiosk-offline-20261016-receipts-v3';
const CORE=['./','./index.html','./kiosk.js','./manifest.webmanifest'];
const ALLOWED=new Set(['','index.html','kiosk.js','kiosk-firebase.js','manifest.webmanifest']);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys()){
   if(key.startsWith('balkan-firebase-')||(key.startsWith('balkan-kiosk-offline-')&&key!==CACHE))
    await caches.delete(key);
  }
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 const rel=url.pathname.slice(new URL(self.registration.scope).pathname.length);
 if(!ALLOWED.has(rel))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(req);
   if(response.ok)await cache.put(req,response.clone());
   return response;
  }catch(error){
   const cached=await cache.match(req,{ignoreSearch:true});
   if(cached)return cached;
   if(req.mode==='navigate'){
    const fallback=await cache.match('./index.html');
    if(fallback)return fallback;
   }
   throw error;
  }
 })());
});
