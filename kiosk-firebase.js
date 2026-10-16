import {auth,db} from './firebase-shared.js';
import {signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Jedna Firebase prijava po sesiji, pokrenuta odmah po otvaranju kioska.
// Kratki cache vrijedi samo za kartice koje JE server potvrdio; nikad za offline status.
const confirmedBadges=new Map(),BADGE_TTL_MS=60000;
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
async function resolveCard(barcode){
 const previous=confirmedBadges.get(barcode);
 if(previous&&previous.expires>Date.now())return previous.worker;
 const snap=await getDocFromServer(doc(db,'badges',barcode));
 if(!snap.exists()||snap.data().active!==true){
  confirmedBadges.delete(barcode);
  const e=new Error('Kartica nije pronađena ili nije aktivna u Firebase bazi. Administrator treba provjeriti barkod i Firebase indeks kartica.');
  e.code='invalid-card';throw e;
 }
 const worker=snap.data();
 if(!worker.empId||!worker.locationId){
  confirmedBadges.delete(barcode);
  const e=new Error('Kartica nema dodijeljen objekat. Administrator mora ispraviti karticu i ponovo poslati podatke.');
  e.code='invalid-assignment';throw e;
 }
 confirmedBadges.set(barcode,{worker,expires:Date.now()+BADGE_TTL_MS});
 return worker;
}
export async function sendQueuedScan(scan){
 // Offline unos uvijek prvo ide u korisnikov lokalni outbox. Nikad ne tvrdimo
 // da je server potvrdio zapis prije uspješnog setDoc() Promise-a.
 try{await authorized()}catch(err){
  const e=new Error('Prijava na Firebase nije uspjela: '+(err.message||String(err)));
  e.code=err.code||'firebase-auth';throw e;
 }
 let worker;
 try{worker=await resolveCard(scan.barcode)}catch(err){
  if(err.code==='invalid-card'||err.code==='invalid-assignment')throw err;
  const e=new Error('Firebase ne može provjeriti barkod '+scan.barcode+': '+(err.message||String(err)));
  e.code=err.code||'firebase-badge';throw e;
 }
 const entry={id:scan.id,empId:worker.empId,locId:worker.locationId,
  kind:scan.kind,at:scan.at,barcode:scan.barcode,source:'barcode',createdAt:serverTimestamp()};
 try{
  // Upis sa izvornim ID-jem ostaje idempotentan i nakon prekida ili timeouta.
  await setDoc(doc(db,'records','events','items',scan.id),entry);
 }catch(err){
  const e=new Error('Firebase je odbio upis dolaska/odlaska: '+(err.message||String(err)));
  e.code=err.code||'firebase-write';throw e;
 }
 return {name:worker.name||'Zaposleni',locationId:worker.locationId,kind:scan.kind,at:scan.at};
}
