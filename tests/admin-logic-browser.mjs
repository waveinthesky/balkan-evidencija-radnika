// Ručno izračunati primjeri: obračun sati i statusa mora dati tačno ove brojeve.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch();const page=await b.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})()`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B);
const r=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 const L=(d,h,m)=>new Date(d+'T00:00:00').getTime()+((h*60+m)*60000);
 const iso=t=>new Date(t).toISOString();
 const e={id:'L1',name:'Logika',barcode:newEan13(),active:true,hiredAt:'2025-01-01',defaultLocationId:loc,assignments:[{from:'2025-01-01',locationId:loc}],sickLeaves:[{id:'s',from:'2026-03-11',to:'2026-03-12'}]};
 S.employees.push(e);
 const ev=(id,d,h,m,k)=>S.events.push({id,empId:'L1',locId:loc,kind:k,at:iso(L(d,h,m)),source:'barcode'});
 ev('a','2026-03-02',7,30,'in');ev('b','2026-03-02',15,45,'out');           // 8 h 15 min
 ev('c','2026-03-03',22,0,'in');ev('d','2026-03-04',6,0,'out');             // noćna: 8 h, pripada 3.3.
 ev('e','2026-03-05',7,0,'in');                                              // bez odjave
 ev('f','2026-03-06',7,0,'in');ev('g','2026-03-06',7,5,'in');ev('h','2026-03-06',15,5,'out'); // dupli dolazak
 const day=d=>{const z=eventsDay('L1',loc,d);return {w:z.worked,s:dayStatus(e,d,loc)}};
 S.leaveGrants.push({id:'gl',empId:'L1',year:2026,days:20,weekdays:[1,2,3,4,5]});
 S.holidays.push({id:'hh',date:'2026-03-10',endDate:'2026-03-10',type:'state',label:'Test praznik',locationId:null,employeeId:null,paid:true});
 const leave=leaveDays('2026-03-09','2026-03-15',[1,2,3,4,5],[],'L1');          // pon–ned; 10. praznik
 return {d2:day('2026-03-02'),d3:day('2026-03-03'),d4:day('2026-03-04'),d5:day('2026-03-05'),d6:day('2026-03-06'),
  sick:dayStatus(e,'2026-03-11',loc),hol:dayStatus(e,'2026-03-10',loc),leave,
  rep:reportFigures(e,loc,['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06'])};
});
assert.equal(r.d2.w,495,'7:30–15:45 = 8 h 15 min');assert.equal(r.d2.s,'P');
assert.equal(r.d3.w,480,'Noćna 22:00–06:00 = 8 h, računa se danu dolaska');
assert.equal(r.d4.w,0,'Dan odlaska iz noćne nema dodatnih sati');
assert.equal(r.d5.w,0,'Dolazak bez odjave: 0 potvrđenih sati');assert.equal(r.d5.s,'RP','Bez odjave = za provjeru (!)');
assert.equal(r.d6.w,480,'Dupli dolazak 7:00 i 7:05, odlazak 15:05: 8 h od drugog dolaska');
assert.equal(r.sick,'BO','Bolovanje');assert.equal(r.hol,'H','Praznik');
assert.deepEqual(r.leave,['2026-03-09','2026-03-11','2026-03-12','2026-03-13'],'Odmor pon–ned: bez praznika (10.) i vikenda = 4 dana');
assert.equal(r.rep.actual,495+480+480,'Izvještaj: zbir potvrđenih sati');
assert.equal(r.rep.unclosed,2,'Izvještaj: 5.3. bez odjave + prvi (dupli) dolazak 6.3. bez odjave = 2 za provjeru');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS LOGIKA: 8h15, noćna 8h, bez odjave = RP, dupli dolazak, bolovanje, praznik, odmor bez praznika/vikenda, zbir sati');
