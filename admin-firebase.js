import * as HIST from './history-2025.js';
import {auth,db} from './firebase-shared.js';
import {ADMIN_UID} from './firebase-config.js';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {collection,doc,getDocs,onSnapshot,setDoc,deleteDoc,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
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
let started=false,cloudReady=false,unsubs=[],pending=0,syncError='',cached=false,applying=Promise.resolve();
function status(){return `<div class="sync-banner ${syncError?'bad':'good'}">${syncError?'⚠ Firebase: '+text(syncError):pending?'⟳ Firestore čuva '+pending+' promjena':'✓ Firebase povezan'} · podaci se automatski usklađuju. Za offline stanje provjeri da nema odbijenih zapisa.</div>`}
function updateBanner(){const el=document.getElementById('v6FirebaseStatus');if(el)el.innerHTML=status()}
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
 api.setSettings(()=>oldSettings()
   .replace(/<section class="panel"><h2>Automatske sigurnosne kopije i sinhronizacija<\/h2>[\s\S]*?<\/section>/,'')
   .replace(/<section class="panel"><h2>Zaštita barkod kartica – Google Authenticator<\/h2>[\s\S]*?<\/section>/,'')
   +HIST.settings()
   +`<section class="panel"><h2>Firebase – status</h2><div id="v6FirebaseStatus">${status()}</div><button class="btn" id="v6SignOut" type="button">Odjavi Firebase administratora</button><p class="smalltext">Nema vezivanja programa za računar. Skeniranje barkoda treba dodatnu zaštitu na serveru prije upotrebe za stvarnu evidenciju.</p></section>`);
 api.patchSave(submitChanges);
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
 login.style.display='none';api.render();
}
form.addEventListener('submit',async e=>{e.preventDefault();message.textContent='Prijavljivanje…';try{await signInWithEmailAndPassword(auth,document.getElementById('v6Email').value.trim(),document.getElementById('v6Password').value)}catch(e){message.textContent='Prijava nije uspjela: '+e.message}});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-act="restore"]')){e.stopImmediatePropagation();e.preventDefault();alert('Vraćanje starih lokalnih podataka u zajedničku bazu se radi isključivo uz prethodni backup i provjeru migracije.');return}if(e.target.id==='v6SignOut'||e.target.closest?.('[data-act="logout"]')){e.stopImmediatePropagation();e.preventDefault();signOut(auth)}},true);
onAuthStateChanged(auth,async user=>{
 if(!user){unsubs.forEach(f=>f());unsubs=[];started=false;cloudReady=false;login.style.display='grid';form.style.display='block';message.textContent='Prijavi se Firebase administratorskim nalogom.';return}
 if(user.uid!==ADMIN_UID){message.textContent='Ovaj nalog nema administratorska ovlaštenja.';form.style.display='none';await signOut(auth);return}
 if(started)return;started=true;message.textContent='Učitavanje zajedničke evidencije…';try{await showApp()}catch(e){message.textContent='Ne mogu učitati Firestore: '+e.message;started=false;form.style.display='none'}
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
