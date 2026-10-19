import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>{window.print=()=>{};});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.route('**/admin-firebase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',
  body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__AUDIT_BOOTED=true})().catch(e=>window.__AUDIT_ERROR=String(e))`}));
 await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__AUDIT_BOOTED||window.__AUDIT_ERROR,{timeout:15000});
 assert.equal(await page.evaluate(()=>window.__AUDIT_ERROR||''),'','Boot succeeded');
 const logic=await page.evaluate(()=>{
  const data=window.BALKAN_V6.state(),employee={
   id:'audit-vacation',name:'Audit Godisnji',active:true,barcode:'2900000000063',
   barcodeAssigned:true,defaultLocationId:'m1',hiredAt:'2026-01-01',attendanceFrom:'2026-10-01',
   assignments:[{from:'2026-01-01',locationId:'m1'}],terminatedAt:''
  };
  data.employees.push(employee);
  data.overrides.push({id:'audit-present',empId:employee.id,locId:'m1',date:'2026-10-05',status:'P',note:'worked'});
  data.overrides.push({id:'audit-second',empId:employee.id,locId:'m1',date:'2026-10-13',status:'P',note:'worked'});
  data.holidays.push({id:'audit-holiday',date:'2026-10-07',endDate:'2026-10-08',
   type:'religious',label:'Vjerski praznik',paid:true,locationId:'m1',employeeId:employee.id});
  employee.sickLeaves=[{id:'audit-sick',from:'2026-10-09',to:'2026-10-10'}];
  data.overrides.push({id:'audit-holiday-overlap',empId:employee.id,locId:'m1',date:'2026-10-08',status:'GO'});
  data.employees.push({id:'audit-placeholder',name:'Bez Barkoda',active:true,
   barcode:'NEPOSTAVLJENO-000',defaultLocationId:'m1',hiredAt:'2026-01-01',attendanceFrom:'2026-10-01',
   assignments:[{from:'2026-01-01',locationId:'m1'}]});
  const allowance5=annualEntitlementSuggestion(employee,2026,5);
  const allowance6=annualEntitlementSuggestion(employee,2026,6);
  const july=annualEntitlementSuggestion({...employee,hiredAt:'2026-07-01'},2026,5);
  const holidays=[holiday('m1','2026-10-07',employee)?.type,holiday('m1','2026-10-08',employee)?.type];
  const goDays=leaveDays('2026-10-05','2026-10-10',[1,2,3,4,5,6],[],employee.id);
  const overlap={status:dayStatus(employee,'2026-10-08','m1'),used:leaveCount(employee.id,2026).used,holidayAuto:agreedAnnualCandidate(employee,'2026-10-08','m1')};
  const candidates=likelyLeaveReviewDays(employee,2026);
  const before=data.overrides.length;
  window.BALKAN_V6.render();
  return {allowance5,allowance6,july,holidays,goDays,overlap,candidates:candidates.map(x=>x.date),before};
 });
 assert.equal(logic.allowance5.days,20,'Full year 5-day entitlement');
 assert.equal(logic.allowance6.days,24,'Full year 6-day entitlement');
 assert.equal(logic.july.days,10,'Started in July, half year');
 assert.deepEqual(logic.holidays,['religious','religious'],'Both days identified');
 assert.equal(logic.overlap.status,'VH','Paid holiday visible even when legacy GO override exists');
 assert.equal(logic.overlap.holidayAuto,false,'Paid holiday must not become automatic leave');
 assert.equal(logic.overlap.used,0,'Dani bez prijave ostaju N i ne troše godišnji');
 assert.ok(!logic.goDays.includes('2026-10-07')&&!logic.goDays.includes('2026-10-08'),'Holiday excluded from annual leave');
 assert.ok(logic.candidates.includes('2026-10-06'),'Unscanned working day proposed');
 assert.ok(!logic.candidates.includes('2026-10-07'),'Holiday not proposed as vacation');
 assert.ok(!logic.candidates.includes('2026-10-09'),'Sick day not proposed as vacation');
 assert.ok(!logic.candidates.includes('2026-10-05'),'Present day not proposed as vacation');
 assert.equal(await page.evaluate(()=>window.BALKAN_V6.state().overrides.length),logic.before,
  'Preview must not modify stored attendance');
 await page.getByRole('button',{name:/Godišnji odmori/}).first().click();
 await page.locator('select[data-leave-field=employee]').selectOption('audit-vacation');
 assert.ok(await page.getByRole('button',{name:/Pregledaj i potvrdi dane/}).count(),'Review panel available');
 await page.getByRole('button',{name:/Pregledaj i potvrdi dane/}).click();
 assert.ok(await page.locator('#balkanLeaveReviewForm').count(),'Review dialog opens');
 await page.locator('#balkanLeaveReviewForm input[name=leaveDate][value="2026-10-06"]').check();
 await page.locator('#balkanLeaveReviewForm textarea[name=note]').fill('Dokumentacija provjerena: AUDIT-1');
 await page.locator('#balkanLeaveReviewForm button[type=submit]').click();
 await page.waitForFunction(()=>window.BALKAN_V6.state().overrides.some(o=>o.id!=='audit-present'&&o.empId==='audit-vacation'&&o.date==='2026-10-06'&&o.status==='GO'));
 const after=await page.evaluate(()=>window.BALKAN_V6.state().overrides);
 const afterCount=await page.evaluate(()=>leaveCount('audit-vacation',2026).used);
 assert.equal(afterCount,logic.overlap.used+1,'Svjesno potvrđen GO dan broji se tačno jednom');
 assert.ok(after.some(o=>o.empId==='audit-vacation'&&o.date==='2026-10-05'&&o.status==='P'),'Existing marked presence preserved');
 assert.ok(after.some(o=>o.empId==='audit-vacation'&&o.date==='2026-10-06'&&o.status==='GO'),'Confirmed day becomes GO');
 assert.ok(!after.some(o=>o.empId==='audit-vacation'&&o.date==='2026-10-07'&&o.status==='GO'),'Holiday remains unmodified');
 await page.getByRole('button',{name:/Radnici/}).first().click();
 const printAll=page.locator('[data-print-all-workers]');
 assert.ok(await printAll.count(),'Print all button');
 const [popup]=await Promise.all([page.waitForEvent('popup',{timeout:9000}),printAll.click()]);
 await popup.waitForLoadState('domcontentloaded');
 assert.ok(await popup.locator('.card').count()>=1,'Printable cards generated');
 assert.equal(await popup.locator('.card').filter({hasText:'Bez Barkoda'}).count(),0,'Placeholder card excluded');
 await popup.close();
 assert.deepEqual(errors,[],'No browser JS exceptions');
 console.log('PASS holiday range, statutory accrual, vacation preview+confirm, preserve existing calendar, print all cards');
}finally{await browser.close();}
