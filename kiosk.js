// Kiosk radi i bez Firebase modula dok nema interneta. Svaki sken prvo ide u trajni outbox.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const OUTBOX_KEY='balkan_kiosk_outbox_v1',RECENT_KEY='balkan_kiosk_lastscan_v1',LIMIT=1500;
let mode='in',busy=false,flushing=null,transport=null,lastScan=null,history=[];
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
function formatWhen(x){return new Date(x).toLocaleString('bs-BA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}
function connection(message,online=false){
 $('connection').textContent=message;
 $('connection').style.background=online?'#e4f8ee':'#fff0db';
}
function showQueue(){
 let items;
 try{items=readQueue();storageBroken=false}catch(e){
  storageBroken=true;$('queueState').textContent='⚠ Lokalna evidencija nije dostupna: '+e.message;
  return;
 }
 const waiting=items.filter(x=>x.flag!=='review').length,review=items.length-waiting;
 $('queueState').textContent='Na ovom računaru: '+waiting+' zapisa čeka slanje'+(review?', '+review+' za provjeru':'')+'.'+
  (waiting||review?' Nemoj brisati podatke preglednika niti koristiti privatni režim rada.':'');
 $('queueRetry').disabled=!navigator.onLine||!items.length||!!flushing;
 const combined=[
  ...items.slice(-15).reverse().map(x=>({name:x.flag==='review'?'⚠ Potrebna provjera':'⏳ Čeka Firebase',kind:x.kind,time:formatWhen(x.at)})),
  ...history
 ].slice(0,20);
 $('events').innerHTML=combined.map(x=>'<div class="item"><span><b>'+esc(x.name)+'</b> · '+
  (x.kind==='in'?'Dolazak':'Odlazak')+'</span><span>'+esc(x.time)+'</span></div>').join('')||
  'Nema prijava na ovom računaru.';
}
function setMode(value){
 mode=value;
 $('modeIn').className='mode'+(value==='in'?' on':'');
 $('modeOut').className='mode'+(value==='out'?' out':'');
 focus();
}
function focus(){setTimeout(()=>$('barcode')?.focus(),0)}
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
function describe(err){
 if(err?.code==='permission-denied')return 'Firebase odbija upis. Provjeri sigurnosna pravila; lokalni zapis je sačuvan.';
 return String(err?.message||err||'Nepoznata greška');
}
function syncQueue(includeReview=false){
 if(flushing)return flushing;
 if(!navigator.onLine){statusConnection();return Promise.resolve()}
 flushing=(async()=>{
  let sent=0,needsReview=0,failed='';
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
     const confirmed=await sender.sendQueuedScan(current);
     const other=readQueue().filter(x=>x.id!==current.id);
     saveQueue(other);
     history.unshift({name:confirmed.name,kind:confirmed.kind,time:formatWhen(confirmed.at)});
     history=history.slice(0,20);
     $('location').textContent='Objekat: '+(confirmed.locationId==='m1'?'Market 1':confirmed.locationId==='m2'?'Market 2':confirmed.locationId);
     sent++;
    }catch(err){
     if(manualReview(err)){
      const items=readQueue(),record=items.find(x=>x.id===current.id);
      if(record){record.flag='review';record.error=describe(err);saveQueue(items)}
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
   feedback('Slanje nije završeno: '+failed+' Preostalo na ovom računaru: '+count+'.','bad');
  }else if(review||needsReview){
   feedback('Zapisi za provjeru: '+review+'. Ništa nije izbrisano. Provjeri kartice i pokušaj ponovo.','bad');
  }else if(sent){
   feedback('Potvrđeno u Firebase bazi: poslano '+sent+' '+(sent===1?'skeniranje':'skeniranja')+'.','ok');
  }else if(count){
   feedback('Lokalno sačuvano: '+count+' zapisa čeka slanje.');
  }
 })().finally(()=>{flushing=null;showQueue();focus()});
 return flushing;
}
$('modeIn').addEventListener('click',()=>setMode('in'));
$('modeOut').addEventListener('click',()=>setMode('out'));
$('queueRetry').addEventListener('click',async()=>{
 if(!navigator.onLine){feedback('Nema interneta. Lokalni zapisi ostaju sačuvani.','bad');return}
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
   feedback('Ponovljeno skeniranje u kratkom roku je zaustavljeno.','bad');
   return;
  }
  const item={id:crypto.randomUUID(),barcode:code,kind:selectedMode,at:new Date(now).toISOString(),
   addedAt:now,offlineAtCapture:!navigator.onLine,flag:'queued'};
  saveQueue([...items,item]); // Moramo imati potvrdu lokalnog upisa PRIJE ikakvog slanja.
  markRecent(code,selectedMode,now);showQueue();
  feedback('Sačuvano NA OVOM RAČUNARU: '+(selectedMode==='in'?'DOLAZAK':'ODLAZAK')+
   ' u '+formatWhen(item.at)+'. '+(navigator.onLine?'Šalje se u Firebase…':'Čeka povratak interneta.')+
   ' Nije još potvrđeno u Firebase bazi.');
  if(navigator.onLine)await syncQueue();
 }catch(err){
  feedback('NIJE SAČUVANO: '+describe(err)+' Koristi rezervnu ručnu evidenciju!','bad');
 }finally{busy=false;$('barcode').disabled=false;showQueue();focus()}
});
window.addEventListener('offline',()=>{statusConnection();feedback('Nema interneta. Novi skenovi se čuvaju samo na ovom računaru.')});
window.addEventListener('online',()=>{statusConnection();void syncQueue()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void syncQueue()});
setInterval(()=>{if(navigator.onLine&&!flushing){try{if(readQueue().some(x=>x.flag!=='review'))void syncQueue()}catch{}}},30000);
prepareRecent();
statusConnection();
try{readQueue();feedback(navigator.onLine?
 'Spremno za skeniranje. Novi zapis se prvo čuva lokalno pa šalje Firebaseu.':
 'Offline režim je spreman. Skeniranja se čuvaju na ovom računaru i šalju kada se internet vrati.')}
catch(err){storageBroken=true;feedback('Lokalna evidencija je nedostupna: '+describe(err)+' Ne koristi ovaj ekran dok ne sačuvaš podatke.','bad')}
focus();
if(navigator.onLine)void syncQueue();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline pokretanje nije dostupno:',err));
