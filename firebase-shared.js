import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,getFirestore} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
export const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
let database;
try {database=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}
catch(e){console.warn('Lokalni Firebase cache nije mogao biti inicijalizovan',e);database=getFirestore(app);}
export const db=database;
