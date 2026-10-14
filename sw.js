// BALKAN V9: uklanjanje zastarjelog service worker keša iz prethodnih verzija.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('balkan-firebase-'))await caches.delete(key);
 await self.registration.unregister();await self.clients.claim();
})())});
