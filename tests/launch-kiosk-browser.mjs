import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1200,height:900}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const app='export function initializeApp(c){return{config:c}}';
 const auth='const a={currentUser:{uid:"anon-test",isAnonymous:true}};export function getAuth(){return a}export function onAuthStateChanged(_,cb){setTimeout(()=>cb(a.currentUser),10);return()=>{}}export async function signInAnonymously(){return{user:a.currentUser}}';
 const db=[
 'export function initializeFirestore(){return{}}',
 'export function persistentLocalCache(){return{}}',
 'export function persistentMultipleTabManager(){return{}}',
 'export function getFirestore(){return{}}',
 'export function doc(_, ...p){return p.join("/")}',
 'export async function getDocFromServer(ref){',
 'const code=String(ref).split("/").pop();',
 'const yes=["MARKET1","MARKET2","INACTIVE","NOOBJECT"].includes(code);',
 'return{exists:()=>yes,data:()=>code==="INACTIVE"?{active:false,empId:"invalid",locationId:"m1"}:code==="NOOBJECT"?{active:true,empId:"orphan"}:{active:true,empId:code==="MARKET1"?"e1":"e2",locationId:code==="MARKET1"?"m1":"m2",name:"Radnik "+code}}',
 '}',
 'export function serverTimestamp(){return{server:true}}',
 'export async function setDoc(ref,value){',
 'if(globalThis.__denyWrite)throw Object.assign(new Error("Permissions rejected"),{code:"permission-denied"});',
 '(globalThis.__writes||=[]).push({ref,value})',
 '}'
 ].join('\n');
 await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{
  const u=route.request().url(),body=u.includes('firebase-app.')?app:u.includes('firebase-auth.')?auth:db;
  route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body});
 });
 await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Spremno za skeniranje'),{timeout:12000});
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:15000});
 const items=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]'));
 const written=()=>page.evaluate(()=>globalThis.__writes||[]);
 async function scan(code){
  await page.locator('#barcode').fill(code);
  await page.locator('#scanForm button[type=submit]').click();
 }
 await scan('MARKET1');
 await page.waitForFunction(()=>globalThis.__writes?.length===1);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0);
 assert.match(await page.locator('#status').innerText(),/Potvrđeno u Firebase bazi.*DOLAZAK/);
 const first=(await written())[0];
 assert.equal(first.value.kind,'in');
 assert.equal(first.value.empId,'e1');
 assert.equal(first.value.locId,'m1');
 await scan('MARKET1');
 assert.match(await page.locator('#status').innerText(),/Ponovljen/);
 assert.equal((await written()).length,1,'Same card and kind in 60s blocked');
 await page.locator('#modeOut').click();
 await scan('MARKET1');
 await page.waitForFunction(()=>globalThis.__writes?.length===2);
 assert.equal((await written())[1].value.kind,'out');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0);
 await context.setOffline(true);
 await page.waitForFunction(()=>!navigator.onLine);
 await page.locator('#modeIn').click();
 await scan('MARKET2');
 assert.match(await page.locator('#status').innerText(),/Sačuvano NA OVOM RAČUNARU/);
 let queued=await items();
 assert.equal(queued.length,1);
 assert.equal(queued[0].barcode,'MARKET2');
 assert.equal(queued[0].kind,'in');
 assert.equal(queued[0].offlineAtCapture,true);
 const firstQueuedId=queued[0].id,firstQueuedAt=queued[0].at;
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#queueState')?.textContent.includes('1 zapis čeka slanje'),{timeout:12000});
 assert.equal((await items())[0].id,firstQueuedId,'Offline record survives reload');
 assert.match(await page.locator('#receiptState').innerText(),/SAČUVANO NA OVOM RAČUNARU/);
 assert.match(await page.locator('#connection').innerText(),/Bez interneta/);
 await page.locator('#modeOut').click();
 await scan('MARKET2');
 queued=await items();
 assert.equal(queued.length,2,'Second offline scan added');
 assert.equal(queued[1].kind,'out');
 assert.equal(queued[0].at,firstQueuedAt,'Offline original time retained');
 assert.equal((await page.locator('#events .item-state.pending').count()),2,'Two queued entries visible offline alongside confirmed history');
 await context.setOffline(false);
 await page.waitForFunction(()=>navigator.onLine);
 // Firebase mock modules are loaded on internet restoration; no user presses "sync".
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0,{timeout:15000});
 const uploaded=await written();
 assert.equal(uploaded.length,2,'Two queued events uploaded in reloaded browser mock');
 assert.equal(uploaded[0].ref.split('/').pop(),firstQueuedId,'Original event idempotency key reused');
 assert.equal(uploaded[0].value.at,firstQueuedAt,'Original offline timestamp used');
 assert.equal(uploaded[0].value.empId,'e2');
 assert.equal(uploaded[1].value.kind,'out');
 await page.locator('#modeIn').click();
 await scan('INACTIVE');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').some(x=>x.flag==='review'));
 assert.equal((await items()).length,1,'Rejected card kept for review');
 assert.match(await page.locator('#queueState').innerText(),/1 zapis zahtijeva provjeru/);
 await page.evaluate(()=>globalThis.__denyWrite=true);
 await page.locator('#modeIn').click(); // dugme važi samo za jedno skeniranje
 await scan('MARKET1');
 await page.waitForFunction(()=>document.querySelector('#syncStatus')?.textContent.includes('Firebase odbija upis'));
 assert.equal((await items()).filter(x=>x.flag!=='review').length,1,'Permission denied leaves pending event');
 await page.evaluate(()=>globalThis.__denyWrite=false);
 await page.locator('#queueRetry').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').filter(x=>x.flag!=='review').length===0);
 assert.equal((await items()).length,1,'Only invalid card remains for manual review');
 // HID-scanner simulation: focus lost after pressing a button; no click on barcode field.
 await page.locator('#modeIn').click();
 await page.waitForFunction(()=>!document.querySelector('#queueRetry').disabled);
 await page.locator('#queueRetry').focus();
 assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'barcode');
 await page.keyboard.type('MARKET2',{delay:4});
 assert.equal(await page.locator('#barcode').inputValue(),'MARKET2','Whole scan redirected into barcode without missing first letter');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>globalThis.__writes?.length===4,{timeout:10000});
 assert.equal((await written())[3].value.kind,'in','Enter from USB scanner submits automatically');
 assert.equal((await written())[3].value.empId,'e2');
 // Tab is also a common barcode scanner suffix.
 await page.locator('#modeOut').click();
 await page.waitForFunction(()=>!document.querySelector('#queueRetry').disabled);
 await page.locator('#queueRetry').focus();
 await page.keyboard.type('MARKET2',{delay:3});
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>globalThis.__writes?.length===5,{timeout:10000});
 assert.equal((await written())[4].value.kind,'out','Tab suffix submits barcode');
 assert.equal((await items()).length,1,'Scanner focus recovery does not alter review records');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.activeElement?.id==='barcode',{timeout:5000});

 assert.deepEqual(errors,[],'No browser errors '+errors.join('; '));
 console.log('PASS OFFLINE KIOSK & SCANNER: offline queue, automatic resync, Enter/Tab suffix when focus on another button, first scan character intact, autofocus on reload.');
}finally{await browser.close()}
