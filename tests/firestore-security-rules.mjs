import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const environment=await initializeTestEnvironment({
 projectId:'demo-balkan-rules',firestore:{
  host:'127.0.0.1',port:8080,
  rules:readFileSync('firestore.rules','utf8')
 }
});
try{
 const admin=environment.authenticatedContext('jWTYPv8PhIb8xUbo0Ra0RtrKVf82').firestore();
 const worker=environment.authenticatedContext('anonymous-employee',{
  firebase:{sign_in_provider:'anonymous'}
 }).firestore();
 const outsider=environment.unauthenticatedContext().firestore();
 const adminBadge=admin.doc('badges/MARKET1');
 await assertSucceeds(adminBadge.set({empId:'emp1',name:'Test Radnik',active:true,locationId:'m1',barcode:'MARKET1'}));
 await assertSucceeds(admin.doc('records/employees/items/emp1').set({id:'emp1',name:'Test Radnik'}));
 await assertSucceeds(worker.doc('badges/MARKET1').get());
 await assertFails(worker.collection('badges').get());
 await assertFails(worker.collection('records/employees/items').get());
 await assertFails(worker.doc('records/employees/items/emp1').get());
 await assertFails(outsider.doc('badges/MARKET1').get());
 await assertFails(worker.doc('badges/MARKET1').update({name:'Pogresno'}));
 const id='scan-uuid-audit-00000001';
 const event=worker.doc('records/events/items/'+id);
 const payload={id,empId:'emp1',locId:'m1',kind:'in',at:'2026-10-17T08:00:00.000Z',
  barcode:'MARKET1',source:'barcode',createdAt:firebase.firestore.FieldValue.serverTimestamp()};
 await assertSucceeds(event.set(payload));
 // Retry of the SAME offline scan needs to be idempotent under Firestore rules.
 await assertSucceeds(event.set(payload));
 await assertFails(event.set({...payload,kind:'out'}));
 await assertFails(event.delete());
 await assertFails(worker.doc('records/events/items/forged1').set({...payload,id:'forged1',empId:'other'}));
 await assertFails(worker.doc('records/events/items/forged2').set({...payload,id:'forged2',barcode:'NOT-A-BADGE'}));
 await assertFails(worker.doc('records/events/items/forged3').set({...payload,id:'forged3',source:'manual'}));
 await assertFails(worker.doc('records/leaveGrants/items/test').set({id:'test'}));
 await assertFails(worker.doc('records/archive2025/items/year2025').get());
 await assertSucceeds(admin.collection('records/events/items').get());
 const contents=(await admin.doc('records/events/items/'+id).get()).data();
 assert.equal(contents.empId,'emp1');
 assert.equal(contents.kind,'in');
 console.log('PASS FIRESTORE SECURITY RULES: anonymous kiosk can only read single badge and create/retry matching scan; employee lists and admin data protected; old scan immutable.');
}finally{await environment.cleanup()}
