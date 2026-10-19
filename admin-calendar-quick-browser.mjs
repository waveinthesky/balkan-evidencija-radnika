// Kalendar v2: jedan klik N → P → GO → N, poništavanje, zaključani dani, "Detalji" ne mijenja status.
// (lokalni administratorski način bez Firebasea; snima i stanje nakon ponovnog učitavanja)
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const shots=process.env.SHOTS;
const b=await chromium.launch();const page=await b.newPage({viewport:{width:1440,height:950}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('DIALOG '+d.message());d.accept()});
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{await window.BALKAN_V6.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
const D=(n)=>{const t=new Date();t.setDate(t.getDate()-n);return t.toISOString().slice(0,10)};
// pronađi skorašnji radni dan bez skeniranja (N) za testnog radnika
await page.evaluate(()=>{
 const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 S.employees.push({id:'q1',name:'Klik Testni',barcode:'BKQ1',active:true,hiredAt:'2025-01-01',defaultLocationId:loc,assignments:[{from:'2025-01-01',locationId:loc}]});
 S.leaveDecisions=S.leaveDecisions||[];
 window.BALKAN_V6.render();
});
await page.getByRole('button',{name:/Kalendar/}).first().click();
const cellSel=(d)=>'.bk-cal button.cell[data-emp="q1"][data-day="'+d+'"]';
const target=await page.evaluate(()=>{const c=[...document.querySelectorAll('.bk-cal button.cell.N[data-emp="q1"]')].pop();return c?.dataset.day||null});
assert.ok(target,'Postoji N dan za testnog radnika u tekućem mjesecu');
const cls=async()=>(await page.locator(cellSel(target)).getAttribute('class')).split(' ');
const before=await page.evaluate(()=>window.BALKAN_V6.state().overrides.length);
await page.locator(cellSel(target)).click();
assert.ok((await cls()).includes('P'),'1. klik: N → P');
assert.ok((await cls()).includes('manual'),'Ručna izmjena označena');
await page.locator(cellSel(target)).click();
assert.ok((await cls()).includes('GO'),'2. klik: P → GO');
await page.locator(cellSel(target)).click();
assert.ok((await cls()).includes('N'),'3. klik: GO → N');
assert.ok(!(await cls()).includes('manual'),'Povratak na N = automatski status, bez ručnog zapisa');
assert.equal(await page.evaluate(()=>window.BALKAN_V6.state().overrides.length),before,'Nema zaostalih ručnih zapisa');
// poništavanje
await page.locator(cellSel(target)).click();
assert.ok((await cls()).includes('P'));
await page.waitForSelector('#bkCalToast.show [data-bk-undo]');
if(shots)await page.screenshot({path:shots+'-toast.png'});
await page.locator('#bkCalToast [data-bk-undo]').click();
assert.ok((await cls()).includes('N'),'Poništi vraća prethodno stanje');
// detalji dana prikazani ispod
assert.ok((await page.locator('#dayPanel').innerText()).includes('Klik Testni'),'Detalji izabranog dana');
// GO se broji kao godišnji odmor
await page.locator(cellSel(target)).click();await page.locator(cellSel(target)).click();
const go=await page.evaluate(d=>window.BALKAN_V6.state().overrides.find(o=>o.empId==='q1'&&o.date===d)?.status,target);
assert.equal(go,'GO','GO upisan kao ručni status (ulazi u obračun godišnjeg)');
// zaključan dan: bolovanje
await page.evaluate(d=>{const e=window.BALKAN_V6.state().employees.find(x=>x.id==='q1');e.sickLeaves=[{id:'s1',from:d,to:d}];window.BALKAN_V6.render()},target);
await page.locator('[data-toggle-sick-calendar]').click();
await page.locator(cellSel(target)).click();
assert.match(await page.locator('#bkCalToast').innerText(),/bolovanju/,'Zaključan dan objašnjen porukom');
assert.ok((await cls()).includes('BO'),'Bolovanje se ne mijenja klikom');
await page.evaluate(()=>{const e=window.BALKAN_V6.state().employees.find(x=>x.id==='q1');e.sickLeaves=[];window.BALKAN_V6.render()});
// Danas, strelice, objekti
await page.locator('[data-act=nextmonth]').first().click();
await page.locator('[data-bk-today]').click();
assert.ok(await page.locator('.bk-cal th.today').count()===1,'Današnji dan istaknut');
const locs=await page.locator('[data-bk-loc]').count();
if(locs>1){await page.locator('[data-bk-loc]').nth(1).click();assert.ok((await page.locator('.bk-cal-head h3').innerText()).length>0);await page.locator('[data-bk-loc]').nth(0).click()}
// "Detalji" iz drugih ekrana NE mijenja status
const st=await cls();
await page.evaluate(d=>{const btn=document.createElement('button');btn.className='btn small';btn.dataset.day=d;btn.dataset.emp='q1';btn.dataset.loc=window.BALKAN_V6.state().locations[0].id;btn.id='fakeDetalji';btn.textContent='Detalji';document.getElementById('app').prepend(btn)},target);
await page.locator('#fakeDetalji').click();
assert.deepEqual((await cls()).filter(c=>c!=='selected'),st.filter(c=>c!=='selected'),'Dugme Detalji ne mijenja status dana');
// ponovno učitavanje zadržava izmjenu
await page.waitForTimeout(400);
await page.reload();await page.waitForFunction(()=>window.__B||window.__E);
await page.getByRole('button',{name:/Kalendar/}).first().click();
assert.ok((await cls()).includes('GO'),'GO ostaje nakon ponovnog učitavanja');
if(shots){await page.locator(cellSel(target)).click();await page.screenshot({path:shots+'-detail.png',fullPage:true})}
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS KALENDAR: jedan klik N→P→GO→N, poništi, GO u obračunu, zaključano bolovanje, Danas/objekti, Detalji ne mijenja status, čuva se nakon reload');
