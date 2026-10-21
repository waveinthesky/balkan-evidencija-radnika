// Čuvanje u pregledniku: stari format (7 rezervnih kopija u glavnom zapisu) prelazi u novi bez gubitka;
// podaci i rezervne kopije preživljavaju ponovno otvaranje; brzina čuvanja i prikaza s realnim podacima.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:950}});const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
const boot=async()=>{await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);assert.equal(await page.evaluate(()=>window.__E||''),'')};
await boot();
await page.addScriptTag({content:fs.readFileSync('tests/audit-seed.js','utf8')});
const seeded=await page.evaluate(()=>window.__seedAudit());
// Napravi STARI format: 7 rezervnih kopija UNUTAR glavnog zapisa (kako je bilo do sada)
await page.evaluate(async()=>{
 const S=window.BALKAN_V6.state(),data={...S};delete data._pending;delete data._localBackups;delete data._sync;
 S._localBackups=Array.from({length:7},(_,i)=>({date:'2026-10-'+String(10+i).padStart(2,'0'),at:'2026-10-'+String(10+i).padStart(2,'0')+'T08:00:00.000Z',data:structuredClone(data)}));
 const full=structuredClone(S);
 await new Promise((res,rej)=>{const r=indexedDB.open('balkan-evidencija-v1',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite');tx.objectStore('kv').put(full,'main');tx.objectStore('kv').delete('backups');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)};r.onerror=()=>rej(r.error)});
}).catch(async e=>{ // naziv baze može biti drugačiji – pronađi ga
 throw e});
await boot();
let st=await page.evaluate(()=>({ev:window.BALKAN_V6.state().events.length,bk:window.BALKAN_V6.state()._localBackups.length}));
assert.equal(st.ev,seeded.events,'Stari format: skeniranja učitana');
assert.equal(st.bk,7,'Stari format: 7 rezervnih kopija učitano');
// jedno čuvanje u novom formatu
await page.evaluate(async()=>{const S=window.BALKAN_V6.state();S.overrides.push({id:'mig',empId:'A1',locId:S.locations[0].id,date:'2026-02-03',status:'P'});await save()});
const raw=await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('balkan-evidencija-v1',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readonly'),os=tx.objectStore('kv');const a=os.get('main'),c=os.get('backups');tx.oncomplete=()=>res({mainHasBackups:!!(a.result?._localBackups?.length),backups:(c.result||[]).length,events:a.result?.events?.length})};r.onerror=()=>rej(r.error)}));
assert.equal(raw.mainHasBackups,false,'Novi format: glavni zapis bez rezervnih kopija');
assert.equal(raw.backups,7,'Novi format: 7 rezervnih kopija u posebnom zapisu');
assert.equal(raw.events,seeded.events);
await boot();
st=await page.evaluate(()=>({ev:window.BALKAN_V6.state().events.length,bk:window.BALKAN_V6.state()._localBackups.length,mig:window.BALKAN_V6.state().overrides.some(o=>o.id==='mig')}));
assert.deepEqual(st,{ev:seeded.events,bk:7,mig:true},'Poslije ponovnog otvaranja: sve na mjestu');
// brzina s realnim podacima (30 radnika, cijela godina) i 7 rezervnih kopija
const perf=await page.evaluate(async()=>{const m={};const t=f=>{const a=performance.now();f();return Math.round(performance.now()-a)};
 for(const r of ['pregled','kalendar','izvjestaji','godisnji'])m[r]=t(()=>{route=r;render()});
 const S=window.BALKAN_V6.state();const a=performance.now();S.overrides.push({id:'p2',empId:'A2',locId:S.locations[0].id,date:'2026-02-04',status:'P'});await save();m.save=Math.round(performance.now()-a);return m});
console.log('Brzina (ms):',JSON.stringify(perf));
for(const [k,v] of Object.entries(perf))assert.ok(v<1500,k+' predugo: '+v+' ms');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS ČUVANJE: stari format → novi bez gubitka (7 kopija), podaci preživljavaju ponovno otvaranje, brzina u granicama');
