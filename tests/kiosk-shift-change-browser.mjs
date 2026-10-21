// Kvar iz marketa (smjena u 14:25): prva smjena skenira ODLAZAK i ostavi dugme; druga smjena (Veza, Melis)
// skenira bez prebacivanja dugmeta. Svi moraju biti upisani ispravno. Automatski način: dolazak/odlazak bez dugmadi.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const fs=`export function getFirestore(){return{}}export function doc(_,...a){return a.join('/')}export function serverTimestamp(){return{}}
export async function getDocFromServer(ref){const c=ref.split('/').pop();return{exists:()=>true,data:()=>({active:true,empId:'e'+c,locationId:'m1',name:{A1:'Prva Smjena',VEZA:'Veza',MELIS:'Melis'}[c]||c})}}
export async function setDoc(ref,v){await new Promise(r=>setTimeout(r,30));(globalThis.__w||=[]).push(v.barcode+':'+v.kind)}`;
const b=await chromium.launch();const p=await b.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/www.gstatic.com/firebasejs/11.10.0/*.js',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/javascript',body:u.includes('-app.')?'export function initializeApp(c){return c}':u.includes('-auth.')?'const a={currentUser:null};export function getAuth(){return a}export async function signInAnonymously(){a.currentUser={uid:"x"}}':fs})});
await p.goto('http://127.0.0.1:8765/index.html');await p.waitForTimeout(300);
const scan=async c=>{await p.keyboard.type(c);await p.keyboard.press('Enter');await p.waitForTimeout(250)};
const written=()=>p.evaluate(()=>globalThis.__w||[]);
assert.match(await p.locator('#modeAuto').innerText(),/AUTOMATSKI/,'Kasa počinje u automatskom načinu');
// stari način rada: prva smjena koristi dugmad
await p.click('#modeIn');await scan('A1');
await p.click('#modeOut');await scan('A1');
// druga smjena: NE dira dugmad
await scan('VEZA');await scan('MELIS');
await p.waitForFunction(()=>(globalThis.__w||[]).length>=4);
assert.deepEqual(await written(),['A1:in','A1:out','VEZA:in','MELIS:in'],'Veza i Melis upisani kao DOLAZAK');
assert.match(await p.locator('#modeAuto').innerText(),/AUTOMATSKI/,'Dugme važi samo za jedno skeniranje');
// slučajno dvostruko skeniranje odmah poslije dolaska NE postaje odlazak
await scan('VEZA');
assert.match(await p.locator('#receiptState').innerText(),/DOLAZAK JE VEĆ UPISAN/);
assert.equal((await written()).length,4,'Dvostruko skeniranje nije upisano');
// odlazak automatski (simuliramo da je dolazak bio prije 8 sati)
await p.evaluate(()=>{const k='balkan_kiosk_confirmed_v1',h=JSON.parse(localStorage.getItem(k)||'[]');for(const x of h)if(x.barcode==='VEZA'||x.barcode==='MELIS')x.at=new Date(Date.now()-8*3600000).toISOString();localStorage.setItem(k,JSON.stringify(h))});
await p.reload();await p.waitForTimeout(300);
await scan('VEZA');await scan('MELIS');
await p.waitForFunction(()=>(globalThis.__w||[]).length>=2);
const w2=await written();
assert.deepEqual(w2,['VEZA:out','MELIS:out'],'Kraj smjene prepoznat automatski kao ODLAZAK | '+w2);
assert.match(await p.locator('#receiptKind').innerText(),/ODLAZAK/,'Ekran jasno pokazuje ODLAZAK');
// sljedeći dan: dolazak automatski
await p.evaluate(()=>{const k='balkan_kiosk_confirmed_v1',h=JSON.parse(localStorage.getItem(k)||'[]');for(const x of h)x.at=new Date(Date.now()-16*3600000).toISOString();localStorage.setItem(k,JSON.stringify(h))});
await p.reload();await p.waitForTimeout(300);
await scan('VEZA');await p.waitForFunction(()=>(globalThis.__w||[]).length>=1);
assert.deepEqual(await written(),['VEZA:in'],'Sljedeći dan: DOLAZAK');
// granični slučajevi automatskog prepoznavanja
const withHistory=async(code,hoursAgo,kind)=>{await p.evaluate(([c,h,k])=>{localStorage.setItem('balkan_kiosk_confirmed_v1',JSON.stringify([{id:'x'+c,barcode:c,name:c,kind:k,at:new Date(Date.now()-h*3600000).toISOString()}]));localStorage.removeItem('balkan_kiosk_lastscan_v1');localStorage.removeItem('balkan_kiosk_outbox_v1');globalThis.__w=[]},[code,hoursAgo,kind]);
 await p.reload();await p.waitForTimeout(250);await scan(code);await p.waitForFunction(()=>(globalThis.__w||[]).length>=1);return (await written())[0]};
assert.equal(await withHistory('NOC',8,'in'),'NOC:out','Noćna smjena 22→06: ODLAZAK');
assert.equal(await withHistory('DUG',12,'in'),'DUG:out','Duga smjena 12 h: ODLAZAK');
assert.equal(await withHistory('ZAB',16.5,'in'),'ZAB:in','Zaboravljena odjava (14:25 → sutra 07:00): DOLAZAK');
assert.equal(await withHistory('ZA2',24,'in'),'ZA2:in','Zaboravljena odjava, ista smjena sutra: DOLAZAK');
assert.deepEqual(errors,[]);
await b.close();
console.log('PASS SMJENA 14:25 + noćna/duga smjena/zaboravljena odjava: dugme ODLAZAK prve smjene ne blokira drugu smjenu; automatski dolazak/odlazak; dvostruko skeniranje u 10 min se ne upisuje');
