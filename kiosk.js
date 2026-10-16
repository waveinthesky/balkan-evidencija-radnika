// Kiosk radi i bez Firebase modula dok nema interneta. Svaki sken prvo ide u trajni outbox.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const OUTBOX_KEY='balkan_kiosk_outbox_v1',RECENT_KEY='balkan_kiosk_lastscan_v1',HISTORY_KEY='balkan_kiosk_confirmed_v1',RECEIPT_KEY='balkan_kiosk_receipt_v1',LIMIT=1500;
let mode='in',busy=false,flushing=null,transport=null,lastScan=null,history=[],receiptId=null;
let storageBroken=false,previousSyncError='';

function readQueue(){
 const raw=localStorage.getItem(OUTBOX_KEY);
 if(!raw)return [];
 const data=JSON.parse(raw);
 if(!Array.isArray(data)||data.some(x=>!x||typeof x.id!=='string'||typeof x.barcode!=='string'||!['in','out'].includes(x.kind)||typeof x.at!=='string'))
  throw Error('Lokalna evidencija nije ispravna. Ne smijemo je prepisati.');
 return data;
}
function saveQueue(items){
 const serialized=JSON.stringify(items);
 localStorage.setItem(OUTBOX_KEY,serialized);
 if(localStorage.getItem(OUTBOX_KEY)!==serialized)throw Error('Čuvanje na računaru nije potvrđeno.');
}
function feedback(message,type=''){
 const el=$('status');el.textContent=message;el.className='result '+type;
}
function setSyncMessage(message,tone=''){
 $('syncStatus').textContent=message;
 $('syncStatus').style.color=tone==='bad'?'#a12837':tone==='ok'?'#08613e':'#586981';
}
function cardLabel(code){
 // Dok server ne potvrdi karticu ne tvrdimo da znamo ime radnika.
 const value=String(code||''),tail=value.slice(-4);
 return 'Kartica '+(tail?'••••'+tail:'bez koda');
}
function showReceipt(info,persist=true){
 const rec={id:info.id||null,variant:info.variant||'idle',heading:info.heading||'Spremno',
  name:info.name||'Prinesi karticu',kind:info.kind||'in',at:info.at||null,
  state:info.state||'',hint:info.hint||'',message:info.message||'',icon:info.icon||'⌁'};
 receiptId=rec.id;
 $('receipt').className='receipt '+rec.variant;
 $('receiptIcon').textContent=rec.icon;
 $('receiptHeading').textContent=rec.heading;
 $('receiptPerson').textContent=rec.name;
 $('receiptKind').textContent=rec.kind==='out'?'↗ ODLAZAK':'↘ DOLAZAK';
 $('receiptTime').textContent=rec.at?formatWhen(rec.at):'Čeka se skeniranje';
 $('receiptState').textContent=rec.state;
 $('receiptHint').textContent=rec.hint;
 feedback(rec.message,rec.variant==='ok'?'ok':rec.variant==='bad'?'bad':'');
 if(persist){
  try{localStorage.setItem(RECEIPT_KEY,JSON.stringify(rec))}catch{}
 }
}
function restoreReceipt(){
 try{
  const rec=JSON.parse(localStorage.getItem(RECEIPT_KEY)||'null');
  if(!rec||!['pending','ok','bad'].includes(rec.variant))return false;
  const queued=rec.id&&readQueue().find(x=>x.id===rec.id);
  if(queued&&rec.variant==='ok'){
   rec.variant='pending';rec.state='SAČUVANO NA OVOM RAČUNARU';rec.heading='Čeka se potvrda';
   rec.hint='Zapis još nije potvrđen u Firebase bazi.';
  }
  if(!queued&&rec.variant==='pending'){
   // Ovaj uređaj zna samo da zapis više nije u lokalnom redu.
   rec.variant='idle';rec.state='Provjeri evidenciju';rec.hint='Prethodni zapis nije više na čekanju. Provjeri posljednja skeniranja.';
  }
  showReceipt(rec,false);
  return true;
 }catch{return false}
}
function loadHistory(){
 try{
  const data=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
  history=Array.isArray(data)?data.filter(x=>x&&typeof x.name==='string'&&typeof x.at==='string').slice(0,20):[];
 }catch{history=[]}
}
function saveHistory(){
 try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,20)))}catch{}
}
function formatWhen(x){return new Date(x).toLocaleString('bs-BA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}
function connection(message,online=false){
 $('connection').textContent=message;
 $('connection').className='pill '+(online?'status-online':'status-offline');
}
function showQueue(){
 let items;
 try{items=readQueue();storageBroken=false}catch(e){
  storageBroken=true;$('queueState').textContent='⚠ Lokalna evidencija nije dostupna: '+e.message;
  $('queueRetry').disabled=true;
  return;
 }
 const waiting=items.filter(x=>x.flag!=='review').length,review=items.length-waiting;
 $('queueState').textContent=waiting?
  waiting+' '+(waiting===1?'zapis čeka':'zapisa čeka')+' slanje u Firebase'+(review?', '+review+' za provjeru':'')+'.':
  review?review+' '+(review===1?'zapis zahtijeva':'zapisa zahtijevaju')+' provjeru.':
  'Svi obrađeni zapisi s ovog računara su poslani.';
 $('queueRetry').disabled=!navigator.onLine||!items.length||!!flushing;
 const pending=items.map(x=>({id:x.id,name:cardLabel(x.barcode),kind:x.kind,at:x.at,
  state:x.flag==='review'?'POTREBNA PROVJERA':'ČEKA SLANJE',tone:x.flag==='review'?'bad':'pending'}));
 const confirmed=history.map(x=>({...x,state:'POTVRĐENO U FIREBASEU',tone:'ok'}));
 const combined=[...pending,...confirmed].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,20);
 $('events').innerHTML=combined.map(x=>'<div class="item"><div class="item-info">'+
  '<div class="item-name">'+esc(x.name)+'</div>'+
  '<div class="item-sub">'+(x.kind==='in'?'↘ DOLAZAK':'↗ ODLAZAK')+'</div></div>'+
  '<div class="item-right"><div class="item-time">'+esc(formatWhen(x.at))+'</div>'+
  '<span class="item-state '+x.tone+'">'+esc(x.state)+'</span></div></div>').join('')||
  'Nema skeniranja na ovom računaru.';
}
function setMode(value){
 mode=value;
 if(!receiptId&&$('receipt').classList.contains('idle'))$('receiptKind').textContent=value==='out'?'↗ ODLAZAK':'↘ DOLAZAK';
 $('modeIn').className='mode'+(value==='in'?' on':'');
 $('modeOut').className='mode'+(value==='out'?' out':'');
 focus();
}
function focus(){
 // Kasa koristi USB/Bluetooth čitač kao tastaturu; fokus mora biti na barkodu.
 setTimeout(()=>{
  const input=$('barcode');
  if(input&&!input.disabled&&!document.hidden){
   try{input.focus({preventScroll:true})}catch{input.focus()}
  }
 },0);
}
// Pojedini skeneri rade kao fizička tastatura i nakon klika na dugme ili prazan dio
// stranice pišu u trenutno aktivni element. Preusmjeri samo njihove obične znakove;
// ne presreći prečice preglednika niti unos u druga polja.
document.addEventListener('keydown',event=>{
 const input=$('barcode');
 if(!input||input.disabled||document.hidden||event.defaultPrevented||event.isComposing||
    event.altKey||event.ctrlKey||event.metaKey)return;
 const fromBarcode=event.target===input;
 const otherField=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
 if(fromBarcode){
  if(event.key==='Tab'&&input.value.trim()){
   event.preventDefault();
   input.form.requestSubmit();
  }
  return;
 }
 if(otherField)return;
 if((event.key==='Enter'||event.key==='Tab')&&input.value.trim()){
  event.preventDefault();
  input.focus({preventScroll:true});
  input.form.requestSubmit();
  return;
 }
 if(event.key.length===1){
  // Upisujemo i prvi znak, koji bi inače završio na dugmetu ili se izgubio.
  event.preventDefault();
  input.focus({preventScroll:true});
  const start=input.selectionStart??input.value.length;
  const end=input.selectionEnd??input.value.length;
  input.setRangeText(event.key,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
 }
},true);
document.addEventListener('click',event=>{
 if(!event.target?.closest?.('a,input,textarea,select,[contenteditable="true"]'))focus();
});
window.addEventListener('focus',focus);
function statusConnection(){
 connection(navigator.onLine?'Internet dostupan – provjera Firebase veze pri slanju':'Bez interneta – lokalno čuvanje',navigator.onLine);
 showQueue();
}
function duplicate(code,kind,now,items){
 const latest=items.findLast(x=>x.barcode===code&&x.kind===kind&&now-new Date(x.at).getTime()<60000&&now>=new Date(x.at).getTime());
 if(latest)return true;
 return lastScan?.code===code&&lastScan?.kind===kind&&now-lastScan.at<60000;
}
function prepareRecent(){
 try{
  const item=JSON.parse(localStorage.getItem(RECENT_KEY)||'null');
  if(item&&typeof item.code==='string'&&Number.isFinite(item.at))lastScan=item;
 }catch{}
}
function markRecent(code,kind,at){
 lastScan={code,kind,at};
 try{localStorage.setItem(RECENT_KEY,JSON.stringify(lastScan))}catch{}
}
function manualReview(err){return ['invalid-card','invalid-assignment'].includes(err?.code)}
function boundedUpload(sender,item){
 return new Promise((resolve,reject)=>{
  let finished=false;
  const done=(error,value)=>{
   if(finished)return;finished=true;
   clearTimeout(timeout);window.removeEventListener('offline',onOffline);
   if(error)reject(error);else resolve(value);
  };
  const onOffline=()=>done(new Error('Internet je nestao tokom slanja; zapis ostaje lokalno.'));
  const timeout=setTimeout(()=>done(new Error('Server nije potvrdio upis na vrijeme; zapis ostaje lokalno.')),12000);
  window.addEventListener('offline',onOffline,{once:true});
  Promise.resolve().then(()=>sender.sendQueuedScan(item)).then(value=>done(null,value),error=>done(error));
 });
}
function describe(err){
 if(err?.code==='permission-denied')return 'Firebase odbija upis. Provjeri sigurnosna pravila; lokalni zapis je sačuvan.';
 return String(err?.message||err||'Nepoznata greška');
}
function syncQueue(includeReview=false){
 if(flushing)return flushing;
 if(!navigator.onLine){statusConnection();return Promise.resolve()}
 flushing=(async()=>{
  let sent=0,needsReview=0,failed='',lastConfirmed=null;
  setSyncMessage('Šaljem sačuvane zapise…');
  $('queueRetry').disabled=true;
  try{
   const list=readQueue();
   if(!list.length)return;
   const sender=transport||await import('./kiosk-firebase.js');
   transport=sender;
   for(const item of list){
    if(!navigator.onLine){failed='Internet je prekinut.';break}
    let current=readQueue().find(x=>x.id===item.id);
    if(!current||current.flag==='review'&&!includeReview)continue;
    try{
     const confirmed=await boundedUpload(sender,current);
     const other=readQueue().filter(x=>x.id!==current.id);
     saveQueue(other);
     history.unshift({id:current.id,name:confirmed.name,kind:confirmed.kind,at:confirmed.at,locationId:confirmed.locationId});
     history=history.slice(0,20);saveHistory();
     if(receiptId===current.id)showReceipt({
      id:current.id,variant:'ok',icon:'✓',heading:'Uspješno evidentirano',name:confirmed.name,
      kind:confirmed.kind,at:confirmed.at,state:'POTVRĐENO U FIREBASE BAZI',
      hint:'Prijava je uspješno upisana u centralnu evidenciju.',
      message:'Potvrđeno u Firebase bazi: '+confirmed.name+' · '+(confirmed.kind==='in'?'DOLAZAK':'ODLAZAK')
     });
     $('location').textContent='Objekat: '+(confirmed.locationId==='m1'?'Market 1':confirmed.locationId==='m2'?'Market 2':confirmed.locationId);
     sent++;lastConfirmed=confirmed;
    }catch(err){
     if(manualReview(err)){
      const items=readQueue(),record=items.find(x=>x.id===current.id);
      if(record){record.flag='review';record.error=describe(err);saveQueue(items)}
      if(receiptId===current.id)showReceipt({
       id:current.id,variant:'bad',icon:'!',heading:'Karticu treba provjeriti',
       name:cardLabel(current.barcode),kind:current.kind,at:current.at,
       state:'NIJE POTVRĐENO U FIREBASEU',
       hint:describe(err)+' Obrati se administratoru.',
       message:'Zapis ostaje na ovom računaru za provjeru.'
      });
      needsReview++;continue;
     }
     failed=describe(err);break;
    }
    showQueue();
   }
  }catch(err){failed=describe(err)}
  previousSyncError=failed;
  showQueue();
  const remaining=readQueue(),count=remaining.filter(x=>x.flag!=='review').length,review=remaining.length-count;
  if(failed){
   setSyncMessage('Slanje nije završeno: '+failed+' Preostalo: '+count+'.','bad');
   const current=remaining.find(x=>x.id===receiptId);
   if(current&&current.flag!=='review')showReceipt({
    id:current.id,variant:'pending',icon:'⏳',heading:'Čeka se slanje',name:cardLabel(current.barcode),
    kind:current.kind,at:current.at,state:'SAČUVANO NA OVOM RAČUNARU',
    hint:'Firebase još nije potvrdio zapis. Podaci nisu izgubljeni.',
    message:'Sačuvano NA OVOM RAČUNARU. Slanje čeka ponovno povezivanje.'
   });
  }else if(review||needsReview){
   setSyncMessage(review+' '+(review===1?'zapis traži':'zapisa traže')+' provjeru.','bad');
  }else if(sent){
   setSyncMessage('Firebase potvrdio '+sent+' '+(sent===1?'zapis':'zapisa')+'.','ok');
  }else if(count){
   setSyncMessage('Čeka se slanje '+count+' zapisa.');
  }else setSyncMessage('Nema zapisa na čekanju.','ok');
 })().finally(()=>{
  flushing=null;showQueue();focus();
  // Skenovi koji su stigli dok je stari red bio u slanju idu odmah sljedeći.
  if(navigator.onLine&&!previousSyncError){
   try{if(readQueue().some(x=>x.flag!=='review'))setTimeout(()=>void syncQueue(),0)}catch{}
  }
 });
 return flushing;
}
$('modeIn').addEventListener('click',()=>setMode('in'));
$('modeOut').addEventListener('click',()=>setMode('out'));
$('queueRetry').addEventListener('click',async()=>{
 if(!navigator.onLine){setSyncMessage('Nema interneta. Lokalni zapisi ostaju sačuvani.','bad');return}
 await syncQueue(true);
});
$('scanForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const code=$('barcode').value.trim().toUpperCase(),selectedMode=mode,now=Date.now();
 $('barcode').value='';
 if(!code||busy)return;
 busy=true;$('barcode').disabled=true;
 try{
  const items=readQueue();
  if(items.length>=LIMIT)throw Error('Lokalna evidencija je puna. Preuzmi sigurnosnu kopiju i zatraži pomoć; ne možemo potvrditi novi sken.');
  if(duplicate(code,selectedMode,now,items)){
   showReceipt({variant:'bad',icon:'!',heading:'Ponovljeno skeniranje',name:cardLabel(code),
    kind:selectedMode,at:new Date(now).toISOString(),state:'NIJE DODAT NOVI ZAPIS',
    hint:'Ista kartica je već skenirana za ovu radnju u posljednjih 60 sekundi.',
    message:'Ponovljeno skeniranje u kratkom roku je zaustavljeno.'});
   return;
  }
  const item={id:crypto.randomUUID(),barcode:code,kind:selectedMode,at:new Date(now).toISOString(),
   addedAt:now,offlineAtCapture:!navigator.onLine,flag:'queued'};
  saveQueue([...items,item]); // Moramo imati potvrdu lokalnog upisa PRIJE ikakvog slanja.
  markRecent(code,selectedMode,now);showQueue();
  showReceipt({id:item.id,variant:'pending',icon:'⏳',heading:'Skeniranje primljeno',
   name:cardLabel(code),kind:selectedMode,at:item.at,
   state:'SAČUVANO NA OVOM RAČUNARU',
   hint:navigator.onLine?'Provjeravam karticu i šaljem zapis u Firebase…':'Nema interneta. Zapis će se automatski poslati kada se veza vrati.',
   message:'Sačuvano NA OVOM RAČUNARU: '+(selectedMode==='in'?'DOLAZAK':'ODLAZAK')+
    '. Još NIJE potvrđeno u Firebase bazi.'});
  setSyncMessage(navigator.onLine?'Slanje u Firebase je u toku…':'Nema interneta – čekaju lokalni zapisi.');
  if(navigator.onLine)void syncQueue();
 }catch(err){
  showReceipt({variant:'bad',icon:'!',heading:'Skeniranje nije sačuvano',
   name:cardLabel(code),kind:selectedMode,at:new Date(now).toISOString(),
   state:'NIJE EVIDENTIRANO',
   hint:'Koristi rezervnu ručnu evidenciju i obavijesti administratora.',
   message:'NIJE SAČUVANO: '+describe(err)});
 }finally{busy=false;$('barcode').disabled=false;showQueue();focus()}
});
window.addEventListener('offline',()=>{statusConnection();setSyncMessage('Offline: novi skenovi se čuvaju na ovom računaru.')});
window.addEventListener('online',()=>{statusConnection();setSyncMessage('Internet je ponovo dostupan; provjeravam zapise…');void syncQueue()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void syncQueue()});
setInterval(()=>{if(navigator.onLine&&!flushing){try{if(readQueue().some(x=>x.flag!=='review'))void syncQueue()}catch{}}},30000);
prepareRecent();
loadHistory();
statusConnection();
try{
 readQueue();
 if(!restoreReceipt()){
  showReceipt({variant:'idle',icon:'⌁',heading:'Spremno za skeniranje',
   name:'Prinesi karticu',kind:mode,state:'ČEKA SE SKENIRANJE',
   hint:'Odmah će se pojaviti ime radnika kada Firebase potvrdi karticu.',
   message:navigator.onLine?'Spremno za skeniranje.':'Offline režim je spreman. Skeniranja se čuvaju na ovom računaru.'},false);
 }
 setSyncMessage(navigator.onLine?'Internet dostupan.':'Bez interneta: skeniranja ostaju lokalno.');
}catch(err){
 storageBroken=true;
 showReceipt({variant:'bad',icon:'!',heading:'Lokalna evidencija nije dostupna',
  state:'NE KORISTI EKRAN ZA PRIJAVU',hint:'Koristi ručnu evidenciju dok administrator ne provjeri podatke.',
  message:'Lokalna evidencija je nedostupna: '+describe(err)});
}
showQueue();
focus();
if(navigator.onLine)void syncQueue();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline pokretanje nije dostupno:',err));
