import {auth,db} from './firebase-shared.js';
import {onAuthStateChanged,signInAnonymously} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {doc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let mode='in',ready=false,busy=false,lastScan=null,history=[];

function feedback(msg,type=''){const el=$('status');el.textContent=msg;el.className='result '+type}
function connection(msg,connected=false){$('connection').textContent=msg;$('connection').style.background=connected?'#e4f8ee':'#fff0db'}
function focus(){setTimeout(()=>$('barcode').focus(),0)}
function renderHistory(){
 $('events').innerHTML=history.map(x=>'<div class="item"><span><b>'+esc(x.name)+'</b> · '+(x.kind==='in'?'Dolazak':'Odlazak')+'</span><span>'+esc(x.time)+'</span></div>').join('')||'Nema uspješno potvrđenih prijava na ovom ekranu.';
}
function setMode(v){
 mode=v;$('modeIn').className='mode'+(v==='in'?' on':'');$('modeOut').className='mode'+(v==='out'?' out':'');focus()
}
$('modeIn').addEventListener('click',()=>setMode('in'));
$('modeOut').addEventListener('click',()=>setMode('out'));
window.addEventListener('offline',()=>connection('Nema interneta'));
window.addEventListener('online',()=>connection('Internet dostupan'));

onAuthStateChanged(auth,async user=>{
 if(!user){
  ready=false;connection('Povezivanje s bazom…');
  try{await signInAnonymously(auth)}
  catch(e){connection('Nije povezano');feedback('Firebase prijava u pozadini nije uspjela: '+e.message,'bad')}
  return;
 }
 ready=true;connection(navigator.onLine?'Internet dostupan':'Nema interneta',navigator.onLine);
 feedback('Skeniraj barkod kartice. Prijava će biti potvrđena tek kada je Firebase prihvati.');
 focus();
});
$('scanForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const code=$('barcode').value.trim();$('barcode').value='';focus();
 if(!code||busy)return;
 if(!ready)return feedback('Veza s Firebaseom nije spremna. Skeniranje NIJE evidentirano.','bad');
 if(!navigator.onLine)return feedback('Nema interneta. Prijava NIJE evidentirana.','bad');
 if(lastScan?.code===code&&lastScan?.kind===mode&&Date.now()-lastScan.at<60_000)
  return feedback('Ponovljeno skeniranje u kratkom roku je zaustavljeno.','bad');
 busy=true;$('barcode').disabled=true;feedback('Provjeravamo karticu i šaljemo evidenciju…');
 try{
  // Čitamo samo karticu koja je fizički skenirana, nikada spisak zaposlenih.
  const snap=await getDocFromServer(doc(db,'badges',code));
  if(!snap.exists()||snap.data().active!==true)throw Error('Kartica nije pronađena ili nije aktivna.');
  const worker=snap.data();
  if(!worker.empId||!worker.locationId)throw Error('Za zaposlenog nije podešen objekat. Administrator treba provjeriti karticu.');
  const date=new Date(),id=crypto.randomUUID();
  const entry={id,empId:worker.empId,locId:worker.locationId,kind:mode,
    at:date.toISOString(),barcode:code,source:'barcode',createdAt:serverTimestamp()};
  await setDoc(doc(db,'records','events','items',id),entry);
  lastScan={code,kind:mode,at:Date.now()};
  history.unshift({name:worker.name||'Zaposleni',kind:mode,time:date.toLocaleString('bs-BA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})});
  history=history.slice(0,20);renderHistory();
  $('location').textContent='Objekat: '+(worker.locationId==='m1'?'Market 1':worker.locationId==='m2'?'Market 2':worker.locationId);
  feedback('Potvrđeno u Firebase bazi: '+(worker.name||'Zaposleni')+' · '+(mode==='in'?'DOLAZAK':'ODLAZAK'),'ok');
 }catch(err){
  feedback('Prijava NIJE evidentirana: '+(err?.code==='permission-denied'?'Firestore sigurnosna pravila još ne dozvoljavaju skeniranje bez registracije računara.':err.message),'bad');
 }finally{busy=false;$('barcode').disabled=false;focus()}
});
