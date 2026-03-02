import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { Sidebar } from './components/Sidebar.js';

import { Home } from './components/Home.js';
import { Contact } from './components/Contact.js';
import { DataTreatment } from './components/DataTreatment.js';
import { About } from './components/About.js';
import { Login } from './components/Login.js';
import { Notes } from './components/Notes.js';

import { UsersAdmin } from './components/UsersAdmin.js';
import { ZonesAdmin } from './components/ZonesAdmin.js';
import { DependenciesAdmin } from './components/DependenciesAdmin.js';
import { SedesAdmin } from './components/SedesAdmin.js';
import { EmployeesAdmin } from './components/EmployeesAdmin.js';
import { SupernumerariosAdmin } from './components/SupernumerariosAdmin.js';
import { SupervisorsAdmin } from './components/SupervisorsAdmin.js';
import { CargosAdmin } from './components/CargosAdmin.js';
import { NovedadesAdmin } from './components/NovedadesAdmin.js';
import { CargueMasivoAdmin } from './components/CargueMasivoAdmin.js';
import { CargueMasivoSupernumerariosAdmin } from './components/CargueMasivoSupernumerariosAdmin.js';
import { CargueMasivoSedesAdmin } from './components/CargueMasivoSedesAdmin.js';
import { ImportHistory } from './components/ImportHistory.js';
import { Payroll } from './components/Payroll.js';
import { Absenteeism } from './components/Absenteeism.js';
import { Reports } from './components/Reports.js';
import { ImportReplacements } from './components/ImportReplacements.js';
import { CargarDatos } from './components/CargarDatos.js';
import { PermissionsCenter } from './components/PermissionsCenter.js';
import { WhatsAppLive } from './components/WhatsAppLive.js';
import { RegistroSede } from './components/RegistroSede.js';

import { addRoute, startRouter, navigate, refreshRoute } from './router.js';
import { getState, setState } from './state.js';
import { can, PERMS, isSuperAdmin } from './permissions.js';
import { USE_FIREBASE } from './config.js';

const sidebarMount=document.getElementById('app-sidebar');
const headerMount =document.getElementById('app-header');
const footerMount =document.getElementById('app-footer');
const root        =document.getElementById('app-root');

let deps={};
sidebarMount.replaceChildren(Sidebar());
headerMount.replaceChildren(Header());
footerMount.replaceChildren(Footer());

let unsubRoleMatrix=null; let unsubUserOverrides=null; let unsubAudit=null;

