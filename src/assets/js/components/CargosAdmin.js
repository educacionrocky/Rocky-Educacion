import { el, qs } from '../utils/dom.js';
export const CargosAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Cargos']),
    el('div',{className:'tabs mt-2'},[
      el('button',{id:'tabCreateBtn',className:'tab',type:'button'},['Crear']),
      el('button',{id:'tabListBtn',className:'tab is-active',type:'button'},['Consultar'])
    ]),
    el('div',{id:'tabCreate',className:'hidden'},[
      el('div',{className:'form-row mt-2'},[
        el('div',{},[ el('label',{className:'label'},['Codigo (automatico)']), el('input',{id:'cCode',className:'input',placeholder:'Se generara al crear',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Cargo']), el('input',{id:'cName',className:'input',placeholder:'Nombre del cargo'}) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear cargo']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ])
    ]),
    el('div',{id:'tabList'},[
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Codigo o cargo...'}) ]),
        el('div',{},[ el('label',{className:'label'},['Estado']), el('select',{id:'selStatus',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'activo'},['Activos']), el('option',{value:'inactivo'},['Inactivos']) ]) ]),
        el('span',{className:'right text-muted'},['Doble clic en una fila para editar.'])
      ]),
      el('div',{className:'mt-2 table-wrap'},[
        el('table',{className:'table',id:'tbl'},[
          el('thead',{},[ el('tr',{},[ el('th',{'data-sort':'codigo',style:'cursor:pointer'},['Codigo']), el('th',{'data-sort':'nombre',style:'cursor:pointer'},['Cargo']), el('th',{'data-sort':'estado',style:'cursor:pointer'},['Estado']), el('th',{'data-sort':'createdByEmail',style:'cursor:pointer'},['Creado por']), el('th',{'data-sort':'createdAt',style:'cursor:pointer'},['Creacion']), el('th',{},['Acciones']) ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'msg',className:'text-muted mt-2'},[' '])
    ])
  ]);

  const tabCreateBtn=qs('#tabCreateBtn',ui);
  const tabListBtn=qs('#tabListBtn',ui);
  const tabCreate=qs('#tabCreate',ui);
  const tabList=qs('#tabList',ui);
  function setTab(which){
    const isCreate=which==='create';
    tabCreateBtn.classList.toggle('is-active',isCreate);
    tabListBtn.classList.toggle('is-active',!isCreate);
    tabCreate.classList.toggle('hidden',!isCreate);
    tabList.classList.toggle('hidden',isCreate);
  }
  tabCreateBtn.addEventListener('click',()=> setTab('create'));
  tabListBtn.addEventListener('click',()=> setTab('list'));

  qs('#btnCreate',ui).addEventListener('click',async()=>{
    const name=qs('#cName',ui).value.trim(); const msg=qs('#msgCreate',ui); msg.textContent=' ';
    if(!name){ msg.textContent='Escribe el cargo.'; return; }
    try{
      const code=await deps.getNextCargoCode?.();
      const id=await deps.createCargo?.({ codigo:code, nombre:name });
      await deps.addAuditLog?.({ targetType:'cargo', targetId:id, action:'create_cargo', after:{ codigo:code, nombre:name, estado:'activo' } });
      qs('#cName',ui).value=''; msg.textContent='Cargo creado OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });
  let snapshot=[]; const tbody=ui.querySelector('tbody');
  let sortKey=''; let sortDir=1;
  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  function sortVal(c,key){ if(key==='createdAt'){ try{ const x=c.createdAt?.toDate?c.createdAt.toDate(): (c.createdAt?new Date(c.createdAt):null); return x?x.getTime():0; }catch{return 0;} } return String(c[key]??'').toLowerCase(); }
  function sortData(data){ if(!sortKey) return data; const out=[...data]; out.sort((a,b)=>{ const va=sortVal(a,sortKey); const vb=sortVal(b,sortKey); if(va===vb) return 0; return va>vb?sortDir:-sortDir; }); return out; }
  function updateSortIndicators(){ ui.querySelectorAll('th[data-sort]').forEach((th)=>{ const base=th.dataset.baseLabel||th.textContent.replace(/\s[\^v]$/,''); th.dataset.baseLabel=base; const key=th.getAttribute('data-sort'); th.textContent=(sortKey===key)?`${base} ${sortDir===1?'^':'v'}`:base; }); }
  function initSorting(){ ui.querySelectorAll('th[data-sort]').forEach((th)=> th.addEventListener('click',()=>{ const key=th.getAttribute('data-sort'); if(sortKey===key) sortDir=sortDir*-1; else { sortKey=key; sortDir=1; } render(); })); }
  function render(){ const term=search(); const st=filterStatus(); const data=snapshot.filter(c=> ((!term||(c.codigo||'').toLowerCase().includes(term)||(c.nombre||'').toLowerCase().includes(term)) && (!st || c.estado===st))); tbody.replaceChildren(...sortData(data).map(c=> row(c))); const msg=qs('#msg',ui); if(msg) msg.textContent=`Total registros filtrados: ${data.length}`; updateSortIndicators(); }
  function row(c){ const tr=el('tr',{'data-id':c.id}); const tdCodigo=el('td',{},[c.codigo||'-']); const tdNombre=el('td',{},[c.nombre||'-']); const tdEstado=el('td',{},[ statusBadge(c.estado) ]); const tdActor=el('td',{},[ c.createdByEmail||c.createdByUid||'-' ]); const tdFecha=el('td',{},[ formatDate(c.createdAt) ]); const tdAcc=el('td',{},[ actionsCell(c) ]); tr.addEventListener('dblclick',()=> startEdit(tr,c)); tr.append(tdCodigo,tdNombre,tdEstado,tdActor,tdFecha,tdAcc); return tr; }
  function statusBadge(st){ return el('span',{className:'badge '+(st==='activo'?'badge--ok':'badge--off')},[st||'-']); }
  function formatDate(ts){ try{ const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null); return d? new Date(d).toLocaleString(): '-'; }catch{ return '-'; } }
  function actionsCell(c){ const box=el('div',{className:'row-actions'},[]); const btnEdit=el('button',{className:'btn'},['Editar']); btnEdit.addEventListener('click',()=>{ const tr=tbody.querySelector(`tr[data-id="${c.id}"]`); if(tr) startEdit(tr,c); }); const btnToggle=el('button',{className:'btn '+(c.estado==='activo'?'btn--danger':'' )},[ c.estado==='activo'?'Desactivar':'Activar' ]); btnToggle.addEventListener('click',async()=>{ const target=c.estado==='activo'?'inactivo':'activo'; if(!window.confirm(`${c.estado==='activo'?'Desactivar':'Activar'} cargo "${c.nombre}"?`)) return; try{ await deps.setCargoStatus?.(c.id,target); await deps.addAuditLog?.({ targetType:'cargo', targetId:c.id, action: target==='activo'?'activate_cargo':'deactivate_cargo', before:{estado:c.estado}, after:{estado:target} }); }catch(e){ alert('Error: '+(e?.message||e)); } }); box.append(btnEdit,btnToggle); return box; }
  function startEdit(tr,c){ const cur={ codigo:c.codigo||'', nombre:c.nombre||'' }; const tds=tr.querySelectorAll('td'); tds[0].replaceChildren(el('input',{className:'input',value:cur.codigo,style:'max-width:160px'})); tds[1].replaceChildren(el('input',{className:'input',value:cur.nombre,style:'max-width:260px'})); tds[2].replaceChildren(statusBadge(c.estado)); tds[3].textContent=c.createdByEmail||c.createdByUid||'-'; tds[4].textContent=formatDate(c.createdAt);
    const box=el('div',{className:'row-actions'},[]); const btnSave=el('button',{className:'btn btn--primary'},['Guardar']); const btnCancel=el('button',{className:'btn'},['Cancelar']); btnSave.addEventListener('click',async()=>{ const newCode=tds[0].querySelector('input').value.trim(); const newName=tds[1].querySelector('input').value.trim(); if(!newCode||!newName) return alert('Completa codigo y cargo.'); try{ if(newCode!==c.codigo){ const dup=await deps.findCargoByCode?.(newCode); if(dup && dup.id!==c.id) return alert('Ya existe un cargo con ese codigo.'); } await deps.updateCargo?.(c.id,{ codigo:newCode, nombre:newName }); await deps.addAuditLog?.({ targetType:'cargo', targetId:c.id, action:'update_cargo', before:{ codigo:c.codigo, nombre:c.nombre }, after:{ codigo:newCode, nombre:newName } }); }catch(e){ alert('Error: '+(e?.message||e)); } }); btnCancel.addEventListener('click',()=> render()); box.append(btnSave,btnCancel); tds[5].replaceChildren(box); }
  const un=deps.streamCargos?.((arr)=>{ snapshot=arr||[]; render(); });
  qs('#txtSearch',ui).addEventListener('input',render); qs('#selStatus',ui).addEventListener('change',render);
  initSorting();
  mount.replaceChildren(ui); return ()=> un?.();
};
