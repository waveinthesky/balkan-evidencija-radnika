import {doc,getDocFromServer,getDocs,collection,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
let archive=null,month=1; const months=['Januar','Februar','Mart','April','Maj','Juni','Juli','August','Septembar','Oktobar','Novembar','Decembar'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const ref=db=>doc(db,'records','archive2025','items','year2025');
export async function load(db){let s=await getDocFromServer(ref(db));archive=s.exists()?s.data():null;return archive}
export function settings(){return '<section class="panel"><h2>Uvoz arhive 2025.</h2><p>Istorijski podaci nisu javni: privatni JSON uvozi se jednom, samo nakon prijave administratora.</p><form id="histImport"><input type="file" name="file" accept=".json,application/json" required><button type="submit" class="btn primary">Uvezi 2025. i radnike 2026.</button></form></section>'}
export function display(){
 if(!archive)return '<section class="panel"><h2>Arhiva 2025.</h2><p>Još nije uvezena u Firebase.</p></section>';
 const mm=String(month).padStart(2,'0'),n=new Date(2025,month,0).getDate();
 const dates=Array.from({length:n},(_,i)=>'2025-'+mm+'-'+String(i+1).padStart(2,'0'));
 const cells=archive.workers.map(w=>'<tr><th style="position:sticky;left:0;background:#fff;min-width:165px;text-align:left">'+escape(w.name)+'</th>'+dates.map(day=>{
  const type=w.days?.[day]||'',sun=new Date(day+'T12:00:00').getDay()===0,holiday=archive.holidays?.[day];
  const color=type==='O'?'#f2a1a3':type==='L'?'#edd1b5':type==='N'?'#161923':type==='X'||type==='x'?'#f2bfd1':holiday?holiday.includes('Bajram')?'#2db764':'#edc75a':sun?'#285cc5':'#bae5c4';
  const fg=type==='N'||(!type&&sun)?'#fff':'#17252b';
  return '<td style="min-width:27px;height:31px;text-align:center;background:'+color+';color:'+fg+'" title="'+escape(day)+'">'+escape(type||'')+'</td>'
 }).join('')+'<th>'+dates.filter(day=>w.days?.[day]).length+'</th></tr>').join('');
 const summary=archive.workers.map(w=>'<tr><td>'+escape(w.name)+'</td><td>'+w.excelTotal+'</td><td>'+Object.keys(w.days||{}).length+'</td><td>'+w.excelEntitlement+'</td><td>'+w.excelRemaining+'</td></tr>').join('');
 return '<section class="panel"><h2>Arhiva odsustava 2025.</h2><label>Mjesec</label><select id="histMonth">'+months.map((name,i)=>'<option value="'+(i+1)+'"'+(month===i+1?' selected':'')+'>'+name+'</option>').join('')+'</select>'+
 '<p>🟩 Nema upisanog odsustva · 🟥 Odmor · 🟧 Lični razlozi · 🟦 Nedjelja · ⬛ Neplaćeno</p><div style="max-width:100%;overflow-x:auto"><table class="simpletable" style="width:max-content;min-width:100%;font-size:12px"><thead><tr><th>Radnik</th>'+dates.map((_,i)=>'<th>'+(i+1)+'</th>').join('')+'<th>∑</th></tr></thead><tbody>'+cells+'</tbody></table></div><p class="smalltext">Zelena znači samo da u Excelu nema označenog odsustva, a ne potvrdu prisustva.</p></section>'+
 '<section class="panel"><h2>Godišnji pregled 2025.</h2><div class="tablewrap"><table class="simpletable"><thead><tr><th>Radnik</th><th>Ukupno u Excelu</th><th>Po važećim datumima</th><th>Po staroj tabeli</th><th>Preostalo</th></tr></thead><tbody>'+summary+'</tbody></table></div><p class="smalltext">Zadržana su originalna zbirna stanja, uključujući napomene o nepostojećem 31. junu i Sanelinom odmoru 15. novembra.</p></section>';
}
export function bindUI(){document.addEventListener('change',e=>{if(e.target?.id==='histMonth'){month=Number(e.target.value);let container=document.getElementById('histContainer');if(container)container.innerHTML=display();}})}
export async function importData(db,api,file){
 const x=JSON.parse(await file.text());
 if(x.format!=='BALKAN-HISTORICAL-2025-1'||x.year!==2025||x.workers?.length!==9||x.newWorkers2026?.length!==4)throw Error('Neispravan istorijski fajl.');
 const dates=new Set();for(let w of x.workers){if(!w.key||!w.name||dates.has(w.key))throw Error('Dupliran radnik');dates.add(w.key);for(let [date,status] of Object.entries(w.days||{})){let d=new Date(date+'T12:00:00Z');if(!/^2025-\d\d-\d\d$/.test(date)||Number.isNaN(+d)||d.toISOString().slice(0,10)!==date||!['O','L','N','X','x'].includes(status))throw Error('Neispravan datum '+date)}}
 const old=await getDocFromServer(ref(db));if(old.exists())throw Error('Arhiva je već uvezena; dupliranje je spriječeno.');
 const existing=await getDocs(collection(db,'records','employees','items'));
 const known=new Map(existing.docs.map(s=>[norm(s.data().name),s.data()])), saves=new Map(),nonActive=new Set(x.noWorkIn2026||[]);
 for(let w of x.workers){const previous=known.get(norm(w.name));const emp=previous?{...previous}:{id:'hist25-'+w.key,name:w.name,barcode:'NEPOSTAVLJENO-'+w.key,barcodeAssigned:false,active:true,defaultLocationId:'',assignments:[],hiredAt:'',terminatedAt:'',needsSetup:true};emp.archive2025Key=w.key;if(nonActive.has(w.key)){emp.active=false;emp.inactiveBy2026=true};saves.set(emp.id,emp)}
 for(let w of x.newWorkers2026){const previous=known.get(norm(w.name));const emp=previous?{...previous}:{id:'new26-'+w.key,name:w.name,barcode:'NEPOSTAVLJENO-'+w.key,barcodeAssigned:false,active:true,defaultLocationId:'',assignments:[],hiredAt:'',terminatedAt:'',needsSetup:true};saves.set(emp.id,emp)}
 const batch=writeBatch(db);for(let e of saves.values())batch.set(doc(db,'records','employees','items',e.id),e);
 batch.set(ref(db),{...x,importedAt:serverTimestamp()});await batch.commit();archive=x;
 const fresh=await getDocs(collection(db,'records','employees','items'));await api.setCloudRows({employees:fresh.docs.map(d=>d.data())});api.render();
 return saves.size;
}