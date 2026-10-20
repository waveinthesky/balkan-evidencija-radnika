// Godišnji – jasan obračun: dan bez prijave ostaje N (ne troši odmor);
// Ukupno = pravo + važeći prenos; Preostalo = ukupno − iskorišćeno − planirano; "Nije radio" se samo prikazuje.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const shots=process.env.SHOTS;
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
const plan=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id,t=today(),y=Number(t.slice(0,4));
 const add=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
 let base=add(t,-18);if(base<y+'-01-01')base=y+'-01-01';
 const e={id:'bal',name:'Obračun Testni',barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:(y-2)+'-01-01',defaultLocationId:loc,
  assignments:[{from:(y-2)+'-01-01',locationId:loc}],autoMissingLeave:true,leaveCarryByYear:{[y]:3},leaveCarryDeadlineByYear:{[y]:y+'-12-31'}};
 S.employees.push(e);S.leaveGrants.push({id:'gbal',empId:'bal',year:y,days:20,weekdays:[1,2,3,4,5]});
 const work=[];for(let d=base;d<t;d=add(d,1))if(isWorking(loc,d))work.push(d);
 const absent=work.slice(1,5),go=work.slice(5,7);
 for(const d of work){if(absent.includes(d)||go.includes(d))continue;
  S.events.push({id:'bi'+d,empId:'bal',locId:loc,kind:'in',at:d+'T07:00:00.000Z',source:'barcode'},{id:'bo'+d,empId:'bal',locId:loc,kind:'out',at:d+'T15:00:00.000Z',source:'barcode'})}
 for(const d of go)S.overrides.push({id:'go'+d,empId:'bal',locId:loc,date:d,status:'GO'});
 let f=add(t,14);while(new Date(f+'T12:00:00Z').getUTCDay()!==1)f=add(f,1);const to=add(f,4);
 const days=leaveDays(f,to,[1,2,3,4,5],[],'bal');
 S.leaveDecisions.push({id:'pl',empId:'bal',employeeName:e.name,year:Number(f.slice(0,4)),number:'9/'+y,from:f,to,days,excluded:[],status:'issued',issuedAt:t,deliveredAt:t,entitlementAtIssue:20,templateSnapshot:S.leaveTemplates.find(x=>x.id==='annual-main'),createdAt:new Date().toISOString()});
 window.BALKAN_V6.render();
 return {y,absent,go,planned:Number(f.slice(0,4))===y?days.length:0,statusAbsent:absent.map(d=>dayStatus(e,d,loc))};
});
assert.ok(plan.statusAbsent.every(s=>s==='N'),'Dani bez prijave su N, ne GO (i kad je stari prekidač bio uključen): '+plan.statusAbsent);
const bal=await page.evaluate(()=>window.balkanLeaveBalance(window.BALKAN_V6.state().employees.find(e=>e.id==='bal'),Number(today().slice(0,4))));
assert.equal(bal.quota,20);assert.equal(bal.carryUsable,3);assert.equal(bal.total,23,'Ukupno = 20 + 3');
assert.equal(bal.used,2,'Iskorišćeno = 2 potvrđena GO dana (dani bez prijave se ne računaju)');
assert.equal(bal.planned,plan.planned,'Planirano = budući dani iz rješenja');
assert.equal(bal.absent,4,'Nije radio = 4');
assert.equal(bal.remaining,23-2-plan.planned,'Preostalo = ukupno − iskorišćeno − planirano');
await page.locator('[data-route="godisnji"]').first().click();
await page.locator('select[data-leave-field=employee]').selectOption('bal');
const hero=await page.locator('.lv-eq').innerText();
for(const [label,n] of [['Pravo',20],['Prenos iz',  '+3'],['Ukupno za odmor',23],['Iskorišćeno',2],['Planirano',plan.planned],['Preostalo',bal.remaining]])
 assert.ok(new RegExp(label+'[^\\n]*\\n\\s*'+String(n).replace('+','\\+')+'(\\n|$)').test(hero),'Račun: '+label+' = '+n+' | '+hero);
