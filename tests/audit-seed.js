// Realističan skup: 30 radnika, 2 marketa, 2 smjene, skeniranja od 5.1. do juče, odsustva, GO, bolovanje, praznici.
window.__seedAudit=function(){
 const S=window.BALKAN_V6.state(),locs=S.locations.map(l=>l.id),t=today(),y=Number(t.slice(0,4));
 let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
 const add=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
 const names=['Amra Hodžić','Edin Lukač','Sanja Perović','Nikola Vuković','Mirela Đurović','Haris Mehović','Jelena Kovačević','Adnan Bećirović','Belisa Žarić','Veza Kurtagić','Melis Šabović','Ena Delić','Selma Husović','Dino Ramović','Lejla Kočan','Emir Hot','Aida Murić','Tarik Đokić','Sabina Ličina','Kenan Adrović','Nermina Pepić','Admir Kalač','Elma Šehović','Jasmin Bralić','Medina Gutić','Almir Feratović','Ilda Hasanović','Senad Muratović','Zerina Kujević','Vedad Omeragić'];
 const emps=names.map((n,i)=>({id:'A'+i,name:n,barcode:newEan13(),barcodeAssigned:true,active:true,hiredAt:i<26?(y-3)+'-02-01':y+'-0'+(3+i-26)+'-15',defaultLocationId:locs[i%2],assignments:[{from:(y-3)+'-02-01',locationId:locs[i%2]}],position:'Prodavac',residence:'Bar',contract:'na određeno vrijeme',defaultShift:i%3===0?'2':'1'}));
 S.employees.push(...emps);
 for(const e of emps)S.leaveGrants.push({id:'g'+e.id,empId:e.id,year:y,days:e.id.length%2?24:20,weekdays:[1,2,3,4,5,6]});
 let n=0;const start=y+'-01-05';
 for(const e of emps){
  const late=e.defaultShift==='2';
  for(let d=e.hiredAt>start?e.hiredAt:start;d<t;d=add(d,1)){
   const loc=assigned(e,d);if(!loc||!isWorking(loc,d))continue;
   const r=rnd();
   if(r<0.05)continue;                       // nije došao (N)
   if(r<0.08){S.overrides.push({id:'o'+(n++),empId:e.id,locId:loc,date:d,status:'GO'});continue}
   const h=late?14:7,m=Math.floor(rnd()*25)-10,inAt=new Date(d+'T00:00:00');inAt.setHours(h,30+m,0,0);
   const outAt=new Date(inAt.getTime()+(7.5+rnd())*3600000);
   S.events.push({id:'i'+(n++),empId:e.id,locId:loc,kind:'in',at:inAt.toISOString(),source:'barcode'});
   if(rnd()>0.02)S.events.push({id:'u'+(n++),empId:e.id,locId:loc,kind:'out',at:outAt.toISOString(),source:'barcode'});
  }
 }
 emps[3].sickLeaves=[{id:'sk',from:add(t,-40),to:add(t,-30)}];
 for(const [l,a,b] of [['Nova godina','01-01','01-02'],['Praznik rada','05-01','05-02'],['Dan nezavisnosti','05-21','05-22'],['Dan državnosti','07-13','07-14']])
  S.holidays.push({id:'h'+a,date:y+'-'+a,endDate:y+'-'+b,type:'state',label:l,locationId:null,employeeId:null,paid:true});
 return {employees:S.employees.length,events:S.events.length,overrides:S.overrides.length};
};
