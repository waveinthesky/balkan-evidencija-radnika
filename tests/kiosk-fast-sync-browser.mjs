import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const auth='const a={currentUser:null};export function getAuth(){return a}export function onAuthStateChanged(_,cb){setTimeout(()=>cb(a.currentUser),10);return()=>{}}export async function signInAnonymously(){globalThis.__authCount=(globalThis.__authCount||0)+1;await new Promise(r=>setTimeout(r,150));a.currentUser={uid:"anon",isAnonymous:true};return{user:a.currentUser}}';
 const db=[
  'export function initializeFirestore(){return{}}',
  'export function persistentLocalCache(){return{}}',
  'export function persistentMultipleTabManager(){return{}}',
  'export function getFirestore(){return{}}',
  'export function doc(_, ...a){return a.join("/")}',
  'export async function getDocFromServer(ref){',
  'const code=String(ref).split("/").pop();',
  '(globalThis.__reads||=[]).push(code);',
  'await new Promise(r=>setTimeout(r,220));',
  'return{exists:()=>["FAST1","FAST2","BLOCKED"].includes(code),data:()=>({active:true,empId:code,locationId:"m1",name:"Radnik "+code})}',
  '}',
  'export function serverTimestamp(){return{server:true}}',
  'export async function setDoc(ref,value){',
  'if(value.barcode==="BLOCKED"&&globalThis.__failBlocked!==false){',
  'await new Promise(r=>setTimeout(r,850));',
  'throw Object.assign(new Error("Blocked by Firestore rule"),{code:"permission-denied"})',
  '}',
  'await new Promise(r=>setTimeout(r,170));',
  '(globalThis.__writes||=[]).push({ref,value})',
  '}'
 ].join('\n');
 await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{
  const url=route.request().url(),body=url.includes('firebase-app.')?'export function initializeApp(c){return{config:c}}':url.includes('firebase-auth.')?auth:db;
  route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body});
 });
 await page.addInitScript(()=>{
  if(!sessionStorage.getItem('audit-seeded')){
   const t=Date.now()-20000;
   localStorage.setItem('balkan_kiosk_outbox_v1',JSON.stringify([
    {id:'blocked-old',barcode:'BLOCKED',kind:'in',at:new Date(t-3000).toISOString(),addedAt:t-3000,flag:'queued'},
    {id:'fast-old-1',barcode:'FAST1',kind:'in',at:new Date(t-2000).toISOString(),addedAt:t-2000,flag:'queued'},
    {id:'fast-old-2',barcode:'FAST2',kind:'in',at:new Date(t-1000).toISOString(),addedAt:t-1000,flag:'queued'}
   ]));
   sessionStorage.setItem('audit-seeded','1');
  }
 });
 const tick=Date.now();
 await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__writes?.length===2,{timeout:10000});
 const elapsed=Date.now()-tick;
 assert.ok(elapsed<3500,'Two good pending workers uploaded fast alongside blocked worker: '+elapsed+'ms');
 const old=await page.evaluate(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').find(x=>x.id==='blocked-old')?.error,{timeout:6000});
 const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')));
 assert.equal(pending.length,1,'Blocked old record remains, not deleted');
 assert.ok(pending[0].error.includes('Firebase je odbio upis'),'Error is explicit about stage');
 assert.ok((await page.locator('#events').innerText()).includes('GREŠKA'),'Old record failure visible in interface');
 assert.equal(await page.evaluate(()=>globalThis.__authCount),1,'Single anonymous auth session despite parallel sends');
 const reads=await page.evaluate(()=>globalThis.__reads);
 assert.equal(reads.filter(x=>x==='FAST1').length,1,'Badge looked up only once');
 await page.locator('#modeOut').click();
 await page.locator('#barcode').fill('FAST1');
 await page.locator('#scanForm button[type=submit]').click();
 await page.waitForFunction(()=>globalThis.__writes?.length===3,{timeout:6000});
 assert.match(await page.locator('#receiptPerson').innerText(),/Radnik FAST1/);
 const afterReads=await page.evaluate(()=>globalThis.__reads);
 assert.equal(afterReads.filter(x=>x==='FAST1').length,1,'Warm session cache avoids duplicate server badge query');
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')))).length,1,
  'Fresh scan succeeds despite prior blocked record');
 await page.evaluate(()=>globalThis.__failBlocked=false);
 await page.locator('#queueRetry').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('balkan_kiosk_outbox_v1')||'[]').length===0,{timeout:8000});
 assert.equal((await page.evaluate(()=>globalThis.__writes)).length,4,'Retry recovers old pending scan without changing its id');
 const archived=await page.evaluate(()=>globalThis.__writes);
 assert.ok(archived.some(x=>x.ref.endsWith('blocked-old')),'Original offline id preserved');
 assert.equal(await page.locator('#receipt').getAttribute('class'),'receipt ok','Old retry does not overwrite newer confirmation');
 assert.deepEqual(errors,[],'JS errors '+errors.join('; '));
 console.log('PASS FAST FIREBASE: warm one-time auth, parallel worker uploads, per-card read cache, old failed scan retained and retried, latest receipt stable, no duplicate IDs. Initial upload time '+elapsed+'ms');
}finally{await browser.close()}
