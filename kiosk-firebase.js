import {auth,db} from './firebase-shared.js';
import {signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Ucitava se samo kad postoji internet. Vanmrezne prijave ostaju na kiosk racunaru.
export async function sendQueuedScan(scan){
 if(!auth.currentUser)await signInAnonymously(auth);
 const snap=await getDocFromServer(doc(db,'badges',scan.barcode));
 if(!snap.exists()||snap.data().active!==true){
  const e=new Error('Kartica nije pronađena ili nije aktivna. Zapis ostaje na računaru za provjeru.');
  e.code='invalid-card';throw e;
 }
 const worker=snap.data();
 if(!worker.empId||!worker.locationId){
  const e=new Error('Kartica nema dodijeljen objekat. Zapis ostaje na računaru za provjeru.');
  e.code='invalid-assignment';throw e;
 }
 // Isti ID upisa koristi se pri svakom pokusaju: ponovno slanje ne pravi novi dogadjaj.
 const entry={id:scan.id,empId:worker.empId,locId:worker.locationId,
  kind:scan.kind,at:scan.at,barcode:scan.barcode,source:'barcode',createdAt:serverTimestamp()};
 await setDoc(doc(db,'records','events','items',scan.id),entry);
 return {name:worker.name||'Zaposleni',locationId:worker.locationId,kind:scan.kind,at:scan.at};
}
