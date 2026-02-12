import { el, qs } from '../utils/dom.js';
export const SedesAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Sedes']),
    el('div',{className:'tabs mt-2'},[
      el('button',{id:'tabCreateBtn',className:'tab',type:'button'},['Crear']),
      el('button',{id:'tabListBtn',className:'tab is-active',type:'button'},['Consultar'])
    ]),
    el('div',{id:'tabCreate',className:'hidden'},[
      el('div',{className:'form-row mt-2'},[
        el('div',{},[ el('label',{className:'label'},['Codigo (automatico)']), el('input',{id:'sCode',className:'input',placeholder:'Se generara al crear',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Nombre']), el('input',{id:'sName',className:'input',placeholder:'Nombre de la sede'}) ]),
        el('div',{},[ el('label',{className:'label'},['Dependencia']), el('select',{id:'sDep',className:'select'},[]) ]),
        el('div',{},[ el('label',{className:'label'},['Zona']), el('select',{id:'sZone',className:'select'},[]) ]),
        el('div',{},[ el('label',{className:'label'},['Nro de operarios']), el('input',{id:'sOps',className:'input',type:'number',min:'0',step:'1',inputMode:'numeric',placeholder:'0'}) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear sede']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ])
    ]),
    el('div',{id:'tabList'},[
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Codigo, nombre, dependencia o zona...'}) ]),
        el('div',{},[ el('label',{className:'label'},['Estado']), el('select',{id:'selStatus',className:'select'},[ el('option',{value:''},['Todos']), el('option',{value:'activo'},['Activos']), el('option',{value:'inactivo'},['Inactivos']) ]) ]),
        el('span',{className:'right text-muted'},['Doble clic en una fila para editar.'])
      ]),
      el('div',{className:'mt-2 table-wrap'},[
        el('table',{className:'table',id:'tbl'},[
          el('thead',{},[ el('tr',{},[
            el('th',{},['Codigo']),
            el('th',{},['Nombre']),
            el('th',{},['Dependencia']),
            el('th',{},['Zona']),
            el('th',{},['Operarios']),
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

  let depList=[]; let zoneList=[];
  const depSelect=qs('#sDep',ui); const zoneSelect=qs('#sZone',ui);

  function buildOptions(items, selected){
    const opts=[ el('option',{value:''},['Seleccione...']) ];
    items.forEach((item)=>{
      const code=item.codigo||''; const label=item.nombre||code||'-';
      opts.push(el('option',{value:code, selected: code && code===selected},[ `${label} (${code||'-'})` ]));
    });
    return opts;
  }
  function renderSelects(){
    const depVal=depSelect.value; const zoneVal=zoneSelect.value;
    depSelect.replaceChildren(...buildOptions(depList,depVal));
    zoneSelect.replaceChildren(...buildOptions(zoneList,zoneVal));
  }
  const unDeps=deps.streamDependencies?.((arr)=>{ depList=(arr||[]).filter(d=>d.estado!=='inactivo'); renderSelects(); render(); });
  const unZones=deps.streamZones?.((arr)=>{ zoneList=(arr||[]).filter(z=>z.estado!=='inactivo'); renderSelects(); render(); });

  qs('#btnCreate',ui).addEventListener('click',async()=>{
    const name=qs('#sName',ui).value.trim();
    const depCode=qs('#sDep',ui).value;
    const zoneCode=qs('#sZone',ui).value;
    const opsRaw=qs('#sOps',ui).value.trim();
    const msg=qs('#msgCreate',ui); msg.textContent=' ';
    if(!name){ msg.textContent='Escribe el nombre de la sede.'; return; }
    if(!depCode){ msg.textContent='Selecciona una dependencia.'; return; }
    if(!zoneCode){ msg.textContent='Selecciona una zona.'; return; }
    const ops=Number(opsRaw);
    if(!Number.isFinite(ops) || ops<0 || !Number.isInteger(ops)){ msg.textContent='Ingresa un numero entero de operarios valido.'; return; }
    try{
      const code=await deps.getNextSedeCode?.();
      const dep=depList.find(d=>d.codigo===depCode);
      const zone=zoneList.find(z=>z.codigo===zoneCode);
      const id=await deps.createSede?.({
        codigo:code,
        nombre:name,
        dependenciaCodigo:depCode,
        dependenciaNombre:dep?.nombre||null,
        zonaCodigo:zoneCode,
        zonaNombre:zone?.nombre||null,
        numeroOperarios:ops
      });
      await deps.addAuditLog?.({ targetType:'sede', targetId:id, action:'create_sede', after:{ codigo:code, nombre:name, estado:'activo', dependenciaCodigo:depCode, zonaCodigo:zoneCode, numeroOperarios:ops } });
      qs('#sName',ui).value=''; qs('#sOps',ui).value=''; renderSelects();
      msg.textContent='Sede creada OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });

  let snapshot=[]; const tbody=ui.querySelector('tbody');
  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  const depNameByCode=(code)=> depList.find(d=>d.codigo===code)?.nombre || '-';
  const zoneNameByCode=(code)=> zoneList.find(z=>z.codigo===code)?.nombre || '-';
  function render(){
    const term=search(); const st=filterStatus();
    const data=snapshot.filter(s=>{
      const text=[s.codigo,s.nombre,s.dependenciaNombre,depNameByCode(s.dependenciaCodigo),s.zonaNombre,zoneNameByCode(s.zonaCodigo)].join(' ').toLowerCase();
      return (!term || text.includes(term)) && (!st || s.estado===st);
    });
    tbody.replaceChildren(...data.map(s=> row(s)));
  }
  function row(s){
    const tr=el('tr',{'data-id':s.id});
    const tdCodigo=el('td',{},[s.codigo||'-']);
    const tdNombre=el('td',{},[s.nombre||'-']);
    const tdDep=el('td',{},[ s.dependenciaNombre||depNameByCode(s.dependenciaCodigo) ]);
    const tdZone=el('td',{},[ s.zonaNombre||zoneNameByCode(s.zonaCodigo) ]);
    const tdOps=el('td',{},[ String(s.numeroOperarios ?? '-') ]);
    const tdEstado=el('td',{},[ statusBadge(s.estado) ]);
    const tdActor=el('td',{},[ s.createdByEmail||s.createdByUid||'-' ]);
    const tdFecha=el('td',{},[ formatDate(s.createdAt) ]);
    const tdAcc=el('td',{},[ actionsCell(s) ]);
    tr.addEventListener('dblclick',()=> startEdit(tr,s));
    tr.append(tdCodigo,tdNombre,tdDep,tdZone,tdOps,tdEstado,tdActor,tdFecha,tdAcc);
    return tr;
  }
  function statusBadge(st){ return el('span',{className:'badge '+(st==='activo'?'badge--ok':'badge--off')},[st||'-']); }
  function formatDate(ts){ try{ const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null); return d? new Date(d).toLocaleString(): '-'; }catch{ return '-'; } }
  function actionsCell(s){
    const box=el('div',{className:'row-actions'},[]);
    const btnEdit=el('button',{className:'btn'},['Editar']);
    btnEdit.addEventListener('click',()=>{ const tr=tbody.querySelector(`tr[data-id="${s.id}"]`); if(tr) startEdit(tr,s); });
    const btnToggle=el('button',{className:'btn '+(s.estado==='activo'?'btn--danger':'' )},[ s.estado==='activo'?'Desactivar':'Activar' ]);
    btnToggle.addEventListener('click',async()=>{
      const target=s.estado==='activo'?'inactivo':'activo';
      if(!window.confirm(`${s.estado==='activo'?'Desactivar':'Activar'} sede "${s.nombre}"?`)) return;
      try{ await deps.setSedeStatus?.(s.id,target); await deps.addAuditLog?.({ targetType:'sede', targetId:s.id, action: target==='activo'?'activate_sede':'deactivate_sede', before:{estado:s.estado}, after:{estado:target} }); }catch(e){ alert('Error: '+(e?.message||e)); }
    });
    box.append(btnEdit,btnToggle); return box;
  }
  function startEdit(tr,s){
    const cur={
      codigo:s.codigo||'',
      nombre:s.nombre||'',
      dependenciaCodigo:s.dependenciaCodigo||'',
      zonaCodigo:s.zonaCodigo||'',
      numeroOperarios:s.numeroOperarios ?? ''
    };
    const tds=tr.querySelectorAll('td');
    tds[0].replaceChildren(el('input',{className:'input',value:cur.codigo,style:'max-width:140px'}));
    tds[1].replaceChildren(el('input',{className:'input',value:cur.nombre,style:'max-width:220px'}));
    tds[2].replaceChildren(el('select',{className:'select'},buildOptions(depList,cur.dependenciaCodigo)));
    tds[3].replaceChildren(el('select',{className:'select'},buildOptions(zoneList,cur.zonaCodigo)));
    tds[4].replaceChildren(el('input',{className:'input',value:String(cur.numeroOperarios),style:'max-width:120px',type:'number',min:'0',step:'1',inputMode:'numeric'}));
    tds[5].replaceChildren(statusBadge(s.estado));
    tds[6].textContent=s.createdByEmail||s.createdByUid||'-';
    tds[7].textContent=formatDate(s.createdAt);
    const box=el('div',{className:'row-actions'},[]);
    const btnSave=el('button',{className:'btn btn--primary'},['Guardar']);
    const btnCancel=el('button',{className:'btn'},['Cancelar']);
    btnSave.addEventListener('click',async()=>{
      const newCode=tds[0].querySelector('input').value.trim();
      const newName=tds[1].querySelector('input').value.trim();
      const newDepCode=tds[2].querySelector('select').value;
      const newZoneCode=tds[3].querySelector('select').value;
      const newOpsRaw=tds[4].querySelector('input').value.trim();
      if(!newCode||!newName) return alert('Completa codigo y nombre.');
      if(!newDepCode||!newZoneCode) return alert('Selecciona dependencia y zona.');
      const newOps=Number(newOpsRaw);
      if(!Number.isFinite(newOps) || newOps<0 || !Number.isInteger(newOps)) return alert('Ingresa un numero entero de operarios valido.');
      try{
        if(newCode!==s.codigo){ const dup=await deps.findSedeByCode?.(newCode); if(dup && dup.id!==s.id) return alert('Ya existe una sede con ese codigo.'); }
        const newDep=depList.find(d=>d.codigo===newDepCode);
        const newZone=zoneList.find(z=>z.codigo===newZoneCode);
        await deps.updateSede?.(s.id,{
          codigo:newCode,
          nombre:newName,
          dependenciaCodigo:newDepCode,
          dependenciaNombre:newDep?.nombre||null,
          zonaCodigo:newZoneCode,
          zonaNombre:newZone?.nombre||null,
          numeroOperarios:newOps
        });
        await deps.addAuditLog?.({ targetType:'sede', targetId:s.id, action:'update_sede', before:{ codigo:s.codigo, nombre:s.nombre, dependenciaCodigo:s.dependenciaCodigo, zonaCodigo:s.zonaCodigo, numeroOperarios:s.numeroOperarios }, after:{ codigo:newCode, nombre:newName, dependenciaCodigo:newDepCode, zonaCodigo:newZoneCode, numeroOperarios:newOps } });
      }catch(e){ alert('Error: '+(e?.message||e)); }
    });
    btnCancel.addEventListener('click',()=> render());
    box.append(btnSave,btnCancel); tds[8].replaceChildren(box);
  }
  const un=deps.streamSedes?.((arr)=>{ snapshot=arr||[]; render(); });
  qs('#txtSearch',ui).addEventListener('input',render);
  qs('#selStatus',ui).addEventListener('change',render);
  mount.replaceChildren(ui);
  return ()=>{ un?.(); unDeps?.(); unZones?.(); };
};
