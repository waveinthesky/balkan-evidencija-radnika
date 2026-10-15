import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'UTC'});
page.on('dialog',async d=>d.accept());
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/admin-firebase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__AUDIT_BOOTED=true})().catch(e=>window.__AUDIT_ERROR=String(e))"}));
await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__AUDIT_BOOTED||window.__AUDIT_ERROR);
assert.equal(await page.evaluate(()=>window.__AUDIT_ERROR||''),'','Boot');
await page.evaluate(()=>{
 const s=window.BALKAN_V6.state();let loc=s.locations.find(l=>l.id==='m1');
 loc.schedules=[{id:'test-shifts',from:'2026-01-01',open:'07:00',close:'21:00',grace:0,days:[1,2,3,4,5,6],firstStart:'08:00',firstEnd:'14:00',secondStart:'14:00',secondEnd:'21:00',paidHours:8}];
 s.employees.push({id:'lateness-probe',name:'Radnik za Boje',active:true,hidden:false,isTest:false,
 barcode:'LATE_PROBE',defaultLocationId:'m1',assignments:[{from:'2026-01-01',locationId:'m1'}],
 hiredAt:'2026-01-01',attendanceFrom:'2026-10-12',defaultShift:'first'});
 for (const [date,start,finish] of [['2026-10-12','08:00','14:00'],['2026-10-13','08:07','14:00'],['2026-10-14','08:15','14:00']]){
  s.events.push({id:'start-'+date,empId:'lateness-probe',locId:'m1',kind:'in',at:date+'T'+start+':00Z',source:'barcode'});
  s.events.push({id:'end-'+date,empId:'lateness-probe',locId:'m1',kind:'out',at:date+'T'+finish+':00Z',source:'barcode'});
 }
 window.BALKAN_V6.render();
});
await page.locator('#balkanDelayDate').fill('2026-10-12');
let daily=await page.locator('#balkanLatenessPanel').innerText();
assert.ok(daily.includes('Na vrijeme'),'Monday on-time displayed');
assert.ok(await page.locator('#balkanLatenessPanel tr.balkan-delay-row-ok').count(),'Green row');
await page.locator('#balkanDelayDate').fill('2026-10-13');
assert.ok(await page.locator('#balkanLatenessPanel tr.balkan-delay-row-warn').count(),'Tuesday orange 7 min');
await page.locator('#balkanDelayDate').fill('2026-10-14');
assert.ok(await page.locator('#balkanLatenessPanel tr.balkan-delay-row-bad').count(),'Wednesday red 15 min');
await page.locator('[data-delay-period="week"]').first().click();
let week=await page.locator('#balkanLatenessPanel').innerText();
assert.ok(week.includes('Ukupno kašnjenje: 22 min'),'Weekly delay 7+15=22');
assert.ok(week.includes('Radnik za Boje'),'Weekly by employee');
for(const css of ['.balkan-delay-row-ok','.balkan-delay-row-warn','.balkan-delay-row-bad']) assert.ok(await page.locator('#balkanLatenessPanel '+css).count()>0,'Weekly status '+css);
await page.locator('[data-delay-period="month"]').first().click();
let monthly=await page.locator('#balkanLatenessPanel').innerText();
assert.ok(monthly.includes('Ukupno kašnjenje: 22 min'),'Monthly 22 minutes');
assert.ok(monthly.includes('Detaljno po danima'),'Monthly per-day breakdown');
await page.getByRole('button',{name:/Izvještaji/}).first().click();
assert.ok(await page.locator('#balkanLatenessPanel').count(),'Lateness UI available in reports');
assert.equal(errors.length,0,errors.join('; '));
console.log('PASS Lateness colors: on time=green, 7 min=orange, 15 min=red; weekly/monthly totals 22 min and per-day detail');
await browser.close();
