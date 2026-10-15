import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.route('**/admin-firebase.js*',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__READY=true})().catch(e=>window.__ERROR=String(e))"
 }));
 await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__READY||window.__ERROR);
 assert.equal(await page.evaluate(()=>window.__ERROR||''),'','Admin boot');
 const before=await page.evaluate(()=>{
  const S=window.BALKAN_V6.state(),id='layout-staff-1';
  S.employees.push({id,name:'Tabelarni Probni',barcode:'LAYOUT100',barcodeAssigned:true,
   active:true,defaultLocationId:'m1',hiredAt:'2026-01-01',attendanceFrom:'2026-10-01',
   assignments:[{from:'2026-01-01',locationId:'m1'}],defaultShift:''});
  S.leaveGrants||=[];
  S.leaveGrants.push({id:'layout-grant',empId:id,year:2026,days:24,
   weekdays:[1,2,3,4,5,6],extraDays:0});
  const relevant=()=>JSON.stringify({worker:S.employees.find(e=>e.id===id),
   grant:S.leaveGrants.find(g=>g.id==='layout-grant'),events:S.events.filter(v=>v.empId===id)});
  window.BALKAN_V6.render();
  return relevant();
 });
 await page.locator('[data-route="radnici"]').first().click();
 assert.equal(await page.locator('#balkanWorkerManagement').count(),1,'Management table in Radnici');
 assert.equal(await page.locator('#balkanLiveLeaveSummary').count(),0,'No annual summary in Radnici');
 assert.equal(await page.locator('#balkanAnnualToday').count(),0,'No annual details in Radnici');
 const row=page.locator('#balkanWorkerManagement tr').filter({hasText:'Tabelarni Probni'});
 assert.equal(await row.count(),1,'Employee visible in management');
 for(const action of ['edit-worker','sick-worker','worker-history','worker-hide','worker-delete','print-card','leave-emp'])
  assert.equal(await row.locator('[data-'+action+']').count(),1,'Employee action '+action);
 assert.equal(await page.locator('[data-print-all-workers]').count(),1,'Print-all preserved');
 await row.locator('[data-edit-worker]').click();
 assert.equal(await page.locator('#workerForm').count(),1,'Edit opens');
 assert.equal(await page.locator('#workerForm input[name=barcode]').inputValue(),'LAYOUT100');
 await page.locator('#modal [data-act="close-modal"]').click();
 await row.locator('[data-leave-emp]').click();
 assert.equal(await page.locator('#balkanWorkerManagement').count(),0,'Management is not in leave page');
 assert.equal(await page.locator('#balkanLiveLeaveSummary').count(),1,'Annual table moved to leave page');
 assert.equal(await page.locator('#balkanAnnualToday').count(),1,'Per-employee annual section remains');
 assert.equal(await page.locator('#balkanAnnualBulk').count(),1,'Bulk annual rights remain');
 assert.equal(await page.locator('[data-leave-field=employee]').inputValue(),'layout-staff-1','Correct worker selected');
 const ordered=await page.evaluate(()=>{
  const list=['balkanLiveLeaveSummary','balkanAnnualToday','balkanAnnualBulk'];
  return list.map(x=>[x,document.getElementById(x)?.getBoundingClientRect().top]);
 });
 assert.ok(ordered.every(x=>typeof x[1]==='number'),'All leave panels mounted');
 assert.ok(ordered[0][1]<ordered[1][1]&&ordered[1][1]<ordered[2][1],
  'All-workers annual table above employee details, bulk controls below');
 assert.equal(await page.locator('#balkanLiveLeaveSummary tr').filter({hasText:'Tabelarni Probni'}).count(),1);
 await page.locator('[data-leave-field=year]').fill('2025');
 await page.locator('[data-leave-field=year]').dispatchEvent('change');
 assert.ok((await page.locator('#balkanLiveLeaveSummary').innerText()).includes('Pravo 2025'),
  'Annual table follows selected year');
 const after=await page.evaluate(()=>{
  const S=window.BALKAN_V6.state(),id='layout-staff-1';
  return JSON.stringify({worker:S.employees.find(e=>e.id===id),
   grant:S.leaveGrants.find(g=>g.id==='layout-grant'),events:S.events.filter(v=>v.empId===id)});
 });
 assert.equal(after,before,'Navigating and opening tabs does not mutate employee or leave rights');
 assert.deepEqual(errors,[],'No browser JavaScript errors: '+errors.join(' | '));
 console.log('PASS browser: Radnici shows management first; year-by-year leave summary appears only in Godisnji; old leave functions remain below; print all/actions/employee selection intact; data unchanged');
}finally{await browser.close();}
