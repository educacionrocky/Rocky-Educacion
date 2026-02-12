import { el, qs } from '../utils/dom.js';
export const SupervisorsAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Supervisores']),
    el('div',{className:'tabs mt-2'},[
      el('button',{id:'tabCreateBtn',className:'tab',type:'button'},['Crear']),
      el('button',{id:'tabListBtn',className:'tab is-active',type:'button'},['Consultar'])
    ]),
    el('div',{id:'tabCreate',className:'hidden'},[
      el('div',{className:'form-row mt-2'},[
        el('div',{},[ el('label',{className:'label'},['Codigo (automatico)']), el('input',{id:'sCode',className:'input',placeholder:'Se generara al crear',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Documento']), el('input',{id:'sDoc',className:'input',placeholder:'Documento del supervisor'}) ]),
        el('div',{},[ el('label',{className:'label'},['Nombre']), el('input',{id:'sName',className:'input',placeholder:'Nombre del supervisor'}) ]),
        el('div',{},[ el('label',{className:'label'},['Zona']), el('select',{id:'sZone',className:'select'},[]) ]),
        el('div',{},[ el('label',{className:'label'},['Fecha ingreso']), el('input',{id:'sIngreso',className:'input',type:'date'}) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear supervisor']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ])
    ]),
    el('div',{id:'tabList'},[
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Codigo, documento, nombre o zona...'}) ]),
        el('div',{},[ el('label',{className:'label'},['Estado']), el('select',{id:'selStatus',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'activo'},['Activos']), el('option',{value:'inactivo'},['Inactivos']) ]) ]),
        el('span',{className:'right text-muted'},['Doble clic en una fila para editar.'])
      ]),
      el('div',{className:'mt-2 table-wrap'},[
        el('table',{className:'table',id:'tbl'},[
          el('thead',{},[ el('tr',{},[
            el('th',{},['Codigo']),
            el('th',{},['Documento']),
            el('th',{},['Nombre']),
            el('th',{},['Zona']),
            el('th',{},['Estado']),
            el('th',{},['Ingreso']),
            el('th',{},['Retiro']),
            el('th',{},['Modificado por']),
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

  let zoneList=[];
  const zoneSelect=qs('#sZone',ui);
  function buildOptions(items, selected){
    const opts=[ el('option',{value:''},['Seleccione...']) ];
    items.forEach((item)=>{
      const code=item.codigo||''; const label=item.nombre||code||'-';
      opts.push(el('option',{value:code, selected: code && code===selected},[ `${label} (${code||'-'})` ]));
    });
    return opts;
  }
  function renderZoneSelect(){
    const cur=zoneSelect.value;
    zoneSelect.replaceChildren(...buildOptions(zoneList,cur));
  }
  const unZones=deps.streamZones?.((arr)=>{ zoneList=(arr||[]).filter(z=>z.estado!=='inactivo'); renderZoneSelect(); render(); });
  const zoneNameByCode=(code)=> zoneList.find(z=>z.codigo===code)?.nombre || '-';

  qs('#btnCreate',ui).addEventListener('click',async()=>{
    const doc=qs('#sDoc',ui).value.trim();
    const name=qs('#sName',ui).value.trim();
    const zoneCode=qs('#sZone',ui).value;
    const ingreso=qs('#sIngreso',ui).value;
    const msg=qs('#msgCreate',ui); msg.textContent=' ';
    if(!doc){ msg.textContent='Escribe el documento.'; return; }
    if(!name){ msg.textContent='Escribe el nombre.'; return; }
    if(!zoneCode){ msg.textContent='Selecciona una zona.'; return; }
    if(!ingreso){ msg.textContent='Selecciona la fecha de ingreso.'; return; }
    try{
      const dupDoc=await deps.findSupervisorByDocument?.(doc);
      if(dupDoc) { msg.textContent='Ya existe un supervisor con ese documento.'; return; }
      const code=await deps.getNextSupervisorCode?.();
      const zone=zoneList.find(z=>z.codigo===zoneCode);
      const id=await deps.createSupervisor?.({
        codigo:code,
        documento:doc,
        nombre:name,
        zonaCodigo:zoneCode,
        zonaNombre:zone?.nombre||null,
        fechaIngreso: new Date(`${ingreso}T00:00:00`)
      });
      await deps.addAuditLog?.({ targetType:'supervisor', targetId:id, action:'create_supervisor', after:{ codigo:code, documento:doc, nombre:name, zonaCodigo:zoneCode, estado:'activo' } });
      qs('#sDoc',ui).value=''; qs('#sName',ui).value=''; qs('#sIngreso',ui).value=''; renderZoneSelect();
      msg.textContent='Supervisor creado OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });

  let snapshot=[]; const tbody=ui.querySelector('tbody');
  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  function render(){
    const term=search(); const st=filterStatus();
    const data=snapshot.filter(s=>{
      const text=[s.codigo,s.documento,s.nombre,s.zonaNombre,zoneNameByCode(s.zonaCodigo)].join(' ').toLowerCase();
      return (!term || text.includes(term)) && (!st || s.estado===st);
    });
    tbody.replaceChildren(...data.map(s=> row(s)));
  }
  function row(s){
    const tr=el('tr',{'data-id':s.id});
    const tdCodigo=el('td',{},[s.codigo||'-']);
    const tdDoc=el('td',{},[s.documento||'-']);
    const tdNombre=el('td',{},[s.nombre||'-']);
    const tdZona=el('td',{},[ s.zonaNombre||zoneNameByCode(s.zonaCodigo) ]);
    const tdEstado=el('td',{},[ statusBadge(s.estado) ]);
    const tdIngreso=el('td',{},[ formatDate(s.fechaIngreso) ]);
    const tdRetiro=el('td',{},[ formatDate(s.fechaRetiro) ]);
    const tdMod=el('td',{},[ s.lastModifiedByEmail||s.lastModifiedByUid||'-' ]);
    const tdAcc=el('td',{},[ actionsCell(s) ]);
    tr.addEventListener('dblclick',()=> startEdit(tr,s));
    tr.append(tdCodigo,tdDoc,tdNombre,tdZona,tdEstado,tdIngreso,tdRetiro,tdMod,tdAcc);
    return tr;
  }
  function statusBadge(st){ return el('span',{className:'badge '+(st==='activo'?'badge--ok':'badge--off')},[st||'-']); }
  function formatDate(ts){
    try{
      const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null);
      return d? new Date(d).toLocaleDateString(): '-';
    }catch{ return '-'; }
  }
  function actionsCell(s){
    const box=el('div',{className:'row-actions'},[]);
    const btnEdit=el('button',{className:'btn'},['Editar']);
    btnEdit.addEventListener('click',()=>{ const tr=tbody.querySelector(`tr[data-id="${s.id}"]`); if(tr) startEdit(tr,s); });
    const btnToggle=el('button',{className:'btn '+(s.estado==='activo'?'btn--danger':'' )},[ s.estado==='activo'?'Desactivar':'Activar' ]);
    btnToggle.addEventListener('click',async()=>{
      const target=s.estado==='activo'?'inactivo':'activo';
      if(!window.confirm(`${s.estado==='activo'?'Desactivar':'Activar'} supervisor "${s.nombre}"?`)) return;
      try{ await deps.setSupervisorStatus?.(s.id,target); await deps.addAuditLog?.({ targetType:'supervisor', targetId:s.id, action: target==='activo'?'activate_supervisor':'deactivate_supervisor', before:{estado:s.estado}, after:{estado:target} }); }catch(err){ alert('Error: '+(err?.message||err)); }
    });
    box.append(btnEdit,btnToggle); return box;
  }
  function startEdit(tr,s){
    const cur={
      codigo:s.codigo||'',
      documento:s.documento||'',
      nombre:s.nombre||'',
      zonaCodigo:s.zonaCodigo||'',
      fechaIngreso: toInputDate(s.fechaIngreso)
    };
    const tds=tr.querySelectorAll('td');
    tds[0].replaceChildren(el('input',{className:'input',value:cur.codigo,style:'max-width:140px'}));
    tds[1].replaceChildren(el('input',{className:'input',value:cur.documento,style:'max-width:160px'}));
    tds[2].replaceChildren(el('input',{className:'input',value:cur.nombre,style:'max-width:220px'}));
    tds[3].replaceChildren(el('select',{className:'select'},buildOptions(zoneList,cur.zonaCodigo)));
    tds[4].replaceChildren(statusBadge(s.estado));
    tds[5].replaceChildren(el('input',{className:'input',type:'date',value:cur.fechaIngreso||''}));
    tds[6].textContent=formatDate(s.fechaRetiro);
    tds[7].textContent=s.lastModifiedByEmail||s.lastModifiedByUid||'-';
    const box=el('div',{className:'row-actions'},[]);
    const btnSave=el('button',{className:'btn btn--primary'},['Guardar']);
    const btnCancel=el('button',{className:'btn'},['Cancelar']);
    btnSave.addEventListener('click',async()=>{
      const newCode=tds[0].querySelector('input').value.trim();
      const newDoc=tds[1].querySelector('input').value.trim();
      const newName=tds[2].querySelector('input').value.trim();
      const newZoneCode=tds[3].querySelector('select').value;
      const newIngreso=tds[5].querySelector('input').value.trim();
      if(!newCode||!newDoc||!newName) return alert('Completa codigo, documento y nombre.');
      if(!newZoneCode) return alert('Selecciona una zona.');
      if(!newIngreso) return alert('Selecciona la fecha de ingreso.');
      try{
        if(newCode!==s.codigo){ const dup=await deps.findSupervisorByCode?.(newCode); if(dup && dup.id!==s.id) return alert('Ya existe un supervisor con ese codigo.'); }
        if(newDoc!==s.documento){ const dupDoc=await deps.findSupervisorByDocument?.(newDoc); if(dupDoc && dupDoc.id!==s.id) return alert('Ya existe un supervisor con ese documento.'); }
        const newZone=zoneList.find(z=>z.codigo===newZoneCode);
        await deps.updateSupervisor?.(s.id,{
          codigo:newCode,
          documento:newDoc,
          nombre:newName,
          zonaCodigo:newZoneCode,
          zonaNombre:newZone?.nombre||null,
          fechaIngreso: new Date(`${newIngreso}T00:00:00`)
        });
        await deps.addAuditLog?.({ targetType:'supervisor', targetId:s.id, action:'update_supervisor', before:{ codigo:s.codigo, documento:s.documento, nombre:s.nombre, zonaCodigo:s.zonaCodigo }, after:{ codigo:newCode, documento:newDoc, nombre:newName, zonaCodigo:newZoneCode } });
      }catch(err){ alert('Error: '+(err?.message||err)); }
    });
    btnCancel.addEventListener('click',()=> render());
    box.append(btnSave,btnCancel); tds[8].replaceChildren(box);
  }
  function toInputDate(ts){
    try{
      const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null);
      if(!d) return '';
      const pad=(n)=> String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }catch{ return ''; }
  }
  const un=deps.streamSupervisors?.((arr)=>{ snapshot=arr||[]; render(); });
  qs('#txtSearch',ui).addEventListener('input',render);
  qs('#selStatus',ui).addEventListener('change',render);
  mount.replaceChildren(ui);
  return ()=>{ un?.(); unZones?.(); };
};
