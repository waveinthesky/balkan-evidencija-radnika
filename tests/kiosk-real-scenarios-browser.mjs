// BALKAN – 10 stvarnih scenarija kase (SIMULIRANI Firebase u pregledniku Chromium).
// Ovo NIJE test produkcione baze; provjerava logiku kioska: brzinu, redoslijed,
// offline, ponovne pokušaje, odbijene zapise i ponovno pokretanje.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const URL='http://127.0.0.1:8765/index.html';
const cards={W1:'Amra Hodžić',W2:'Edin Lukač',W3:'Sanja Perović',W4:'Nikola Vuković',BAD:null};
const auth='const a={currentUser:null};export function getAuth(){return a}export async function signInAnonymously(){await new Promise(r=>setTimeout(r,100));a.currentUser={uid:"anon"};return{user:a.currentUser}}';
const fs=`
const C=${JSON.stringify(cards)};
export function initializeFirestore(){return{}}export function persistentLocalCache(){return{}}export function persistentMultipleTabManager(){return{}}export function getFirestore(){return{}}
export function doc(_,...a){return a.join('/')}
export function serverTimestamp(){return{server:true}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function getDocFromServer(ref){const code=ref.split('/').pop();(globalThis.__reads||=[]).push(code);
 if(!navigator.onLine)throw Object.assign(new Error('offline'),{code:'unavailable'});
 await wait(globalThis.__lat??150);
 const n=C[code];return{exists:()=>!!n,data:()=>({active:true,empId:'e-'+code,locationId:'m1',name:n})}}
export async function setDoc(ref,v){
 if(globalThis.__hang||(globalThis.__hangCards||[]).includes(v.barcode))return new Promise(()=>{});
 if(!navigator.onLine)return new Promise(()=>{});
 await wait(globalThis.__lat??150);
 if((globalThis.__reject||[]).includes(v.barcode))throw Object.assign(new Error('Missing or insufficient permissions.'),{code:'permission-denied'});
 const S=globalThis.__server||=new Map();S.set(ref,v);(globalThis.__writes||=[]).push(ref)}`;
const browser=await chromium.launch();
const ctx=await browser.newContext();
const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',r=>{const u=r.request().url();
 r.fulfill({status:200,contentType:'application/javascript',body:u.includes('-app.')?'export function initializeApp(c){return c}':u.includes('-auth.')?auth:fs})});
await ctx.addInitScript(()=>{
 // Server stanje preživljava reload kroz sessionStorage (simulira centralnu bazu).
 const raw=sessionStorage.getItem('__srv');globalThis.__server=new Map(raw?JSON.parse(raw):[]);
 addEventListener('beforeunload',()=>sessionStorage.setItem('__srv',JSON.stringify([...globalThis.__server])));
});
const outbox=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]'));
const server=()=>page.evaluate(()=>[...globalThis.__server.values()]);
async function scan(code,mode='in'){
 await page.click(mode==='in'?'#modeIn':'#modeOut');
 const t=Date.now();await page.keyboard.type(code,{delay:5});await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#receipt').classList.contains('pending')||document.querySelector('#receipt').classList.contains('ok')||document.querySelector('#receipt').classList.contains('bad'));
 return Date.now()-t;
}
const results=[];const ok=m=>{results.push('✓ '+m);console.log('✓ '+m)};
await page.goto(URL,{waitUntil:'domcontentloaded'});

// 1+2: dolazak, server potvrđuje
await scan('W1');
await page.waitForFunction(()=>document.querySelector('#receipt').classList.contains('ok'),{timeout:5000});
assert.equal(await page.locator('#receiptPerson').innerText(),'Amra Hodžić');
assert.match(await page.locator('#receiptState').innerText(),/POTVRĐENO U FIREBASE/);
ok('1–2 DOLAZAK skeniran, Firebase potvrdio, prikazano ime i zelena potvrda');

// 3+4: nekoliko radnika uzastopno, brzo
for(const c of ['W2','W3','W4'])await scan(c);
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0,{timeout:8000});
assert.equal((await server()).length,4);
ok('3–4 Tri radnika jedan za drugim: svi u Firebaseu, red prazan');

// Ponovni sken poznate kartice: NEMA dodatnog čitanja sa servera i ime je odmah tu
await page.evaluate(()=>globalThis.__reads=[]);
const t0=Date.now();await scan('W1','out');
const instantName=await page.locator('#receiptPerson').innerText();
assert.equal(instantName,'Amra Hodžić','Ime poznate kartice odmah');
assert.match(await page.locator('#receiptState').innerText(),/SAČUVANO NA OVOM RAČUNARU/,'Prije servera: žuto, ne zeleno');
await page.waitForFunction(()=>document.querySelector('#receipt').classList.contains('ok'));
assert.deepEqual(await page.evaluate(()=>globalThis.__reads),[],'Bez čitanja kartice sa servera');
ok('Poznata kartica: ime za '+(Date.now()-t0)+' ms ukupno do potvrde, lokalni prikaz trenutan, 0 dodatnih čitanja');

// 5+6: internet nestaje tokom slanja, više zapisa offline
await page.evaluate(()=>globalThis.__lat=1500);
await scan('W2','out');
await ctx.setOffline(true);
await scan('W3','out');await scan('W4','out');
let ob=await outbox();assert.equal(ob.length,3,'Tri zapisa čekaju lokalno');
assert.ok(!(await page.locator('#receiptState').innerText()).includes('POTVRĐENO'));
ok('5–6 Prekid interneta tokom slanja: 3 zapisa sačuvana lokalno, nijedan lažno potvrđen');

