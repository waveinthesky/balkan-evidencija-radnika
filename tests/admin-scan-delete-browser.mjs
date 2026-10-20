// Brisanje skeniranja: vidljivo dugme, brisanje samo izabranog, preračun kašnjenja, istorija i vraćanje,
// opcionalno brisanje ručnih statusa samo za izabrane dane, pojedinačno brisanje + Poništi.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const shots=process.env.SHOTS;
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:950}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
const seed=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id,t=today(),d=new Date();
 const at=(h,m)=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),h,m).toISOString();
 const mk=(id,n)=>({id,name:n,barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:'2025-01-01',defaultLocationId:loc,assignments:[{from:'2025-01-01',locationId:loc}]});
 S.employees.push(mk('dA','Amra Brisanje'),mk('dB','Edin Ostaje'));
 S.events.push({id:'a-in',empId:'dA',locId:loc,kind:'in',at:at(9,40),source:'barcode'},{id:'a-out',empId:'dA',locId:loc,kind:'out',at:at(15,0),source:'barcode'},
  {id:'b-in',empId:'dB',locId:loc,kind:'in',at:at(9,30),source:'barcode'});
 S.overrides.push({id:'ovA',empId:'dA',locId:loc,date:t,status:'P',note:'test'},{id:'ovOther',empId:'dA',locId:loc,date:'2026-01-05',status:'GO',note:'drugi dan'});
 window.BALKAN_V6.render();
 const A=S.employees.find(e=>e.id==='dA');
 return {loc,t,late:tardiness(A,t,loc)};
});
await page.getByRole('button',{name:/Kalendar/}).first().click();
const openBtn=page.locator('.intro [data-bkd-open]');
assert.ok(await openBtn.isVisible(),'Dugme "Brisanje skeniranja" vidljivo u zaglavlju kalendara');
assert.match(await openBtn.innerText(),/Brisanje skeniranja/);
await openBtn.click();
await page.waitForSelector('.bkd-tabs');
await page.locator('[data-bkd-field=emp]').selectOption('dA');
assert.equal(await page.locator('.bkd-row').count(),2,'Filter radnika: 2 skeniranja');
await page.locator('[data-bkd-all]').click();
assert.match(await page.locator('.bkd-impact').innerText(),/Biće obrisano 2 skeniranja/);
if(shots)await page.screenshot({path:shots+'-modal.png'});
await page.locator('[data-bkd-delete]').click();
let st=await page.evaluate(({loc,t})=>{const S=window.BALKAN_V6.state(),A=S.employees.find(e=>e.id==='dA');
 return {ev:S.events.map(v=>v.id),trash:S.scanTrash.length,ov:S.overrides.map(o=>o.id),late:tardiness(A,t,loc)}},seed);
assert.deepEqual(st.ev.filter(id=>['a-in','a-out','b-in'].includes(id)),['b-in'],'Obrisana samo izabrana skeniranja; drugi radnik ostaje');
assert.equal(st.trash,1,'Zapis u istoriji brisanja');
assert.ok(st.ov.includes('ovA'),'Ručni status ostaje kad opcija nije označena');
assert.ok(!(st.late>0),'Kašnjenje za taj dan uklonjeno (bilo: '+seed.late+')');
assert.ok(await page.locator('.bkd-batch').count()===1,'Prikazana istorija brisanja');
if(shots)await page.screenshot({path:shots+'-history.png'});
await page.locator('[data-bkd-restore]').click();
st=await page.evaluate(({loc,t})=>{const S=window.BALKAN_V6.state(),A=S.employees.find(e=>e.id==='dA');
 return {ev:S.events.map(v=>v.id),late:tardiness(A,t,loc),restored:!!S.scanTrash[0].restoredAt}},seed);
assert.ok(st.ev.includes('a-in')&&st.ev.includes('a-out'),'Vraćena skeniranja');
assert.equal(st.late,seed.late,'Kašnjenje ponovo izračunato kao prije');
assert.ok(st.restored,'Zapis označen kao vraćen');
// brisanje zajedno s ručnim statusom samo za izabrani dan
await page.locator('[data-bkd-tab=delete]').click();
await page.locator('[data-bkd-field=emp]').selectOption('dA');
await page.locator('[data-bkd-all]').click();
await page.locator('[data-bkd-ovr]').check();
assert.match(await page.locator('.bkd-impact').innerText(),/Ručni statusi za te dane koji se brišu: 1/);
await page.locator('[data-bkd-delete]').click();
st=await page.evaluate(()=>window.BALKAN_V6.state().overrides.map(o=>o.id));
assert.ok(!st.includes('ovA'),'Ručni status izabranog dana obrisan');
assert.ok(st.includes('ovOther'),'Ručni status drugog dana NIJE diran');
await page.locator('.bkd-batch:not(.restored) [data-bkd-restore]').click();
st=await page.evaluate(()=>window.BALKAN_V6.state().overrides.map(o=>o.id));
assert.ok(st.includes('ovA'),'Ručni status vraćen');
await page.locator('[data-act=close-modal]').first().click();
// pojedinačno brisanje iz detalja dana + Poništi
await page.locator('.bk-cal button.cell[data-emp="dB"][data-day="'+seed.t+'"]').click();
await page.locator('[data-bk-undo]').click(); // vrati status poslije klika u kalendaru
await page.waitForSelector('#dayPanel [data-del-event="b-in"]');
await page.locator('#dayPanel [data-del-event="b-in"]').click();
assert.ok(!(await page.evaluate(()=>window.BALKAN_V6.state().events.some(v=>v.id==='b-in'))),'Pojedinačno obrisano');
await page.waitForSelector('#bkCalToast.show [data-bk-undo]');
await page.locator('#bkCalToast [data-bk-undo]').click();
assert.ok(await page.evaluate(()=>window.BALKAN_V6.state().events.some(v=>v.id==='b-in')),'Poništi vraća pojedinačno brisanje');
// imena u kalendaru nisu podebljana
const fw=await page.evaluate(()=>getComputedStyle(document.querySelector('.bk-cal td.name b')).fontWeight);
assert.ok(Number(fw)<=500,'Imena radnika nisu bold: '+fw);
// istorija sačuvana nakon ponovnog učitavanja
await page.waitForTimeout(400);await page.reload();await page.waitForFunction(()=>window.__B||window.__E);
assert.ok(await page.evaluate(()=>window.BALKAN_V6.state().scanTrash.length)>=3,'Istorija brisanja sačuvana');
assert.ok(await page.evaluate(()=>window.BALKAN_V6.collections().includes('scanTrash')),'Istorija se sinhronizuje s Firebaseom');
if(shots){await page.getByRole('button',{name:/Kalendar/}).first().click();await page.screenshot({path:shots+'-cal.png'})}
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS BRISANJE: vidljivo dugme, samo izabrano, kašnjenje '+seed.late+' min uklonjeno i vraćeno, ručni status samo za izabrani dan, pojedinačno + Poništi, istorija sačuvana i sinhronizovana, imena nisu bold');
