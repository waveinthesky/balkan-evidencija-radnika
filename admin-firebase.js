import * as HIST from './history-2025.js';
import {auth,db} from './firebase-shared.js';
import {ADMIN_UID} from './firebase-config.js';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDocs,getDocsFromServer,onSnapshot,setDoc,deleteDoc,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const login=document.getElementById('v6Login');
const message=document.getElementById('v6AuthMessage');
const form=document.getElementById('v6LoginForm');
const api=window.BALKAN_V6;
window.BALKAN_ARCHIVE={display:()=>HIST.display()};
HIST.bindUI();
const columns=api.collections();
const cloudRefs=c=>collection(db,'records',c,'items');
const cloudDoc=(c,id)=>doc(db,'records',c,'items',id);
const text=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let started=false,cloudReady=false,serverVerified=false,unsubs=[],pending=0,syncError='',cached=false,applying=Promise.resolve();
window.BALKAN_FIREBASE_READY=false;
function paintCloud(){
 const el=document.querySelector('.top-actions .pill');
 if(!el)return;
 el.textContent=!navigator.onLine?'● Nema interneta':syncError?'● Firebase – provjeri grešku':serverVerified?'● Firebase server potvrđen':'● Firebase – nije potvrđen';
}
window.addEventListener('online',paintCloud);window.addEventListener('offline',paintCloud);

function programHelp(){return `
<section class="panel" id="balkanProgramHelp">
 <h2>Uputstvo za korištenje programa BALKAN</h2>
 <p class="smalltext">Ovo uputstvo opisuje postojeće funkcije i ograničenja. Kada se mijenjaju podaci, administrator treba provjeriti Firebase status i izvještaj, a ne samo izgled kalendara.</p>
 <details open><summary><b>1. Početna stranica za radnike</b></summary><p>Web stranica otvara ekran DOLAZAK / ODLAZAK. Radnik odabere radnju i skenira barkod kartice. Ne unosi lozinku niti se prijavljuje na Firebase. Poruka <b>Potvrđeno u Firebase bazi</b> smije značiti samo stvarno potvrđen upis. Ako server odbije upis, prijava nije izvršena. Bez interneta trenutni barkod ekran ne garantuje čuvanje prijave.</p></details>
 <details><summary><b>2. Administratorska prijava i sigurnost</b></summary><p>U administraciju se ulazi Firebase administratorskim nalogom. Nikad ne stavljaj lozinke ili privatni JSON na GitHub. Program je javno dostupan kao web stranica, ali Firebase pravila moraju štititi podatke. Sam Anonymous Authentication nije dokaz da je skeniranje izvršio ovlašten radnik; serverska provjera skeniranja još treba posebnu završnu provjeru.</p></details>
 <details><summary><b>3. Radnici, barkodovi i prestanak rada</b></summary><p>Radnici → Dodaj/Uredi: ime, stvarni barkod, objekat, datum početka i eventualnog prestanka rada, aktivan/neaktivan. Za radnike uvezene iz 2025. provjeri i zamijeni privremene kodove NEPOSTAVLJENO. Ne briši bivše radnike jer se njihova istorija mora sačuvati. Ako je radnik prestao raditi, uneseni datum ili status mora zaustaviti očekivanje dolazaka za kasniji period.</p></details>
 <details><summary><b>4. Objekti i radno vrijeme</b></summary><p>Objekti → Uredi: otvaranje i zatvaranje, radni dani, tolerancija i datum od kojeg raspored važi. Ranije postavke ostaju u istoriji. Unesi i <b>normu plaćenih sati za radni dan</b>, jer trajanje otvorenosti prodavnice nije isto što i radni sati pojedinačnog radnika.</p></details>
 <details><summary><b>5. Kalendar, jedan klik i detaljne ispravke</b></summary><p>Kalendar prikazuje cijeli mjesec bez bočnog skrolovanja. Klik na običnu ćeliju mijenja oznaku N ↔ P i upisuje administrativnu izmjenu. P uneseno ručno <b>ne znači da imamo izmjereno vrijeme rada</b>. Dani sa skeniranjima, praznicima ili već evidentiranim odsustvom ne prepisuju se jednim klikom: izaberi dan, pa u detaljima koristi Ručna evidencija / ispravka. Svaka promjena ostaje u istoriji.</p></details>
 <details><summary><b>6. Smjene, kašnjenje i obračun sati</b></summary><p>U profilu radnika može se upisati uobičajeni početak smjene, a u detaljima dana izuzetak za taj datum. Kašnjenje se računa prema početku smjene i toleranciji, <b>ne samo prema otvaranju objekta</b>. Izvještaji odvojeno prikazuju potvrđene sate iz parova dolazak–odlazak, sate plaćenog praznika, obračunski zbir i kašnjenja. Nedostajuća odjava mora se provjeriti; ne izmišljamo nepoznate sate.</p></details>
 <details><summary><b>7. Praznici i periodi od više dana</b></summary><p>Praznici i odsustva → Praznik: unesi naziv, početni i završni datum, vrstu (vjerski, državni, drugi), objekat ili pojedinačnog zaposlenog i da li je to plaćen neradni dan. Vjerski praznik može važiti samo za zaposlenog koji ima pravo na odsustvo, ili za cijeli objekat ako objekat ne radi. Program ga označava posebnom bojom. Plaćeni neradni sati nisu isto što i stvarno odrađeni sati i računaju se samo kada je unesena norma.</p></details>
 <details><summary><b>8. Arhiva 2025. i preneseni godišnji zbirovi</b></summary><p>Arhiva 2025. sadrži svih 12 mjeseci i originalne kolone Ukupno, Po staroj tabeli i Preostalo. Zeleno znači da u starom Excelu nema upisanog odsustva, ne da postoji skeniranje. Uvoz je jednokratan; ne uvozi isti privatni fajl ponovo. Razlike za juni i novembar sačuvane su kao napomene, bez izmišljanja datuma.</p></details>
 <details><summary><b>9. Izvještaji, štampanje i kopije</b></summary><p>Izvještaji → odaberi objekat, godinu i mjesec; pregledaj mjesečne i sedmične sate. Dostupno je preuzimanje CSV-a i štampanje/PDF kroz preglednik. Preuzmi sigurnosnu kopiju po potrebi i čuvaj je privatno. Štampanje rješenja ne smije samo po sebi umanjiti broj dana godišnjeg odmora. Google Authenticator ostaje isključen dok se ne osigura serverska verifikacija.</p></details>
 <details><summary><b>10. Šta još mora proći prije stvarnog obračuna</b></summary><p>Firebase podatke provjeri prijavom iz drugog preglednika. Testiraj dolazak i odlazak s testnom karticom uz provjeru upisa na serveru, pravila pristupa i neuspio pokušaj upisa. Provjeri praznike i norme sati, smjene, datume početka/prestanka rada i izvještaje. Bez uspješnog testa stvarnog Firestore upisa skeniranje ne treba koristiti kao pouzdanu službenu evidenciju.</p></details>
</section>`;}

