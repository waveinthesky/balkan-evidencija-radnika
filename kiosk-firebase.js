import {auth,db} from './firebase-shared.js';
import {signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// BRZINA: kartica koju je server jednom potvrdio čuva se na ovom računaru
// (balkan_kiosk_badges_v1). Sljedeći sken iste kartice ide DIREKTNO na upis,
// bez dodatnog čitanja – Firestore pravila ionako na serveru provjeravaju da je
// kartica aktivna i da empId/objekat odgovaraju. Ako server odbije upis zbog
// zastarjele kartice, keš se briše, kartica se ponovo čita i upis ponavlja jednom.
export const BADGE_CACHE_KEY='balkan_kiosk_badges_v1';
const BADGE_MAX_AGE_MS=30*24*3600*1000;
function readBadges(){try{const d=JSON.parse(localStorage.getItem(BADGE_CACHE_KEY)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}}
function writeBadge(code,worker){
 const all=readBadges();
 if(worker)all[code]={empId:worker.empId,locationId:worker.locationId,name:worker.name||'Zaposleni',checkedAt:Date.now()};
 else delete all[code];
 try{localStorage.setItem(BADGE_CACHE_KEY,JSON.stringify(all))}catch{}
}
export function cachedBadge(code){
 const b=readBadges()[code];
 if(!b||!b.empId||!b.locationId||Date.now()-(Number(b.checkedAt)||0)>BADGE_MAX_AGE_MS)return null;
 return b;
}

let authentication=null;
async function authorized(){
 if(auth.currentUser)return;
 if(!authentication){
  authentication=(async()=>{
   if(typeof auth.authStateReady==='function')await auth.authStateReady();
   if(!auth.currentUser)await signInAnonymously(auth);
  })().finally(()=>{authentication=null});
 }
 await authentication;
 if(!auth.currentUser)throw Error('Firebase autentifikacija nije uspjela.');
}
export async function warmFirebase(){await authorized()}

async function readCardFromServer(barcode){
 let snap;
 try{snap=await getDocFromServer(doc(db,'badges',barcode))}catch(err){
  const e=new Error('Firebase ne može provjeriti barkod '+barcode+': '+(err.message||String(err)));
  e.code=err.code||'firebase-badge';throw e;
 }
 if(!snap.exists()||snap.data().active!==true){
  writeBadge(barcode,null);
  const e=new Error('Kartica nije pronađena ili nije aktivna u Firebase bazi. Administrator treba provjeriti barkod.');
  e.code='invalid-card';throw e;
 }
 const worker=snap.data();
 if(!worker.empId||!worker.locationId){
  writeBadge(barcode,null);
  const e=new Error('Kartica nema dodijeljen objekat. Administrator mora ispraviti radnika.');
  e.code='invalid-assignment';throw e;
 }
 writeBadge(barcode,worker);
 return {empId:worker.empId,locationId:worker.locationId,name:worker.name||'Zaposleni'};
}
async function write(scan,worker){
 const entry={id:scan.id,empId:worker.empId,locId:worker.locationId,
  kind:scan.kind,at:scan.at,barcode:scan.barcode,source:'barcode',createdAt:serverTimestamp()};
 // Isti ID pri svakom ponovnom slanju = nema dupliranja.
 await setDoc(doc(db,'records','events','items',scan.id),entry);
}
function wrap(err){
 const e=new Error('Firebase je odbio upis dolaska/odlaska: '+(err.message||String(err)));
 e.code=err.code||'firebase-write';return e;
}
export async function sendQueuedScan(scan){
 // Lokalni outbox je već sačuvan. Ovdje NIKAD ne vraćamo uspjeh prije nego što
 // setDoc() Promise potvrdi da je server prihvatio upis.
 try{await authorized()}catch(err){
  const e=new Error('Prijava na Firebase nije uspjela: '+(err.message||String(err)));
  e.code=err.code||'firebase-auth';throw e;
 }
 let worker=cachedBadge(scan.barcode);const fromCache=!!worker;
 if(!worker)worker=await readCardFromServer(scan.barcode);
 try{await write(scan,worker)}catch(err){
  if(fromCache&&err?.code==='permission-denied'){
   // Kartica je možda promijenjena u administraciji: osvježi i probaj jednom.
   writeBadge(scan.barcode,null);
   worker=await readCardFromServer(scan.barcode);
   try{await write(scan,worker)}catch(err2){throw wrap(err2)}
  }else throw wrap(err);
 }
 return {name:worker.name||'Zaposleni',locationId:worker.locationId,kind:scan.kind,at:scan.at};
}
