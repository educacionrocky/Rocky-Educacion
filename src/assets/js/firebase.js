// Firebase v12.9.0 (CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, onSnapshot, query, orderBy, where, serverTimestamp, limit, runTransaction, writeBatch } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

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
  await setDoc(ref, replaceUndefined({
    email: (data.email||'').toLowerCase(),
    displayName: data.nombre || null,
    documento: data.documento || null,
    createdAt: serverTimestamp(),
  }), { merge: true });
}
export async function ensureUserProfile(user){
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, replaceUndefined({ email: (user.email||'').toLowerCase(), displayName: user.displayName || null, createdAt: serverTimestamp() }));
  }
}
export async function loadUserProfile(uid){ const ref=doc(db,'users',uid); const snap=await getDoc(ref); return snap.exists()? snap.data(): null; }

// ===== Notas (demo) =====
export const addNote = async (uid, text) => { const ref=collection(db,'users',uid,'notes'); await addDoc(ref,replaceUndefined({ text, createdAt: serverTimestamp() })); };
export const streamNotes = (uid, onData) => { const ref=collection(db,'users',uid,'notes'); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({id:d.id,...d.data()}))) ); };

// ===== Centro de Permisos =====
export function streamRoleMatrix(onData){ const ref=collection(db,'roles_matrix'); return onSnapshot(ref,(snap)=>{ const map={}; snap.forEach(docu=> map[docu.id]=docu.data()||{} ); onData(map); }); }
export async function setRolePermissions(role, perms){ const ref=doc(db,'roles_matrix', role); await setDoc(ref, replaceUndefined(perms||{}), { merge:true }); }
export function streamUserOverrides(uid,onData){ const ref=doc(db,'user_overrides',uid); return onSnapshot(ref,(snap)=> onData(snap.exists()? snap.data(): {})); }
export async function getUserOverrides(uid){ const ref=doc(db,'user_overrides',uid); const snap=await getDoc(ref); return snap.exists()? snap.data(): {}; }
export async function setUserOverrides(uid,perms){ const ref=doc(db,'user_overrides',uid); await setDoc(ref, replaceUndefined(perms||{}), { merge:true }); }
export async function clearUserOverrides(uid){ const ref=doc(db,'user_overrides',uid); await deleteDoc(ref); }

// ===== Auditoría =====
function replaceUndefined(value){
  if(value === undefined) return null;
  if(Array.isArray(value)) return value.map(replaceUndefined);
  if(value && typeof value === 'object'){
    // Preserve Firestore sentinels and class instances (e.g. serverTimestamp, Timestamp, Date)
    const proto=Object.getPrototypeOf(value);
    if(proto && proto.constructor && proto.constructor.name!=='Object') return value;
    const out={};
    for(const [k,v] of Object.entries(value)) out[k]=replaceUndefined(v);
    return out;
  }
  return value;
}
export async function addAuditLog(entry){
  const ref=collection(db,'audit_logs');
  const safe=replaceUndefined(entry||{});
  await addDoc(ref,{ ...safe, ts: serverTimestamp(), actorUid: auth.currentUser?.uid||null, actorEmail: (auth.currentUser?.email||'').toLowerCase()||null });
}
export function streamAuditLogs(onData,max=50){ const ref=collection(db,'audit_logs'); const qy=query(ref,orderBy('ts','desc'),limit(max)); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() }))) ); }

