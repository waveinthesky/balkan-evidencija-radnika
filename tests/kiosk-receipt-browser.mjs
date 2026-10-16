import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1160,height:880}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const app='export function initializeApp(c){return{config:c}}';
 const auth='const a={currentUser:{uid:"anon-audit",isAnonymous:true}};export function getAuth(){return a}export function onAuthStateChanged(_,cb){setTimeout(()=>cb(a.currentUser),10);return()=>{}}export async function signInAnonymously(){return{user:a.currentUser}}';
 const db=[
  'export function initializeFirestore(){return{}}',
  'export function persistentLocalCache(){return{}}',
  'export function persistentMultipleTabManager(){return{}}',
  'export function getFirestore(){return{}}',
  'export function doc(_, ...a){return a.join("/")}',
  'export async function getDocFromServer(ref){const code=String(ref).split("/").pop();',
  'return{exists:()=>["MARKET1","MARKET2"].includes(code),data:()=>({active:true,empId:code==="MARKET1"?"e1":"e2",locationId:code==="MARKET1"?"m1":"m2",name:code==="MARKET1"?"Aida Kovačević":"Mirsad Bećirović"})}}',
  'export function serverTimestamp(){return{server:true}}',
  'export async function setDoc(ref,value){if(globalThis.__deny)throw Object.assign(new Error("permission denied"),{code:"permission-denied"});await new Promise(resolve=>setTimeout(resolve,90));(globalThis.__writes||=[]).push({ref,value})}'
 ].join('\n');
 await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{
  const u=route.request().url();
  route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:u.includes('firebase-app.')?app:u.includes('firebase-auth.')?auth:db});
 });
 await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#receipt')?.classList.contains('idle'));
 assert.match(await page.locator('#receiptPerson').innerText(),/Prinesi karticu/);
 assert.ok(await page.locator('#receipt').isVisible(),'Large receipt visible');
 assert.ok(await page.locator('#scanForm').isVisible(),'Scanner input visible');
 const scan=async(code)=>{
  await page.locator('#barcode').fill(code);
  await page.locator('#scanForm button[type=submit]').click();
 };
 await scan('MARKET1');
 assert.match(await page.locator('#receiptState').innerText(),/SAČUVANO NA OVOM RAČUNARU/);
 assert.match(await page.locator('#receiptTime').innerText(),/\d/);
 await page.waitForFunction(()=>document.querySelector('#receipt')?.classList.contains('ok'),{timeout:12000});
 assert.equal(await page.locator('#receiptPerson').innerText(),'Aida Kovačević');
 assert.match(await page.locator('#receiptState').innerText(),/POTVRĐENO U FIREBASE BAZI/);
 assert.match(await page.locator('#receiptKind').innerText(),/DOLAZAK/);
 const firstTime=await page.locator('#receiptTime').innerText();
 assert.ok(firstTime.length>=10,'Time displayed in receipt');
 assert.ok((await page.locator('#events').innerText()).includes('Aida Kovačević'),'Confirmed worker in activity');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#receiptPerson')?.textContent==='Aida Kovačević');
 assert.equal(await page.locator('#receipt').getAttribute('class'),'receipt ok','Confirmed success persists after reload');
 assert.ok((await page.locator('#events').innerText()).includes('Aida Kovačević'),'Activity survives reload');
 await context.setOffline(true);
 await page.waitForFunction(()=>!navigator.onLine);
 await page.locator('#modeOut').click();
 await scan('MARKET2');
 assert.ok((await page.locator('#receipt').getAttribute('class')).includes('pending'));
 assert.match(await page.locator('#receiptKind').innerText(),/ODLAZAK/);
 assert.match(await page.locator('#receiptState').innerText(),/SAČUVANO NA OVOM RAČUNARU/);
 assert.ok(!(await page.locator('#receiptState').innerText()).includes('POTVRĐENO'),'Offline must never imply server verified');
 const queuedTime=await page.locator('#receiptTime').innerText();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#receipt')?.classList.contains('pending'));
 assert.equal(await page.locator('#receiptTime').innerText(),queuedTime,'Original time survives offline reload');
 assert.match(await page.locator('#events').innerText(),/ČEKA SLANJE/);
 await context.setOffline(false);
 await page.waitForFunction(()=>document.querySelector('#receipt')?.classList.contains('ok'),{timeout:12000});
 assert.equal(await page.locator('#receiptPerson').innerText(),'Mirsad Bećirović');
 assert.match(await page.locator('#receiptKind').innerText(),/ODLAZAK/);
 assert.equal(await page.locator('#receiptTime').innerText(),queuedTime,'Original time shown after sync');
 assert.match(await page.locator('#syncStatus').innerText(),/Firebase potvrdio|Nema zapisa na čekanju/);
 // Background sync of older queued items may not wipe the latest scan receipt.
 await context.setOffline(true);
 await page.waitForFunction(()=>!navigator.onLine);
 await page.locator('#modeIn').click();
 await scan('MARKET1');
 await page.waitForFunction(()=>document.querySelector('#receiptPerson')?.textContent.includes('Kartica'));
 await scan('MARKET2');
 const latest=await page.locator('#receiptPerson').innerText();
 await context.setOffline(false);
 await page.waitForFunction(()=>document.querySelector('#receiptPerson')?.textContent==='Mirsad Bećirović',{timeout:12000});
 assert.notEqual(latest,'Aida Kovačević');
 assert.match(await page.locator('#receiptKind').innerText(),/DOLAZAK/);
 assert.equal(await page.locator('#receipt').getAttribute('class'),'receipt ok');
 await page.locator('#modeOut').click();
 await scan('NOTFOUND');
 await page.waitForFunction(()=>document.querySelector('#receipt')?.classList.contains('bad'),{timeout:12000});
 assert.match(await page.locator('#receiptState').innerText(),/NIJE POTVRĐENO/);
 assert.match(await page.locator('#receiptHint').innerText(),/Kartica nije pronađena/);
 assert.ok(!(await page.locator('#receiptState').innerText()).includes('POTVRĐENO U FIREBASE'),'Unknown barcode never appears confirmed');
 await page.setViewportSize({width:375,height:790});
 assert.ok(await page.locator('#receipt').isVisible(),'Mobile has visible receipt');
 assert.ok((await page.locator('#barcode').boundingBox()).width>280,'Mobile barcode input remains wide');
 assert.deepEqual(errors,[],'Page errors: '+errors.join('; '));
 console.log('PASS KIOSK RECEIPTS: bold worker name, arrival/departure/time, offline yellow, server green, invalid red, reload, original time, background sync does not replace latest scan, mobile layout.');
}finally{await browser.close()}
