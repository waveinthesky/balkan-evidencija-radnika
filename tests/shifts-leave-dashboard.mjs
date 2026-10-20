import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:950}});
const errors=[];
page.on('dialog',async d=>d.accept());
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/admin-firebase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__AUDIT_BOOTED=true})().catch(e=>window.__AUDIT_ERROR=String(e))"}));
await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__AUDIT_BOOTED||window.__AUDIT_ERROR);
assert.equal(await page.evaluate(()=>window.__AUDIT_ERROR||''),'','Admin boot');
await page.evaluate(()=>{
 const s=window.BALKAN_V6.state(),loc=s.locations.find(l=>l.id==='m1');
 loc.schedules.push({id:'shift-test',from:'2026-01-01',open:'07:00',close:'21:00',grace:0,days:[1,2,3,4,5,6],paidHours:8,
 firstStart:'08:00',firstEnd:'14:00',secondStart:'14:00',secondEnd:'21:00'});
 s.employees.push({id:'shift-emp',name:'Smjenski Test',active:true,barcode:'SHIFT_TEST',defaultLocationId:'m1',
 assignments:[{from:'2026-01-01',locationId:'m1'}],hiredAt:'2026-01-01',terminatedAt:'',
 attendanceFrom:'2026-10-12',defaultShift:'second',leaveQuotaByYear:{'2026':24},leaveCarryByYear:{'2026':-5}});
 s.employees.push({id:'hidden-emp',name:'Skriveni Probni',active:true,hidden:true,isTest:true,barcode:'HIDDEN_TEST',defaultLocationId:'m1',
 assignments:[{from:'2026-01-01',locationId:'m1'}],hiredAt:'2026-01-01',attendanceFrom:'2026-10-12'});
 s.employees.push({id:'linked-emp',name:'Povezani Radnik',active:true,barcode:'LINKED_TEST',defaultLocationId:'m1',
 assignments:[{from:'2026-01-01',locationId:'m1'}],hiredAt:'2026-01-01',attendanceFrom:'2026-10-12'});
 s.events.push({id:'shift-in',empId:'shift-emp',locId:'m1',kind:'in',at:'2026-10-13T14:15:00.000Z',source:'barcode'});
 s.events.push({id:'shift-out',empId:'shift-emp',locId:'m1',kind:'out',at:'2026-10-13T20:15:00.000Z',source:'barcode'});
 s.events.push({id:'linked-in',empId:'linked-emp',locId:'m1',kind:'in',at:'2026-10-13T08:00:00.000Z',source:'barcode'});
 s.overrides.push({id:'leave-used',empId:'shift-emp',locId:'m1',date:'2026-10-06',status:'GO'});
 s.overrides.push({id:'leave-planned',empId:'shift-emp',locId:'m1',date:'2026-10-20',status:'GO'});
 window.BALKAN_V6.render();
});
assert.ok(await page.getByText('Kašnjenja u mjesecu').count(),'Dashboard has monthly late metric');
const workerRow=page.locator('section.panel').filter({has:page.getByRole('heading',{name:/Danas · sedmica/})}).locator('table tr').filter({hasText:'Smjenski Test'}).first();
const rowText=await workerRow.innerText();
assert.ok(rowText.includes('Druga smjena'),'Shift B correctly assigned');
assert.ok(rowText.includes('15 min'),'15 minutes delay calculated for Shift B: '+rowText);
const balance=await page.evaluate(()=>{
 const employee=window.BALKAN_V6.state().employees.find(e=>e.id==='shift-emp');
 return yearLeaveSummary(employee,2026);
});
assert.equal(balance.quota,24,'Annual entitlement is 24 days for this 6-day worker');
assert.equal(balance.carry,-5,'Carried balance is preserved');
assert.equal(balance.autoLeave,0,'Dan bez prijave ostaje N i ne troši godišnji');
assert.equal(balance.annualRemaining,24-5-balance.used-balance.planned,'Full-year balance has no double counting');
assert.ok(rowText.includes('preostalo '+balance.annualRemaining),'Pregled pokazuje isti preostali broj kao stranica godišnjeg: '+rowText);
assert.equal(await page.getByText('Skriveni Probni').count(),0,'Hidden test staff excluded from overview');
await page.getByRole('button',{name:/Radnici/}).first().click();
assert.equal(await page.locator('#balkanLiveLeaveSummary').count(),0,'Annual balances removed from Radnici tab');
assert.equal(await page.locator('#balkanWorkerManagement tr').filter({hasText:'Smjenski Test'}).count(),1,'Worker management remains in Radnici');
await page.locator('[data-route="godisnji"]').first().click();
const leaveRow=page.locator('#balkanLiveLeaveSummary tr').filter({hasText:'Smjenski Test'}).first();
const leaveText=await leaveRow.innerText();
for(const part of ['24','-5',String(balance.annualRemaining)])assert.ok(leaveText.includes(part),'Annual leave part '+part);
await page.locator('[data-route="radnici"]').first().click();
assert.equal(await page.locator('#balkanWorkerManagement').getByText('Skriveni Probni').count(),0,'Hidden staff not in employee management; diagnostic may still explain exclusion');
await page.locator('[data-worker-toggle]').click();
assert.ok(await page.getByText('Skriveni Probni').count(),'Hidden staff displayed on demand');
await page.locator('tr').filter({hasText:'Skriveni Probni'}).locator('[data-worker-delete]').click();
await page.waitForFunction(()=>!window.BALKAN_V6.state().employees.some(e=>e.id==='hidden-emp'),{timeout:6000});
await page.locator('#balkanWorkerManagement tr').filter({hasText:'Skriveni Probni'}).waitFor({state:'detached',timeout:6000});
await page.locator('tr').filter({hasText:'Povezani Radnik'}).locator('[data-worker-delete]').click();
assert.ok(await page.getByText('Povezani Radnik').count(),'Worker with scan history protected from deletion');
await page.getByRole('button',{name:/Objekti/}).first().click();
await page.locator('[data-location-edit="m1"]').click();
assert.equal(await page.locator('#locationForm input[name=firstStart]').inputValue(),'08:00');
assert.equal(await page.locator('#locationForm input[name=secondStart]').inputValue(),'14:00');
console.log('PASS Shifts and balances: 2 shifts, 15-min delay, live annual accrual with carried days, hidden/test staff, guarded deletion');
assert.equal(errors.length,0,'Javascript errors: '+errors.join(' | '));
await browser.close();