function status(){return `<div class="sync-banner ${syncError?'bad':'good'}">${syncError?'⚠ Firebase: '+text(syncError):pending?'⟳ Firestore čuva '+pending+' promjena':serverVerified?'✓ Firebase server potvrdio čitanje podataka':'⚠ Veza s Firebase serverom nije potvrđena'} · Kod offline rada podaci mogu biti samo u lokalnoj memoriji dok server ne potvrdi promjene.</div>`}
function updateBanner(){const el=document.getElementById('v6FirebaseStatus');if(el)el.innerHTML=status();paintCloud()}
function sanitize(){const s=api.state();if(!s)return;s._sync={url:'',token:'',deviceId:s._sync?.deviceId||crypto.randomUUID(),seeded:true,lastAt:null};s._pending=[];s._security={terminalToken:'',lastPolicies:{},lastIndividual:{}};s.admin={username:'Firebase administrator'};}
function badge(e){
 const day=new Date().toLocaleDateString('en-CA');
 const items=(e.assignments||[]).filter(a=>a.from<=day).sort((a,b)=>b.from.localeCompare(a.from));
 const locationId=items[0]?.locationId||e.defaultLocationId||'';
 return {empId:e.id,name:e.name,active:e.active===true,barcode:e.barcode||'',locationId,updatedAt:new Date().toISOString()}
}
function submitChanges(before,after){
 if(!cloudReady)return;
 const changes=api.diff(before,after);
 if(!changes.length)return;
 const items=[];
 for(const a of changes){items.push({ref:cloudDoc(a.collection,a.key),value:a.type==='delete'?null:a.value});
   if(a.collection==='employees'){
    const old=(before.employees||[]).find(e=>e.id===a.key);
    if(old?.barcode&&(!a.value||old.barcode!==a.value.barcode))items.push({ref:doc(db,'badges',old.barcode),value:null});
    if(a.value?.barcode&&a.value.barcodeAssigned!==false&&!a.value.barcode.startsWith('NEPOSTAVLJENO-'))items.push({ref:doc(db,'badges',a.value.barcode),value:badge(a.value)});
   }
 }
 for(let i=0;i<items.length;i+=300){const batch=writeBatch(db);let part=items.slice(i,i+300);for(let x of part)x.value===null?batch.delete(x.ref):batch.set(x.ref,x.value);pending+=part.length;updateBanner();batch.commit().then(()=>{pending-=part.length;syncError='';updateBanner()}).catch(err=>{pending-=part.length;syncError=err.message+' — sačuvaj lokalnu kopiju i provjeri pravila!';updateBanner()});}
}
async function showApp(){
 await api.boot();sanitize();
 api.setSyncIndicator(status);
 const oldSettings=api.getSettings();
 // Ne prikazujemo stari privatni Python server, ključeve ili dugmad TOTP koja ne rade na Spark planu.

 function cleanLegacySettings(html){
  html=html.replace('Lokalna instalacija, sigurnosne kopije i stanica za skeniranje',
    'Zajednička evidencija u Firebase bazi i uputstvo za rad');
  const a=html.indexOf('<div class="panel"><h2>Računar za skeniranje</h2>');
  const b=html.indexOf('<div class="panel"><h2>Čuvanje i vraćanje podataka</h2>',a);
  if(a>=0&&b>a)html=html.slice(0,a)+html.slice(b);
  const c=html.indexOf('<div class="panel"><h2>Stara Excel evidencija</h2>');
  if(c>=0){const d=html.indexOf('</div>',c);if(d>c)html=html.slice(0,c)+html.slice(d+6)}
  html=html.replace('⚠ Podaci su trenutno samo na ovom računaru i u ovom pregledniku. Nema automatske razmjene između marketa i kancelarije. Ne briši podatke preglednika; redovno pravi sigurnosne kopije. Lozinka u lokalnoj aplikaciji nije zamjena za serversku kontrolu pristupa.',
   'Firebase je zajednička baza, ali upis mora potvrditi server. Preuzeta JSON kopija sadrži trenutno učitane podatke i služi kao dodatna zaštita, ne kao dokaz da je svaki unos sinhronizovan.');
  html=html.replace('↓ Preuzmi sigurnosnu kopiju (JSON)','↓ Preuzmi lokalnu kopiju (JSON)');
  html=html.replace('<button class="btn" data-act="restore">↑ Vrati sigurnosnu kopiju</button>','');
  return html;
 }
 api.setSettings(()=>cleanLegacySettings(oldSettings()
   .replace(/<section class="panel"><h2>Automatske sigurnosne kopije i sinhronizacija<\/h2>[\s\S]*?<\/section>/,'')
   .replace(/<section class="panel"><h2>Zaštita barkod kartica – Google Authenticator<\/h2>[\s\S]*?<\/section>/,''))
   +HIST.settings()
   +programHelp()
   +`<section class="panel"><h2>Firebase – status</h2><div id="v6FirebaseStatus">${status()}</div><button class="btn" id="v6SignOut" type="button">Odjavi Firebase administratora</button><p class="smalltext">Nema vezivanja programa za računar. Skeniranje barkoda zahtijeva završnu serversku provjeru prije službene upotrebe.</p></section>`);

 api.patchSave(submitChanges);
 // Stvarna serverska provjera: lokalni Firestore cache nije dovoljan dokaz veze.
 try{await getDocsFromServer(cloudRefs('locations'));serverVerified=true}
 catch(err){serverVerified=false;syncError='Nije uspjela provjera servera: '+err.message;console.warn('Firestore server check:',err)}
 const fetched={};let any=false;
 for(const c of columns){const snap=await getDocs(cloudRefs(c));fetched[c]=snap.docs.map(d=>d.data());if(fetched[c].length)any=true;}
 if(any){await api.setCloudRows(fetched);
  // Ako smo uvezli staru evidenciju, provjeri da sve aktivne kartice imaju indeks za kase.
  const badgeSnap=await getDocs(collection(db,'badges'));
  const known=new Map(badgeSnap.docs.map(d=>[d.id,d.data()]));
  const needed=(api.state().employees||[]).filter(e=>e.barcode&&e.barcodeAssigned!==false&&!e.barcode.startsWith('NEPOSTAVLJENO-')&&(!known.has(e.barcode)||known.get(e.barcode).empId!==e.id||(known.get(e.barcode).active!==(e.active===true)||known.get(e.barcode).locationId!==badge(e).locationId)));
  for(let i=0;i<needed.length;i+=250){const b=writeBatch(db);for(const e of needed.slice(i,i+250))b.set(doc(db,'badges',e.barcode),badge(e));await b.commit();}
 }else{
  // U novom projektu automatski pošalji samo početne objekte i šablon.
  const s=api.state();const ops=[...(s.locations||[]).map(l=>({c:'locations',v:l})),...(s.leaveTemplates||[]).map(l=>({c:'leaveTemplates',v:l}))];
  const batch=writeBatch(db);ops.forEach(x=>batch.set(cloudDoc(x.c,x.v.id),x.v));
  await batch.commit();
 }
 cloudReady=true;
 for(const c of columns){let first=true;unsubs.push(onSnapshot(cloudRefs(c),snap=>{
   if(first){first=false;return}
   applying=applying.then(async()=>{
    const s=api.state();const map=new Map((s[c]||[]).map(x=>[x.id,x]));
    for(let change of snap.docChanges()){if(change.type==='removed')map.delete(change.doc.id);else map.set(change.doc.id,change.doc.data());}
    await api.setCloudRows({[c]:[...map.values()]});
   }).catch(e=>{syncError=e.message;updateBanner()});
  },err=>{syncError=err.message;updateBanner()}));}
 try{await HIST.load(db)}catch(err){syncError='Arhiva 2025 nije dostupna: '+err.message;updateBanner();console.warn('Arhiva 2025:',err)}
 window.BALKAN_FIREBASE_READY=serverVerified;
 login.style.display='none';api.render();paintCloud();
}
form.addEventListener('submit',async e=>{e.preventDefault();message.textContent='Prijavljivanje…';try{await signInWithEmailAndPassword(auth,document.getElementById('v6Email').value.trim(),document.getElementById('v6Password').value)}catch(e){message.textContent='Prijava nije uspjela: '+e.message}});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-act="restore"]')){e.stopImmediatePropagation();e.preventDefault();alert('Vraćanje starih lokalnih podataka u zajedničku bazu se radi isključivo uz prethodni backup i provjeru migracije.');return}if(e.target.id==='v6SignOut'||e.target.closest?.('[data-act="logout"]')){e.stopImmediatePropagation();e.preventDefault();signOut(auth)}},true);
onAuthStateChanged(auth,async user=>{
 if(!user){unsubs.forEach(f=>f());unsubs=[];started=false;cloudReady=false;serverVerified=false;window.BALKAN_FIREBASE_READY=false;login.style.display='grid';form.style.display='block';message.textContent='Prijavi se Firebase administratorskim nalogom.';return}
 if(user.uid!==ADMIN_UID){message.textContent='Ovaj nalog nema administratorska ovlaštenja.';form.style.display='none';await signOut(auth);return}
 if(started)return;started=true;message.textContent='Učitavanje zajedničke evidencije…';try{await showApp()}catch(e){message.textContent='Ne mogu učitati Firestore: '+e.message;started=false;cloudReady=false;serverVerified=false;syncError=e.message;window.BALKAN_FIREBASE_READY=false;paintCloud();form.style.display='none'}
});

document.addEventListener('submit',async event=>{
 if(event.target?.id!=='histImport')return;
 event.preventDefault();event.stopImmediatePropagation();
 if(!cloudReady||auth.currentUser?.uid!==ADMIN_UID){alert('Prvo se prijavi kao administrator.');return}
 const uploadForm=event.target;
 const uploaded=uploadForm.elements.namedItem('file')?.files?.[0];
 if(!uploaded)return;
 if(!confirm('Uvesti istoriju 2025. i spisak radnika u privatnu Firebase bazu? Podaci se neće postaviti na GitHub.'))return;
 try{
  const n=await HIST.importData(db,api,uploaded);
  alert('Sačuvano '+n+' zaposlenih. Provjeri tačne datume, barkodove i objekte prije korištenja.');
 }catch(err){alert('Uvoz nije završen: '+err.message)}
},true);
