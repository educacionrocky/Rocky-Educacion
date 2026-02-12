import { el } from '../utils/dom.js';
import { PERMS, can } from '../permissions.js';
export const UsersAdmin=(mount,deps={})=>{
  if(!can(PERMS.MANAGE_USERS)) return mount.replaceChildren(el('section',{className:'main-card'},[ el('h2',{},['Usuarios']), el('p',{},['No tienes permiso para gestionar usuarios.']) ]));
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Gestión de usuarios']),
    el('div',{className:'toolbar'},[
      el('input',{id:'search',className:'input',placeholder:'Buscar por correo o nombre...'}),
      el('select',{id:'roleFilter',className:'select'},[]),
      el('button',{id:'btnRefresh',className:'btn'},['Refrescar'])
    ]),
    el('div',{className:'table-wrap'},[
      el('table',{className:'table',id:'tbl'},[
        el('thead',{},[ el('tr',{},[ el('th',{},['Usuario']), el('th',{},['Correo']), el('th',{},['Rol']), el('th',{},['Acciones']) ]) ]),
        el('tbody',{})
      ])
    ]),
    el('p',{id:'msg',className:'mt-2 text-muted'},[' '])
  ]);
  const roles=['superadmin','admin','editor','consultor','supervisor','empleado'];
  const roleFilter=ui.querySelector('#roleFilter'); roleFilter.append( el('option',{value:''},['Todos los roles']), ...roles.map(r=> el('option',{value:r},[r])) );
  let data=[]; function renderRows(){ const term=ui.querySelector('#search').value.trim().toLowerCase(); const rf=ui.querySelector('#roleFilter').value; const tbody=ui.querySelector('tbody'); const rows=data.filter(u=>(!term||(u.email||'').toLowerCase().includes(term)||(u.displayName||'').toLowerCase().includes(term))).filter(u=>(!rf||(u.role===rf))).map(u=> renderRow(u)); tbody.replaceChildren(...rows); }
  function renderRow(u){ const tr=el('tr',{}); tr.append( el('td',{},[u.displayName||'—']), el('td',{},[u.email||'—']), el('td',{},[ roleSelect(u) ]), el('td',{},[ el('div',{className:'actions'},[]) ]) ); return tr; }
  function roleSelect(u){ const sel=el('select',{className:'select'}, roles.map(r=> el('option',{value:r,selected:u.role===r},[r]) )); sel.addEventListener('change',async()=>{ try{ await deps.setUserRole(u.uid, sel.value); ui.querySelector('#msg').textContent=`Rol actualizado para ${u.email||u.uid}: ${sel.value}`; }catch(e){ ui.querySelector('#msg').textContent='Error al actualizar rol: '+(e?.message||e); sel.value=u.role; } }); return sel; }
  ui.querySelector('#search').addEventListener('input',renderRows); ui.querySelector('#roleFilter').addEventListener('change',renderRows); ui.querySelector('#btnRefresh').addEventListener('click',()=> deps.refreshUsers?.()); deps.streamUsers((users)=>{ data=users; renderRows(); }); mount.replaceChildren(ui);
};