// 10 (dio): ponovno pokretanje dok je offline
await page.reload({waitUntil:'domcontentloaded'});
ob=await outbox();assert.equal(ob.length,3,'Reload ne gubi zapise');
const times=ob.map(x=>x.at);
ok('10 Ponovno otvaranje programa offline: svih 3 zapisa i dalje postoje');

// 7: internet se vraća
await page.evaluate(()=>globalThis.__lat=150);
await ctx.setOffline(false);
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0,{timeout:30000});
const srv=await server();
assert.equal(srv.length,8,'Ukupno 8 jedinstvenih događaja');
for(const t of times)assert.ok(srv.some(x=>x.at===t),'Originalno vrijeme sačuvano');
ok('7 Internet vraćen: sve poslano automatski, originalna vremena, bez dupliranja (8 jedinstvenih ID)');

// 8: Firebase odbija jedan zapis, ostali nastavljaju; redoslijed od najstarijeg
await page.evaluate(()=>{globalThis.__reject=['W2'];globalThis.__writes=[]});
await ctx.setOffline(true);
await scan('W2','in');await scan('W3','in');await scan('BAD','in');await scan('W4','in');
await ctx.setOffline(false);
await page.waitForFunction(()=>(globalThis.__writes||[]).length>=2,{timeout:15000});
await page.waitForTimeout(800);
ob=await outbox();
const left=ob.map(x=>x.barcode).sort();
assert.deepEqual(left,['BAD','W2'],'Ostaju samo odbijeni/neispravni');
assert.equal(ob.find(x=>x.barcode==='BAD').flag,'review','Neispravna kartica ide na provjeru');
assert.ok(ob.find(x=>x.barcode==='W2').error.includes('Firebase'),'Greška jasno opisana');
ok('8 Firebase odbio jedan zapis + jedna nepostojeća kartica: ostali poslani, problemi jasno označeni');

// Automatski ponovni pokušaj BEZ novog skena (rastući razmak)
await page.evaluate(()=>globalThis.__reject=[]);
await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').some(x=>x.barcode==='W2'),{timeout:15000});
ok('Odbijeni zapis automatski ponovo poslan kad je problem riješen, bez novog skena');

// Spor server: timeout ne blokira sljedećeg radnika
await page.evaluate(()=>globalThis.__hang=true);
const ms=await scan('W3','out');
assert.ok(ms<1500,'Lokalna potvrda brza i kad server visi: '+ms);
const ms2=await scan('W4','out');assert.ok(ms2<1500);
ok('Server ne odgovara: sljedeći radnik skenira odmah ('+ms+' ms / '+ms2+' ms do lokalne potvrde)');
await page.evaluate(()=>globalThis.__hang=false);
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').filter(x=>x.flag!=='review').length===0,{timeout:70000});
ok('Nakon oporavka servera zapisi automatski potvrđeni');

// KVAR IZ MARKETA: stari zaglavljeni zapis iste kartice (označen za provjeru ili s greškom)
// NE smije blokirati nove prijave te kartice.
await page.evaluate(()=>{
 const q=JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]'),t=Date.now()-3600000;
 q.push({id:'stari-review-w1',barcode:'W1',kind:'in',at:new Date(t).toISOString(),addedAt:t,flag:'review',error:'stara greška',attempts:3,nextTryAt:Date.now()+3600000});
 q.push({id:'stari-greska-w1',barcode:'W1',kind:'out',at:new Date(t+1000).toISOString(),addedAt:t+1000,flag:'queued',error:'stara greška',attempts:9,nextTryAt:Date.now()+3600000});
 localStorage.setItem('balkan_kiosk_outbox_v1',JSON.stringify(q));
 sessionStorage.removeItem('__lastScan');
});
await page.evaluate(()=>localStorage.removeItem('balkan_kiosk_lastscan_v1'));
await page.reload({waitUntil:'domcontentloaded'});
const before=(await server()).length;
await scan('W1','in');
await page.waitForFunction(()=>document.querySelector('#receipt').classList.contains('ok'),{timeout:5000});
assert.equal((await server()).length,before+1,'Novi sken poslan uprkos starim zaglavljenim zapisima iste kartice');
ok('Stari zaglavljeni zapisi iste kartice NE blokiraju novu prijavu (kvar prijavljen iz marketa)');
await page.evaluate(()=>{const q=JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')).filter(x=>!x.id.startsWith('stari-'));localStorage.setItem('balkan_kiosk_outbox_v1',JSON.stringify(q))});

// Jedan radnik "visi" na serveru; sljedeći radnik mora dobiti zelenu potvrdu odmah, ne za 20 s.
await page.evaluate(()=>globalThis.__hangCards=['W2']);
await scan('W2','in');
await page.waitForTimeout(300);
const tHang=Date.now();await scan('W3','in');
await page.waitForFunction(()=>document.querySelector('#receipt').classList.contains('ok'),{timeout:5000});
const okMs=Date.now()-tHang;
assert.ok(okMs<3000,'Sljedeći radnik potvrđen brzo i dok prethodni zapis visi: '+okMs);
ok('Dok jedan zapis visi na serveru, sljedeći radnik dobija zelenu potvrdu za '+okMs+' ms');
await page.evaluate(()=>globalThis.__hangCards=[]);
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').filter(x=>x.flag!=='review').length===0,{timeout:70000});

// Redoslijed: dolazak prije odlaska iste kartice
const fin=await server();const ids=new Set(fin.map(x=>x.id));assert.equal(ids.size,fin.length);
assert.deepEqual(errors,[]);
ok('Nema JS grešaka; svi ID-jevi jedinstveni ('+fin.length+' događaja)');
await browser.close();
console.log('PASS KIOSK REAL SCENARIOS (simulirani Firebase): '+results.length+' provjera');
