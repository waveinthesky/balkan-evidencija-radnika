// Godišnji v2: obrazac s kalendarom od–do, broj radnih dana, upozorenja, živi pregled rješenja,
// izdavanje kroz postojeću provjeru, štampa vjerna originalu (JMB se ne čuva).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const shots=process.env.SHOTS;
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
// Radnik s radom u oktobru; odmor biramo u decembru (budućnost) – 7 do 18.12.2026.
await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 S.employees.push({id:'w1',name:'Amra Hodžić',barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:'2024-03-01',defaultLocationId:loc,assignments:[{from:'2024-03-01',locationId:loc}],position:'Prodavac',residence:'Bar',contract:'na određeno vrijeme'});
 S.employees.push({id:'w2',name:'Edin Lukač',barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:'2024-03-01',defaultLocationId:loc,assignments:[{from:'2024-03-01',locationId:loc}]});
 S.leaveGrants.push({id:'gw1',empId:'w1',year:2026,days:20,weekdays:[1,2,3,4,5]});
 S.events.push({id:'wk1',empId:'w1',locId:loc,kind:'in',at:'2026-10-05T06:00:00.000Z',source:'barcode'},{id:'wk2',empId:'w1',locId:loc,kind:'out',at:'2026-10-05T14:00:00.000Z',source:'barcode'});
 window.BALKAN_V6.render();
});
await page.locator('[data-route="godisnji"]').first().click();
await page.locator('select[data-leave-field=employee]').selectOption('w1');
assert.ok(await page.locator('.lv-hero').count(),'Novi pregled radnika');
assert.ok(await page.locator('.lv-year .lv-mini').count()===12,'Godišnji kalendar radnika (12 mjeseci)');
await page.locator('.intro [data-leave-new]').click();
await page.waitForSelector('#wzCal');
assert.equal(await page.locator('[data-wz-emp]').inputValue(),'w1','Izabrani radnik prenesen u obrazac');
// kalendar pokazuje dan kada je radio
await page.evaluate(()=>{});
for(let i=0;i<2;i++){ if(await page.locator('[data-wz-day="2026-10-05"]').count())break; await page.locator('[data-wz-month="-1"]').click(); }
assert.match(await page.locator('[data-wz-day="2026-10-05"]').getAttribute('class'),/\bP\b/,'Kalendar pokazuje dan kada je radio');
// pomjeri na decembar
while(!(await page.locator('[data-wz-day="2026-12-07"]').count()))await page.locator('[data-wz-month="1"]').click();
await page.locator('[data-wz-day="2026-12-07"]').click();
await page.locator('[data-wz-day="2026-12-18"]').click();
const sum=await page.locator('#wzSum').innerText();
assert.match(sum,/7\.12\.2026\. – 18\.12\.2026\./);
assert.match(sum,/radnih dana odmora: 10/,'10 radnih dana (pon–pet)');
assert.match(sum,/preostalo poslije: 10/);
await page.locator('#leaveDecisionForm [name=jmb]').fill('0101990210012');
const prev=await page.locator('#wzPaper').innerText();
for(const t of ['Amra Hodžić','Bara','0101990210012','Prodavac','na određeno vrijeme','za kalendarsku 2026','20 radnih dana','07.12.2026.','18.12.2026','30.06.2027','RJEŠENJE O KORIŠĆENJU GODIŠNJEG ODMORA'])
 assert.ok(prev.includes(t),'Pregled sadrži: '+t+' | '+prev.slice(0,400));
if(shots)await page.screenshot({path:shots+'-wizard.png'});
// konflikt: period koji uključuje dan kada je radio
while(!(await page.locator('[data-wz-day="2026-10-05"]').count()))await page.locator('[data-wz-month="-1"]').click();
await page.locator('[data-wz-day="2026-10-05"]').click();await page.locator('[data-wz-day="2026-10-06"]').click();
assert.match(await page.locator('#wzSum').innerText(),/Radnik je radio/,'Upozorenje: radio u tom periodu');
while(!(await page.locator('[data-wz-day="2026-12-07"]').count()))await page.locator('[data-wz-month="1"]').click();
await page.locator('[data-wz-day="2026-12-07"]').click();await page.locator('[data-wz-day="2026-12-18"]').click();
// izdavanje (postojeća provjera i čuvanje) + štampa bez ponovnog pitanja za JMB
const popupP=ctx.waitForEvent('page');
await page.locator('#leaveDecisionForm button[type=submit]').click();
const pop=await popupP;await pop.waitForLoadState();
const st=await page.evaluate(()=>{const d=window.BALKAN_V6.state().leaveDecisions.find(x=>x.empId==='w1');return d&&{from:d.from,to:d.to,days:d.days.length,res:d.residence,keys:Object.keys(d)}});
assert.ok(st,'Rješenje sačuvano');
assert.equal(st.from,'2026-12-07');assert.equal(st.to,'2026-12-18');assert.equal(st.days,10);
assert.ok(!JSON.stringify(await page.evaluate(()=>window.BALKAN_V6.state())).includes('0101990210012'),'JMB nije sačuvan u bazi');
const printed=await pop.locator('.rj-page').innerText();
assert.ok(printed.includes('0101990210012')&&printed.includes('Amra Hodžić')&&printed.includes('Bara'),'Štampa sadrži JMB i podatke');
if(shots){await pop.setViewportSize({width:900,height:1200});await pop.screenshot({path:shots+'-print.png',fullPage:true})}
// lista rješenja i kalendar godine pokazuju odmor
await page.locator('select[data-leave-field=employee]').selectOption('w1');
assert.equal(await page.locator('.lv-dec').count(),1,'Rješenje u listi');
assert.ok(await page.locator('.lv-year span.GO').count()>=10,'Godišnji kalendar pokazuje dane odmora');
if(shots)await page.screenshot({path:shots+'-page.png',fullPage:true});
// radnik bez fonda: obrazac jasno traži fond
await page.locator('.intro [data-leave-new]').click();await page.waitForSelector('#wzCal');
await page.locator('[data-wz-emp]').selectOption('w2');
assert.match(await page.locator('#wzSum').innerText(),/nema utvrđen godišnji fond/);
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS GODIŠNJI v2: obrazac s kalendarom (radio/nije radio), od–do = 10 radnih dana, upozorenje o radu u periodu, pregled kao original, izdavanje + štampa, JMB se ne čuva, godišnji kalendar');
