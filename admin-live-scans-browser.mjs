import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// Admin "Skeniranja danas": novi zapis sa kase pojavljuje se uživo (SIMULIRANI Firebase).
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
export function query(ref,...c){return {q:ref}}
export function where(){return {}}
export function onSnapshot(t,onValue){
 if(t&&t.q){globalThis.__liveCb=onValue;setTimeout(()=>onValue({docs:[],docChanges:()=>[]}),50);return()=>{globalThis.__liveCb=null}}
 setTimeout(()=>onValue({docs:[],docChanges:()=>[],metadata:{fromCache:false}}),100);return()=>{}}
export function writeBatch(){return{set(){},delete(){},commit:async()=>{}}}
export async function setDoc(ref,value){
 if(String(ref).startsWith('records/events/'))throw Object.assign(new Error('Missing or insufficient permissions.'),{code:'permission-denied'});
}
export async function deleteDoc(){}
`;

const page=await browser.newPage({viewport:{width:1300,height:850}});
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',route=>{const u=route.request().url();
 route.fulfill({status:200,contentType:'application/javascript',body:u.includes('firebase-app.')?app:u.includes('firebase-auth.')?auth:db})});
await page.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded'});
await page.waitForSelector('#balkanLiveBtn',{timeout:20000});
await page.waitForFunction(()=>typeof globalThis.__liveCb==='function');
assert.match(await page.locator('#balkanLiveBtn').innerText(),/0/);
await page.evaluate(()=>{
 const v={id:'ev1',empId:'e1',locId:'m1',kind:'in',at:new Date().toISOString(),source:'barcode'};
 const d={id:'ev1',data:()=>v};
 globalThis.__liveCb({docs:[d],docChanges:()=>[{type:'added',doc:d}]});
});
await page.waitForFunction(()=>document.querySelector('#balkanToast')?.classList.contains('show'));
assert.match(await page.locator('#balkanToast').innerText(),/DOLAZAK/);
assert.match(await page.locator('#balkanLiveBtn').innerText(),/1/);
await page.locator('#balkanLiveBtn').click();
assert.match(await page.locator('#balkanLivePanel').innerText(),/DOLAZAK[\s\S]*|kartica/);
assert.deepEqual(errors,[]);
await page.screenshot({path:'/tmp/admin-live.png'});
await browser.close();
console.log('PASS ADMIN LIVE: novo skeniranje sa kase odmah vidljivo administratoru (toast + panel)');