assert.match(await page.locator('.lv-absent').innerText(),/4 dana bez prijave \(N\)[\s\S]*ne oduzima/);
const row=await page.locator('#balkanLiveLeaveSummary tr').filter({hasText:'Obračun Testni'}).innerText();
const cells=row.split('\t').map(x=>x.trim().split('\n')[0]);
assert.deepEqual(cells.slice(1,8),['20','+3','23','2',String(plan.planned),String(bal.remaining),'4'],'Tabela: iste vrijednosti kao kartica | '+row);
// --- PRENOS: istekao, negativan, bez podatka, ručna ispravka ---
const carry=await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),y=Number(today().slice(0,4)),e=S.employees.find(x=>x.id==='bal');
 const r={};
 e.leaveCarryDeadlineByYear={[y]:(y)+'-01-01'};e.leaveCarryByYear={[y]:5};          // rok prošao, ništa iskorišteno do roka
 r.expired=window.balkanLeaveBalance(e,y);
 e.leaveCarryByYear={[y]:-2};delete e.leaveCarryDeadlineByYear;
 r.neg=window.balkanLeaveBalance(e,y);
 e.leaveCarryByYear={};
 r.none=window.balkanLeaveBalance(e,y);
 e.leaveCarryByYear={[y]:3};e.leaveCarryDeadlineByYear={[y]:y+'-12-31'};
 window.BALKAN_V6.render();return r;
});
assert.equal(carry.expired.carry,5);assert.equal(carry.expired.carryExpired,5,'Istekli prenos prikazan kao isteklo');assert.equal(carry.expired.carryUsable,0,'Istekli prenos se ne računa u ukupno');
assert.equal(carry.neg.carryUsable,-2,'Negativan prenos umanjuje ukupno');assert.equal(carry.neg.total,18);
assert.equal(carry.none.carry,0);assert.equal(carry.none.carrySource.kind,'none','Bez podatka – jasno označeno');
assert.match(carry.none.carrySource.text,/unesi/i);
// kartica prenosa i ručna ispravka kroz obrazac
assert.match(await page.locator('.lv-carry').innerText(),/Prenos iz[\s\S]*\+3[\s\S]*Još važi/);
await page.locator('[data-carry-edit="bal"]').click();
await page.locator('#carryForm [name=carry]').fill('-4');
await page.locator('#carryForm [name=note]').fill('prema Excelu');
await page.locator('#carryForm button[type=submit]').click();
await page.waitForFunction(()=>window.BALKAN_V6.state().employees.find(x=>x.id==='bal').leaveCarryByYear[Number(today().slice(0,4))]===-4);
assert.match(await page.locator('.lv-carry').innerText(),/-4[\s\S]*dana manje[\s\S]*Ručno uneseno – prema Excelu/);
assert.match(await page.locator('.lv-eq').innerText(),/Prenos iz[^\n]*\n\s*-4/);
const row2=await page.locator('#balkanLiveLeaveSummary tr').filter({hasText:'Obračun Testni'}).innerText();
assert.match(row2,/-4/,'Tabela pokazuje negativan prenos');
assert.match(await page.locator('#balkanAnnualToday').innerText(),/Ukupno za odmor[\s\S]*Preostalo/,'Objašnjenje računa');
assert.equal(await page.locator('[data-agreed-leave-toggle]').count(),0,'Nema više prekidača za automatski GO');
if(shots)await page.screenshot({path:shots+'.png',fullPage:true});
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS OBRAČUN GODIŠNJEG + PRENOS: istekao/negativan/bez podatka/ručna ispravka; dan bez prijave = N; ukupno 23 (20+3), iskorišćeno 2, planirano '+plan.planned+', nije radio 4, preostalo '+bal.remaining+'; kartica = tabela');