(function init(){
  if(USE_FIREBASE){
    import('./firebase.js')
      .then((fb) => {
        deps={
          authState:fb.authState, login:fb.login, register:fb.register, logout:fb.logout,
          ensureUserProfile:fb.ensureUserProfile, loadUserProfile:fb.loadUserProfile, createUserProfile:fb.createUserProfile,
          addNote:fb.addNote, streamNotes:fb.streamNotes,
          // permisos
          streamRoleMatrix:fb.streamRoleMatrix, setRolePermissions:fb.setRolePermissions, streamUserOverrides:fb.streamUserOverrides,
          getUserOverrides:fb.getUserOverrides, setUserOverrides:fb.setUserOverrides, clearUserOverrides:fb.clearUserOverrides,
          addAuditLog:fb.addAuditLog, streamAuditLogs:(cb)=>{ if(unsubAudit)unsubAudit(); unsubAudit=fb.streamAuditLogs(cb); return unsubAudit; },
          // users
          streamUsers:fb.streamUsers, setUserRole:fb.setUserRole, findUserByEmail:fb.findUserByEmail,
          // zonas
          streamZones:fb.streamZones, createZone:fb.createZone, updateZone:fb.updateZone, setZoneStatus:fb.setZoneStatus, findZoneByCode:fb.findZoneByCode, getNextZoneCode:fb.getNextZoneCode,
          // dependencias
          streamDependencies:fb.streamDependencies, createDependency:fb.createDependency, updateDependency:fb.updateDependency, setDependencyStatus:fb.setDependencyStatus, findDependencyByCode:fb.findDependencyByCode, getNextDependencyCode:fb.getNextDependencyCode,
          // sedes
          streamSedes:fb.streamSedes, createSede:fb.createSede, updateSede:fb.updateSede, setSedeStatus:fb.setSedeStatus, findSedeByCode:fb.findSedeByCode, getNextSedeCode:fb.getNextSedeCode,
          createSedesBulk:fb.createSedesBulk,
          // empleados
          streamEmployees:fb.streamEmployees, createEmployee:fb.createEmployee, updateEmployee:fb.updateEmployee, setEmployeeStatus:fb.setEmployeeStatus, findEmployeeByCode:fb.findEmployeeByCode, findEmployeeByDocument:fb.findEmployeeByDocument, getNextEmployeeCode:fb.getNextEmployeeCode,
          createEmployeesBulk:fb.createEmployeesBulk,
          // supernumerarios
          streamSupernumerarios:fb.streamSupernumerarios, createSupernumerario:fb.createSupernumerario, updateSupernumerario:fb.updateSupernumerario, setSupernumerarioStatus:fb.setSupernumerarioStatus, findSupernumerarioByCode:fb.findSupernumerarioByCode, findSupernumerarioByDocument:fb.findSupernumerarioByDocument, getNextSupernumerarioCode:fb.getNextSupernumerarioCode, createSupernumerariosBulk:fb.createSupernumerariosBulk,
          // cargos
          streamCargos:fb.streamCargos, createCargo:fb.createCargo, updateCargo:fb.updateCargo, setCargoStatus:fb.setCargoStatus, findCargoByCode:fb.findCargoByCode, getNextCargoCode:fb.getNextCargoCode,
          // novedades
          streamNovedades:fb.streamNovedades, createNovedad:fb.createNovedad, updateNovedad:fb.updateNovedad, setNovedadStatus:fb.setNovedadStatus, findNovedadByCode:fb.findNovedadByCode, findNovedadByCodigoNovedad:fb.findNovedadByCodigoNovedad, getNextNovedadCode:fb.getNextNovedadCode,
          // supervisores
          streamSupervisors:fb.streamSupervisors, createSupervisor:fb.createSupervisor, updateSupervisor:fb.updateSupervisor, setSupervisorStatus:fb.setSupervisorStatus, findSupervisorByCode:fb.findSupervisorByCode, findSupervisorByDocument:fb.findSupervisorByDocument, getNextSupervisorCode:fb.getNextSupervisorCode,
          // operacion
          confirmImportOperation:fb.confirmImportOperation, saveImportReplacements:fb.saveImportReplacements,
          isOperationDayClosed:fb.isOperationDayClosed, listClosedOperationDaysRange:fb.listClosedOperationDaysRange,
          listSedeStatusRange:fb.listSedeStatusRange, listAttendanceRange:fb.listAttendanceRange, listImportReplacementsRange:fb.listImportReplacementsRange,
          streamImportHistory:fb.streamImportHistory, streamWhatsAppIncoming:fb.streamWhatsAppIncoming,
          streamAttendanceByDate:fb.streamAttendanceByDate, streamAttendanceRecent:fb.streamAttendanceRecent, streamImportReplacementsByDate:fb.streamImportReplacementsByDate
        };

        // Re-render current route so Login receives hydrated deps.
        refreshRoute();

        fb.authState(async (user)=>{
          if(unsubRoleMatrix){unsubRoleMatrix();unsubRoleMatrix=null;} if(unsubUserOverrides){unsubUserOverrides();unsubUserOverrides=null;}
          if(!user){ setState({ user:null, userProfile:null, userOverrides:{} }); headerMount.replaceChildren(Header(deps)); sidebarMount.replaceChildren(Sidebar()); if(location.hash!=="#/login") navigate('/login'); else refreshRoute(); return; }
          await fb.ensureUserProfile(user); const profile=await fb.loadUserProfile(user.uid); setState({ user, userProfile: profile });
          unsubRoleMatrix=fb.streamRoleMatrix((map)=> setState({ roleMatrix: map }));
          unsubUserOverrides=fb.streamUserOverrides(user.uid,(ov)=> setState({ userOverrides: ov||{} }));
          headerMount.replaceChildren(Header(deps)); sidebarMount.replaceChildren(Sidebar());
          if(location.hash==='' || location.hash==="#/login") navigate('/');
        });
      })
      .catch((err) => {
        console.error('Firebase init failed:', err);
      });
  } else {
    setState({ user:null, userProfile:null });
  }

  addRoute('/login', ()=> Login(root, deps));
  addRoute('/', ()=> requireAuth(()=> Home(root, deps)));
  addRoute('/contact', ()=> requireAuth(()=> Contact(root)));
  addRoute('/data-treatment', ()=> requireAuth(()=> DataTreatment(root)));
  addRoute('/about', ()=> requireAuth(()=> About(root)));
  addRoute('/notes', ()=> requireAuth(()=> Notes(root)));

  // Gobierno
  addRoute('/permissions', ()=> requireAuth(()=> { if(!isSuperAdmin()) return block('Solo SuperAdmin puede ver esto.'); PermissionsCenter(root, deps); }));

  // Administración
  addRoute('/users', ()=> requireAuth(()=> guard(PERMS.MANAGE_USERS, ()=> UsersAdmin(root, deps))));
  addRoute('/zones', ()=> requireAuth(()=> guard(PERMS.MANAGE_ZONES, ()=> ZonesAdmin(root, deps))));
  addRoute('/dependencies', ()=> requireAuth(()=> guard(PERMS.MANAGE_DEPENDENCIES, ()=> DependenciesAdmin(root, deps))));
  addRoute('/sedes', ()=> requireAuth(()=> guard(PERMS.MANAGE_SEDES, ()=> SedesAdmin(root, deps))));
  addRoute('/bulk-upload-sedes', ()=> requireAuth(()=> guard(PERMS.MANAGE_SEDES, ()=> CargueMasivoSedesAdmin(root, deps))));
  addRoute('/employees', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> EmployeesAdmin(root, deps))));
  addRoute('/supernumerarios', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> SupernumerariosAdmin(root, deps))));
  addRoute('/bulk-upload-supernumerarios', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> CargueMasivoSupernumerariosAdmin(root, deps))));
  addRoute('/bulk-upload', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> CargueMasivoAdmin(root, deps))));
  addRoute('/cargos', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> CargosAdmin(root, deps))));
  addRoute('/novedades', ()=> requireAuth(()=> guard(PERMS.MANAGE_EMPLOYEES, ()=> NovedadesAdmin(root, deps))));
  addRoute('/supervisors', ()=> requireAuth(()=> guard(PERMS.MANAGE_SUPERVISORS, ()=> SupervisorsAdmin(root, deps))));

  // Operación
  addRoute('/imports', ()=> { navigate('/registros-vivo'); return null; });
  addRoute('/whatsapp-live', ()=> { navigate('/registros-vivo'); return null; });
  addRoute('/registros-vivo', ()=> requireAuth(()=> guard(PERMS.IMPORT_DATA, ()=> WhatsAppLive(root, deps))));
  addRoute('/registro-sede', ()=> requireAuth(()=> guard(PERMS.IMPORT_DATA, ()=> RegistroSede(root, deps))));
  addRoute('/imports-replacements', ()=> requireAuth(()=> guard(PERMS.IMPORT_DATA, ()=> ImportReplacements(root, deps))));
  addRoute('/import-history', ()=> requireAuth(()=> guard(PERMS.VIEW_IMPORT_HISTORY, ()=> ImportHistory(root, deps))));
  addRoute('/payroll', ()=> requireAuth(()=> guard(PERMS.RUN_PAYROLL, ()=> Payroll(root))));
  addRoute('/absenteeism', ()=> requireAuth(()=> guard(PERMS.MANAGE_ABSENTEEISM, ()=> Absenteeism(root, deps))));

  // Consultor
  addRoute('/reports', ()=> requireAuth(()=> guard(PERMS.VIEW_REPORTS, ()=> Reports(root))));

  // Supervisor/Empleado
  addRoute('/upload', ()=> requireAuth(()=> guard(PERMS.UPLOAD_DATA, ()=> CargarDatos(root))));

  startRouter();
})();
function requireAuth(ok){ const { user }=getState(); if(!user){ navigate('/login'); return; } return ok?.(); }
function guard(perm, ok){ if(!can(perm)) return block('No tienes permiso para acceder a esta sección.'); return ok?.(); }
function block(text){ const div=document.createElement('div'); div.className='main-card'; div.innerHTML=`<h2 style="margin:0 0 .5rem 0;">RockyEDU</h2><p>${text}</p>`; root.replaceChildren(div); return null; }
