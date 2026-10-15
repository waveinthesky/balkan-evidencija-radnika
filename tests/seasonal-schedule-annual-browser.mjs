import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1365,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.route('**/admin-firebase.js*',route=>route.fulfill({
  status:200,contentType:'application/javascript',
  body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__TEST_BOOTED=true})().catch(e=>window.__TEST_ERROR=String(e))"
 }));
 await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__TEST_BOOTED||window.__TEST_ERROR);
 assert.equal(await page.evaluate(()=>window.__TEST_ERROR||''),'','Start administracije');
 const initial=await page.evaluate(()=>{
  const S=window.BALKAN_V6.state();
  const from='2026-01-01';
  S.locations.find(l=>l.id==='m1').schedules.push({id:'summer',from,
   open:'07:00',close:'21:00',days:[1,2,3,4,5,6],grace:0,
   firstStart:'07:00',firstEnd:'14:00',secondStart:'14:00',secondEnd:'21:00'});
  S.locations.find(l=>l.id==='m2').schedules.push({id:'five-days',from,
   open:'08:00',close:'20:00',days:[1,2,3,4,5],grace:0});
  const worker=(id,name,loc,mode,shift)=>({
   id,name,barcode:'BK'+id,barcodeAssigned:true,active:true,
   defaultLocationId:loc,assignments:[{from,locationId:loc}],
   hiredAt:from,attendanceFrom:'2026-10-01',defaultShift:mode,shiftStart:shift
  });
  S.employees.push(worker('auto','Radnik Automatski','m1','','07:00'));
  S.employees.push(worker('first','Radnik Prva','m1','first',''));
  S.employees.push(worker('second','Radnik Druga','m1','second',''));
  S.employees.push(worker('custom','Radnik Posebna','m1','custom','07:00'));
  S.employees.push(worker('five','Radnik Pet Dana','m2','',''));
  S.employees.push(worker('fixed','Radnik Izuzetak','m2','',''));
  S.leaveGrants.push({id:'prev-grant',empId:'fixed',year:2026,days:27,
   weekdays:[1,2,3,4,5],extraDays:7,note:'Po posebnom osnovu'});
  const date='2026-10-15';
  return ['auto','first','second','custom'].map(id=>({
   id,start:shiftInfo(S.employees.find(e=>e.id===id),date,'m1').start
  }));
 });
 assert.deepEqual(initial.map(x=>x.start),['07:00','07:00','14:00','07:00']);
 await page.locator('[data-route="objekti"]').first().click();
 await page.locator('[data-location-edit="m1"]').first().click();
 const form=page.locator('#locationForm');
 assert.equal(await form.locator('input[name=open]').inputValue(),'07:00');
 assert.equal(await form.locator('input[name=firstStart]').inputValue(),'07:00');
 await form.locator('input[name=open]').fill('08:00');
 await form.locator('button[type=submit]').click();
 await page.waitForFunction(()=>!document.getElementById('locationForm'));
 const result=await page.evaluate(()=>{
  const S=window.BALKAN_V6.state(),date=today();
  const test=(id)=>{const e=S.employees.find(x=>x.id===id);
   return shiftInfo(e,date,e.defaultLocationId)};
  const sc=getSchedule('m1',date);
  const original=getSchedule('m1','2026-10-14');
  S.events.push({id:'auto-in',empId:'auto',locId:'m1',kind:'in',
   at:date+'T08:00:00.000Z',source:'test'});
  return {nowOpen:sc.open,nowFirst:sc.firstStart,oldOpen:original.open,
   auto:test('auto'),first:test('first'),second:test('second'),custom:test('custom'),
   lateAuto:tardiness(S.employees.find(x=>x.id==='auto'),date,'m1')};
 });
 assert.equal(result.nowOpen,'08:00','Market follows winter season');
 assert.equal(result.nowFirst,'08:00','First shift synced to new opening');
 assert.equal(result.oldOpen,'07:00','Historical time unchanged');
 assert.equal(result.auto.start,'08:00','Legacy individual shift 07 ignored in auto mode');
 assert.equal(result.first.start,'08:00','First shift follows opening');
 assert.equal(result.second.start,'14:00','Second shift preserved');
 assert.equal(result.custom.start,'07:00','Explicit custom shift preserved');
 assert.equal(result.lateAuto,0,'08:00 arrival is not late');
 await page.locator('[data-route="radnici"]').first().click();
 await page.locator('[data-edit-worker="auto"]').first().click();
 assert.equal(await page.locator('#workerForm select[name="defaultShift"]').inputValue(),'');
 assert.equal(await page.locator('#workerForm input[name="shiftStart"]').inputValue(),'07:00','Historical legacy time still stored but ignored in auto mode');
 await page.locator('#modal [data-act="close-modal"]').first().click();
 await page.locator('[data-route="godisnji"]').first().click();
 assert.ok(await page.locator('#balkanAnnualBulk').count(),'Bulk annual grant shown');
 assert.equal(await page.locator('[data-balkan-annual-bulk]').isDisabled(),false);
 await page.locator('[data-balkan-annual-bulk]').click();
 await page.waitForFunction(()=>window.BALKAN_V6.state().leaveGrants.filter(x=>x.source==='batch-confirmed').length===5 && document.querySelector('[data-balkan-annual-bulk]')?.disabled===true);
 const grants=await page.evaluate(()=>Object.fromEntries(window.BALKAN_V6.state().leaveGrants.map(x=>[x.empId,x.days])));
 for(const id of ['auto','first','second','custom'])assert.equal(grants[id],24,id+' six day fund');
 assert.equal(grants.five,20,'Five day weekly fund');
 assert.equal(grants.fixed,27,'Previously confirmed special right not overwritten');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__TEST_BOOTED||window.__TEST_ERROR);
 assert.equal(await page.evaluate(()=>window.__TEST_ERROR||''),'','Reload from local test state');
 const persisted=await page.evaluate(()=>{
  const S=window.BALKAN_V6.state(),g=S.leaveGrants.find(x=>x.empId==='auto');
  const a=S.employees.find(x=>x.id==='auto');
  return {grant:g?.days,open:getSchedule('m1',today()).open,
   start:shiftInfo(a,today(),'m1').start};
 });
 assert.deepEqual(persisted,{grant:24,open:'08:00',start:'08:00'},'Season and annual grant persisted');
 assert.deepEqual(errors,[],'Browser errors: '+errors.join(' | '));
 console.log('PASS Chromium real user workflow: seasonal time update, historical schedule, four shift modes, no false delay, annual bulk 24/20, manual exemption, persisted reload');
}finally{await browser.close();}
