// Zakon o radu CG: državni praznici (čl. 80 st. 4), srazmjerno pravo za započeti mjesec (čl. 79 st. 3–4),
// prvi dio odmora najmanje 10 radnih dana i rok 30. jun (čl. 85 st. 3).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
const y=await page.evaluate(()=>new Date().getFullYear());
await page.evaluate(()=>{const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 S.employees.push({id:'lw',name:'Zakon Testni',barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:'2024-01-01',defaultLocationId:loc,assignments:[{from:'2024-01-01',locationId:loc}]});
 S.leaveGrants.push({id:'glw',empId:'lw',year:new Date().getFullYear(),days:20,weekdays:[1,2,3,4,5]});window.BALKAN_V6.render()});
// 1. praznici
await page.getByRole('button',{name:/Praznici i odsustva/}).first().click();
assert.ok(await page.locator('#cgHolidays').count(),'Panel državnih praznika');
await page.locator('[data-cg-holidays="'+y+'"]').click();
const hol=await page.evaluate(y=>window.BALKAN_V6.state().holidays.filter(h=>h.type==='state'&&h.date.startsWith(String(y))).map(h=>h.label+':'+h.date+'>'+h.endDate),y);
assert.deepEqual(hol.sort(),['Dan državnosti:'+y+'-07-13>'+y+'-07-14','Dan nezavisnosti:'+y+'-05-21>'+y+'-05-22','Njegošev dan:'+y+'-11-13>'+y+'-11-14','Nova godina:'+y+'-01-01>'+y+'-01-02','Praznik rada:'+y+'-05-01>'+y+'-05-02'].sort());
assert.equal(await page.locator('[data-cg-holidays="'+y+'"]').count(),0,'Dugme nestaje kad su praznici uneseni');
const leave=await page.evaluate(y=>{
 // sedmica oko Dana državnosti: od ponedjeljka prije 13.7. do petka poslije
 const d=new Date(Date.UTC(y,6,13));const mon=new Date(d);mon.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const fri=new Date(mon);fri.setUTCDate(mon.getUTCDate()+4);
 const days=leaveDays(mon.toISOString().slice(0,10),fri.toISOString().slice(0,10),[1,2,3,4,5],[],'lw');
 const e=window.BALKAN_V6.state().employees.find(x=>x.id==='lw');
 return {days,status:dayStatus(e,y+'-07-13',assigned(e,y+'-07-13'))};
},y);
assert.ok(!leave.days.includes(y+'-07-13')&&!leave.days.includes(y+'-07-14'),'Praznik se ne računa u godišnji (čl. 80 st. 4): '+leave.days);
assert.equal(leave.status,'H','Praznik bez rada je praznik, ne izostanak');
// 1b. praznici u obračunu sati: plaćeno kao da je radio (bez unesene norme → 40 h / radni dani),
//     rad na dan praznika posebno (uvećanje), vjerski praznik samo za radnika koji ga slavi, nedjeljno pravilo.
const pay=await page.evaluate(y=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id,e=S.employees.find(x=>x.id==='lw');
 const sc=getSchedule(loc,y+'-07-13');sc.paidHours=0;S.employees.forEach(x=>{if(x.id==='lw')delete x.paidHours});
 const w2={id:'lw2',name:'Radi Praznik',barcode:newEan13(),active:true,hiredAt:'2024-01-01',defaultLocationId:loc,assignments:[{from:'2024-01-01',locationId:loc}]};
 S.employees.push(w2);
 S.events.push({id:'hw1',empId:'lw2',locId:loc,kind:'in',at:y+'-07-13T06:00:00.000Z',source:'barcode'},{id:'hw2',empId:'lw2',locId:loc,kind:'out',at:y+'-07-13T14:00:00.000Z',source:'barcode'});
 // vjerski praznik samo za lw (npr. Kurbanski bajram) na radni dan
 let rd=new Date(Date.UTC(y,4,26));while(!isWorking(loc,rd.toISOString().slice(0,10)))rd.setUTCDate(rd.getUTCDate()+1);const rel=rd.toISOString().slice(0,10);
 S.holidays.push({id:'rel1',date:rel,endDate:rel,type:'religious',label:'Kurbanski bajram',locationId:null,employeeId:'lw',paid:true});
 const days=[y+'-07-13'];const r1=reportFigures(e,loc,days),r2=reportFigures(w2,loc,days);
 const rel1=reportFigures(e,loc,[rel]),rel2=reportFigures(w2,loc,[rel]);
 const norm=40/((sc.days||[1,2,3,4,5]).length);
 return {norm,r1,r2,rel1,rel2,relStatus:[dayStatus(e,rel,loc),dayStatus(w2,rel,loc)],
  sunday2027:window.balkanMissingStateHolidays(2027).find(h=>h.label==='Praznik rada')};
},y);
assert.equal(pay.r1.paid,Math.round(pay.norm*60),'Praznik bez rada: plaćeno po zakonskoj normi ('+pay.norm+' h)');
assert.equal(pay.r1.actual,0,'Praznik nije odrađeno vrijeme');
assert.equal(pay.r1.normDefault,1,'Označeno da je korištena zakonska norma');
assert.equal(pay.r2.paid,0,'Ko radi na praznik ne dobija i plaćeni praznik i sate (nema dupliranja)');
assert.equal(pay.r2.holidayWorkDays,1);assert.equal(pay.r2.holidayWork,480,'Rad na dan praznika: 8 h za uvećanje');
assert.deepEqual(pay.relStatus,['VH','N'],'Vjerski praznik važi samo za radnika koji ga slavi');
assert.ok(pay.rel1.paid>0&&pay.rel2.paid===0,'Vjerski praznik plaćen samo tom radniku');
assert.equal(pay.sunday2027.endDate,'2027-05-03','2.5.2027. je nedjelja → neradan je i ponedjeljak 3.5.');

