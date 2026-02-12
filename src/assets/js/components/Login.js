import { el, qs } from '../utils/dom.js';
export const Login=(mount,deps={})=>{
  let currentTab='login';
  const root=el('section',{className:'main-card'},[
    el('h2',{},['Acceso']),
    el('div',{className:'tabs'},[
      tabBtn('Acceso','login'),
      tabBtn('Crear cuenta','register')
    ]),
    el('div',{id:'tabContent',className:'mt-2'},[])
  ]);
  function tabBtn(text,key){ const b=el('button',{className:'tab'+(currentTab===key?' is-active':'')},[text]); b.addEventListener('click',()=>{ currentTab=key; renderTab();}); return b; }
  function renderTab(){ const c=qs('#tabContent',root); if(currentTab==='login') c.replaceChildren(loginForm()); else c.replaceChildren(registerForm()); const idx={login:0,register:1}[currentTab]; root.querySelectorAll('.tab').forEach(b=>b.classList.remove('is-active')); root.querySelectorAll('.tab')[idx].classList.add('is-active'); }
  function loginForm(){ const ui=el('div',{},[
    el('label',{className:'label mt-2'},['Correo']), el('input',{id:'email',type:'email',placeholder:'correo@dominio.com',className:'input'}),
    el('label',{className:'label mt-2'},['Contraseña']), el('input',{id:'pass',type:'password',placeholder:'********',className:'input'}),
    el('div',{className:'mt-2'},[ el('button',{id:'btnLogin',className:'btn btn--primary'},['Iniciar sesión']) ]),
    el('p',{className:'mt-2'},[ el('span',{className:'text-muted'},['¿No tienes cuenta? ']), el('span',{className:'link',onclick:()=>{ currentTab='register'; renderTab(); }},['Crear cuenta']) ]),
    el('p',{id:'msg',className:'text-muted mt-2'},[' '])
  ]);
    if(!deps.login){ qs('#msg',ui).textContent='Firebase no está activo.'; }
    else ui.querySelector('#btnLogin').addEventListener('click',async()=>{
      try{ const email=ui.querySelector('#email').value.trim(); const pass=ui.querySelector('#pass').value; await deps.login(email,pass); qs('#msg',ui).textContent='Sesión iniciada ✅'; }
      catch(e){ qs('#msg',ui).textContent='Error al iniciar sesión: '+(e?.message||e); }
    });
    return ui; }
  function registerForm(){ const ui=el('div',{},[
    el('label',{className:'label mt-2'},['Documento']), el('input',{id:'doc',placeholder:'Número de documento',className:'input'}),
    el('label',{className:'label mt-2'},['Nombre completo']), el('input',{id:'name',placeholder:'Tu nombre y apellidos',className:'input'}),
    el('label',{className:'label mt-2'},['Correo']), el('input',{id:'email',type:'email',placeholder:'correo@dominio.com',className:'input'}),
    el('label',{className:'label mt-2'},['Contraseña']), el('input',{id:'pass',type:'password',placeholder:'********',className:'input'}),
    el('div',{className:'mt-2'},[ el('button',{id:'btnReg',className:'btn btn--primary'},['Crear cuenta']) ]),
    el('p',{className:'mt-2'},[ el('span',{className:'link',onclick:()=>{ currentTab='login'; renderTab(); }},['← Volver a Acceso']) ]),
    el('p',{id:'msg',className:'text-muted mt-2'},[' '])
  ]);
    if(!deps.register||!deps.createUserProfile){ qs('#msg',ui).textContent='Firebase no está activo.'; }
    else ui.querySelector('#btnReg').addEventListener('click',async()=>{
      try{ const doc=ui.querySelector('#doc').value.trim(); const name=ui.querySelector('#name').value.trim(); const email=ui.querySelector('#email').value.trim(); const pass=ui.querySelector('#pass').value; if(!doc||!name||!email||!pass) throw new Error('Completa documento, nombre, correo y contraseña.'); const cred=await deps.register(email,pass); await deps.createUserProfile(cred.user.uid,{ email, nombre:name, documento:doc }); qs('#msg',ui).textContent='Cuenta creada ✅. Ahora inicia sesión.'; currentTab='login'; renderTab(); }
      catch(e){ qs('#msg',ui).textContent='Error al registrar: '+(e?.message||e); }
    });
    return ui; }
  renderTab(); mount.replaceChildren(root);
};