import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const errors=[];
const app='export function initializeApp(config){return {config}}';
const auth=`
let a={currentUser:{uid:'jWTYPv8PhIb8xUbo0Ra0RtrKVf82',isAnonymous:false}};
export function getAuth(){return a}
export function onAuthStateChanged(auth,cb){setTimeout(()=>cb(auth.currentUser),25);return()=>{}}
export async function signInWithEmailAndPassword(_,email,password){globalThis.__lastAdminAuthCall={email,password};return{user:a.currentUser}}
export async function signInAnonymously(){a.currentUser={uid:'anonymous-test-1',isAnonymous:true};return{user:a.currentUser}}
export async function signOut(){a.currentUser=null}
`;
const db=`
export function initializeFirestore(){return {}}
export function persistentLocalCache(){return {}}
export function persistentMultipleTabManager(){return {}}
export function getFirestore(){return {}}
export function collection(_, ...p){return p.join('/')}
export function doc(_, ...p){return p.join('/')}
export async function getDocs(){return{docs:[],size:0}}
export async function getDocsFromServer(){return{docs:[],size:0}}
export async function getDocFromServer(key){
 if(String(key).startsWith('badges/'))return{
  exists:()=>true,
  data:()=>({active:true,empId:'test123',name:'Test Radnik',locationId:'m1'})
 };
 return {exists:()=>false,data:()=>null};
}
export function serverTimestamp(){return new Date().toISOString()}
export function onSnapshot(_,onValue){setTimeout(()=>onValue({docs:[],docChanges:()=>[],metadata:{fromCache:false}}),100);return()=>{}}
export function writeBatch(){return{set(){},delete(){},commit:async()=>{}}}
export async function setDoc(ref,value){
 if(String(ref).startsWith('records/events/'))throw Object.assign(new Error('Missing or insufficient permissions.'),{code:'permission-denied'});
}
export async function deleteDoc(){}
`;
async function mockFirebase(page) {
 await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{
  const url=route.request().url();
  const src=url.includes('firebase-app.')?app:url.includes('firebase-auth.')?auth:db;
  route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:src});
 });
 page.on('pageerror',e=>errors.push(e.message));
}
const context=await browser.newContext({viewport:{width:1100,height:900}});
const page=await context.newPage();
await mockFirebase(page);
await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.getElementById('v6Login')?.style.display==='none',{timeout:15000});
assert.ok(await page.getByText('Firebase server potvrđen').count()>0,'Server confirmed only after mocked server check');
await page.getByRole('button',{name:/Postavke/}).first().click();
assert.ok(await page.getByText('Uputstvo za korištenje programa BALKAN').count(),'Settings help shown');
assert.ok(await page.getByText('Firebase – status').count(),'Firebase status shown');
assert.ok(await page.getByText('Uvoz arhive 2025.').count(),'Archive importer shown');

const printedCard=await page.locator('#v6AdminBarcodeCard').innerText();
const code=printedCard.match(/BKADM[A-Z0-9]+/)?.[0];
assert.ok(code&&code.length>12,'Valid admin barcode generated');
assert.equal(await page.locator('#v6AdminBarcodeCard svg').count(),1,'Printable barcode SVG');
await page.evaluate(()=>{
 localStorage.setItem('balkan_admin_email_jWTYPv8PhIb8xUbo0Ra0RtrKVf82','admin-audit@example.org');
 document.getElementById('v6Login').style.display='grid';
 document.getElementById('v6LoginForm').style.display='block';
});
await page.locator('#v6ModeBarcode').click();
assert.equal(await page.locator('#v6BarcodeLabel').isVisible(),true,'Barcode field visible');
assert.equal(await page.locator('#v6EmailLabel').isVisible(),false,'Email field hidden in barcode mode');
await page.locator('#v6AdminBarcode').fill('WRONG-CODE');
await page.locator('#v6Password').fill('TestPasswordNotReal');
await page.locator('#v6LoginForm button[type=submit]').click();
assert.ok((await page.locator('#v6AuthMessage').innerText()).includes('Neprepoznat'),'Wrong barcode blocked');
assert.equal(await page.evaluate(()=>globalThis.__lastAdminAuthCall||null),null,'Bad barcode never calls Firebase auth');
await page.locator('#v6AdminBarcode').fill(code);
await page.locator('#v6LoginForm button[type=submit]').click();
await page.waitForFunction(()=>!!globalThis.__lastAdminAuthCall);
const recorded=await page.evaluate(()=>globalThis.__lastAdminAuthCall);
assert.equal(recorded.email,'admin-audit@example.org','Correct Firebase email selected by barcode');
assert.equal(recorded.password,'TestPasswordNotReal','Firebase password still mandatory');
await page.locator('#v6ModeEmail').click();
assert.equal(await page.locator('#v6EmailLabel').isVisible(),true,'Original email mode retained');
await page.locator('#v6Login').evaluate(el=>el.style.display='none');
console.log('PASS Admin barcode login: printable Code39, reject wrong code, require same password, preserve email login');
await page.getByRole('button',{name:/Arhiva 2025/}).first().click();
assert.ok(await page.getByText('Još nije uvezena u Firebase').count(),'Absent archive handled');
console.log('PASS Firebase mock browser: actual admin-firebase integration, remote verification indicator, archive fallback, Settings help');
const kiosk=await context.newPage();await mockFirebase(kiosk);
await kiosk.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
await kiosk.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Skeniraj barkod'),{timeout:15000});
assert.equal(await kiosk.getByText('DOLAZAK').count()>0,true,'Public scanning UI');
await kiosk.locator('#barcode').fill('TEST999');
await kiosk.locator('#scanForm button[type=submit]').click();
await kiosk.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Prijava NIJE evidentirana'),{timeout:10000});
assert.ok(!(await kiosk.locator('#status').textContent()).includes('Potvrđeno u Firebase bazi'),'Rejected write never reports success');
assert.equal(errors.length,0,'No page errors: '+errors.join(' / '));
console.log('PASS Kiosk mocked server-denial: denies attendance and displays actual failure; no false confirmation');
await browser.close();
