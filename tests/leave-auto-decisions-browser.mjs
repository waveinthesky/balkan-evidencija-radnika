// Brzo izdavanje rješenja iz evidencije: a) dani N, b) GO bez rješenja; brojevi GO-n redom;
// datum donošenja/dostave 30 dana prije (ili danas); štampa svih; storno vraća prethodno stanje.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const shots=process.env.SHOTS;
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
const plan=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id,t=today(),y=Number(t.slice(0,4));
 const add=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
 let base=add(t,-24);if(base<y+'-01-01')base=y+'-01-01';
 S.employees.push({id:'au',name:'Auto Rješenje',barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:(y-2)+'-01-01',defaultLocationId:loc,assignments:[{from:(y-2)+'-01-01',locationId:loc}],position:'Prodavac',residence:'Bar',contract:'na određeno vrijeme'});
 S.leaveGrants.push({id:'gau',empId:'au',year:y,days:20,weekdays:[1,2,3,4,5]});
 // ranije rješenje drugog radnika s brojem GO-7 → sljedeći mora biti GO-8
 S.leaveDecisions.push({id:'old7',empId:'x',employeeName:'Drugi',year:y,number:'GO-7',from:y+'-01-05',to:y+'-01-05',days:[],excluded:[],status:'issued',issuedAt:y+'-01-01',deliveredAt:y+'-01-01'});
 const work=[];for(let d=base;d<t;d=add(d,1))if(isWorking(loc,d)&&[1,2,3,4,5].includes(new Date(d+'T12:00:00Z').getUTCDay()))work.push(d);
 const nRun=work.slice(2,5),nOne=[work[8]],go=work.slice(11,13);
 for(const d of work){if(nRun.includes(d)||nOne.includes(d)||go.includes(d))continue;
  S.events.push({id:'ai'+d,empId:'au',locId:loc,kind:'in',at:d+'T07:00:00.000Z',source:'barcode'},{id:'ao'+d,empId:'au',locId:loc,kind:'out',at:d+'T15:00:00.000Z',source:'barcode'})}
 for(const d of go)S.overrides.push({id:'ago'+d,empId:'au',locId:loc,date:d,status:'GO'});
 window.BALKAN_V6.render();
 return {y,nRun,nOne,go,usedBefore:window.balkanLeaveBalance(S.employees.find(e=>e.id==='au'),y).used,add:null};
});
await page.locator('[data-route="godisnji"]').first().click();
await page.locator('select[data-leave-field=employee]').selectOption('au');
// pojedinačno rješenje predlaže sljedeći broj GO-8 i ima jasno dugme za sve dane
await page.locator('.intro [data-leave-new]').click();await page.waitForSelector('#wzAuto');
assert.equal(await page.locator('#leaveDecisionForm [name=number]').inputValue(),'GO-8','Pojedinačno rješenje: broj GO-8 redom');
assert.match(await page.locator('#wzAuto [data-bulk-open]').innerText(),/A 4 · B 2/);
await page.locator('[data-act=close-modal]').first().click().catch(()=>{});
await page.evaluate(()=>{document.getElementById('modal').innerHTML=''});
// VIDLJIVO DUGME na kartici radnika
const btn=page.locator('.lv-main [data-bulk-open]');
assert.ok(await btn.isVisible(),'Dugme „Rješenja za sve dane“ vidljivo na kartici radnika');
await btn.click();await page.waitForSelector('#bulkLeaveForm');
assert.match(await page.locator('#bkCounts').innerText(),/A\) Nije radio\/la \(N\) – 4 dana/);
assert.match(await page.locator('#bkCounts').innerText(),/B\) Godišnji odmor iskorišćeno – 2 dana/);
assert.ok(await page.locator('#bkGo').isDisabled(),'Bez izbora A/B nema štampe');
await page.locator('[data-bulk-kind="N"]').check();
await page.locator('[data-bulk-kind="GO"]').check();
await page.waitForFunction(()=>document.querySelectorAll('.bk-row').length===3);
let rows=await page.locator('.bk-row').allInnerTexts();
assert.equal(rows.length,3,'3 rješenja: N (3 dana), N (1 dan), GO (2 dana) | '+rows.join(' / '));
assert.deepEqual(rows.map(r=>r.trim().split(/\s/)[0]),['GO-8','GO-9','GO-10'],'Brojevi idu redom');
const exp=(d)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-30);return x.toISOString().slice(0,10).split('-').reverse().map(Number).join('.')+'.'};
assert.ok(rows[0].includes(exp(plan.nRun[0])),'Datum donošenja/dostave = 30 dana prije početka | '+rows[0]);
assert.match(await page.locator('#bkPlan').innerText(),/raniji od današnjeg/,'Napomena za prošle periode');
// skidanje jedne kvačice → brojevi se prenumerišu, dugme broji samo izabrana
await page.locator('.bk-row').nth(1).locator('input').uncheck();
await page.waitForFunction(()=>/2 rješenja/.test(document.querySelector('#bkGo').textContent));
rows=await page.locator('.bk-row').allInnerTexts();
assert.deepEqual(rows.map(r=>r.trim().split(/\s/)[0]),['GO-8','—','GO-9'],'Isključeno rješenje nema broj');
assert.match(await page.locator('#bkGo').innerText(),/2 rješenja \(5 dana\)/);
await page.locator('.bk-row').nth(1).locator('input').check();
await page.waitForFunction(()=>/3 rješenja/.test(document.querySelector('#bkGo').textContent));
assert.match(await page.locator('#bkGo').innerText(),/3 rješenja \(6 dana\)/);
if(shots)await page.screenshot({path:shots+'-wizard.png'});
const popupP=ctx.waitForEvent('page');
await page.locator('#bkGo').click();
const pop=await popupP;await pop.waitForLoadState();
assert.equal(await pop.locator('.sheet .rj-page').count(),3,'Štampa: 3 rješenja odjednom');
const printed=await pop.locator('body').innerText();
assert.ok(printed.includes('Auto Rješenje')&&printed.includes('Bara'),'Rješenja popunjena podacima radnika');
if(shots){await pop.setViewportSize({width:900,height:1100});await pop.screenshot({path:shots+'-print.png'})}
const after=await page.evaluate(y=>{const S=window.BALKAN_V6.state(),e=S.employees.find(x=>x.id==='au');
 const decs=S.leaveDecisions.filter(d=>d.empId==='au');
 return {decs:decs.map(d=>({n:d.number,from:d.from,to:d.to,days:d.days.length,iss:d.issuedAt,del:d.deliveredAt,src:d.source})),
  used:window.balkanLeaveBalance(e,y).used,ov:S.overrides.filter(o=>o.empId==='au').length,
  status:decs.map(d=>dayStatus(e,d.from,assigned(e,d.from)))}},plan.y);
