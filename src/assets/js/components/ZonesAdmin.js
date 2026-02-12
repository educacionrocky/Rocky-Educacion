import { el, qs } from '../utils/dom.js';
export const ZonesAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Zonas']),
    el('div',{className:'tabs mt-2'},[
      el('button',{id:'tabCreateBtn',className:'tab',type:'button'},['Crear']),
      el('button',{id:'tabListBtn',className:'tab is-active',type:'button'},['Consultar'])
    ]),
    el('div',{id:'tabCreate',className:'hidden'},[
      el('div',{className:'form-row mt-2'},[
        el('div',{},[ el('label',{className:'label'},['Codigo (automatico)']), el('input',{id:'zCode',className:'input',placeholder:'Se generara al crear',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Nombre']), el('input',{id:'zName',className:'input',placeholder:'Nombre de la zona'}) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear zona']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ])
    ]),
    el('div',{id:'tabList'},[
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Codigo o nombre...'}) ]),
        el('div',{},[ el('label',{className:'label'},['Estado']), el('select',{id:'selStatus',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'activo'},['Activos']), el('option',{value:'inactivo'},['Inactivos']) ]) ]),
        el('span',{className:'right text-muted'},['Doble clic en una fila para editar.'])
      ]),
      el('div',{className:'mt-2 table-wrap'},[
        el('table',{className:'table',id:'tbl'},[
          el('thead',{},[ el('tr',{},[ el('th',{},['Codigo']), el('th',{},['Nombre']), el('th',{},['Estado']), el('th',{},['Creado por']), el('th',{},['Creacion']), el('th',{},['Acciones']) ]) ]),
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
    const name=qs('#zName',ui).value.trim(); const msg=qs('#msgCreate',ui); msg.textContent=' ';
    if(!name){ msg.textContent='Escribe el nombre de la zona.'; return; }
    try{
      const code = await deps.getNextZoneCode?.();
      const id = await deps.createZone?.({ codigo: code, nombre: name });
      await deps.addAuditLog?.({ targetType:'zone', targetId:id, action:'create_zone', after:{ codigo:code, nombre:name, estado:'activo' } });
      qs('#zName',ui).value=''; msg.textContent='Zona creada OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });
  let snapshot=[]; const tbody=ui.querySelector('tbody');
  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  function render(){ const term=search(); const st=filterStatus(); const data=snapshot.filter(z=> ((!term||(z.codigo||'').toLowerCase().includes(term)||(z.nombre||'').toLowerCase().includes(term)) && (!st || z.estado===st))); tbody.replaceChildren(...data.map(z=> row(z))); }
  function row(z){ const tr=el('tr',{'data-id':z.id}); const tdCodigo=el('td',{},[z.codigo||'-']); const tdNombre=el('td',{},[z.nombre||'-']); const tdEstado=el('td',{},[ statusBadge(z.estado) ]); const tdActor=el('td',{},[ z.createdByEmail||z.createdByUid||'-' ]); const tdFecha=el('td',{},[ formatDate(z.createdAt) ]); const tdAcc=el('td',{},[ actionsCell(z) ]); tr.addEventListener('dblclick',()=> startEdit(tr,z)); tr.append(tdCodigo,tdNombre,tdEstado,tdActor,tdFecha,tdAcc); return tr; }
  function statusBadge(st){ return el('span',{className:'badge '+(st==='activo'?'badge--ok':'badge--off')},[st||'-']); }
  function formatDate(ts){ try{ const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null); return d? new Date(d).toLocaleString(): '-'; }catch{ return '-'; } }
  function actionsCell(z){ const box=el('div',{className:'row-actions'},[]); const btnEdit=el('button',{className:'btn'},['Editar']); btnEdit.addEventListener('click',()=>{ const tr=tbody.querySelector(`tr[data-id="${z.id}"]`); if(tr) startEdit(tr,z); }); const btnToggle=el('button',{className:'btn '+(z.estado==='activo'?'btn--danger':'' )},[ z.estado==='activo'?'Desactivar':'Activar' ]); btnToggle.addEventListener('click',async()=>{ const target=z.estado==='activo'?'inactivo':'activo'; if(!window.confirm(`${z.estado==='activo'?'Desactivar':'Activar'} zona "${z.nombre}"?`)) return; try{ await deps.setZoneStatus?.(z.id,target); await deps.addAuditLog?.({ targetType:'zone', targetId:z.id, action: target==='activo'?'activate_zone':'deactivate_zone', before:{estado:z.estado}, after:{estado:target} }); }catch(e){ alert('Error: '+(e?.message||e)); } }); box.append(btnEdit,btnToggle); return box; }
  function startEdit(tr,z){ const cur={ codigo:z.codigo||'', nombre:z.nombre||'' }; const tds=tr.querySelectorAll('td'); tds[0].replaceChildren(el('input',{className:'input',value:cur.codigo,style:'max-width:160px'})); tds[1].replaceChildren(el('input',{className:'input',value:cur.nombre,style:'max-width:260px'})); tds[2].replaceChildren(statusBadge(z.estado)); tds[3].textContent=z.createdByEmail||z.createdByUid||'-'; tds[4].textContent=formatDate(z.createdAt);
    const box=el('div',{className:'row-actions'},[]); const btnSave=el('button',{className:'btn btn--primary'},['Guardar']); const btnCancel=el('button',{className:'btn'},['Cancelar']); btnSave.addEventListener('click',async()=>{ const newCode=tds[0].querySelector('input').value.trim(); const newName=tds[1].querySelector('input').value.trim(); if(!newCode||!newName) return alert('Completa codigo y nombre.'); try{ if(newCode!==z.codigo){ const dup=await deps.findZoneByCode?.(newCode); if(dup && dup.id!==z.id) return alert('Ya existe una zona con ese codigo.'); } await deps.updateZone?.(z.id,{ codigo:newCode, nombre:newName }); await deps.addAuditLog?.({ targetType:'zone', targetId:z.id, action:'update_zone', before:{ codigo:z.codigo, nombre:z.nombre }, after:{ codigo:newCode, nombre:newName } }); }catch(e){ alert('Error: '+(e?.message||e)); } }); btnCancel.addEventListener('click',()=> render()); box.append(btnSave,btnCancel); tds[5].replaceChildren(box); }
  const un=deps.streamZones?.((arr)=>{ snapshot=arr||[]; render(); });
  qs('#txtSearch',ui).addEventListener('input',render); qs('#selStatus',ui).addEventListener('change',render);
  mount.replaceChildren(ui); return ()=> un?.();
};
