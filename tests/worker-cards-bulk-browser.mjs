import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1300,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/admin-firebase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:"(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__BOOTED=true})().catch(e=>window.__BOOT_ERROR=String(e))"}));
 await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BOOTED||window.__BOOT_ERROR);
 assert.equal(await page.evaluate(()=>window.__BOOT_ERROR||''),'');
 const initial=await page.evaluate(()=>{
  const s=window.BALKAN_V6.state();
  const make=(id,name,code,other={})=>({id,name,barcode:code,active:true,barcodeAssigned:true,
   defaultLocationId:'m1',assignments:[{from:'2026-01-01',locationId:'m1'}],hiredAt:'2026-01-01',...other});
  s.employees.push(make('card1','Aktivan Jedan','BK1001'));
  s.employees.push(make('card2','Aktivan Dva','BK1002'));
  s.employees.push(make('card3','Aktivan Tri','BK1003'));
  s.employees.push(make('card4','Treba Nov Barkod','NEPOSTAVLJENO-ABC',{barcodeAssigned:false}));
  s.employees.push(make('card5','Treba Drugi Barkod','',{barcodeAssigned:false}));
  s.employees.push(make('card6','Testna Osoba','TEST123',{isTest:true}));
  s.employees.push(make('card7','Sakrivena Osoba','HIDE123',{hidden:true}));
  s.employees.push(make('card8','Neaktivna Osoba','INACTIVE123',{active:false}));
  s.employees.push(make('card9','Bez Objekta','NOOBJECT',{defaultLocationId:'',assignments:[]}));
  s.employees.push(make('card10','Dupli Kod Prvi','DUPLICATE'));
  s.employees.push(make('card11','Dupli Kod Drugi','DUPLICATE'));
  window.BALKAN_V6.render();
  return {count:printableWorkerCards().length,issues:balkanCardCandidates().map(x=>x.id)};
 });
 assert.equal(initial.count,3,'Exactly three originally printable workers');
 assert.deepEqual(initial.issues.sort(),['card10','card11','card4','card5'].sort(),'Four can get new codes');
 await page.locator('[data-route="radnici"]').first().click();
 assert.match(await page.locator('[data-print-all-workers]').innerText(),/3/);
 assert.equal(await page.locator('[data-balkan-issue-cards]').count(),1);
 assert.match(await page.locator('[data-balkan-issue-cards]').innerText(),/4/);
 await page.locator('#balkanSkippedCards summary').click();
 const exclusions=page.locator('#balkanSkippedCards table tbody tr');
 assert.equal(await exclusions.count(),8,'All excluded employees displayed');
 for(const [name,reason] of [
 ['Treba Nov Barkod','Barkod još nije dodijeljen'],
 ['Treba Drugi Barkod','Barkod još nije dodijeljen'],
 ['Testna Osoba','Testni radnik'],
 ['Sakrivena Osoba','Skriven radnik'],
 ['Neaktivna Osoba','Neaktivan radnik'],
 ['Bez Objekta','Nije dodijeljen objekat'],
 ['Dupli Kod Prvi','Barkod se ponavlja'],
 ['Dupli Kod Drugi','Barkod se ponavlja']]){
  const row=exclusions.filter({hasText:name});
  assert.equal(await row.count(),1,name+' appears');
  assert.ok((await row.innerText()).includes(reason),name+' reason');
  assert.equal(await row.locator('[data-print-card]').count(),0,'Unprintable workers are not offered a card');
 }
 const pop=page.waitForEvent('popup');
 await page.locator('[data-print-all-workers]').click();
 const popup=await pop;
 await popup.waitForLoadState('domcontentloaded');
 assert.equal(await popup.locator('article.card').count(),3,'Only 3 valid cards printed before issuance');
 await popup.close();
 await page.locator('[data-balkan-issue-cards]').click();
 await page.waitForFunction(()=>{
  const s=window.BALKAN_V6.state();
  return ['card4','card5','card10','card11'].every(id=>s.employees.find(e=>e.id===id).barcodeAssigned===true&&s.employees.find(e=>e.id===id).barcode.startsWith('BK'));
 });
 const state=await page.evaluate(()=>{
  const s=window.BALKAN_V6.state();
  return {cards:printableWorkerCards().map(e=>e.id),codes:s.employees.map(e=>e.barcode),
   statuses:['card6','card7','card8','card9'].map(id=>[id,balkanCardReason(s.employees.find(e=>e.id===id))])};
 });
 assert.equal(state.cards.length,7,'3 previous + 4 newly issued');
 assert.equal(new Set(state.codes.filter(Boolean)).size,state.codes.filter(Boolean).length,'No new duplicates');
 assert.ok(state.statuses.every(x=>x[1]),'Excluded workers unchanged');
 await page.waitForFunction(()=>document.querySelector('[data-print-all-workers]')?.textContent.includes('(7)'),{timeout:10000});
 const pop2=page.waitForEvent('popup');
 await page.locator('[data-print-all-workers]').click();
 const popup2=await pop2;
 await popup2.waitForLoadState('domcontentloaded');
 assert.equal(await popup2.locator('article.card').count(),7,'All seven real ready workers included');
 await popup2.close();
 const priorCodes=await page.evaluate(()=>window.BALKAN_V6.state().employees.map(e=>[e.id,e.barcode,e.barcodeAssigned]));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BOOTED||window.__BOOT_ERROR);
 const afterCodes=await page.evaluate(()=>window.BALKAN_V6.state().employees.map(e=>[e.id,e.barcode,e.barcodeAssigned]));
 assert.deepEqual(afterCodes,priorCodes,'Codes durable after reload');
 assert.deepEqual(errors,[],'No JS errors: '+errors.join(' | '));
 console.log('PASS CARDS: 3 valid + 8 diagnosed; explicit issue 4 unique codes; inactive/hidden/test/no-object protected; 7 valid printable cards; persisted after reload.');
}finally{await browser.close()}
