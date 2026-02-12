import { el, qs } from '../utils/dom.js';
export const NovedadesAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Novedades']),
    el('div',{className:'tabs mt-2'},[
      el('button',{id:'tabCreateBtn',className:'tab',type:'button'},['Crear']),
      el('button',{id:'tabListBtn',className:'tab is-active',type:'button'},['Consultar'])
    ]),
    el('div',{id:'tabCreate',className:'hidden'},[
      el('div',{className:'form-row mt-2'},[
        el('div',{},[ el('label',{className:'label'},['Codigo (automatico)']), el('input',{id:'nCode',className:'input',placeholder:'Se generara al crear',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Codigo novedad']), el('input',{id:'nCodeRef',className:'input',placeholder:'Codigo de la novedad'}) ]),
        el('div',{},[ el('label',{className:'label'},['Nombre']), el('input',{id:'nName',className:'input',placeholder:'Nombre de la novedad'}) ]),
        el('div',{},[ el('label',{className:'label'},['Reemplazo']), el('select',{id:'nReemplazo',className:'select'},[ el('option',{value:''},['Seleccione...']), el('option',{value:'si'},['SI']), el('option',{value:'no'},['NO']) ]) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear novedad']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ])
    ]),
    el('div',{id:'tabList'},[
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Codigo o nombre...'}) ]),
        el('div',{},[ el('label',{className:'label'},['Estado']), el('select',{id:'selStatus',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'activo'},['Activos']), el('option',{value:'inactivo'},['Inactivos']) ]) ]),
        el('div',{},[ el('label',{className:'label'},['Reemplazo']), el('select',{id:'selReemp',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'si'},['SI']), el('option',{value:'no'},['NO']) ]) ]),
        el('span',{className:'right text-muted'},['Doble clic en una fila para editar.'])
      ]),
      el('div',{className:'mt-2 table-wrap'},[
        el('table',{className:'table',id:'tbl'},[
          el('thead',{},[ el('tr',{},[
            el('th',{},['Codigo']),
            el('th',{},['Codigo novedad']),
            el('th',{},['Nombre']),
            el('th',{},['Reemplazo']),
            el('th',{},['Estado']),
            el('th',{},['Creado por']),
            el('th',{},['Creacion']),
            el('th',{},['Acciones'])
          ]) ]),
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
    const codeRef=qs('#nCodeRef',ui).value.trim();
    const name=qs('#nName',ui).value.trim();
    const reemplazo=qs('#nReemplazo',ui).value;
    const msg=qs('#msgCreate',ui); msg.textContent=' ';
    if(!codeRef){ msg.textContent='Escribe el codigo de novedad.'; return; }
    if(!name){ msg.textContent='Escribe el nombre de la novedad.'; return; }
    if(!reemplazo){ msg.textContent='Selecciona reemplazo.'; return; }
    try{
      const dupRef=await deps.findNovedadByCodigoNovedad?.(codeRef);
      if(dupRef) { msg.textContent='Ya existe una novedad con ese codigo de novedad.'; return; }
      const code=await deps.getNextNovedadCode?.();
      const id=await deps.createNovedad?.({ codigo:code, codigoNovedad:codeRef, nombre:name, reemplazo });
      await deps.addAuditLog?.({ targetType:'novedad', targetId:id, action:'create_novedad', after:{ codigo:code, codigoNovedad:codeRef, nombre:name, reemplazo, estado:'activo' } });
      qs('#nCodeRef',ui).value=''; qs('#nName',ui).value=''; qs('#nReemplazo',ui).value=''; msg.textContent='Novedad creada OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });

  let snapshot=[]; const tbody=ui.querySelector('tbody');
  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  const filterReemp=()=> qs('#selReemp',ui).value;
  function render(){
    const term=search(); const st=filterStatus(); const re=filterReemp();
    const data=snapshot.filter(n=>{
      const matchesText=!term || (n.codigo||'').toLowerCase().includes(term) || (n.codigoNovedad||'').toLowerCase().includes(term) || (n.nombre||'').toLowerCase().includes(term);
      const matchesStatus=!st || n.estado===st;
      const matchesReemp=!re || n.reemplazo===re;
      return matchesText && matchesStatus && matchesReemp;
    });
    tbody.replaceChildren(...data.map(n=> row(n)));
  }
  function row(n){
    const tr=el('tr',{'data-id':n.id});
    const tdCodigo=el('td',{},[n.codigo||'-']);
    const tdCodeRef=el('td',{},[n.codigoNovedad||'-']);
    const tdNombre=el('td',{},[n.nombre||'-']);
    const tdReemp=el('td',{},[ (n.reemplazo||'').toUpperCase() || '-' ]);
    const tdEstado=el('td',{},[ statusBadge(n.estado) ]);
    const tdActor=el('td',{},[ n.createdByEmail||n.createdByUid||'-' ]);
    const tdFecha=el('td',{},[ formatDate(n.createdAt) ]);
    const tdAcc=el('td',{},[ actionsCell(n) ]);
    tr.addEventListener('dblclick',()=> startEdit(tr,n));
    tr.append(tdCodigo,tdCodeRef,tdNombre,tdReemp,tdEstado,tdActor,tdFecha,tdAcc);
    return tr;
  }
  function statusBadge(st){ return el('span',{className:'badge '+(st==='activo'?'badge--ok':'badge--off')},[st||'-']); }
  function formatDate(ts){ try{ const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null); return d? new Date(d).toLocaleString(): '-'; }catch{ return '-'; } }
  function actionsCell(n){
    const box=el('div',{className:'row-actions'},[]);
    const btnEdit=el('button',{className:'btn'},['Editar']);
    btnEdit.addEventListener('click',()=>{ const tr=tbody.querySelector(`tr[data-id="${n.id}"]`); if(tr) startEdit(tr,n); });
    const btnToggle=el('button',{className:'btn '+(n.estado==='activo'?'btn--danger':'' )},[ n.estado==='activo'?'Desactivar':'Activar' ]);
    btnToggle.addEventListener('click',async()=>{
      const target=n.estado==='activo'?'inactivo':'activo';
      if(!window.confirm(`${n.estado==='activo'?'Desactivar':'Activar'} novedad "${n.nombre}"?`)) return;
      try{ await deps.setNovedadStatus?.(n.id,target); await deps.addAuditLog?.({ targetType:'novedad', targetId:n.id, action: target==='activo'?'activate_novedad':'deactivate_novedad', before:{estado:n.estado}, after:{estado:target} }); }catch(e){ alert('Error: '+(e?.message||e)); }
    });
    box.append(btnEdit,btnToggle); return box;
  }
  function startEdit(tr,n){
    const cur={ codigo:n.codigo||'', codigoNovedad:n.codigoNovedad||'', nombre:n.nombre||'', reemplazo:n.reemplazo||'' };
    const tds=tr.querySelectorAll('td');
    tds[0].replaceChildren(el('input',{className:'input',value:cur.codigo,style:'max-width:140px'}));
    tds[1].replaceChildren(el('input',{className:'input',value:cur.codigoNovedad,style:'max-width:160px'}));
    tds[2].replaceChildren(el('input',{className:'input',value:cur.nombre,style:'max-width:260px'}));
    tds[3].replaceChildren(el('select',{className:'select'},[
      el('option',{value:'si', selected:cur.reemplazo==='si'},['SI']),
      el('option',{value:'no', selected:cur.reemplazo==='no'},['NO'])
    ]));
    tds[4].replaceChildren(statusBadge(n.estado));
    tds[5].textContent=n.createdByEmail||n.createdByUid||'-';
    tds[6].textContent=formatDate(n.createdAt);
    const box=el('div',{className:'row-actions'},[]);
    const btnSave=el('button',{className:'btn btn--primary'},['Guardar']);
    const btnCancel=el('button',{className:'btn'},['Cancelar']);
    btnSave.addEventListener('click',async()=>{
      const newCode=tds[0].querySelector('input').value.trim();
      const newCodeRef=tds[1].querySelector('input').value.trim();
      const newName=tds[2].querySelector('input').value.trim();
      const newReemp=tds[3].querySelector('select').value;
      if(!newCode||!newCodeRef||!newName) return alert('Completa codigo, codigo novedad y nombre.');
      if(!newReemp) return alert('Selecciona reemplazo.');
      try{
        if(newCode!==n.codigo){ const dup=await deps.findNovedadByCode?.(newCode); if(dup && dup.id!==n.id) return alert('Ya existe una novedad con ese codigo.'); }
        if(newCodeRef!==n.codigoNovedad){ const dupRef=await deps.findNovedadByCodigoNovedad?.(newCodeRef); if(dupRef && dupRef.id!==n.id) return alert('Ya existe una novedad con ese codigo de novedad.'); }
        await deps.updateNovedad?.(n.id,{ codigo:newCode, codigoNovedad:newCodeRef, nombre:newName, reemplazo:newReemp });
        await deps.addAuditLog?.({ targetType:'novedad', targetId:n.id, action:'update_novedad', before:{ codigo:n.codigo||null, codigoNovedad:n.codigoNovedad||null, nombre:n.nombre||null, reemplazo:n.reemplazo||null }, after:{ codigo:newCode||null, codigoNovedad:newCodeRef||null, nombre:newName||null, reemplazo:newReemp||null } });
      }catch(e){ alert('Error: '+(e?.message||e)); }
    });
    btnCancel.addEventListener('click',()=> render());
    box.append(btnSave,btnCancel); tds[7].replaceChildren(box);
  }
  const un=deps.streamNovedades?.((arr)=>{ snapshot=arr||[]; render(); });
  qs('#txtSearch',ui).addEventListener('input',render);
  qs('#selStatus',ui).addEventListener('change',render);
  qs('#selReemp',ui).addEventListener('change',render);
  mount.replaceChildren(ui);
  return ()=> un?.();
};
