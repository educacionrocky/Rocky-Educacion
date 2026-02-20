import { el } from '../utils/dom.js';
import { getRole } from '../permissions.js';
import { navigate } from '../router.js';
import { getState } from '../state.js';

export const Header=(deps={})=>{
  const { user }=getState();
  const role=getRole();

  const nav=el('nav',{className:'header-nav container'},[
    navLink('Inicio','/',()=> navigate('/')),
    navLink('Ajustes','/settings',()=> navigate('/settings')),
    navLink('Acerca','/about',()=> navigate('/about')),
    el('div',{className:'header-nav__spacer'},[]),
    user
      ? el('button',{className:'btn header-btn',onclick:async()=>{ await deps.logout?.(); navigate('/login'); }},['Cerrar sesion'])
      : el('button',{className:'btn btn--primary header-btn',onclick:()=> navigate('/login')},['Iniciar sesion']),
    el('span',{className:'role-badge',title:'Rol actual'},['Rol: ', role || '-'])
  ]);
  return el('div',{className:'header'},[nav]);
};

function navLink(text,to,onClick){
  const a=el('a',{href:`#${to}`,className:'header-nav__link'},[text]);
  a.addEventListener('click',(e)=>{ e.preventDefault(); onClick?.(); });
  return a;
}
