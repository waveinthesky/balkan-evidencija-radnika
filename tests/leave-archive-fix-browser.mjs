// 1) Promjena prezimena (Belisa Ahmemulić → Belisa Žarić): prenos iz arhive 2025. ostaje; arhiva se ne mijenja.
// 2) Povezivanje radnika sa sličnim imenom iz arhive.  3) Brisanje / ispravka / vraćanje rješenja.
// 4) Pregled rješenja prije izdavanja (pojedinačno i NACRT svih).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='prompt')d.accept('');else d.accept()});
const archive={workers:[
 {key:'w1',name:'Belisa Ahmemulić',excelRemaining:-5,excelTotal:31,excelEntitlement:26,days:{'2025-03-03':'O'}},
 {key:'w2',name:'Amra Starić',excelRemaining:4,excelTotal:16,excelEntitlement:20,days:{}}],holidays:{}};
await page.route('**/www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js',r=>r.fulfill({status:200,contentType:'application/javascript',
 body:'export function doc(){return {}}export function collection(){return {}}export function serverTimestamp(){return {}}export function writeBatch(){return {set(){},commit:async()=>{}}}export async function getDocs(){return {docs:[]}}export async function getDocFromServer(){return {exists:()=>true,data:()=>('+JSON.stringify(archive)+')}}'}));
