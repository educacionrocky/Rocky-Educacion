// Firebase v12.9.0 (CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, onSnapshot, query, orderBy, where, serverTimestamp, limit, runTransaction } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyC2S2kMvBP4rMIeVRLgmQ3TcwrG7SZXKCY",
  authDomain: "rockypro-98390.firebaseapp.com",
  projectId: "rockypro-98390",
  storageBucket: "rockypro-98390.firebasestorage.app",
  messagingSenderId: "891421432235",
  appId: "1:891421432235:web:151ff4cb0ebf4c01ff1aee"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ===== Auth =====
export const authState = (cb) => onAuthStateChanged(auth, cb);
export const login     = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const register  = (email, pass) => createUserWithEmailAndPassword(auth, email, pass);
export const logout    = () => signOut(auth);

// ===== Perfiles =====
export async function createUserProfile(uid, data){
  const ref = doc(db, 'users', uid);
  await setDoc(ref, {
    email: (data.email||'').toLowerCase(),
    displayName: data.nombre || null,
    documento: data.documento || null,
    createdAt: serverTimestamp(),
  }, { merge: true });
}
export async function ensureUserProfile(user){
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { email: (user.email||'').toLowerCase(), displayName: user.displayName || null, createdAt: serverTimestamp() });
  }
}
export async function loadUserProfile(uid){ const ref=doc(db,'users',uid); const snap=await getDoc(ref); return snap.exists()? snap.data(): null; }

// ===== Notas (demo) =====
export const addNote = async (uid, text) => { const ref=collection(db,'users',uid,'notes'); await addDoc(ref,{ text, createdAt: serverTimestamp() }); };
export const streamNotes = (uid, onData) => { const ref=collection(db,'users',uid,'notes'); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({id:d.id,...d.data()}))) ); };

// ===== Centro de Permisos =====
export function streamRoleMatrix(onData){ const ref=collection(db,'roles_matrix'); return onSnapshot(ref,(snap)=>{ const map={}; snap.forEach(docu=> map[docu.id]=docu.data()||{} ); onData(map); }); }
export async function setRolePermissions(role, perms){ const ref=doc(db,'roles_matrix', role); await setDoc(ref, perms, { merge:true }); }
export function streamUserOverrides(uid,onData){ const ref=doc(db,'user_overrides',uid); return onSnapshot(ref,(snap)=> onData(snap.exists()? snap.data(): {})); }
export async function getUserOverrides(uid){ const ref=doc(db,'user_overrides',uid); const snap=await getDoc(ref); return snap.exists()? snap.data(): {}; }
export async function setUserOverrides(uid,perms){ const ref=doc(db,'user_overrides',uid); await setDoc(ref, perms, { merge:true }); }
export async function clearUserOverrides(uid){ const ref=doc(db,'user_overrides',uid); await deleteDoc(ref); }

// ===== Auditoría =====
export async function addAuditLog(entry){ const ref=collection(db,'audit_logs'); await addDoc(ref,{ ...entry, ts: serverTimestamp(), actorUid: auth.currentUser?.uid||null, actorEmail: (auth.currentUser?.email||'').toLowerCase()||null }); }
export function streamAuditLogs(onData,max=50){ const ref=collection(db,'audit_logs'); const qy=query(ref,orderBy('ts','desc'),limit(max)); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() }))) ); }

// ===== Users (admin) =====
export function streamUsers(onData){ const ref=collection(db,'users'); return onSnapshot(ref,(snap)=> onData(snap.docs.map(d=>({ uid:d.id, ...d.data() }))) ); }
export async function setUserRole(uid, role){ const ref=doc(db,'users',uid); await updateDoc(ref,{ role }); }
export async function findUserByEmail(email){ if(!email) return null; const ref=collection(db,'users'); const qy=query(ref, where('email','==', email.toLowerCase())); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { uid:d.id, ...d.data() };
}

// ===== Zonas =====
const ZONES_COL = 'zones';
const COUNTERS_COL = 'counters';

export async function getNextZoneCode(prefix='ZON', width=4){
  const ref = doc(db, COUNTERS_COL, 'zones');
  const next = await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    let last = 0; if(snap.exists()) last = Number(snap.data().last||0);
    const val = last + 1; tx.set(ref, { last: val }, { merge:true }); return val;
  });
  const num = String(next).padStart(width,'0');
  return `${prefix}-${num}`; // p.ej. ZON-0001
}

export function streamZones(onData){ const ref=collection(db,ZONES_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createZone({ codigo, nombre }){
  const ref=collection(db,ZONES_COL);
  const docRef=await addDoc(ref,{
    codigo: codigo||null,
    nombre: nombre||null,
    estado:'activo',
    createdByUid: auth.currentUser?.uid||null,
    createdByEmail: (auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
export async function updateZone(id,{ codigo, nombre }){ const ref=doc(db,ZONES_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof nombre==='string') patch.nombre=nombre; await updateDoc(ref,patch); }
export async function setZoneStatus(id,estado){ const ref=doc(db,ZONES_COL,id); await updateDoc(ref,{ estado }); }
export async function findZoneByCode(codigo){ if(!codigo) return null; const ref=collection(db,ZONES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Dependencias =====
const DEPS_COL='dependencies';
export async function getNextDependencyCode(prefix='DEP',width=4){ const ref=doc(db,COUNTERS_COL,'dependencies'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamDependencies(onData){ const ref=collection(db,DEPS_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createDependency({ codigo, nombre }){ const ref=collection(db,DEPS_COL); const docRef=await addDoc(ref,{ codigo:codigo||null, nombre:nombre||null, estado:'activo', createdByUid:auth.currentUser?.uid||null, createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null, createdAt: serverTimestamp() }); return docRef.id; }
export async function updateDependency(id,{ codigo, nombre }){ const ref=doc(db,DEPS_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof nombre==='string') patch.nombre=nombre; await updateDoc(ref,patch); }
export async function setDependencyStatus(id,estado){ const ref=doc(db,DEPS_COL,id); await updateDoc(ref,{ estado }); }
export async function findDependencyByCode(codigo){ if(!codigo) return null; const ref=collection(db,DEPS_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
