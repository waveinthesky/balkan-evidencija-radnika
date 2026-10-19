// BALKAN kasa. Svaki sken se PRVO trajno sačuva na ovom računaru (outbox), pa tek
// onda šalje u Firebase. Zeleno "POTVRĐENO" prikazuje se isključivo kad server prihvati upis.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const OUTBOX_KEY='balkan_kiosk_outbox_v1',RECENT_KEY='balkan_kiosk_lastscan_v1',HISTORY_KEY='balkan_kiosk_confirmed_v1',
 RECEIPT_KEY='balkan_kiosk_receipt_v1',BADGES_KEY='balkan_kiosk_badges_v1',LIMIT=1500,MODULE='./kiosk-firebase.js?v=20261019v6';
let mode='in',busy=false,flushing=null,transport=null,lastScan=null,history=[],receiptId=null;
const HISTORY_MAX=400,SHIFT_WINDOW_MS=18*3600000,CONFIRM_MS=30000;
let pendingConfirm=null,spawnWorker=null,syncRequested=false,includeReviewsNext=false,firebaseWarmup=null,retryTimer=null,idleTimer=null,lastServerOk=0;

// ---------- lokalni red ----------
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
const order=x=>Number(x.addedAt)||Date.parse(x.at)||0;

// ---------- prikaz ----------
function knownName(code){
 try{const b=JSON.parse(localStorage.getItem(BADGES_KEY)||'{}')[code];return b&&b.name?String(b.name):''}catch{return ''}
}
function cardLabel(code){
 // Ime samo ako je ovu karticu server ranije potvrdio na ovom računaru.
 const known=knownName(code);if(known)return known;
 const tail=String(code||'').slice(-4);
 return 'Kartica '+(tail?'••••'+tail:'bez koda');
}
function feedback(message,type=''){const el=$('status');el.textContent=message;el.className='result '+type}
function setSyncMessage(message,tone=''){const el=$('syncStatus');el.textContent=message;el.dataset.tone=tone}
// Ručno formatiranje: ne zavisi od jezičkih paketa preglednika na računaru kase.
const p2=n=>String(n).padStart(2,'0');
const DAYS=['nedjelja','ponedjeljak','utorak','srijeda','četvrtak','petak','subota'];
const MONTHS=['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
function formatWhen(x){const d=new Date(x);return p2(d.getDate())+'.'+p2(d.getMonth()+1)+'.'+d.getFullYear()+'. u '+p2(d.getHours())+':'+p2(d.getMinutes())}
function showReceipt(info,persist=true){
 const rec={id:info.id||null,variant:info.variant||'idle',heading:info.heading||'Spremno',
  name:info.name||'Prinesi karticu',kind:info.kind||'in',at:info.at||null,
  state:info.state||'',hint:info.hint||'',message:info.message||'',icon:info.icon||'⌁'};
 receiptId=rec.id;
 const box=$('receipt');
 box.className='receipt '+rec.variant;
 if(rec.variant!=='idle'&&box.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
  box.animate([{transform:'scale(.985)',boxShadow:'0 0 0 10px rgba(80,120,170,.25)'},{transform:'none',boxShadow:'none'}],{duration:450,easing:'ease-out'});
 $('receiptIcon').textContent=rec.icon;
 $('receiptHeading').textContent=rec.heading;
 $('receiptPerson').textContent=rec.name;
 $('receiptKind').textContent=rec.kind==='out'?'↗ ODLAZAK':'↘ DOLAZAK';
 $('receiptKind').dataset.kind=rec.kind;
 $('receiptTime').textContent=rec.at?formatWhen(rec.at):'Čeka se skeniranje';
 $('receiptState').textContent=rec.state;
 $('receiptHint').textContent=rec.hint;
 feedback(rec.message,rec.variant==='ok'?'ok':rec.variant==='bad'?'bad':'');
 if(persist){try{localStorage.setItem(RECEIPT_KEY,JSON.stringify(rec))}catch{}}
 clearTimeout(idleTimer);
 // Završen rezultat (zeleno/crveno) ostaje 25 s, pa se ekran vraća na "Spremno".
 if(rec.variant==='ok'||rec.variant==='bad'||rec.variant==='warn')idleTimer=setTimeout(()=>{if(receiptId===rec.id)showIdle()},rec.variant==='warn'?CONFIRM_MS:25000);
}
function showIdle(){
 showReceipt({variant:'idle',icon:'⌁',heading:'Spremno za skeniranje',name:'Prinesi karticu',kind:mode,
  state:'ČEKA SE SKENIRANJE',hint:'Izaberi DOLAZAK ili ODLAZAK, pa skeniraj karticu.',
  message:navigator.onLine?'Spremno za skeniranje.':'Offline režim: skeniranja se čuvaju na ovom računaru.'},false);
 try{localStorage.removeItem(RECEIPT_KEY)}catch{}
}
function restoreReceipt(){
 try{
  const rec=JSON.parse(localStorage.getItem(RECEIPT_KEY)||'null');
  if(!rec||!['pending','ok','bad'].includes(rec.variant))return false;
  const queued=rec.id&&readQueue().find(x=>x.id===rec.id);
  if(queued&&rec.variant==='ok'){rec.variant='pending';rec.state='SAČUVANO NA OVOM RAČUNARU';rec.heading='Čeka se potvrda';rec.hint='Zapis još nije potvrđen u Firebase bazi.'}
  if(!queued&&rec.variant==='pending'){rec.variant='idle';rec.state='Provjeri evidenciju';rec.hint='Prethodni zapis nije više na čekanju. Provjeri posljednja skeniranja.'}
  showReceipt(rec,false);
  return true;
 }catch{return false}
}
function loadHistory(){
 try{const data=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
  history=Array.isArray(data)?data.filter(x=>x&&typeof x.name==='string'&&typeof x.at==='string').slice(0,HISTORY_MAX):[]}catch{history=[]}
}
function saveHistory(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,HISTORY_MAX)))}catch{}}
function connection(){
 const el=$('connection');
 let text,cls;
 if(!navigator.onLine){text='● Bez interneta – čuvam lokalno';cls='status-offline'}
 else if(lastServerOk&&Date.now()-lastServerOk<10*60000){text='● Firebase dostupan';cls='status-online'}
 else{text='● Internet dostupan';cls='status-neutral'}
 el.textContent=text;el.className='pill '+cls;
}
function explain(code,message,stage){
 const c=String(code||'');
 if(c==='permission-denied'&&stage==='badge')return 'Firebase odbija upis: server ne dozvoljava kasi ni da pročita karticu, jer ispravna pravila nisu objavljena. Lokalni zapis je sačuvan. Administrator mora objaviti pravila (Firestore → Rules → Publish).';
 if(c==='permission-denied')return 'Firebase odbija upis: sigurnosna pravila na serveru ne dozvoljavaju ovaj zapis. Lokalni zapis je sačuvan. Administrator mora objaviti ispravna pravila (Firestore → Rules → Publish).';
 if(c==='auth/operation-not-allowed'||c==='auth/admin-restricted-operation')return 'U Firebase konzoli nije uključena anonimna prijava (Authentication → Sign-in method → Anonymous).';
 if(c==='auth/network-request-failed'||c==='unavailable'||c==='slow-server'||c==='offline')return 'Veza sa serverom je spora ili prekinuta. Zapis je sačuvan i šalje se automatski.';
 if(c==='invalid-card')return 'Kartica nije pronađena ili nije aktivna u bazi. Administrator treba provjeriti radnika i barkod.';
 if(c==='invalid-assignment')return 'Radniku nije dodijeljen market. Administrator treba urediti radnika.';
 if(c==='auth/api-key-not-valid'||c.startsWith('auth/invalid-api-key'))return 'Firebase konfiguracija nije ispravna.';
 return String(message||code||'Nepoznata greška');
}
function showQueue(){
 let items;
 try{items=readQueue()}catch(e){
  $('queueState').textContent='⚠ Lokalna evidencija nije dostupna: '+e.message;$('queueRetry').disabled=true;return;
 }
 const waiting=items.filter(x=>x.flag!=='review').length,review=items.length-waiting;
 $('queueState').textContent=waiting?
  waiting+' '+(waiting===1?'zapis čeka':'zapisa čeka')+' slanje u Firebase'+(review?', '+review+' za provjeru':'')+'.':
  review?review+' '+(review===1?'zapis zahtijeva':'zapisa zahtijevaju')+' provjeru.':'Nema zapisa na čekanju.';
 $('queueCount').textContent=String(items.length);
 $('queueBox').dataset.state=review?'bad':waiting?'pending':'ok';
 $('queueRetry').disabled=!navigator.onLine||!items.length||!!flushing;
 const pending=items.map(x=>({id:x.id,name:cardLabel(x.barcode),kind:x.kind,at:x.at,
  error:x.error||'',
  state:x.flag==='review'?'POTREBNA PROVJERA':x.error?'GREŠKA – ČEKA PONOVNI POKUŠAJ':'ČEKA SLANJE',
  tone:x.flag==='review'||x.errorCode==='permission-denied'?'bad':'pending'}));
 const confirmed=history.map(x=>({...x,state:'POTVRĐENO U FIREBASEU',tone:'ok'}));
 const combined=[...pending,...confirmed].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,25);
 $('events').innerHTML=combined.map(x=>'<div class="item '+x.tone+'"><span class="dot"></span><div class="item-info">'+
  '<div class="item-name">'+esc(x.name)+'</div>'+
  '<div class="item-sub"><b class="k-'+x.kind+'">'+(x.kind==='in'?'↘ DOLAZAK':'↗ ODLAZAK')+'</b>'+(x.error?' · '+esc(x.error.slice(0,180)):'')+'</div></div>'+
  '<div class="item-right"><div class="item-time">'+esc(formatWhen(x.at))+'</div>'+
  '<span class="item-state '+x.tone+'">'+esc(x.state)+'</span></div></div>').join('')||
  '<div class="empty">Nema skeniranja na ovom računaru.</div>';
 connection();
}
function setMode(value){
 mode=value;
 if($('receipt').classList.contains('idle')){$('receiptKind').textContent=value==='out'?'↗ ODLAZAK':'↘ DOLAZAK';$('receiptKind').dataset.kind=value}
 $('modeIn').className='mode mode-in'+(value==='in'?' on':'');
 $('modeOut').className='mode mode-out'+(value==='out'?' out':'');
 $('modeIn').setAttribute('aria-pressed',String(value==='in'));
 $('modeOut').setAttribute('aria-pressed',String(value==='out'));
 document.body.dataset.mode=value;
 focus();
}
function focus(){
 // Skener radi kao tastatura; fokus mora biti na polju za barkod.
 setTimeout(()=>{
  const input=$('barcode'),active=document.activeElement;
  if(active&&active!==input&&active.closest?.('#diag input,#diag textarea'))return;
  if(input&&!input.disabled&&!document.hidden){try{input.focus({preventScroll:true})}catch{input.focus()}}
 },0);
}
// Skener piše u aktivni element; preusmjeri obične znakove u polje za barkod.
document.addEventListener('keydown',event=>{
 const input=$('barcode');
 if(!input||input.disabled||document.hidden||event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
 const fromBarcode=event.target===input;
 const otherField=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
 if(fromBarcode){
  if(event.key==='Tab'&&input.value.trim()){event.preventDefault();input.form.requestSubmit()}
  return;
 }
 if(otherField)return;
 if((event.key==='Enter'||event.key==='Tab')&&input.value.trim()){
  event.preventDefault();input.focus({preventScroll:true});input.form.requestSubmit();return;
 }
 if(event.key.length===1){
  event.preventDefault();input.focus({preventScroll:true});
  const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
  input.setRangeText(event.key,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
 }
},true);
document.addEventListener('click',event=>{
 if(!event.target?.closest?.('a,input,textarea,select,summary,[contenteditable="true"]'))focus();
});
window.addEventListener('focus',focus);
function duplicate(code,kind,now,items){
 if(items.findLast(x=>x.barcode===code&&x.kind===kind&&now-new Date(x.at).getTime()<60000&&now>=new Date(x.at).getTime()))return true;
 return lastScan?.code===code&&lastScan?.kind===kind&&now-lastScan.at<60000;
}
// SIGURNOSNO PRAVILO SMJENE (na osnovu skeniranja na ovom računaru u zadnjih 18 h):
//  • isti radnik ne može dva puta zaredom DOLAZAK, niti dva puta zaredom ODLAZAK;
//  • ODLAZAK bez prethodnog DOLASKA traži potvrdu ponovnim skeniranjem u roku od 30 s.
function lastLocalScan(code,now,items){
 const all=[...items.filter(x=>x.flag!=='review'),...history.filter(x=>x.barcode)];
 let last=null;
 for(const x of all){
  if(x.barcode!==code)continue;
  const t=Date.parse(x.at);
  if(!(t<=now)||now-t>SHIFT_WINDOW_MS)continue;
  if(!last||t>Date.parse(last.at))last=x;
 }
 return last;
}
function clock(at){const d=new Date(at);return p2(d.getHours())+':'+p2(d.getMinutes())}
function prepareRecent(){
 try{const item=JSON.parse(localStorage.getItem(RECENT_KEY)||'null');if(item&&typeof item.code==='string'&&Number.isFinite(item.at))lastScan=item}catch{}
}
function markRecent(code,kind,at){lastScan={code,kind,at};try{localStorage.setItem(RECENT_KEY,JSON.stringify(lastScan))}catch{}}
function manualReview(err){return ['invalid-card','invalid-assignment'].includes(err?.code)}
function boundedUpload(sender,item){
 return new Promise((resolve,reject)=>{
  let finished=false;
  const done=(error,value)=>{
   if(finished)return;finished=true;
   clearTimeout(timeout);window.removeEventListener('offline',onOffline);
   if(error)reject(error);else resolve(value);
  };
  const onOffline=()=>done(Object.assign(new Error('Internet je nestao tokom slanja; zapis ostaje lokalno.'),{code:'offline'}));
  const timeout=setTimeout(()=>done(Object.assign(new Error('Server nije odgovorio za 20 sekundi; zapis je sačuvan i šalje se ponovo.'),{code:'slow-server'})),20000);
  window.addEventListener('offline',onOffline,{once:true});
  Promise.resolve().then(()=>sender.sendQueuedScan(item)).then(value=>done(null,value),error=>done(error));
 });
}
function describe(err){return explain(err?.code,err?.message||String(err||''),err?.stage)}

// ---------- slanje ----------
function backoffMs(item){
 const n=Math.max(1,Number(item.attempts)||1);
 if(item.flag==='review')return 5*60000; // karticu je možda administrator u međuvremenu ispravio
 return Math.min(60000,2000*Math.pow(2,n-1));
}
function due(item,manual){return manual||!item.nextTryAt||Number(item.nextTryAt)<=Date.now()}
function scheduleRetry(){
 clearTimeout(retryTimer);retryTimer=null;
 let items;try{items=readQueue()}catch{return}
 if(!items.length||!navigator.onLine)return;
 const next=Math.min(...items.map(x=>Number(x.nextTryAt)||0));
 retryTimer=setTimeout(()=>{retryTimer=null;if(navigator.onLine)void syncQueue()},Math.max(500,next-Date.now()));
}
function warmFirebase(){
 if(!navigator.onLine)return Promise.resolve(null);
 if(!firebaseWarmup){
  firebaseWarmup=import(MODULE).then(async sender=>{transport=sender;await sender.warmFirebase();return sender})
   .catch(err=>{firebaseWarmup=null;throw err});
 }
 return firebaseWarmup;
}
function syncQueue(includeReview=false){
 const manual=includeReview;
 if(flushing){
  // Novi sken dok prethodni zapis još čeka server: odmah pokreni dodatno slanje,
  // da sljedeći radnik ne čeka spori zapis nekog drugog.
  if(spawnWorker&&!includeReview)spawnWorker();
  else{syncRequested=true;if(includeReview)includeReviewsNext=true}
  return flushing;
 }
 if(!navigator.onLine){showQueue();return Promise.resolve()}
 flushing=(async()=>{
  let sent=0,failed='',failedCode='';
  setSyncMessage('Šaljem zapise u Firebase…');
  $('queueRetry').disabled=true;
  try{
   if(!readQueue().length){setSyncMessage('Nema zapisa na čekanju.','ok');return}
   let sender=transport;
   if(!sender){
    try{sender=await import(MODULE)}catch(err){throw Object.assign(new Error('Firebase modul se ne može učitati: '+(err.message||err)),{code:'offline'})}
    transport=sender;
   }
   const tried=new Set();
   // Red ide od NAJSTARIJEG zapisa. Zapisi su nezavisni (svaki ima svoje vrijeme i ID),
   // pa jedan zapis koji ne prolazi NE blokira nijedan drugi, ni iste kartice.
   async function worker(){
    while(navigator.onLine){
     // Svaki zapis najviše JEDNOM po prolazu; neuspjeli čeka svoj sljedeći termin.
     const current=readQueue().sort((a,b)=>order(a)-order(b)).find(x=>!tried.has(x.id)&&due(x,manual));
     if(!current)return;
     tried.add(current.id);
     try{
      const confirmed=await boundedUpload(sender,current);
      saveQueue(readQueue().filter(x=>x.id!==current.id));
      history=history.filter(x=>x.id!==current.id);
      history.unshift({id:current.id,barcode:current.barcode,name:confirmed.name,kind:confirmed.kind,at:confirmed.at,locationId:confirmed.locationId});
      history=history.slice(0,HISTORY_MAX);saveHistory();
      lastServerOk=Date.now();
      if(receiptId===current.id)showReceipt({
       id:current.id,variant:'ok',icon:'✓',heading:'Uspješno evidentirano',name:confirmed.name,
       kind:confirmed.kind,at:confirmed.at,state:'POTVRĐENO U FIREBASE BAZI',
       hint:'Prijava je upisana u centralnu evidenciju i vidljiva je administratoru.',
       message:'Potvrđeno u Firebase bazi: '+confirmed.name+' · '+(confirmed.kind==='in'?'DOLAZAK':'ODLAZAK')
      });
      $('location').textContent=confirmed.locationId==='m1'?'Market 1':confirmed.locationId==='m2'?'Market 2':String(confirmed.locationId);
      sent++;
      setSyncMessage('Firebase potvrdio '+sent+' '+(sent===1?'zapis':'zapisa')+'…','ok');
     }catch(err){
      const reason=describe(err),items=readQueue(),record=items.find(x=>x.id===current.id);
      if(record){
       record.error=reason;record.errorDetail=String(err?.message||err);record.errorCode=String(err?.code||'');record.errorStage=String(err?.stage||'');
       record.lastTriedAt=Date.now();record.attempts=(Number(record.attempts)||0)+1;
       if(manualReview(err))record.flag='review';
       record.nextTryAt=Date.now()+backoffMs(record);
       saveQueue(items);
      }
      if(manualReview(err)){
       if(receiptId===current.id)showReceipt({id:current.id,variant:'bad',icon:'!',heading:'Karticu treba provjeriti',
        name:cardLabel(current.barcode),kind:current.kind,at:current.at,state:'NIJE POTVRĐENO U FIREBASEU',
        hint:reason+' Obrati se administratoru.',message:'Zapis ostaje na ovom računaru za provjeru.'});
      }else{
       failed=reason;failedCode=String(err?.code||'');
       if(receiptId===current.id)showReceipt({id:current.id,variant:err?.code==='permission-denied'?'bad':'pending',
        icon:err?.code==='permission-denied'?'!':'⏳',heading:err?.code==='permission-denied'?'Server odbija upis':'Čeka se potvrda',
        name:cardLabel(current.barcode),kind:current.kind,at:current.at,
        state:err?.code==='permission-denied'?'NIJE POTVRĐENO · SAČUVANO NA OVOM RAČUNARU':'SAČUVANO NA OVOM RAČUNARU',
        hint:reason,message:'Sačuvano NA OVOM RAČUNARU, nije potvrđeno u Firebase bazi.'});
      }
     }finally{showQueue()}
    }
   }
   const active=new Set();
   spawnWorker=()=>{if(active.size>=8)return;const w=worker().finally(()=>active.delete(w));active.add(w)};
   spawnWorker();spawnWorker();spawnWorker();
   while(active.size)await Promise.race(active);
  }catch(err){failed=describe(err);failedCode=String(err?.code||'')}
  showQueue();
  const remaining=readQueue(),count=remaining.filter(x=>x.flag!=='review').length,review=remaining.length-count;
  if(failed)setSyncMessage('Neuspjelo slanje: '+failed+' ('+count+' čeka; novi pokušaj automatski).','bad');
  else if(review)setSyncMessage('Potvrđeno: '+sent+'. Za provjeru: '+review+'.','bad');
  else if(count)setSyncMessage('Potvrđeno: '+sent+'. Preostalo za slanje: '+count+' (automatski).');
  else if(sent)setSyncMessage('Firebase potvrdio '+sent+' '+(sent===1?'zapis':'zapisa')+'. Nema zapisa na čekanju.','ok');
  else setSyncMessage('Nema zapisa na čekanju.','ok');
  if(failedCode)$('queueBox').dataset.code=failedCode;else delete $('queueBox').dataset.code;
 })().finally(()=>{
  flushing=null;spawnWorker=null;showQueue();focus();scheduleRetry();
  const again=syncRequested,reviews=includeReviewsNext;
  syncRequested=false;includeReviewsNext=false;
  if(navigator.onLine&&again)setTimeout(()=>void syncQueue(reviews),0);
 });
 return flushing;
}

// ---------- dijagnostika ----------
async function runDiagnostics(){
 const out=$('diagOut'),btn=$('diagRun');
 const rows=[];
 const paint=()=>{out.innerHTML=rows.map(r=>'<li class="'+(r.ok===true?'ok':r.ok===false?'bad':'')+'"><b>'+(r.ok===true?'✓':r.ok===false?'✗':'•')+' '+esc(r.name)+'</b><span>'+esc(r.detail||'')+'</span></li>').join('')};
 btn.disabled=true;
 rows.push({ok:navigator.onLine,name:'Internet',detail:navigator.onLine?'Preglednik javlja da je internet dostupan.':'Nema interneta. Skeniranja se čuvaju lokalno.'});paint();
 let items=[];try{items=readQueue()}catch{}
 rows.push({ok:null,name:'Lokalni red',detail:items.length+' zapisa na ovom računaru'});paint();
 const lastErr=items.filter(x=>x.errorCode||x.error).sort((a,b)=>(b.lastTriedAt||0)-(a.lastTriedAt||0))[0];
 if(navigator.onLine){
  try{
   const sender=transport||await import(MODULE);transport=sender;
   rows.push({ok:true,name:'Firebase modul',detail:'Učitan'});paint();
   const code=lastScan?.code||items[0]?.barcode||'';
   for(const s of await sender.diagnose(code)){
    rows.push({ok:s.ok,name:s.name,detail:s.ok?s.detail:explain(s.code,s.detail,'badge')+' ['+(s.code||'greška')+']'});paint();
    if(s.ok)lastServerOk=Date.now();
   }
  }catch(err){rows.push({ok:false,name:'Firebase modul',detail:describe(err)});paint()}
 }
 if(lastErr)rows.push({ok:false,name:'Posljednja greška upisa',detail:lastErr.error+' ['+(lastErr.errorCode||'?')+'] · '+cardLabel(lastErr.barcode)+' · pokušaja: '+(lastErr.attempts||0)});
 else rows.push({ok:null,name:'Posljednja greška upisa',detail:'Nema zabilježenih grešaka.'});
 paint();btn.disabled=false;connection();focus();
}

// ---------- događaji ----------
$('modeIn').addEventListener('click',()=>setMode('in'));
$('modeOut').addEventListener('click',()=>setMode('out'));
$('queueRetry').addEventListener('click',async()=>{
 if(!navigator.onLine){setSyncMessage('Nema interneta. Lokalni zapisi ostaju sačuvani.','bad');return}
 await syncQueue(true);
});
$('diagRun').addEventListener('click',()=>void runDiagnostics());
$('scanForm').addEventListener('submit',e=>{
 e.preventDefault();
 const code=$('barcode').value.trim().toUpperCase(),selectedMode=mode,now=Date.now();
 $('barcode').value='';
 if(!code||busy)return;
 busy=true;
 try{
  const items=readQueue();
  if(items.length>=LIMIT)throw Error('Lokalna evidencija je puna. Zatraži pomoć administratora.');
  const last=lastLocalScan(code,now,items);
  if(last&&last.kind===selectedMode){
   const name=cardLabel(code);
   showReceipt({variant:'warn',icon:'i',heading:'Već evidentirano – novi zapis nije potreban',name,kind:selectedMode,at:last.at,
    state:selectedMode==='in'?'VEĆ SI PRIJAVLJEN OD '+clock(last.at):'VEĆ SI ODJAVLJEN U '+clock(last.at),
    hint:selectedMode==='in'?'Tvoj DOLAZAK u '+clock(last.at)+' je već sačuvan. Za kraj smjene izaberi ODLAZAK pa skeniraj karticu.':
     'Tvoj ODLAZAK u '+clock(last.at)+' je već sačuvan. Ako dolaziš na posao, izaberi DOLAZAK pa skeniraj karticu.',
    message:'Ponovljena radnja nije upisana, da obračun sati ostane tačan. Ako je ovo greška, javi administratoru.'});
   pendingConfirm=null;
   return;
  }
  if(selectedMode==='out'&&!last){
   const confirmed=pendingConfirm&&pendingConfirm.code===code&&now-pendingConfirm.at<CONFIRM_MS;
   if(!confirmed){
    pendingConfirm={code,at:now};
    showReceipt({variant:'warn',icon:'?',heading:'Potrebna potvrda',name:cardLabel(code),kind:'out',at:new Date(now).toISOString(),
     state:'NEMA DOLASKA NA OVOJ KASI',
     hint:'Na ovoj kasi nema tvog DOLASKA u zadnjih 18 sati. Ako zaista odlaziš, skeniraj karticu JOŠ JEDNOM u roku od 30 sekundi. Ako dolaziš, izaberi DOLAZAK.',
     message:'Ništa još nije upisano.'});
    return;
   }
  }
  pendingConfirm=null;
  if(duplicate(code,selectedMode,now,items)){
   showReceipt({variant:'bad',icon:'!',heading:'Ponovljeno skeniranje',name:cardLabel(code),
    kind:selectedMode,at:new Date(now).toISOString(),state:'NIJE DODAT NOVI ZAPIS',
    hint:'Ista kartica je već skenirana za '+(selectedMode==='in'?'DOLAZAK':'ODLAZAK')+' u posljednjih 60 sekundi.',
    message:'Ponovljeno skeniranje u kratkom roku je zaustavljeno.'});
   return;
  }
  const item={id:crypto.randomUUID(),barcode:code,kind:selectedMode,at:new Date(now).toISOString(),
   addedAt:now,offlineAtCapture:!navigator.onLine,flag:'queued'};
  saveQueue([...items,item]); // lokalni upis potvrđen PRIJE slanja
  markRecent(code,selectedMode,now);
  const name=cardLabel(code);
  showReceipt({id:item.id,variant:'pending',icon:'⏳',heading:navigator.onLine?'Šaljem u Firebase…':'Sačuvano bez interneta',
   name,kind:selectedMode,at:item.at,state:'SAČUVANO NA OVOM RAČUNARU',
   hint:navigator.onLine?'Prijava je sačuvana. Čekam potvrdu centralne baze (obično ispod 1 sekunde).':'Nema interneta. Zapis će se automatski poslati kada se veza vrati.',
   message:'Sačuvano NA OVOM RAČUNARU: '+(selectedMode==='in'?'DOLAZAK':'ODLAZAK')+'. Još NIJE potvrđeno u Firebase bazi.'});
  showQueue();
  setSyncMessage(navigator.onLine?'Slanje u Firebase je u toku…':'Nema interneta – čekaju lokalni zapisi.');
  if(navigator.onLine)void syncQueue();
 }catch(err){
  showReceipt({variant:'bad',icon:'!',heading:'Skeniranje nije sačuvano',name:cardLabel(code),kind:selectedMode,
   at:new Date(now).toISOString(),state:'NIJE EVIDENTIRANO',hint:'Koristi rezervnu ručnu evidenciju i obavijesti administratora.',
   message:'NIJE SAČUVANO: '+describe(err)});
 }finally{busy=false;showQueue();focus()}
});
window.addEventListener('offline',()=>{showQueue();setSyncMessage('Offline: novi skenovi se čuvaju na ovom računaru.')});
window.addEventListener('online',()=>{showQueue();setSyncMessage('Internet je ponovo dostupan; šaljem zapise…');void warmFirebase().catch(()=>{});void syncQueue()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void syncQueue()});
setInterval(()=>{if(navigator.onLine&&!flushing){try{if(readQueue().some(x=>due(x,false)))void syncQueue()}catch{}}},30000);
function tick(){
 const now=new Date();
 $('clockTime').textContent=p2(now.getHours())+':'+p2(now.getMinutes())+':'+p2(now.getSeconds());
 $('clockDate').textContent=DAYS[now.getDay()]+', '+now.getDate()+'. '+MONTHS[now.getMonth()]+' '+now.getFullYear()+'.';
}
tick();setInterval(tick,1000);

// ---------- start ----------
prepareRecent();loadHistory();
try{
 readQueue();
 if(!restoreReceipt())showIdle();
 setSyncMessage(navigator.onLine?'Internet dostupan.':'Bez interneta: skeniranja ostaju lokalno.');
}catch(err){
 showReceipt({variant:'bad',icon:'!',heading:'Lokalna evidencija nije dostupna',state:'NE KORISTI EKRAN ZA PRIJAVU',
  hint:'Koristi ručnu evidenciju dok administrator ne provjeri podatke.',message:'Lokalna evidencija je nedostupna: '+describe(err)});
}
setMode('in');showQueue();focus();
if(navigator.onLine){
 void warmFirebase().then(()=>{lastServerOk=lastServerOk||0;connection()}).catch(err=>{
  setSyncMessage('Firebase veza još nije spremna: '+describe(err)+' Prijave se čuvaju lokalno.','bad');
 });
 void syncQueue();
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline pokretanje nije dostupno:',err));
