import {auth,db} from './firebase-shared.js';
import {onAuthStateChanged,signInAnonymously,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDoc,getDocFromCache,onSnapshot,query,where,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let station=null,mode='in',badges=new Map(),events=[],unsubscribe=[],connected=false,lastClick=0;
function feedback(message,style=''){$('status').className='result '+style;$('status').textContent=message}
function setConnectivity(){connected=navigator.onLine;$('connection').textContent=connected?'Internet dostupan':'Nema interneta – offline';$('connection').style.background=connected?'#e4f8ee':'#fff0db'}
window.addEventListener('online',setConnectivity);window.addEventListener('offline',setConnectivity);setConnectivity();
if('serviceWorker' in navigator && ['https:','http:'].some(s=>location.protocol===s))navigator.serviceWorker.register('./sw.js').catch(()=>{});
function day(stamp){const d=new Date(stamp);return d.toLocaleDateString('bs-BA')}
function refreshHistory(){let list=events.slice().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,25);$('events').innerHTML=list.map(x=>`<div class="item"><span><b>${esc(badges.get(x.barcode)?.name||'Zaposleni')}</b> · ${x.kind==='in'?'Dolazak':'Odlazak'}</span><span>${day(x.at)} · ${new Date(x.at).toLocaleTimeString('bs-BA',{hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')||'Nema skeniranja.'}
let profileUnsubscribe=null,currentUid=null,registering=false;
function pending(msg){$('loginPanel').classList.remove('hide');$('kiosk').classList.add('hide');$('loginStatus').textContent=msg;}
function leave(){unsubscribe.forEach(f=>f());unsubscribe=[];station=null;badges=new Map();events=[];}
function enter(user,locationId){
 if(station===locationId)return;
 leave();station=locationId;
 $('location').textContent='Objekat: '+(station==='m1'?'Market 1':station==='m2'?'Market 2':station);
 unsubscribe.push(onSnapshot(collection(db,'badges'),s=>{badges=new Map(s.docs.map(d=>[d.id,d.data()]));refreshHistory()},e=>feedback('Greška učitavanja kartica: '+e.message,'bad')));
 unsubscribe.push(onSnapshot(query(collection(db,'records','events','items'),where('locId','==',station)),s=>{events=s.docs.map(d=>d.data());refreshHistory();$('connection').textContent=s.metadata.fromCache?'Lokalni podaci – čeka vezu': 'Povezano sa bazom'},e=>feedback('Greška pri čitanju evidencije: '+e.message,'bad')));
 $('loginPanel').classList.add('hide');$('kiosk').classList.remove('hide');$('barcode').focus();
}
function trackDevice(user){
 currentUid=user.uid;$('terminalUid').value=user.uid;
 if(profileUnsubscribe)profileUnsubscribe();leave();
 pending('Provjera odobrenja računara…');
 profileUnsubscribe=onSnapshot(doc(db,'terminals',user.uid),snap=>{
   if(!snap.exists()||snap.data().active!==true){leave();pending('Čeka odobrenje administratora. U administraciji → Postavke → Firebase terminali unesi prikazani UID i odaberi market.');return;}
   enter(user,snap.data().locationId);
 },err=>{leave();pending('Nije moguće provjeriti odobrenje: '+err.message+'. Provjeri Firestore Rules ili internet.');});
}
$('copyUid').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(currentUid||'');$('loginStatus').textContent='Identifikator je kopiran. Pošalji ga administratoru.'}
 catch{$('terminalUid').select();$('loginStatus').textContent='Označen je UID – kopiraj ga pomoću Ctrl+C.'}
});
onAuthStateChanged(auth,async user=>{
 if(!user){leave();if(profileUnsubscribe){profileUnsubscribe();profileUnsubscribe=null};pending('Prvi put povezujemo ovaj računar…');
   if(registering)return;registering=true;
   try{await signInAnonymously(auth)}catch(e){pending('Anonimna prijava nije uspjela: '+e.message+' — provjeri Firebase Authentication → Anonymous.')}finally{registering=false}
   return;
 }
 if(!user.isAnonymous){leave();pending('Ovdje je već prijavljen administratorski nalog. Za terminal otvori poseban Chrome profil ili se odjavi u administraciji.');$('terminalUid').value='Administratorska sesija';return;}
 if(currentUid!==user.uid||!profileUnsubscribe)trackDevice(user);
});
$('modeIn').addEventListener('click',()=>{mode='in';$('modeIn').className='mode on';$('modeOut').className='mode';$('barcode').focus()});
$('modeOut').addEventListener('click',()=>{mode='out';$('modeOut').className='mode out';$('modeIn').className='mode';$('barcode').focus()});
$('scanForm').addEventListener('submit',async e=>{
 e.preventDefault();let code=$('barcode').value.trim();$('barcode').value='';$('barcode').focus();
 if(!station||!code)return;if(Date.now()-lastClick<850)return feedback('Sačekaj prije sljedećeg skeniranja.','bad');lastClick=Date.now();
 const worker=badges.get(code);
 if(!worker?.active)return feedback('Kartica nije pronađena u lokalno učitanom spisku. Ako je nova, prvo poveži internet.','bad');
 const last=events.filter(x=>x.empId===worker.empId).sort((a,b)=>b.at.localeCompare(a.at))[0];
 if(last && Math.abs(Date.now()-Date.parse(last.at))<60_000)return feedback('Ponovljeno skeniranje zaustavljeno (manje od 60 sekundi).','bad');
 if(mode==='in'&&last?.kind==='in')return feedback('Radnik već ima otvorenu prijavu. Administrator treba provjeriti evidenciju.','bad');
 if(mode==='out'&&last?.kind!=='in')return feedback('Nema evidentiranog dolaska. Administrator treba provjeriti evidenciju.','bad');
 const at=new Date().toISOString(),id=crypto.randomUUID();
 const entry={id,empId:worker.empId,locId:station,kind:mode,at,barcode:code,source:'barcode',terminalUid:auth.currentUser.uid,createdAt:serverTimestamp()};
 // Firestore pohranjuje lokalni red čekanja; server kasnije provjerava sigurnosna pravila.
 try{
  const promise=setDoc(doc(db,'records','events','items',id),entry);
  promise.then(()=>feedback('Potvrđeno u zajedničkoj bazi: '+worker.name+' · '+modeLabel())).catch(err=>feedback('SERVER ODBIO PRIJAVU: '+err.message+' (provjeri s administratorom)','bad'));
  feedback((navigator.onLine?'Zabilježeno – čeka potvrdu servera: ':'Sačuvano lokalno – čeka internet: ')+worker.name+' · '+modeLabel(),'ok');
 }catch(err){feedback('Greška lokalnog spremanja: '+err.message,'bad')}
});
function modeLabel(){return mode==='in'?'DOLAZAK':'ODLAZAK'}
