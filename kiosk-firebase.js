// BALKAN kasa – veza s Firebaseom.
// Kasa ima VLASTITU Firebase instancu ("balkan-kiosk"), odvojenu od administracije:
//  • anonimna prijava kase i prijava administratora se ne gaze ako su obje
//    stranice otvorene u istom pregledniku (ranije je admin stranica odjavljivala kasu),
//  • Firestore bez trajnog keša u IndexedDB-u: jedini trajni red je lokalni red kase,
//    pa nema skrivenog drugog reda koji šalje "iza leđa" ili ostaje zaglavljen.
import * as FA from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const APP_NAME='balkan-kiosk';
const app=(FA.getApps?.()||[]).find(a=>a.name===APP_NAME)||FA.initializeApp(firebaseConfig,APP_NAME);
const auth=getAuth(app);
const db=getFirestore(app);

// Kartica koju je server potvrdio pamti se na ovom računaru, da sljedeći sken
// ide direktno na upis. Pravila na serveru i dalje provjeravaju karticu.
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
 if(auth.currentUser)return auth.currentUser;
 if(!authentication){
  authentication=(async()=>{
   if(typeof auth.authStateReady==='function')await auth.authStateReady();
   if(!auth.currentUser)await signInAnonymously(auth);
  })().finally(()=>{authentication=null});
 }
 await authentication;
 if(!auth.currentUser)throw Object.assign(Error('Firebase prijava kase nije uspjela.'),{code:'firebase-auth',stage:'auth'});
 return auth.currentUser;
}
export async function warmFirebase(){await authorized()}

function tagged(err,stage,prefix){
 const e=new Error(prefix+(err?.message||String(err)));
 e.code=err?.code||'firebase-'+stage;e.stage=stage;return e;
}
async function readCardFromServer(barcode){
 let snap;
 try{snap=await getDocFromServer(doc(db,'badges',barcode))}
 catch(err){throw tagged(err,'badge','Firebase ne može provjeriti karticu: ')}
 if(!snap.exists()||snap.data().active!==true){
  writeBadge(barcode,null);
  throw Object.assign(Error('Kartica nije pronađena ili nije aktivna u Firebase bazi.'),{code:'invalid-card',stage:'badge'});
 }
 const worker=snap.data();
 if(!worker.empId||!worker.locationId){
  writeBadge(barcode,null);
  throw Object.assign(Error('Kartica nema dodijeljen objekat (market).'),{code:'invalid-assignment',stage:'badge'});
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
export async function sendQueuedScan(scan){
 // NIKAD ne vraćamo uspjeh prije nego što server potvrdi setDoc().
 try{await authorized()}catch(err){throw tagged(err,'auth','Prijava kase na Firebase nije uspjela: ')}
 let worker=cachedBadge(scan.barcode);const fromCache=!!worker;
 if(!worker)worker=await readCardFromServer(scan.barcode);
 try{await write(scan,worker)}catch(err){
  if(fromCache&&err?.code==='permission-denied'){
   // Kartica je možda promijenjena u administraciji: osvježi i probaj jednom.
   writeBadge(scan.barcode,null);
   worker=await readCardFromServer(scan.barcode);
   try{await write(scan,worker)}catch(err2){throw tagged(err2,'write','Firebase je odbio upis: ')}
  }else throw tagged(err,'write','Firebase je odbio upis: ');
 }
 return {name:worker.name||'Zaposleni',locationId:worker.locationId,kind:scan.kind,at:scan.at};
}

// Dijagnostika bez upisa u bazu: prijava kase i čitanje jedne kartice.
export async function diagnose(barcode){
 const steps=[];
 const t0=performance.now();
 try{const u=await authorized();steps.push({ok:true,name:'Firebase prijava kase',detail:'Anonimni nalog '+String(u.uid||'').slice(0,6)+'… ('+Math.round(performance.now()-t0)+' ms)'})}
 catch(err){steps.push({ok:false,name:'Firebase prijava kase',code:err.code,detail:err.message});return steps}
 if(barcode){
  const t1=performance.now();
  try{const w=await readCardFromServer(barcode);steps.push({ok:true,name:'Čitanje kartice '+barcode,detail:w.name+' · '+w.locationId+' ('+Math.round(performance.now()-t1)+' ms)'})}
  catch(err){steps.push({ok:false,name:'Čitanje kartice '+barcode,code:err.code,detail:err.message})}
 }
 return steps;
}
