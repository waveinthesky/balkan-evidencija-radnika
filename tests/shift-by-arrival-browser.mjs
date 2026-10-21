// Kvar iz marketa: Veza i Melis (druga smjena, bez ručno postavljene smjene) dolaze u 14:25,
// a "Prijave i kašnjenja" je pokazivao kašnjenje od ~7 sati (računato od otvaranja marketa).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})()`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B);
const r=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id,d=today();
 const sc=getSchedule(loc,d);sc.open='07:00';sc.firstStart='07:00';sc.firstEnd='15:00';sc.secondStart='14:30';sc.secondEnd='22:00';sc.close='22:00';sc.grace=0;
 const at=(h,m)=>{const x=new Date(d+'T00:00:00');x.setHours(h,m,0,0);return x.toISOString()};
 const mk=(id,name,extra={})=>({id,name,barcode:newEan13(),active:true,hiredAt:'2025-01-01',defaultLocationId:loc,assignments:[{from:'2025-01-01',locationId:loc}],...extra});
 S.employees.push(mk('veza','Veza Kurtagić'),mk('melis','Melis Šabović'),mk('jutro','Jutarnji Radnik'),mk('kasni','Kasni Ujutro'),mk('pogr','Pogrešna Smjena',{defaultShift:'first'}),mk('druga','Postavljena Druga',{defaultShift:'second'}));
 const ev=(id,emp,h,m)=>S.events.push({id,empId:emp,locId:loc,kind:'in',at:at(h,m),source:'barcode'});
 ev('v','veza',14,25);ev('m','melis',14,27);ev('j','jutro',6,58);ev('k','kasni',7,20);ev('p','pogr',14,25);ev('dr','druga',14,40);
 const E=id=>S.employees.find(e=>e.id===id);
 const t=id=>tardiness(E(id),d,loc),lab=id=>shiftInfo(E(id),d,loc).label;
 window.BALKAN_V6.render();
 return {veza:t('veza'),melis:t('melis'),jutro:t('jutro'),kasni:t('kasni'),pogr:t('pogr'),druga:t('druga'),lv:lab('veza'),lj:lab('jutro'),lp:lab('pogr')};
});
assert.equal(r.veza,0,'Veza 14:25 uz drugu smjenu 14:30: na vrijeme');
assert.equal(r.melis,0,'Melis 14:27: na vrijeme');
assert.equal(r.lv,'Druga smjena (prema dolasku)');
assert.equal(r.jutro,0,'Jutarnja smjena 06:58: na vrijeme');assert.equal(r.lj,'Prva smjena (prema dolasku)');
assert.equal(r.kasni,20,'Prva smjena 07:20: kasni 20 min (pravo kašnjenje i dalje se vidi)');
assert.equal(r.druga,10,'Izričito druga smjena 14:40: kasni 10 min');
assert.ok(r.pogr>400,'Izričito PRVA smjena, dolazak 14:25: postavka se poštuje');assert.equal(r.lp,'Prva smjena');
// tabela na Pregledu
await page.locator('[data-route="pregled"]').first().click();
const txt=await page.locator('#balkanLatenessPanel').innerText();
const rows=n=>txt.split('\n').filter(l=>l.includes(n));
for(const n of ['Veza Kurtagić','Melis Šabović']){
 assert.ok(rows(n).some(l=>/\t1\t0\t0\t0 min\t0/.test(l)),'Sažetak: 1 na vrijeme, 0 min kašnjenja | '+rows(n).join(' / '));
 assert.ok(rows(n).some(l=>/Druga smjena[\s\S]*Na vrijeme/.test(l)),'Detalj: druga smjena, na vrijeme | '+rows(n).join(' / '));
}
assert.match(txt,/Pogrešna Smjena[\s\S]*Dolazak odgovara DRUGOJ smjeni – provjeri smjenu radnika/,'Upozorenje za pogrešno postavljenu smjenu');
// market BEZ upisane druge smjene: jasan savjet umjesto zbunjujućeg kašnjenja
await page.evaluate(()=>{const S=window.BALKAN_V6.state(),loc=S.locations[0].id,sc=getSchedule(loc,today());delete sc.secondStart;delete sc.secondEnd;window.BALKAN_V6.render()});
const t2=await page.locator('#balkanLatenessPanel').innerText();
assert.match(t2,/Veza Kurtagić[\s\S]*upiši drugu smjenu za ovaj market u Objekti/,'Savjet kad market nema drugu smjenu');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS SMJENA PREMA DOLASKU: Veza/Melis 14:25 = druga smjena, na vrijeme; pravo kašnjenje (20 min, 10 min) se i dalje vidi; pogrešno postavljena smjena dobija upozorenje');
