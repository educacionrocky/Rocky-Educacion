import { el, qs } from '../utils/dom.js';
import { navigate } from '../router.js';
import { getState, subscribe } from '../state.js';
import { can, isSuperAdmin, PERMS } from '../permissions.js';
export const Sidebar=()=>{
  const container=el('div',{});
  const top=el('div',{className:'sidebar__top'},[
    el('div',{className:'sidebar__brand'},['RockyPro']),
    el('button',{className:'btn sidebar__collapse-btn',id:'btnCollapse'},['⟷'])
  ]);
  const sections=[]; const { user, userProfile }=getState();
  if(user && userProfile){
    if(isSuperAdmin()) sections.push(section('Gobierno',[ navLink('Centro de Permisos','/permissions') ]));
    const adminLinks=[]; if(can(PERMS.MANAGE_USERS)) adminLinks.push(navLink('Usuarios','/users')); if(can(PERMS.MANAGE_ZONES)) adminLinks.push(navLink('Zonas','/zones'));
    if(can(PERMS.MANAGE_DEPENDENCIES)) adminLinks.push(navLink('Dependencias','/dependencies'));
    if(can(PERMS.MANAGE_SEDES)) adminLinks.push(navLink('Sedes','/sedes'));
    if(can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Empleados','/employees'));
    if(can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Cargue masivo','/bulk-upload'));
    if(can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Cargos','/cargos'));
    if(can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Novedades','/novedades'));
    if(can(PERMS.MANAGE_SUPERVISORS)) adminLinks.push(navLink('Supervisores','/supervisors'));
    if(adminLinks.length) sections.push(section('Administración',adminLinks));
    const editorLinks=[]; if(can(PERMS.IMPORT_DATA)) editorLinks.push(navLink('Importar datos','/imports')); if(can(PERMS.VIEW_IMPORT_HISTORY)) editorLinks.push(navLink('Historial de importaciones','/import-history')); if(can(PERMS.RUN_PAYROLL)) editorLinks.push(navLink('Nómina','/payroll')); if(can(PERMS.MANAGE_ABSENTEEISM)) editorLinks.push(navLink('Ausentismo','/absenteeism'));
    if(editorLinks.length) sections.push(section('Operación',editorLinks));
    if(can(PERMS.VIEW_REPORTS)) sections.push(section('Reportes',[ navLink('Reportes','/reports') ]));
    if(can(PERMS.UPLOAD_DATA)) sections.push(section('Carga de Información',[ navLink('Cargar datos','/upload') ]));
  }
  container.replaceChildren(top,...sections);
  const btn=qs('#btnCollapse',container); btn.addEventListener('click',()=>{ const aside=document.getElementById('app-sidebar'); const c=aside.getAttribute('data-collapsed')==='true'; aside.setAttribute('data-collapsed',c?'false':'true'); });
  const apply=(t)=> document.documentElement.setAttribute('data-theme',t); apply(getState().theme); const unsub=subscribe('theme',apply); container._cleanup=()=>unsub?.(); return container;
};
function section(title,links){ return el('div',{className:'sidebar__section'},[ el('div',{className:'sidebar__section-title'},[title]), el('nav',{className:'sidebar__nav'},links) ]); }
function navLink(text,to){ const a=el('a',{href:`#${to}`,className:'sidebar__nav-link'},[ el('span',{className:'sidebar__item-text'},[text]) ]); a.addEventListener('click',(e)=>{ e.preventDefault(); navigate(to); document.querySelectorAll('.sidebar__nav-link').forEach(n=>n.classList.remove('is-active')); a.classList.add('is-active');}); return a; }
