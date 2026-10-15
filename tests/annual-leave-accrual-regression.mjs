import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regresijski test stvarnog JS izvora bez veze s Firebase bazom.
const src=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
function part(from,to){
 const start=src.indexOf(from),end=src.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'Kod sadrzi potrebnu funkciju: '+from);
 return src.slice(start,end);
}
const mk=(y,m,d)=>[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
const leaveCode=[
 part('function annualEntitlementSuggestion(','function likelyLeaveReviewDays('),
 part('function balkanCompletedServiceMonths(','function agreedAnnualTodaySummary('),
 part('function agreedAnnualTodaySummary(','const _annualPriorPage'),
 part('function balkanCarryAudit(','function balkanLeaveDashboard('),
 part('function balkanLeaveDashboard(','yearLeaveSummary=function')
].join('\n');
function balance(asOf,hired,quota,carry,dates,deadline){
 const worker={id:'r1',name:'Test',hiredAt:hired,terminatedAt:'',defaultLocationId:'m1',
 leaveQuotaByYear:{2026:quota},leaveCarryByYear:{2026:carry},leaveCarryDeadlineByYear:{2026:deadline}};
 const S={leaveDecisions:[{empId:'r1',year:2026,status:'issued',days:dates}],events:[],overrides:[]};
 const used=dates.filter(d=>d<=asOf).length,planned=dates.length-used;
 const ctx={S,ymd:mk,today:()=>asOf,leaveGrant:()=>null,assigned:()=> 'm1',
  getSchedule:()=>({days:[1,2,3,4,5,6]}),leaveCount:()=>({used,upcoming:planned,autoDays:0}),
  manualLeaveDates:()=>[],agreedAnnualDates:()=>[],employeeAt:()=>true,isWorking:()=>true,
  holiday:()=>null,sickLeaveAt:()=>null,dateOfEvent:()=>'',_balkanLeaveSummaryBeforeCarryAudit:()=>({used,planned}),
  window:{BALKAN_ARCHIVE:{getCarryover:()=>null}}};
 const code='const {'+Object.keys(ctx).join(',')+'}=ctx;'+leaveCode+
  ';return {balkanLeaveDashboard,balkanCompletedServiceMonths};';
 const methods=new Function('ctx',code)(ctx),summary=methods.balkanLeaveDashboard(worker,2026);
 return {...summary,months:methods.balkanCompletedServiceMonths(worker,2026,asOf)};
}
const oldDays=['2026-05-04','2026-05-05','2026-05-06','2026-05-07'];
const june=balance('2026-06-30','2026-01-01',24,2,oldDays,'2026-06-30');
assert.equal(june.months,6);
assert.equal(june.accrued,12);
assert.equal(june.carry,2);
assert.equal(june.used,4);
assert.equal(june.remaining,10,'12+2-4 = 10');
assert.equal(june.annualRemaining,22,'Puni godisnji fond nije skracen');
assert.equal(balance('2026-06-30','2026-01-01',24,-2,oldDays,'2026-06-30').remaining,6);
assert.equal(balance('2026-10-15','2026-07-01',12,0,oldDays,'2026-06-30').accrued,6);
assert.equal(balance('2026-10-15','2026-07-01',24,0,oldDays,'2026-06-30').accrued,6);
const lateDays=['2026-08-04','2026-08-05','2026-09-05','2026-09-07'];
const late=balance('2026-10-15','2026-01-01',24,2,lateDays,'2026-06-30');
assert.equal(late.carryExpired,2);
assert.equal(late.remaining,14);
assert.equal(balance('2026-10-15','2026-01-01',24,2,lateDays,'2026-12-31').remaining,16);

const autoCode=[
 part('function agreedAnnualAutoOn(','function annualObservedMonth('),
 part('function annualObservedMonth(','const _annualOriginalStatus='),
 part('function agreedAnnualCandidate(','dayStatus=function(employee,date,location){'),
 part('function agreedAnnualDates(','const _annualPriorLeaveCount=')
].join('\n');
const worker={id:'w',hiredAt:'2026-01-01',attendanceFrom:'2026-01-01',defaultLocationId:'m1'};
const missing=['2026-05-04','2026-05-05','2026-05-06','2026-05-07'];
const events=[];
for(let d=1;d<=31;d++){
 const date=mk(2026,5,d);
 if(new Date(date+'T12:00:00Z').getUTCDay()!==0&&!missing.includes(date))
  events.push({empId:'w',kind:'in',at:date+'T09:00:00.000Z'});
}
const S={events,overrides:[]};
const ctx={S,today:()=> '2026-06-30',ymd:mk,dateOfEvent:at=>at.slice(0,10),
 evs:(id,loc,date)=>events.filter(v=>v.empId===id&&v.at.startsWith(date)),
 override:(id,date,loc)=>S.overrides.find(v=>v.empId===id&&v.date===date&&v.locId===loc),
 assigned:()=> 'm1',employeeAt:(e,d)=>d>=e.hiredAt,
 isWorking:(loc,date)=>new Date(date+'T12:00:00Z').getUTCDay()!==0,
 holiday:()=>null,sickLeaveAt:()=>null,existingLeaveDay:()=>null,
 _annualOriginalStatus:(e,date,loc)=>events.some(v=>v.at.startsWith(date))?'P':'N'};
const calc=new Function('ctx','const {'+Object.keys(ctx).join(',')+'}=ctx;'+autoCode+
 ';return {agreedAnnualDates};')(ctx);
assert.deepEqual(calc.agreedAnnualDates(worker,2026),missing,'Cetiri propustene prijave -> cetiri privremena GO');
S.overrides.push({empId:'w',locId:'m1',date:'2026-05-05',status:'N'});
assert.deepEqual(calc.agreedAnnualDates(worker,2026),missing.filter(d=>d!=='2026-05-05'),'Rucno N ne postaje GO');
S.overrides[0].status='GO';
assert.deepEqual(calc.agreedAnnualDates(worker,2026),missing.filter(d=>d!=='2026-05-05'),'Rucni GO ne broji se opet automatski');
S.overrides.length=0;
worker.attendanceFrom='2026-05-06';
assert.deepEqual(calc.agreedAnnualDates(worker,2026),['2026-05-06','2026-05-07'],'Prije pocetka pracenja nema automatskog GO');
console.log('PASS: 12 + 2 - 4 = 10, mjeseci rada, arhivski prenos, istek roka, 4 automatska dana, rucni override');