// 2. srazmjerno pravo – započeti mjesec
const pro=await page.evaluate(()=>({
 jul20:annualEntitlementSuggestion({hiredAt:'2026-07-20'},2026,5),
 mar10:annualEntitlementSuggestion({hiredAt:'2025-01-01',terminatedAt:'2026-03-10'},2026,5),
 six:annualEntitlementSuggestion({hiredAt:'2026-10-31'},2026,6),
 full:annualEntitlementSuggestion({hiredAt:'2024-02-01'},2026,6)}));
assert.equal(pro.jul20.months,6);assert.equal(pro.jul20.days,10,'Počeo 20.7.: jul je započeti mjesec → 6/12 od 20 = 10');
assert.equal(pro.mar10.months,3);assert.equal(pro.mar10.days,5,'Prestanak 10.3.: 3 započeta mjeseca → 5');
assert.equal(pro.six.days,6,'Šestodnevna sedmica, počeo 31.10.: 3/12 od 24 = 6');
assert.equal(pro.full.days,24,'Puna godina, šestodnevna sedmica: 24');
// 3. obrazac: prvi dio < 10 dana i rok 30.6.
await page.locator('[data-route="godisnji"]').first().click();
await page.locator('select[data-leave-field=employee]').selectOption('lw');
await page.locator('.intro [data-leave-new]').click();await page.waitForSelector('#wzCal');
const pick=async(d)=>{for(let i=0;i<24&&!(await page.locator('[data-wz-day="'+d+'"]').count());i++)await page.locator('[data-wz-month="1"]').click();await page.locator('[data-wz-day="'+d+'"]').click()};
// 3 radna dana u novembru (poslije praznika): pon–sri
const short=await page.evaluate(y=>{let d=new Date(Date.UTC(y,10,16));while(d.getUTCDay()!==1)d.setUTCDate(d.getUTCDate()+1);const a=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+2);return [a,d.toISOString().slice(0,10)]},y);
await pick(short[0]);await pick(short[1]);
await page.waitForSelector('#wzLegal');
assert.match(await page.locator('#wzLegal').innerText(),/najmanje 10 radnih dana/,'Upozorenje: prvi dio min. 10 dana');
await page.locator('[data-wz-emp]').selectOption('lw');
assert.equal(await page.locator('#wzLegal').count(),0,'Upozorenje nestaje kad se period poništi');
// 4. upozorenje na stranici kad praznici nisu uneseni za drugu godinu
await page.keyboard.press('Escape');await page.evaluate(()=>{document.getElementById('modal').innerHTML=''});
await page.locator('[data-leave-field=year]').fill(String(y+1));await page.locator('[data-leave-field=year]').press('Tab');
assert.match(await page.locator('main, #app').first().innerText(),/nisu uneseni državni praznici/,'Upozorenje za godinu bez praznika');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS ZAKON CG: 5 državnih praznika (s Njegoševim danom, nedjeljno pravilo), praznik plaćen po normi 40h bez dupliranja, rad na praznik za uvećanje, vjerski samo za radnika koji slavi, praznik se ne troši iz godišnjeg, srazmjerno pravo za započeti mjesec (10/5/6/24), upozorenje za prvi dio <10 dana, upozorenje kad praznici nisu uneseni');