await page.route('**/admin-firebase.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:`(async()=>{
 const HIST=await import('./history-2025.js?test=1');await HIST.load({});
 const api=window.BALKAN_V6;
 window.BALKAN_ARCHIVE={display:()=>{HIST.setAliases(api.state()?.employees);return HIST.display()},getCarryover:(n,a)=>HIST.carryoverFor2026(n,a),isLoaded:()=>HIST.isLoaded(),workerNames:()=>HIST.workerNames(),similarNames:n=>HIST.similarNames(n)};
 await api.boot();document.getElementById('v6Login').style.display='none';window.__B=1})().catch(e=>{window.__E=String(e.stack)})`}));
await page.goto('http://127.0.0.1:8765/admin.html');await page.waitForFunction(()=>window.__B||window.__E);
assert.equal(await page.evaluate(()=>window.__E||''),'');
await page.evaluate(()=>{const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 const mk=(id,name)=>({id,name,barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:'2024-01-01',defaultLocationId:loc,assignments:[{from:'2024-01-01',locationId:loc}],position:'Prodavac',residence:'Bar'});
 S.employees.push(mk('bel','Belisa Ahmemulić'),mk('amr','Amra Novak'));
 S.leaveGrants.push({id:'g1',empId:'bel',year:2026,days:26,weekdays:[1,2,3,4,5,6]},{id:'g2',empId:'amr',year:2026,days:20,weekdays:[1,2,3,4,5]});
 window.BALKAN_V6.render()});
const carry=id=>page.evaluate(id=>{const S=window.BALKAN_V6.state();return window.balkanLeaveBalance(S.employees.find(e=>e.id===id),2026).carry},id);
assert.equal(await carry('bel'),-5,'Prije promjene: prenos -5 iz arhive');
// 1) promjena imena kroz obrazac radnika
await page.getByRole('button',{name:/Radnici/}).first().click();
await page.locator('[data-edit-worker="bel"]').first().click();
await page.locator('#workerForm [name=name]').fill('Belisa Žarić');
await page.locator('#workerForm button[type=submit]').click();
await page.waitForFunction(()=>window.BALKAN_V6.state().employees.find(e=>e.id==='bel').name==='Belisa Žarić');
const bel=await page.evaluate(()=>window.BALKAN_V6.state().employees.find(e=>e.id==='bel'));
assert.deepEqual(bel.archiveNames,['Belisa Ahmemulić'],'Staro ime zapamćeno');
assert.equal(await carry('bel'),-5,'Poslije promjene imena prenos -5 OSTAJE');
await page.locator('[data-route="godisnji"]').first().click();
await page.locator('select[data-leave-field=employee]').selectOption('bel');
assert.match(await page.locator('.lv-carry').innerText(),/-5[\s\S]*u arhivi kao „Belisa Ahmemulić“/);
const arch=await page.evaluate(()=>window.BALKAN_ARCHIVE.display());
assert.ok(arch.includes('Belisa Žarić (u arhivi 2025: Belisa Ahmemulić)'),'Arhiva 2025. prikazuje novo ime');
assert.equal(archive.workers[0].name,'Belisa Ahmemulić','Podaci arhive nisu mijenjani');
// 2) povezivanje sličnog imena
await page.locator('select[data-leave-field=employee]').selectOption('amr');
assert.equal(await carry('amr'),0);
await page.locator('[data-archive-link="amr"][data-archive-name="Amra Starić"]').click();
await page.waitForFunction(()=>(window.BALKAN_V6.state().employees.find(e=>e.id==='amr').archiveNames||[]).length===1);
assert.equal(await carry('amr'),4,'Poslije povezivanja: prenos +4');
// 3) brisanje / ispravka / vraćanje rješenja
await page.locator('select[data-leave-field=employee]').selectOption('bel');
await page.evaluate(()=>{const S=window.BALKAN_V6.state();
 const days=leaveDays('2026-12-07','2026-12-11',[1,2,3,4,5,6],[],'bel');
 S.leaveDecisions.push({id:'d1',empId:'bel',employeeName:'Belisa Žarić',year:2026,number:'GO-3',from:'2026-12-07',to:'2026-12-11',days,excluded:[],status:'issued',issuedAt:'2026-11-01',deliveredAt:'2026-11-01',position:'Prodavac',residence:'Bar',contract:'na određeno vrijeme',entitlementAtIssue:26,templateSnapshot:S.leaveTemplates.find(x=>x.id==='annual-main'),createdAt:new Date().toISOString()});
 window.BALKAN_V6.render()});
const planned=()=>page.evaluate(()=>window.balkanLeaveBalance(window.BALKAN_V6.state().employees.find(e=>e.id==='bel'),2026).planned);
assert.equal(await planned(),5);
await page.locator('[data-dec-delete="d1"]').click();
await page.waitForFunction(()=>!window.BALKAN_V6.state().leaveDecisions.some(d=>d.id==='d1'));
assert.equal(await planned(),0,'Obrisano rješenje oslobađa dane');
assert.match(await page.locator('.lv-trash summary').innerText(),/Obrisana rješenja \(1\)/);
await page.locator('.lv-trash summary').click();
await page.locator('[data-dec-restore]').click();
await page.waitForFunction(()=>window.BALKAN_V6.state().leaveDecisions.some(d=>d.id==='d1'));
assert.equal(await planned(),5,'Vraćeno rješenje ponovo rezerviše dane');
// ispravka: otvara obrazac s istim podacima, izdaje se ponovo pod istim brojem
await page.locator('[data-dec-fix="d1"]').click();
await page.waitForSelector('#wzCal');
assert.equal(await page.locator('#leaveDecisionForm [name=number]').inputValue(),'GO-3','Ispravka zadržava broj');
assert.match(await page.locator('#wzSum').innerText(),/7\.12\.2026\. – 11\.12\.2026\./,'Ispravka zadržava period');
await page.locator('[data-wz-day="2026-12-09"]').click();await page.locator('[data-wz-day="2026-12-10"]').click(); // kraći period
const popupP=ctx.waitForEvent('page');
await page.locator('#leaveDecisionForm button[type=submit]').click();
const pop=await popupP;await pop.close();
const st=await page.evaluate(()=>{const S=window.BALKAN_V6.state();return {decs:S.leaveDecisions.filter(d=>d.empId==='bel').map(d=>d.number+':'+d.from+'>'+d.to),trash:S.leaveTrash.length}});
assert.deepEqual(st.decs,['GO-3:2026-12-09>2026-12-10'],'Ispravljeno rješenje GO-3 s novim periodom');
assert.equal(st.trash,1,'Staro rješenje u obrisanima');
// vraćanje starog nije moguće dok postoji ispravljeno (preklapanje dana)
await page.locator('select[data-leave-field=employee]').selectOption('bel');
await page.locator('.lv-trash summary').click();
if(process.env.SHOTS)await page.screenshot({path:process.env.SHOTS+'-trash.png',fullPage:true});
await page.locator('[data-dec-restore]').click();
assert.equal(await page.evaluate(()=>window.BALKAN_V6.state().leaveDecisions.filter(d=>d.empId==='bel').length),1,'Nema duplih rješenja za iste dane');
// 4) pregled prije izdavanja u prozoru za sve dane
await page.evaluate(()=>{const S=window.BALKAN_V6.state(),loc=S.locations[0].id;
 S.events.push({id:'ev1',empId:'amr',locId:loc,kind:'in',at:'2026-10-05T06:00:00.000Z',source:'barcode'},{id:'ev2',empId:'amr',locId:loc,kind:'out',at:'2026-10-05T14:00:00.000Z',source:'barcode'});window.BALKAN_V6.render()});
await page.locator('select[data-leave-field=employee]').selectOption('amr');
await page.locator('.lv-main [data-bulk-open]').click();await page.waitForSelector('#bulkLeaveForm');
await page.locator('[data-bulk-kind="N"]').check();
await page.waitForFunction(()=>document.querySelectorAll('.bk-row').length>0);
await page.locator('.bk-row [data-bulk-prev]').first().click();
await page.waitForSelector('.bk-prev .rj-page');
assert.match(await page.locator('.bk-prev').innerText(),/RJEŠENJE O KORIŠĆENJU GODIŠNJEG ODMORA[\s\S]*Amra Novak/);
assert.ok(await page.locator('.bk-row input').first().isChecked(),'Klik na pregled ne mijenja kvačicu');
if(process.env.SHOTS)await page.screenshot({path:process.env.SHOTS+'-prev.png'});
const before=await page.evaluate(()=>window.BALKAN_V6.state().leaveDecisions.length);
const draftP=ctx.waitForEvent('page');await page.locator('[data-bulk-draft]').click();const draft=await draftP;await draft.waitForLoadState();
assert.match(await draft.locator('.bar').innerText(),/NACRT/);
assert.ok(await draft.locator('.sheet').count()>=1);
assert.equal(await page.evaluate(()=>window.BALKAN_V6.state().leaveDecisions.length),before,'Nacrt ništa ne čuva');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS ARHIVA/ISPRAVKE: promjena prezimena čuva prenos -5 i arhivu, povezivanje sličnog imena (+4), obriši/vrati/ispravi rješenje bez duplikata, pregled i NACRT prije izdavanja');