// ===== Users (admin) =====
export function streamUsers(onData){ const ref=collection(db,'users'); return onSnapshot(ref,(snap)=> onData(snap.docs.map(d=>({ uid:d.id, ...d.data() }))) ); }
export async function setUserRole(uid, role){ const ref=doc(db,'users',uid); await updateDoc(ref,replaceUndefined({ role })); }
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
  const docRef=await addDoc(ref,replaceUndefined({
    codigo: codigo||null,
    nombre: nombre||null,
    estado:'activo',
    createdByUid: auth.currentUser?.uid||null,
    createdByEmail: (auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp(),
  }));
  return docRef.id;
}
export async function updateZone(id,{ codigo, nombre }){ const ref=doc(db,ZONES_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof nombre==='string') patch.nombre=nombre; await updateDoc(ref,replaceUndefined(patch)); }
export async function setZoneStatus(id,estado){ const ref=doc(db,ZONES_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findZoneByCode(codigo){ if(!codigo) return null; const ref=collection(db,ZONES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Dependencias =====
const DEPS_COL='dependencies';
export async function getNextDependencyCode(prefix='DEP',width=4){ const ref=doc(db,COUNTERS_COL,'dependencies'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamDependencies(onData){ const ref=collection(db,DEPS_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createDependency({ codigo, nombre }){ const ref=collection(db,DEPS_COL); const docRef=await addDoc(ref,replaceUndefined({ codigo:codigo||null, nombre:nombre||null, estado:'activo', createdByUid:auth.currentUser?.uid||null, createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null, createdAt: serverTimestamp() })); return docRef.id; }
export async function updateDependency(id,{ codigo, nombre }){ const ref=doc(db,DEPS_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof nombre==='string') patch.nombre=nombre; await updateDoc(ref,replaceUndefined(patch)); }
export async function setDependencyStatus(id,estado){ const ref=doc(db,DEPS_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findDependencyByCode(codigo){ if(!codigo) return null; const ref=collection(db,DEPS_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Sedes =====
const SEDES_COL='sedes';
export async function getNextSedeCode(prefix='SED',width=4){ const ref=doc(db,COUNTERS_COL,'sedes'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamSedes(onData){ const ref=collection(db,SEDES_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createSede({ codigo, nombre, dependenciaCodigo, dependenciaNombre, zonaCodigo, zonaNombre, numeroOperarios }){
  const ref=collection(db,SEDES_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    nombre:nombre||null,
    dependenciaCodigo:dependenciaCodigo||null,
    dependenciaNombre:dependenciaNombre||null,
    zonaCodigo:zonaCodigo||null,
    zonaNombre:zonaNombre||null,
    numeroOperarios: typeof numeroOperarios==='number' ? numeroOperarios : null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateSede(id,{ codigo, nombre, dependenciaCodigo, dependenciaNombre, zonaCodigo, zonaNombre, numeroOperarios }){
  const ref=doc(db,SEDES_COL,id); const patch={};
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof dependenciaCodigo==='string') patch.dependenciaCodigo=dependenciaCodigo;
  if(typeof dependenciaNombre==='string') patch.dependenciaNombre=dependenciaNombre;
  if(typeof zonaCodigo==='string') patch.zonaCodigo=zonaCodigo;
  if(typeof zonaNombre==='string') patch.zonaNombre=zonaNombre;
  if(typeof numeroOperarios==='number') patch.numeroOperarios=numeroOperarios;
  await updateDoc(ref,replaceUndefined(patch));
}
export async function setSedeStatus(id,estado){ const ref=doc(db,SEDES_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findSedeByCode(codigo){ if(!codigo) return null; const ref=collection(db,SEDES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Empleados =====
const EMPLOYEES_COL='employees';
export async function getNextEmployeeCode(prefix='EMP',width=4){ const ref=doc(db,COUNTERS_COL,'employees'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamEmployees(onData){ const ref=collection(db,EMPLOYEES_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createEmployee({ codigo, documento, nombre, telefono, cargoCodigo, cargoNombre, sedeCodigo, sedeNombre, fechaIngreso }){
  const ref=collection(db,EMPLOYEES_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    documento:documento||null,
    nombre:nombre||null,
    telefono:telefono||null,
    cargoCodigo:cargoCodigo||null,
    cargoNombre:cargoNombre||null,
    sedeCodigo:sedeCodigo||null,
    sedeNombre:sedeNombre||null,
    fechaIngreso: fechaIngreso || null,
    fechaRetiro: null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp(),
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateEmployee(id,{ codigo, documento, nombre, telefono, cargoCodigo, cargoNombre, sedeCodigo, sedeNombre, fechaIngreso }){
  const ref=doc(db,EMPLOYEES_COL,id); const patch={};
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof documento==='string') patch.documento=documento;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof telefono==='string') patch.telefono=telefono;
  if(typeof cargoCodigo==='string') patch.cargoCodigo=cargoCodigo;
  if(typeof cargoNombre==='string') patch.cargoNombre=cargoNombre;
  if(typeof sedeCodigo==='string') patch.sedeCodigo=sedeCodigo;
  if(typeof sedeNombre==='string') patch.sedeNombre=sedeNombre;
  if(fechaIngreso) patch.fechaIngreso=fechaIngreso;
  patch.lastModifiedByUid=auth.currentUser?.uid||null;
  patch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  patch.lastModifiedAt=serverTimestamp();
  await updateDoc(ref,replaceUndefined(patch));
}
export async function setEmployeeStatus(id,estado){
  const ref=doc(db,EMPLOYEES_COL,id);
  await updateDoc(ref,replaceUndefined({
    estado,
    fechaRetiro: estado==='inactivo' ? serverTimestamp() : null,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
}
export async function findEmployeeByCode(codigo){ if(!codigo) return null; const ref=collection(db,EMPLOYEES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function findEmployeeByDocument(documento){ if(!documento) return null; const ref=collection(db,EMPLOYEES_COL); const qy=query(ref, where('documento','==', documento)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function createEmployeesBulk(rows=[]){
  const data=Array.isArray(rows)? rows.filter(Boolean): [];
  if(!data.length) return { created:0 };
  const start=await runTransaction(db, async (tx)=>{
    const ref=doc(db,COUNTERS_COL,'employees');
    const snap=await tx.get(ref);
    const last=snap.exists()? Number(snap.data().last||0) : 0;
    const next=last+data.length;
    tx.set(ref,{ last: next },{ merge:true });
    return last+1;
  });
  const batch=writeBatch(db);
  data.forEach((row,idx)=>{
    const code=`EMP-${String(start+idx).padStart(4,'0')}`;
    const ref=doc(collection(db,EMPLOYEES_COL));
    batch.set(ref, replaceUndefined({
      codigo:code,
      documento:row.documento||null,
      nombre:row.nombre||null,
      telefono:row.telefono||null,
      cargoCodigo:row.cargoCodigo||null,
      cargoNombre:row.cargoNombre||null,
      sedeCodigo:row.sedeCodigo||null,
      sedeNombre:row.sedeNombre||null,
      fechaIngreso:row.fechaIngreso||null,
      fechaRetiro:null,
      estado:'activo',
      createdByUid:auth.currentUser?.uid||null,
      createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
      createdAt: serverTimestamp(),
      lastModifiedByUid:auth.currentUser?.uid||null,
      lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
      lastModifiedAt: serverTimestamp()
    }));
  });
  await batch.commit();
  return { created:data.length };
}

// ===== Supervisores =====
const SUPERVISORS_COL='supervisors';
export async function getNextSupervisorCode(prefix='SUP',width=4){ const ref=doc(db,COUNTERS_COL,'supervisors'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamSupervisors(onData){ const ref=collection(db,SUPERVISORS_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createSupervisor({ codigo, documento, nombre, zonaCodigo, zonaNombre, fechaIngreso }){
  const ref=collection(db,SUPERVISORS_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    documento:documento||null,
    nombre:nombre||null,
    zonaCodigo:zonaCodigo||null,
    zonaNombre:zonaNombre||null,
    fechaIngreso: fechaIngreso || null,
    fechaRetiro: null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp(),
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateSupervisor(id,{ codigo, documento, nombre, zonaCodigo, zonaNombre, fechaIngreso }){
  const ref=doc(db,SUPERVISORS_COL,id); const patch={};
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof documento==='string') patch.documento=documento;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof zonaCodigo==='string') patch.zonaCodigo=zonaCodigo;
  if(typeof zonaNombre==='string') patch.zonaNombre=zonaNombre;
  if(fechaIngreso) patch.fechaIngreso=fechaIngreso;
  patch.lastModifiedByUid=auth.currentUser?.uid||null;
  patch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  patch.lastModifiedAt=serverTimestamp();
  await updateDoc(ref,replaceUndefined(patch));
}
export async function setSupervisorStatus(id,estado){
  const ref=doc(db,SUPERVISORS_COL,id);
  await updateDoc(ref,replaceUndefined({
    estado,
    fechaRetiro: estado==='inactivo' ? serverTimestamp() : null,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
}
export async function findSupervisorByCode(codigo){ if(!codigo) return null; const ref=collection(db,SUPERVISORS_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function findSupervisorByDocument(documento){ if(!documento) return null; const ref=collection(db,SUPERVISORS_COL); const qy=query(ref, where('documento','==', documento)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Cargos =====
const CARGOS_COL='cargos';
export async function getNextCargoCode(prefix='CAR',width=4){ const ref=doc(db,COUNTERS_COL,'cargos'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamCargos(onData){ const ref=collection(db,CARGOS_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createCargo({ codigo, nombre }){
  const ref=collection(db,CARGOS_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    nombre:nombre||null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateCargo(id,{ codigo, nombre }){ const ref=doc(db,CARGOS_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof nombre==='string') patch.nombre=nombre; await updateDoc(ref,replaceUndefined(patch)); }
export async function setCargoStatus(id,estado){ const ref=doc(db,CARGOS_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findCargoByCode(codigo){ if(!codigo) return null; const ref=collection(db,CARGOS_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Novedades =====
const NOVEDADES_COL='novedades';
export async function getNextNovedadCode(prefix='NOV',width=4){ const ref=doc(db,COUNTERS_COL,'novedades'); const next=await runTransaction(db, async (tx)=>{ const snap=await tx.get(ref); let last=0; if(snap.exists()) last=Number(snap.data().last||0); const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val; }); const num=String(next).padStart(width,'0'); return `${prefix}-${num}`; }
export function streamNovedades(onData){ const ref=collection(db,NOVEDADES_COL); const qy=query(ref,orderBy('createdAt','desc')); return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() })))); }
export async function createNovedad({ codigo, codigoNovedad, nombre, reemplazo }){
  const ref=collection(db,NOVEDADES_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    codigoNovedad:codigoNovedad||null,
    nombre:nombre||null,
    reemplazo:reemplazo||null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateNovedad(id,{ codigo, codigoNovedad, nombre, reemplazo }){ const ref=doc(db,NOVEDADES_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof codigoNovedad==='string') patch.codigoNovedad=codigoNovedad; if(typeof nombre==='string') patch.nombre=nombre; if(typeof reemplazo==='string') patch.reemplazo=reemplazo; await updateDoc(ref,replaceUndefined(patch)); }
export async function setNovedadStatus(id,estado){ const ref=doc(db,NOVEDADES_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findNovedadByCode(codigo){ if(!codigo) return null; const ref=collection(db,NOVEDADES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function findNovedadByCodigoNovedad(codigoNovedad){ if(!codigoNovedad) return null; const ref=collection(db,NOVEDADES_COL); const qy=query(ref, where('codigoNovedad','==', codigoNovedad)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}

// ===== Operacion =====
const IMPORT_HISTORY_COL='import_history';
const ATTENDANCE_COL='attendance';
const ABSENTEEISM_COL='absenteeism';
const SEDE_STATUS_COL='sede_status';

export async function confirmImportOperation(payload){
  const data=replaceUndefined(payload||{});
  if(data.fechaOperacion){
    const ref=collection(db,IMPORT_HISTORY_COL);
    const qy=query(ref, where('fechaOperacion','==', data.fechaOperacion), limit(1));
    const snap=await getDocs(qy);
    if(!snap.empty) throw new Error('Ya existe una confirmacion para esa fecha.');
  }
  const batch=writeBatch(db);
  const importRef=doc(collection(db,IMPORT_HISTORY_COL));
  batch.set(importRef, replaceUndefined({
    fechaOperacion: data.fechaOperacion||null,
    ts: serverTimestamp(),
    source: data.source||null,
    expectedCount: data.expectedCount||0,
    foundCount: data.foundCount||0,
    missingCount: data.missingCount||0,
    extraCount: data.extraCount||0,
    missingDocs: data.missingDocs||[],
    extraDocs: data.extraDocs||[],
    errores: data.errores||[],
    confirmadoPorUid: auth.currentUser?.uid||null,
    confirmadoPorEmail: (auth.currentUser?.email||'').toLowerCase()||null
  }));

  for(const a of (data.attendance||[])){
    if(!a || !a.empleadoId || !a.fecha) continue;
    const ref=doc(db,ATTENDANCE_COL, `${a.fecha}_${a.empleadoId}`);
    batch.set(ref, replaceUndefined({
      fecha: a.fecha,
      empleadoId: a.empleadoId,
      documento: a.documento||null,
      nombre: a.nombre||null,
      sedeCodigo: a.sedeCodigo||null,
      sedeNombre: a.sedeNombre||null,
      asistio: Boolean(a.asistio),
      novedad: a.novedad||null,
      createdAt: serverTimestamp()
    }), { merge:true });
  }

  for(const ab of (data.absences||[])){
    if(!ab || !ab.empleadoId || !ab.fecha) continue;
    const ref=doc(db,ABSENTEEISM_COL, `${ab.fecha}_${ab.empleadoId}`);
    batch.set(ref, replaceUndefined({
      fecha: ab.fecha,
      empleadoId: ab.empleadoId,
      documento: ab.documento||null,
      nombre: ab.nombre||null,
      sedeCodigo: ab.sedeCodigo||null,
      sedeNombre: ab.sedeNombre||null,
      estado: ab.estado||'pendiente',
      reemplazoId: ab.reemplazoId||null,
      reemplazoDocumento: ab.reemplazoDocumento||null,
      createdAt: serverTimestamp(),
      createdByUid: auth.currentUser?.uid||null,
      createdByEmail: (auth.currentUser?.email||'').toLowerCase()||null
    }), { merge:true });
  }

  for(const ss of (data.sedeStatus||[])){
    if(!ss || !ss.fecha || !ss.sedeCodigo) continue;
    const ref=doc(db,SEDE_STATUS_COL, `${ss.fecha}_${ss.sedeCodigo}`);
    batch.set(ref, replaceUndefined({
      fecha: ss.fecha,
      sedeCodigo: ss.sedeCodigo,
      sedeNombre: ss.sedeNombre||null,
      operariosEsperados: ss.operariosEsperados||0,
      operariosPresentes: ss.operariosPresentes||0,
      faltantes: ss.faltantes||0,
      createdAt: serverTimestamp()
    }), { merge:true });
  }

  await batch.commit();
  return importRef.id;
}
