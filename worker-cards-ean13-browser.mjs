// EAN-13 kartice: dodjela novih kodova, štampa svih kartica, kartice se mogu očitati (ZXing dekoder).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1300,height:900}});
const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 ['Amra Hodžić','Edin Lukač','Sanja Perović','Nikola Vuković','Mirela Đurović'].forEach((n,i)=>
  S.employees.push({id:'c'+i,name:n,barcode:'BKOLDCODE00'+i,barcodeAssigned:true,active:true,hiredAt:'2025-01-01',defaultLocationId:loc,assignments:[{from:'2025-01-01',locationId:loc}]}));
 window.BALKAN_V6.render();
});
await page.getByRole('button',{name:/Radnici/}).first().click();
const issue=page.locator('[data-balkan-issue-cards]');
assert.match(await issue.innerText(),/EAN-13/,'Dugme za nove EAN-13 kodove');
await issue.click();await page.waitForTimeout(400);
const codes=await page.evaluate(()=>window.BALKAN_V6.state().employees.filter(e=>e.id.startsWith('c')).map(e=>e.barcode));
assert.equal(codes.length,5);
for(const c of codes)assert.match(c,/^29\d{11}$/,'Novi kod je EAN-13 s prefiksom 29: '+c);
assert.equal(new Set(codes).size,5,'Kodovi jedinstveni');
// štampa svih kartica
const [popup]=await Promise.all([page.waitForEvent('popup'),page.locator('[data-print-all-workers]').click()]);
await popup.evaluate(()=>{window.print=()=>{}});
await popup.waitForLoadState();await popup.waitForTimeout(300);
assert.equal(await popup.locator('svg.ean13').count(),5,'5 EAN-13 kartica u štampi');
const w=await popup.evaluate(()=>document.querySelector('svg.ean13').getBoundingClientRect().width);
assert.ok(Math.abs(w-46*96/25.4)<3,'Barkod u stvarnoj veličini 46 mm, nije razvučen: '+w+'px');
// "Štampa" pri ~200 dpi (deviceScaleFactor 2) i dekodiranje svake kartice
const hi=await b.newContext({viewport:{width:900,height:1300},deviceScaleFactor:2});
const pp=await hi.newPage();
await pp.setContent(await popup.content());
await pp.evaluate(()=>{window.print=()=>{}});
const found=[];
const cards=pp.locator('article.card');
for(let i=0;i<await cards.count();i++){
 const file='/tmp/ean-card-'+i+'.png';
 await cards.nth(i).screenshot({path:file});
 const out=execFileSync('python3',['-c',`import zxingcpp,sys;from PIL import Image;r=zxingcpp.read_barcodes(Image.open(sys.argv[1]));print(';'.join(f"{x.format}:{x.text}" for x in r))`,file]).toString().trim();
 found.push(out);
}
for(const c of codes)assert.ok(found.some(f=>f.includes('EAN-13:'+c)),'Dekoder je pročitao '+c+' | '+found.join(' | '));
// pojedinačna kartica
await page.locator('[data-print-card="c0"]').first().click();
assert.equal(await page.locator('#employeeCard svg.ean13').count(),1,'Pojedinačna kartica je EAN-13');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS EAN-13 KARTICE: 5 novih jedinstvenih kodova (29…), štampa u stvarnoj veličini 46 mm, ZXing dekoder pročitao svih 5 odštampanih kartica');
