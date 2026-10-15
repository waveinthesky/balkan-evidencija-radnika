import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const app="export function initializeApp(c){return {config:c}}";
 const auth="const a={currentUser:{uid:'anon-audit',isAnonymous:true}};export function getAuth(){return a};export function onAuthStateChanged(_,cb){setTimeout(()=>cb(a.currentUser),10);return ()=>{}};export async function signInAnonymously(){return {user:a.currentUser}}";
 const db=[
  "export function initializeFirestore(){return {}}",
  "export function persistentLocalCache(){return {}}",
  "export function persistentMultipleTabManager(){return {}}",
  "export function getFirestore(){return {}}",
  "export function doc(_, ...p){return p.join('/')}",
  "export async function getDocFromServer(ref){",
  "const code=String(ref).split('/').pop();",
  "const exists=['MARKET1','MARKET2','INACTIVE','NOOBJECT'].includes(code);",
  "return {exists:()=>exists,data:()=>code==='INACTIVE'?{active:false,empId:'inactive',locationId:'m1'}:code==='NOOBJECT'?{active:true,empId:'orphan'}:{active:true,empId:code==='MARKET1'?'e1':'e2',locationId:code==='MARKET1'?'m1':'m2',name:'Probni radnik'}}",
  "}",
  "export function serverTimestamp(){return {server:true}}",
  "export async function setDoc(ref,value){if(globalThis.__denyWrite)throw Object.assign(new Error('Permission denied'),{code:'permission-denied'});(globalThis.__writes||=[]).push({ref,value})}"
 ].join('\n');
 await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{
  const u=route.request().url(),body=u.includes('firebase-app.')?app:u.includes('firebase-auth.')?auth:db;
  route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body});
 });
 await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('Skeniraj barkod'),{timeout:14000});
 async function scan(code){
  await page.locator('#barcode').fill(code);
  await page.locator('#scanForm button[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#barcode').disabled);
  return page.locator('#status').innerText();
 }
 async function saved(){return page.evaluate(()=>globalThis.__writes?.length||0)}
 assert.match(await scan('MARKET1'),/Potvrđeno u Firebase bazi.*DOLAZAK/);
 assert.equal(await saved(),1,'First barcode arrival saved');
 const first=await page.evaluate(()=>globalThis.__writes[0].value);
 assert.equal(first.empId,'e1');
 assert.equal(first.locId,'m1');
 assert.equal(first.kind,'in');
 assert.match(await scan('MARKET1'),/Ponovljeno skeniranje/);
 assert.equal(await saved(),1,'Duplicates blocked');
 await page.locator('#modeOut').click();
 assert.match(await scan('MARKET1'),/Potvrđeno u Firebase bazi.*ODLAZAK/);
 assert.equal(await saved(),2);
 assert.equal(await page.evaluate(()=>globalThis.__writes[1].value.kind),'out');
 assert.match(await scan('NOTFOUND'),/Prijava NIJE evidentirana/);
 assert.match(await scan('INACTIVE'),/Prijava NIJE evidentirana/);
 assert.match(await scan('NOOBJECT'),/Prijava NIJE evidentirana/);
 assert.equal(await saved(),2,'Unknown, inactive, unassigned never saved');
 await page.evaluate(()=>globalThis.__denyWrite=true);
 assert.match(await scan('MARKET2'),/Prijava NIJE evidentirana/);
 assert.equal(await saved(),2,'Rejected writes never count');
 await page.evaluate(()=>globalThis.__denyWrite=false);
 await page.context().setOffline(true);
 assert.match(await scan('MARKET2'),/Nema interneta/);
 assert.equal(await saved(),2,'No offline write');
 await page.context().setOffline(false);
 assert.match(await scan('MARKET2'),/Potvrđeno u Firebase bazi/);
 assert.equal(await saved(),3,'Works again when online');
 assert.equal(await page.locator('#events .item').count(),3,'Only confirmed events appear in kiosk history');
 assert.deepEqual(errors,[],'Browser page errors: '+errors.join('; '));
 console.log('PASS PRELAUNCH KIOSK: arrival and departure, duplicate, unknown, inactive, missing object, rejected Firebase write, offline rejection, online recovery.');
} finally {await browser.close()}
