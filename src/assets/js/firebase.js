// Firebase v12.9.0 (CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, onSnapshot, query, orderBy, where, serverTimestamp, limit, runTransaction, writeBatch } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyAkZJuves5WDo3QA5JJ3qlb5Lb_D5j1FPE",
  authDomain: "educacion-rocky.firebaseapp.com",
  projectId: "educacion-rocky",
  storageBucket: "educacion-rocky.firebasestorage.app",
  messagingSenderId: "559391413242",
  appId: "1:559391413242:web:ae81a5497f498d0fd40a43"
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

function normalizeEmployeePhoneCO(value){
  if(value === null || value === undefined) return null;
  const digits=String(value).replace(/\D/g,'');
  if(!digits) return null;
  if(digits.startsWith('57')) return digits;
  if(digits.length===10) return `57${digits}`;
  return digits;
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
export async function createSede({ codigo, nombre, dependenciaCodigo, dependenciaNombre, zonaCodigo, zonaNombre, numeroOperarios, jornada }) {
  const ref=collection(db,SEDES_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    nombre:nombre||null,
    dependenciaCodigo:dependenciaCodigo||null,
    dependenciaNombre:dependenciaNombre||null,
    zonaCodigo:zonaCodigo||null,
    zonaNombre:zonaNombre||null,
    numeroOperarios: typeof numeroOperarios==='number' ? numeroOperarios : null,
    jornada: jornada||'lun_vie',
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateSede(id,{ codigo, nombre, dependenciaCodigo, dependenciaNombre, zonaCodigo, zonaNombre, numeroOperarios, jornada }){
  const ref=doc(db,SEDES_COL,id); const patch={};
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof dependenciaCodigo==='string') patch.dependenciaCodigo=dependenciaCodigo;
  if(typeof dependenciaNombre==='string') patch.dependenciaNombre=dependenciaNombre;
  if(typeof zonaCodigo==='string') patch.zonaCodigo=zonaCodigo;
  if(typeof zonaNombre==='string') patch.zonaNombre=zonaNombre;
  if(typeof numeroOperarios==='number') patch.numeroOperarios=numeroOperarios;
  if(typeof jornada==='string') patch.jornada=jornada;
  await updateDoc(ref,replaceUndefined(patch));
}
export async function setSedeStatus(id,estado){ const ref=doc(db,SEDES_COL,id); await updateDoc(ref,replaceUndefined({ estado })); }
export async function findSedeByCode(codigo){ if(!codigo) return null; const ref=collection(db,SEDES_COL); const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy); if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function createSedesBulk(rows=[]){
  const data=Array.isArray(rows)? rows.filter(Boolean): [];
  if(!data.length) return { created:0 };
  const start=await runTransaction(db, async (tx)=>{
    const ref=doc(db,COUNTERS_COL,'sedes');
    const snap=await tx.get(ref);
    const last=snap.exists()? Number(snap.data().last||0) : 0;
    const next=last+data.length;
    tx.set(ref,{ last: next },{ merge:true });
    return last+1;
  });
  const batch=writeBatch(db);
  data.forEach((row,idx)=>{
    const code=`SED-${String(start+idx).padStart(4,'0')}`;
    const ref=doc(collection(db,SEDES_COL));
    batch.set(ref, replaceUndefined({
      codigo:code,
      nombre:row.nombre||null,
      dependenciaCodigo:row.dependenciaCodigo||null,
      dependenciaNombre:row.dependenciaNombre||null,
      zonaCodigo:row.zonaCodigo||null,
      zonaNombre:row.zonaNombre||null,
      numeroOperarios: typeof row.numeroOperarios==='number' ? row.numeroOperarios : null,
      jornada: row.jornada||'lun_vie',
      estado:'activo',
      createdByUid:auth.currentUser?.uid||null,
      createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
      createdAt: serverTimestamp()
    }));
  });
  await batch.commit();
  return { created:data.length };
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
    telefono:normalizeEmployeePhoneCO(telefono),
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
export async function updateEmployee(id,data={}){
  const { codigo, documento, nombre, telefono, cargoCodigo, cargoNombre, sedeCodigo, sedeNombre, fechaIngreso, fechaRetiro } = data;
  const ref=doc(db,EMPLOYEES_COL,id); const patch={};
  const currentSnap=await getDoc(ref);
  const current=currentSnap.exists()? currentSnap.data(): {};
  const previousDocumento=String(current.documento||'').trim();
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof documento==='string') patch.documento=documento;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof telefono==='string') patch.telefono=normalizeEmployeePhoneCO(telefono);
  if(typeof cargoCodigo==='string') patch.cargoCodigo=cargoCodigo;
  if(typeof cargoNombre==='string') patch.cargoNombre=cargoNombre;
  if(typeof sedeCodigo==='string') patch.sedeCodigo=sedeCodigo;
  if(typeof sedeNombre==='string') patch.sedeNombre=sedeNombre;
  if(fechaIngreso) patch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) patch.fechaRetiro=fechaRetiro||null;
  patch.lastModifiedByUid=auth.currentUser?.uid||null;
  patch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  patch.lastModifiedAt=serverTimestamp();
  await updateDoc(ref,replaceUndefined(patch));

  // Sync linked records (supervisors/supernumerarios) when this employee is also there.
  const finalDocumento=(typeof documento==='string' ? String(documento).trim() : previousDocumento);
  const docsToSync=Array.from(new Set([previousDocumento, finalDocumento].filter(Boolean)));

  const supPatch={};
  if(typeof documento==='string') supPatch.documento=String(documento).trim();
  if(typeof nombre==='string') supPatch.nombre=nombre;
  if(fechaIngreso) supPatch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) supPatch.fechaRetiro=fechaRetiro||null;
  supPatch.lastModifiedByUid=auth.currentUser?.uid||null;
  supPatch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  supPatch.lastModifiedAt=serverTimestamp();

  const supnPatch={};
  if(typeof documento==='string') supnPatch.documento=String(documento).trim();
  if(typeof nombre==='string') supnPatch.nombre=nombre;
  if(typeof telefono==='string') supnPatch.telefono=normalizeEmployeePhoneCO(telefono);
  if(typeof cargoCodigo==='string') supnPatch.cargoCodigo=cargoCodigo;
  if(typeof cargoNombre==='string') supnPatch.cargoNombre=cargoNombre;
  if(typeof sedeCodigo==='string') supnPatch.sedeCodigo=sedeCodigo;
  if(typeof sedeNombre==='string') supnPatch.sedeNombre=sedeNombre;
  if(fechaIngreso) supnPatch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) supnPatch.fechaRetiro=fechaRetiro||null;
  supnPatch.lastModifiedByUid=auth.currentUser?.uid||null;
  supnPatch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  supnPatch.lastModifiedAt=serverTimestamp();

  for(const docNum of docsToSync){
    const qSup=query(collection(db,SUPERVISORS_COL), where('documento','==', docNum));
    const supSnap=await getDocs(qSup);
    for(const d of supSnap.docs){ await updateDoc(doc(db,SUPERVISORS_COL,d.id), replaceUndefined(supPatch)); }

    const qSupn=query(collection(db,SUPERNUMERARIOS_COL), where('documento','==', docNum));
    const supnSnap=await getDocs(qSupn);
    for(const d of supnSnap.docs){ await updateDoc(doc(db,SUPERNUMERARIOS_COL,d.id), replaceUndefined(supnPatch)); }
  }
}
export async function setEmployeeStatus(id,estado,fechaRetiro=null){
  const ref=doc(db,EMPLOYEES_COL,id);
  const snap=await getDoc(ref);
  const current=snap.exists()? snap.data(): {};
  const docNum=String(current.documento||'').trim();
  const retiroValue=estado==='inactivo' ? (fechaRetiro||serverTimestamp()) : null;
  await updateDoc(ref,replaceUndefined({
    estado,
    fechaRetiro: retiroValue,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));

  if(!docNum) return;
  const commonPatch={
    estado,
    fechaRetiro: retiroValue,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  };
  const qSup=query(collection(db,SUPERVISORS_COL), where('documento','==', docNum));
  const supSnap=await getDocs(qSup);
  for(const d of supSnap.docs){ await updateDoc(doc(db,SUPERVISORS_COL,d.id), replaceUndefined(commonPatch)); }

  const qSupn=query(collection(db,SUPERNUMERARIOS_COL), where('documento','==', docNum));
  const supnSnap=await getDocs(qSupn);
  for(const d of supnSnap.docs){ await updateDoc(doc(db,SUPERNUMERARIOS_COL,d.id), replaceUndefined(commonPatch)); }
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
      telefono:normalizeEmployeePhoneCO(row.telefono),
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
export async function createSupernumerariosBulk(rows=[]){
  const data=Array.isArray(rows)? rows.filter(Boolean): [];
  if(!data.length) return { created:0 };
  const start=await runTransaction(db, async (tx)=>{
    const ref=doc(db,COUNTERS_COL,'supernumerarios');
    const snap=await tx.get(ref);
    const last=snap.exists()? Number(snap.data().last||0) : 0;
    const next=last+data.length;
    tx.set(ref,{ last: next },{ merge:true });
    return last+1;
  });
  const batch=writeBatch(db);
  data.forEach((row,idx)=>{
    const code=`SUPN-${String(start+idx).padStart(4,'0')}`;
    const ref=doc(collection(db,SUPERNUMERARIOS_COL));
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

// ===== Supernumerarios =====
const SUPERNUMERARIOS_COL='supernumerarios';
export async function getNextSupernumerarioCode(prefix='SUPN',width=4){
  const ref=doc(db,COUNTERS_COL,'supernumerarios');
  const next=await runTransaction(db, async (tx)=>{
    const snap=await tx.get(ref);
    let last=0; if(snap.exists()) last=Number(snap.data().last||0);
    const val=last+1; tx.set(ref,{ last:val },{ merge:true }); return val;
  });
  const num=String(next).padStart(width,'0');
  return `${prefix}-${num}`;
}
export function streamSupernumerarios(onData){
  const ref=collection(db,SUPERNUMERARIOS_COL);
  const qy=query(ref,orderBy('createdAt','desc'));
  return onSnapshot(qy,(snap)=> onData(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function createSupernumerario({ codigo, documento, nombre, telefono, cargoCodigo, cargoNombre, sedeCodigo, sedeNombre, fechaIngreso }){
  const ref=collection(db,SUPERNUMERARIOS_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null, documento:documento||null, nombre:nombre||null, telefono:telefono||null,
    cargoCodigo:cargoCodigo||null, cargoNombre:cargoNombre||null, sedeCodigo:sedeCodigo||null, sedeNombre:sedeNombre||null,
    fechaIngreso: fechaIngreso || null, fechaRetiro: null, estado:'activo',
    createdByUid:auth.currentUser?.uid||null, createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null, createdAt: serverTimestamp(),
    lastModifiedByUid:auth.currentUser?.uid||null, lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null, lastModifiedAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateSupernumerario(id,data={}){
  const { codigo, documento, nombre, telefono, cargoCodigo, cargoNombre, sedeCodigo, sedeNombre, fechaIngreso, fechaRetiro } = data;
  const ref=doc(db,SUPERNUMERARIOS_COL,id); const patch={};
  const currentSnap=await getDoc(ref);
  const current=currentSnap.exists()? currentSnap.data(): {};
  const previousDocumento=String(current.documento||'').trim();
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof documento==='string') patch.documento=documento;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof telefono==='string') patch.telefono=telefono;
  if(typeof cargoCodigo==='string') patch.cargoCodigo=cargoCodigo;
  if(typeof cargoNombre==='string') patch.cargoNombre=cargoNombre;
  if(typeof sedeCodigo==='string') patch.sedeCodigo=sedeCodigo;
  if(typeof sedeNombre==='string') patch.sedeNombre=sedeNombre;
  if(fechaIngreso) patch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) patch.fechaRetiro=fechaRetiro||null;
  patch.lastModifiedByUid=auth.currentUser?.uid||null;
  patch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  patch.lastModifiedAt=serverTimestamp();
  await updateDoc(ref,replaceUndefined(patch));

  const finalDocumento=(typeof documento==='string' ? String(documento).trim() : previousDocumento);
  const docsToSync=Array.from(new Set([previousDocumento, finalDocumento].filter(Boolean)));
  const empPatch={};
  if(typeof documento==='string') empPatch.documento=String(documento).trim();
  if(typeof nombre==='string') empPatch.nombre=nombre;
  if(typeof telefono==='string') empPatch.telefono=normalizeEmployeePhoneCO(telefono);
  if(typeof cargoCodigo==='string') empPatch.cargoCodigo=cargoCodigo;
  if(typeof cargoNombre==='string') empPatch.cargoNombre=cargoNombre;
  if(typeof sedeCodigo==='string') empPatch.sedeCodigo=sedeCodigo;
  if(typeof sedeNombre==='string') empPatch.sedeNombre=sedeNombre;
  if(fechaIngreso) empPatch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) empPatch.fechaRetiro=fechaRetiro||null;
  empPatch.lastModifiedByUid=auth.currentUser?.uid||null;
  empPatch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  empPatch.lastModifiedAt=serverTimestamp();
  for(const docNum of docsToSync){
    const qEmp=query(collection(db,EMPLOYEES_COL), where('documento','==', docNum));
    const empSnap=await getDocs(qEmp);
    for(const d of empSnap.docs){ await updateDoc(doc(db,EMPLOYEES_COL,d.id), replaceUndefined(empPatch)); }
  }
}
export async function setSupernumerarioStatus(id,estado,fechaRetiro=null,opts={}){
  const ref=doc(db,SUPERNUMERARIOS_COL,id);
  const snap=await getDoc(ref);
  const current=snap.exists()? snap.data(): {};
  const docNum=String(current.documento||'').trim();
  const retiroValue=estado==='inactivo' ? (fechaRetiro||serverTimestamp()) : null;
  const syncEmployee = opts?.syncEmployee !== false;
  const motivoEstado = opts?.motivoEstado || null;
  await updateDoc(ref,replaceUndefined({
    estado,
    fechaRetiro: retiroValue,
    motivoEstado,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
  if(!docNum || !syncEmployee) return;
  const empPatch={
    estado,
    fechaRetiro: retiroValue,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  };
  const qEmp=query(collection(db,EMPLOYEES_COL), where('documento','==', docNum));
  const empSnap=await getDocs(qEmp);
  for(const d of empSnap.docs){ await updateDoc(doc(db,EMPLOYEES_COL,d.id), replaceUndefined(empPatch)); }
}
export async function findSupernumerarioByCode(codigo){
  if(!codigo) return null; const ref=collection(db,SUPERNUMERARIOS_COL);
  const qy=query(ref, where('codigo','==', codigo)); const snap=await getDocs(qy);
  if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
}
export async function findSupernumerarioByDocument(documento){
  if(!documento) return null; const ref=collection(db,SUPERNUMERARIOS_COL);
  const qy=query(ref, where('documento','==', documento)); const snap=await getDocs(qy);
  if(snap.empty) return null; const d=snap.docs[0]; return { id:d.id, ...d.data() };
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
export async function updateSupervisor(id,data={}){
  const { codigo, documento, nombre, zonaCodigo, zonaNombre, fechaIngreso, fechaRetiro } = data;
  const ref=doc(db,SUPERVISORS_COL,id); const patch={};
  const currentSnap=await getDoc(ref);
  const current=currentSnap.exists()? currentSnap.data(): {};
  const previousDocumento=String(current.documento||'').trim();
  if(typeof codigo==='string') patch.codigo=codigo;
  if(typeof documento==='string') patch.documento=documento;
  if(typeof nombre==='string') patch.nombre=nombre;
  if(typeof zonaCodigo==='string') patch.zonaCodigo=zonaCodigo;
  if(typeof zonaNombre==='string') patch.zonaNombre=zonaNombre;
  if(fechaIngreso) patch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) patch.fechaRetiro=fechaRetiro||null;
  patch.lastModifiedByUid=auth.currentUser?.uid||null;
  patch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  patch.lastModifiedAt=serverTimestamp();
  await updateDoc(ref,replaceUndefined(patch));

  const finalDocumento=(typeof documento==='string' ? String(documento).trim() : previousDocumento);
  const docsToSync=Array.from(new Set([previousDocumento, finalDocumento].filter(Boolean)));
  const empPatch={};
  if(typeof documento==='string') empPatch.documento=String(documento).trim();
  if(typeof nombre==='string') empPatch.nombre=nombre;
  if(fechaIngreso) empPatch.fechaIngreso=fechaIngreso;
  if(Object.prototype.hasOwnProperty.call(data,'fechaRetiro')) empPatch.fechaRetiro=fechaRetiro||null;
  empPatch.lastModifiedByUid=auth.currentUser?.uid||null;
  empPatch.lastModifiedByEmail=(auth.currentUser?.email||'').toLowerCase()||null;
  empPatch.lastModifiedAt=serverTimestamp();
  for(const docNum of docsToSync){
    const qEmp=query(collection(db,EMPLOYEES_COL), where('documento','==', docNum));
    const empSnap=await getDocs(qEmp);
    for(const d of empSnap.docs){ await updateDoc(doc(db,EMPLOYEES_COL,d.id), replaceUndefined(empPatch)); }
  }
}
export async function setSupervisorStatus(id,estado,fechaRetiro=null){
  const ref=doc(db,SUPERVISORS_COL,id);
  const snap=await getDoc(ref);
  const current=snap.exists()? snap.data(): {};
  const docNum=String(current.documento||'').trim();
  const retiroValue=estado==='inactivo' ? (fechaRetiro||serverTimestamp()) : null;
  await updateDoc(ref,replaceUndefined({
    estado,
    fechaRetiro: retiroValue,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  }));
  if(!docNum) return;
  const empPatch={
    estado,
    fechaRetiro: retiroValue,
    lastModifiedByUid:auth.currentUser?.uid||null,
    lastModifiedByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    lastModifiedAt: serverTimestamp()
  };
  const qEmp=query(collection(db,EMPLOYEES_COL), where('documento','==', docNum));
  const empSnap=await getDocs(qEmp);
  for(const d of empSnap.docs){ await updateDoc(doc(db,EMPLOYEES_COL,d.id), replaceUndefined(empPatch)); }
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
export async function createNovedad({ codigo, codigoNovedad, nombre, reemplazo, nomina }){
  const ref=collection(db,NOVEDADES_COL);
  const docRef=await addDoc(ref,replaceUndefined({
    codigo:codigo||null,
    codigoNovedad:codigoNovedad||null,
    nombre:nombre||null,
    reemplazo:reemplazo||null,
    nomina:nomina||null,
    estado:'activo',
    createdByUid:auth.currentUser?.uid||null,
    createdByEmail:(auth.currentUser?.email||'').toLowerCase()||null,
    createdAt: serverTimestamp()
  }));
  return docRef.id;
}
export async function updateNovedad(id,{ codigo, codigoNovedad, nombre, reemplazo, nomina }){ const ref=doc(db,NOVEDADES_COL,id); const patch={}; if(typeof codigo==='string') patch.codigo=codigo; if(typeof codigoNovedad==='string') patch.codigoNovedad=codigoNovedad; if(typeof nombre==='string') patch.nombre=nombre; if(typeof reemplazo==='string') patch.reemplazo=reemplazo; if(typeof nomina==='string') patch.nomina=nomina; await updateDoc(ref,replaceUndefined(patch)); }
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
const IMPORT_REPLACEMENTS_COL='import_replacements';

export function streamImportHistory(onData,max=200){
  const ref=collection(db,IMPORT_HISTORY_COL);
  const qy=query(ref,orderBy('ts','desc'),limit(max));
  return onSnapshot(qy,(snap)=> onData(snap.docs.map((d)=>({ id:d.id, ...d.data() }))));
}
export function streamWhatsAppIncoming(onData,max=200,onError){
  const ref=collection(db,'whatsapp_incoming');
  const qy=query(ref,orderBy('receivedAt','desc'),limit(max));
  return onSnapshot(
    qy,
    (snap)=> onData(snap.docs.map((d)=>({ id:d.id, ...d.data() }))),
    (err)=> onError?.(err)
  );
}
export function streamAttendanceByDate(fecha,onData,onError){
  if(!fecha){ onData?.([]); return ()=>{}; }
  const ref=collection(db,ATTENDANCE_COL);
  const qy=query(ref, where('fecha','==',fecha));
  return onSnapshot(
    qy,
    (snap)=> onData(snap.docs.map((d)=>({ id:d.id, ...d.data() }))),
    (err)=> onError?.(err)
  );
}
export function streamAttendanceRecent(onData,max=300,onError){
  const ref=collection(db,ATTENDANCE_COL);
  const qy=query(ref,orderBy('createdAt','desc'),limit(max));
  return onSnapshot(
    qy,
    (snap)=> onData(snap.docs.map((d)=>({ id:d.id, ...d.data() }))),
    (err)=> onError?.(err)
  );
}
export function streamImportReplacementsByDate(fecha,onData,onError){
  if(!fecha){ onData?.([]); return ()=>{}; }
  const ref=collection(db,IMPORT_REPLACEMENTS_COL);
  const qy=query(ref, where('fecha','==',fecha));
  return onSnapshot(
    qy,
    (snap)=> onData(snap.docs.map((d)=>({ id:d.id, ...d.data() }))),
    (err)=> onError?.(err)
  );
}
export async function listSedeStatusRange(dateFrom,dateTo){
  if(!dateFrom || !dateTo) return [];
  const ref=collection(db,SEDE_STATUS_COL);
  const qy=query(ref, where('fecha','>=',dateFrom), where('fecha','<=',dateTo), orderBy('fecha','asc'));
  const snap=await getDocs(qy);
  return snap.docs.map((d)=>({ id:d.id, ...d.data() }));
}
export async function listAttendanceRange(dateFrom,dateTo){
  if(!dateFrom || !dateTo) return [];
  const ref=collection(db,ATTENDANCE_COL);
  const qy=query(ref, where('fecha','>=',dateFrom), where('fecha','<=',dateTo), orderBy('fecha','asc'));
  const snap=await getDocs(qy);
  return snap.docs.map((d)=>({ id:d.id, ...d.data() }));
}
export async function listImportReplacementsRange(dateFrom,dateTo){
  if(!dateFrom || !dateTo) return [];
  const ref=collection(db,IMPORT_REPLACEMENTS_COL);
  const qy=query(ref, where('fecha','>=',dateFrom), where('fecha','<=',dateTo), orderBy('fecha','asc'));
  const snap=await getDocs(qy);
  return snap.docs.map((d)=>({ id:d.id, ...d.data() }));
}

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
    plannedCount: data.plannedCount||0,
    expectedCount: data.expectedCount||0,
    foundCount: data.foundCount||0,
    missingCount: data.missingCount||0,
    extraCount: data.extraCount||0,
    missingSupervisorsCount: data.missingSupervisorsCount||0,
    missingSupernumerariosCount: data.missingSupernumerariosCount||0,
    missingDocs: data.missingDocs||[],
    extraDocs: data.extraDocs||[],
    missingSupervisors: data.missingSupervisors||[],
    missingSupernumerarios: data.missingSupernumerarios||[],
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

export async function saveImportReplacements({ importId=null, fechaOperacion=null, assignments=[] }={}){
  const data=Array.isArray(assignments)? assignments.filter(Boolean): [];
  const fechas=new Set();
  data.forEach((a)=>{
    const f=String(a?.fecha||fechaOperacion||'').trim();
    if(f) fechas.add(f);
  });
  for(const f of fechas){
    if(await isOperationDayClosed(f)) throw new Error(`La fecha ${f} ya esta cerrada y no admite cambios.`);
  }
  const used=new Set();
  for(const a of data){
    if(a.decision==='reemplazo'){
      const sid=String(a.supernumerarioId||'').trim();
      if(!sid) throw new Error('Falta supernumerario en una fila de reemplazo.');
      if(used.has(sid)) throw new Error('Un supernumerario no puede asignarse dos veces.');
      used.add(sid);
    }
  }
  const batch=writeBatch(db);
  for(const a of data){
    const empId=String(a.empleadoId||'').trim();
    const fecha=String(a.fecha||fechaOperacion||'').trim();
    if(!empId || !fecha) continue;
    const ref=doc(db,IMPORT_REPLACEMENTS_COL,`${fecha}_${empId}`);
    batch.set(ref, replaceUndefined({
      importId: importId||null,
      fechaOperacion: fechaOperacion||fecha,
      fecha,
      empleadoId: a.empleadoId||null,
      documento: a.documento||null,
      nombre: a.nombre||null,
      sedeCodigo: a.sedeCodigo||null,
      sedeNombre: a.sedeNombre||null,
      novedadCodigo: a.novedadCodigo||null,
      novedadNombre: a.novedadNombre||null,
      decision: a.decision||'ausentismo',
      supernumerarioId: a.supernumerarioId||null,
      supernumerarioDocumento: a.supernumerarioDocumento||null,
      supernumerarioNombre: a.supernumerarioNombre||null,
      ts: serverTimestamp(),
      actorUid: auth.currentUser?.uid||null,
      actorEmail: (auth.currentUser?.email||'').toLowerCase()||null
    }), { merge:true });
  }
  await batch.commit();
  return { saved:data.length };
}

export async function isOperationDayClosed(fecha){
  const day=String(fecha||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ref=doc(db,'daily_closures',day);
  const snap=await getDoc(ref);
  if(!snap.exists()) return false;
  const row=snap.data()||{};
  return row.locked===true || String(row.status||'').trim()==='closed';
}

export async function listClosedOperationDaysRange(dateFrom,dateTo){
  if(!dateFrom || !dateTo) return [];
  const ref=collection(db,'daily_closures');
  const qy=query(ref, where('fecha','>=',dateFrom), where('fecha','<=',dateTo), orderBy('fecha','asc'));
  const snap=await getDocs(qy);
  return snap.docs
    .map((d)=> ({ id:d.id, ...d.data() }))
    .filter((r)=> r.locked===true || String(r.status||'').trim()==='closed')
    .map((r)=> String(r.fecha||'').trim())
    .filter(Boolean);
}
