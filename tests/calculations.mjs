import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1350,height:900}});
page.on('dialog',async d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__AUDIT_BOOTED=true})().catch(e=>{window.__AUDIT_ERROR=String(e)})"}));
await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__AUDIT_BOOTED||window.__AUDIT_ERROR);
assert.equal(await page.evaluate(()=>window.__AUDIT_ERROR||''),'');
await page.evaluate(()=>{
 let s=window.BALKAN_V6.state();
 s.employees.push({id:'report-test-1',name:'Obracun Probni',active:true,barcode:'REPORT_TEST',
 defaultLocationId:'m1',assignments:[{from:'2025-01-01',locationId:'m1'}],
 hiredAt:'2025-01-01',terminatedAt:'',shiftStart:'08:00',paidHours:8});
 s.employees.push({id:'old-worker-1',name:'Bivsi Probni',active:false,inactiveBy2026:true,barcode:'OLD_TEST',
 defaultLocationId:'m1',assignments:[{from:'2025-01-01',locationId:'m1'}],
 hiredAt:'2025-01-01',terminatedAt:''});
 s.holidays.push({id:'audit-holiday-1',date:'2026-10-20',endDate:'2026-10-22',
 type:'religious',paid:true,label:'Probni praznik',locationId:'m1',employeeId:null});
 s.events.push({id:'audit-in',empId:'report-test-1',locId:'m1',kind:'in',at:'2026-10-19T08:15:00.000Z',source:'manual'});
 s.events.push({id:'audit-out',empId:'report-test-1',locId:'m1',kind:'out',at:'2026-10-19T16:00:00.000Z',source:'manual'});
 window.BALKAN_V6.render();
});
await page.getByRole('button',{name:/Izvještaji/}).first().click();
await page.locator('select[data-field=calM]').selectOption('10');
await page.locator('input[data-field=calY]').fill('2026');
await page.locator('input[data-field=calY]').dispatchEvent('change');
await page.waitForTimeout(250);
const monthly=page.locator('tr').filter({hasText:'Obracun Probni'}).filter({hasText:'24 h 00 min'}).first();
assert.ok(await monthly.count(),'Paid 3 holidays x 8 h = 24 h shown');
const row=await monthly.textContent();
assert.ok(row.includes('7 h 45 min'),'Actual 7h45 shown: '+row);
assert.ok(row.includes('31 h 45 min'),'Total actual plus holiday = 31h45: '+row);
assert.ok(row.includes('15 min'),'Tardy 15 min shown: '+row);
assert.equal(await page.locator('tr').filter({hasText:'Bivsi Probni'}).count(),0,'Inactive 2026 excluded');
await page.locator('input[data-field=calY]').fill('2025');
await page.locator('input[data-field=calY]').dispatchEvent('change');
await page.waitForTimeout(250);
assert.ok(await page.locator('tr').filter({hasText:'Bivsi Probni'}).count()>0,'Inactive 2026 employee remains in historical 2025');
console.log('PASS Calculations: 7h45 real + 24h paid = 31h45; 15 min late; no former employee in 2026, retained in 2025');
await browser.close();
