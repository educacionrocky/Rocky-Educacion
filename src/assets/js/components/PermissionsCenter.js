import { el, qs } from '../utils/dom.js';
import { isSuperAdmin } from '../permissions.js';
import { ALL_ROLES, ROLES, PERMS, permsForRole } from '../roles.js';
import { getState } from '../state.js';
export const PermissionsCenter=(mount, deps={})=>{
  if(!isSuperAdmin()){
    mount.replaceChildren(el('section',{className:'main-card'},[ el('h2',{},['Centro de Permisos']), el('p',{},['Solo SuperAdmin puede administrar permisos.']) ]));
    return;
  }
  let currentTab='roles'; let selectedRole=ROLES.ADMIN; let userTarget=null; let userOverrides={}; let originalOverrides={};
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Centro de Permisos']),
    el('div',{className:'tabs'},[ tabBtn('Por rol','roles'), tabBtn('Por usuario','users'), tabBtn('Auditoría','audit') ]),
    el('div',{id:'tabContent',className:'mt-2'},[])
  ]);
  function tabBtn(text,key){ const b=el('button',{className:'tab'+(currentTab===key?' is-active':'')},[text]); b.addEventListener('click',()=>{ currentTab=key; renderTab();}); return b; }
  function renderTab(){ const c=qs('#tabContent',ui); if(currentTab==='roles') c.replaceChildren(renderRolesTab()); else if(currentTab==='users') c.replaceChildren(renderUsersTab()); else c.replaceChildren(renderAuditTab()); const idx={roles:0,users:1,audit:2}[currentTab]; ui.querySelectorAll('.tab').forEach(b=>b.classList.remove('is-active')); ui.querySelectorAll('.tab')[idx].classList.add('is-active'); }
  function renderRolesTab(){
    const s=getState(); const matrix=s.roleMatrix||{}; const fromMatrix=matrix[selectedRole]; const computedBase= fromMatrix ?? permsForRole(selectedRole);
    const original=JSON.parse(JSON.stringify(computedBase)); const base=JSON.parse(JSON.stringify(computedBase));
    const roleSel=el('select',{className:'select',style:'max-width:260px'}, ALL_ROLES.map(r=> el('option',{value:r,selected:r===selectedRole},[r]) ));
    roleSel.addEventListener('change',()=>{ selectedRole=roleSel.value; renderTab(); });
    const editingSuperAdmin= selectedRole===ROLES.SUPERADMIN;
    const grid=el('div',{className:'perms-grid mt-2'}, Object.values(PERMS).map(k=> permCheckbox(k, base[k]===true, (ch)=> base[k]=ch, editingSuperAdmin)) );
    const warnSA = editingSuperAdmin? el('p',{className:'warn mt-1'},['Edición de SuperAdmin está bloqueada (solo lectura).']): null;
    const actions=el('div',{className:'mt-2'},[
      el('button',{className:'btn btn--primary',disabled:editingSuperAdmin,onclick:async()=>{
        if(editingSuperAdmin) return; if(!window.confirm(`¿Guardar cambios de permisos para el rol "${selectedRole}"?`)) return; try{
          const before=original; const after=base; await deps.setRolePermissions?.(selectedRole,after); await deps.addAuditLog?.({targetType:'role',targetId:selectedRole,action:'update_role_matrix',before,after}); alert('Permisos del rol actualizados.');
        }catch(e){ alert('Error al guardar: '+(e?.message||e)); }
      }},['Guardar cambios del rol'])
    ]);
    return el('div',{},[ el('label',{className:'label'},['Selecciona un rol']), roleSel, warnSA, grid, actions ].filter(Boolean));
  }
  function permCheckbox(key,val,onChange,disabled){ const id=`perm_${key}_${Math.random().toString(36).slice(2,6)}`; const w=el('label',{className:'perm-item',title:disabled?'Solo lectura para SuperAdmin':''},[ el('input',{type:'checkbox',id,checked:!!val,disabled:!!disabled}), el('span',{},[key]) ]); if(!disabled){ w.querySelector('input').addEventListener('change',(e)=> onChange(e.target.checked)); } return w; }
  function renderUsersTab(){ const emailInput=el('input',{className:'input',placeholder:'Correo del usuario'}); const btn=el('button',{className:'btn mt-1'},['Cargar usuario']); const box=el('div',{className:'mt-2'},[]); btn.addEventListener('click',async()=>{ try{ const res=await deps.findUserByEmail?.(emailInput.value.trim()); if(!res){ box.replaceChildren(el('p',{className:'error'},['Usuario no encontrado'])); return; } userTarget=res; const ov=await deps.getUserOverrides?.(userTarget.uid)||{}; userOverrides=JSON.parse(JSON.stringify(ov)); originalOverrides=JSON.parse(JSON.stringify(ov)); box.replaceChildren(renderUserOverrides()); }catch(e){ box.replaceChildren(el('p',{className:'error'},['Error: ',e?.message||e])); } }); return el('div',{},[ el('label',{className:'label'},['Buscar usuario por correo']), emailInput, btn, box ]); }
  function renderUserOverrides(){ const current=JSON.parse(JSON.stringify(userOverrides)); const grid=el('div',{className:'perms-grid mt-2'}, Object.values(PERMS).map(k=> permCheckbox(k, current[k]===true, (ch)=> current[k]=ch, false))); const info=el('p',{className:'text-muted mt-1'},[`Usuario: ${userTarget.email} (${userTarget.displayName||'—'})`]); const actions=el('div',{className:'mt-2'},[
    el('button',{className:'btn btn--primary',onclick:async()=>{ if(!window.confirm(`¿Guardar overrides para ${userTarget.email}?`)) return; try{ const before=originalOverrides; const after=current; await deps.setUserOverrides?.(userTarget.uid,after); await deps.addAuditLog?.({targetType:'user',targetId:userTarget.uid,action:'update_user_overrides',before,after}); originalOverrides=JSON.parse(JSON.stringify(after)); alert('Overrides guardados.'); }catch(e){ alert('Error: '+(e?.message||e)); } }},['Guardar overrides']),
    el('button',{className:'btn btn--danger',style:'margin-left:.5rem',onclick:async()=>{ if(!window.confirm(`¿Quitar TODOS los overrides de ${userTarget.email}?`)) return; try{ const before=originalOverrides; await deps.clearUserOverrides?.(userTarget.uid); await deps.addAuditLog?.({targetType:'user',targetId:userTarget.uid,action:'clear_user_overrides',before}); originalOverrides={}; userOverrides={}; alert('Overrides eliminados.'); }catch(e){ alert('Error: '+(e?.message||e)); } }},['Quitar overrides'])
  ]); return el('div',{},[info,grid,actions]); }
  function renderAuditTab(){ const box=el('div',{className:'mt-1'},[ el('p',{className:'text-muted'},['Últimos cambios de permisos']) ]); const list=el('div',{id:'auditList',className:'mt-1'},[]); box.append(list); deps.streamAuditLogs?.((items)=>{ list.replaceChildren(...items.map(it=> renderAuditItem(it))); }); return box; }
  function renderAuditItem(it){ const date=it.ts?.toDate? it.ts.toDate(): (it.ts||new Date()); return el('div',{className:'card',style:'margin-top:.5rem'},[ el('div',{},[ el('strong',{},[it.action||'acción']),' — ', new Date(date).toLocaleString() ]), el('div',{className:'mt-1 text-muted'},[`Actor: ${it.actorEmail||it.actorUid||'—'}`]), el('div',{className:'mt-1'},[`Target: ${it.targetType}/${it.targetId}`]) ]); }
  renderTab(); mount.replaceChildren(ui);
};