assert.deepEqual(after.decs.map(d=>d.n),['GO-8','GO-9','GO-10']);
assert.deepEqual(after.decs.map(d=>d.days),[3,1,2]);
assert.ok(after.decs.every(d=>d.iss===d.del),'Datum donošenja = datum dostave');
assert.equal(after.used,plan.usedBefore+4,'Iskorišćeno: +4 (N dani), GO dani se ne broje dvaput');
assert.equal(after.ov,0,'Ručne GO oznake zamijenjene rješenjem');
assert.ok(after.status.every(s=>s==='GO'),'Dani sada GO');
// storno N rješenja vraća N; storno GO rješenja vraća ručni GO
await page.evaluate(()=>{const S=window.BALKAN_V6.state();for(const d of S.leaveDecisions.filter(x=>x.empId==='au'&&x.number!=='GO-9')){d.status='cancelled';d.cancelledReason='test'}window.BALKAN_V6.render()});
const back=await page.evaluate(y=>{const S=window.BALKAN_V6.state(),e=S.employees.find(x=>x.id==='au');
 return {ov:S.overrides.filter(o=>o.empId==='au'&&o.status==='GO').length,used:window.balkanLeaveBalance(e,y).used}},plan.y);
assert.equal(back.ov,2,'Storno GO rješenja vraća ručne GO oznake');
assert.equal(back.used,plan.usedBefore+1,'Poslije storna ostaje samo GO-9 (1 dan N)');
// opcija "današnji datum"
await page.locator('.lv-main [data-bulk-open]').click();await page.waitForSelector('#bulkLeaveForm');
await page.locator('[data-bulk-kind="N"]').check();
await page.locator('[data-bulk-date]').selectOption('today');
await page.waitForFunction(()=>!/raniji od današnjeg/.test(document.querySelector('#bkPlan').textContent)&&document.querySelectorAll('.bk-row').length>0);
const r2=await page.locator('.bk-row').first().innerText();
const td=await page.evaluate(()=>today().split('-').reverse().map(Number).join('.')+'.');
assert.ok(r2.includes(td),'Današnji datum kao datum donošenja/dostave | '+r2);
assert.doesNotMatch(await page.locator('#bkPlan').innerText(),/raniji od današnjeg/);
await page.evaluate(()=>{document.getElementById('modal').innerHTML=''});
await page.locator('.intro [data-leave-new]').click();await page.waitForSelector('#wzCal');
// pojedinačno: izbor perioda → datumi 30 dana prije
let f=await page.evaluate(()=>{let d=new Date();d.setDate(d.getDate()+45);while(d.getDay()!==1)d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)});
for(let i=0;i<4&&!(await page.locator('[data-wz-day="'+f+'"]').count());i++)await page.locator('[data-wz-month="1"]').click();
await page.locator('[data-wz-day="'+f+'"]').click();
const iss=await page.locator('#leaveDecisionForm [name=issuedAt]').inputValue();
const want=await page.evaluate(f=>{const x=new Date(f+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-30);return x.toISOString().slice(0,10)},f);
assert.equal(iss,want,'Pojedinačno rješenje: datum donošenja 30 dana prije');
assert.equal(await page.locator('#leaveDecisionForm [name=deliveredAt]').inputValue(),want,'Datum dostave 30 dana prije');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS RJEŠENJA ZA SVE DANE: vidljivo dugme, A + B, kvačica po rješenju,  → 3 rješenja GO-8..GO-10 redom, 30 dana prije (ili danas), štampa svih odjednom, nema dvostrukog brojanja, storno vraća stanje');
