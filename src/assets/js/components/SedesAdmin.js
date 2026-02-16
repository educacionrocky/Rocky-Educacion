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
        el('div',{},[ el('label',{className:'label'},['Dependencia (buscar)']), el('input',{id:'sDepSearch',className:'input',list:'sDepList',placeholder:'Nombre o codigo de dependencia'}) ]),
        el('div',{},[ el('label',{className:'label'},['Zona (buscar)']), el('input',{id:'sZoneSearch',className:'input',list:'sZoneList',placeholder:'Nombre o codigo de zona'}) ]),
        el('div',{},[ el('label',{className:'label'},['Nro de operarios']), el('input',{id:'sOps',className:'input',type:'number',min:'0',step:'1',inputMode:'numeric',placeholder:'0'}) ]),
        el('button',{id:'btnCreate',className:'btn btn--primary'},['Crear sede']),
        el('span',{id:'msgCreate',className:'text-muted'},[' '])
      ]),
      el('datalist',{id:'sDepList'},[]),
      el('datalist',{id:'sZoneList'},[])
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
            el('th',{'data-sort':'codigo',style:'cursor:pointer'},['Codigo']),
            el('th',{'data-sort':'nombre',style:'cursor:pointer'},['Nombre']),
            el('th',{'data-sort':'dependenciaNombre',style:'cursor:pointer'},['Dependencia']),
            el('th',{'data-sort':'zonaNombre',style:'cursor:pointer'},['Zona']),
            el('th',{'data-sort':'numeroOperarios',style:'cursor:pointer'},['Operarios']),
            el('th',{'data-sort':'estado',style:'cursor:pointer'},['Estado']),
            el('th',{'data-sort':'createdByEmail',style:'cursor:pointer'},['Creado por']),
            el('th',{'data-sort':'createdAt',style:'cursor:pointer'},['Creacion']),
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
  const depInput=qs('#sDepSearch',ui); const zoneInput=qs('#sZoneSearch',ui);
  const depDatalist=qs('#sDepList',ui); const zoneDatalist=qs('#sZoneList',ui);

  function buildOptions(items, selected){
    const opts=[ el('option',{value:''},['Seleccione...']) ];
    items.forEach((item)=>{
      const code=item.codigo||''; const label=item.nombre||code||'-';
      opts.push(el('option',{value:code, selected: code && code===selected},[ `${label} (${code||'-'})` ]));
    });
    return opts;
  }
  function labelByCode(list, code){
    const it=list.find(x=>x.codigo===code);
    return it ? `${it.nombre||it.codigo} (${it.codigo||'-'})` : '';
  }
  function resolveCode(list, rawValue){
    const raw=String(rawValue||'').trim();
    if(!raw) return '';
    const byCode=list.find(x=> String(x.codigo||'').toLowerCase()===raw.toLowerCase());
    if(byCode) return byCode.codigo;
    const m=raw.match(/\(([^)]+)\)\s*$/);
    if(m){
      const code=m[1].trim();
      const byLabel=list.find(x=> String(x.codigo||'').toLowerCase()===code.toLowerCase());
      if(byLabel) return byLabel.codigo;
    }
    const byName=list.find(x=> String(x.nombre||'').toLowerCase()===raw.toLowerCase());
    return byName?.codigo||'';
  }
  function renderSelects(){
    const depOpts=depList
      .map((d)=> labelByCode(depList,d.codigo))
      .filter((v,i,arr)=> v && arr.indexOf(v)===i)
      .map((value)=> el('option',{value}));
    depDatalist.replaceChildren(...depOpts);
    const zoneOpts=zoneList
      .map((z)=> labelByCode(zoneList,z.codigo))
      .filter((v,i,arr)=> v && arr.indexOf(v)===i)
      .map((value)=> el('option',{value}));
    zoneDatalist.replaceChildren(...zoneOpts);
  }
  let snapshot=[]; const tbody=ui.querySelector('tbody');
  let sortKey=''; let sortDir=1;
  let unDeps=()=>{};
  let unZones=()=>{};

  qs('#btnCreate',ui).addEventListener('click',async()=>{
    const name=qs('#sName',ui).value.trim();
    const depCode=resolveCode(depList, depInput.value);
    const zoneCode=resolveCode(zoneList, zoneInput.value);
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
      qs('#sName',ui).value=''; qs('#sOps',ui).value=''; depInput.value=''; zoneInput.value=''; renderSelects();
      msg.textContent='Sede creada OK'; setTab('list'); setTimeout(()=> msg.textContent=' ',1200);
    }catch(e){ msg.textContent='Error: '+(e?.message||e); }
  });

  const search=()=> qs('#txtSearch',ui).value.trim().toLowerCase();
  const filterStatus=()=> qs('#selStatus',ui).value;
  const depNameByCode=(code)=> depList.find(d=>d.codigo===code)?.nombre || '-';
  const zoneNameByCode=(code)=> zoneList.find(z=>z.codigo===code)?.nombre || '-';
  function toDate(ts){ try{ const d=ts?.toDate? ts.toDate(): (ts? new Date(ts): null); return d? d.getTime():0; }catch{ return 0; } }
  function sortValue(s,key){
    if(key==='dependenciaNombre') return (s.dependenciaNombre||depNameByCode(s.dependenciaCodigo)||'').toLowerCase();
    if(key==='zonaNombre') return (s.zonaNombre||zoneNameByCode(s.zonaCodigo)||'').toLowerCase();
    if(key==='numeroOperarios') return Number(s.numeroOperarios||0);
    if(key==='createdAt') return toDate(s.createdAt);
    return String(s[key]??'').toLowerCase();
  }
  function sortData(data){
    if(!sortKey) return data;
    const out=[...data];
    out.sort((a,b)=>{
      const va=sortValue(a,sortKey); const vb=sortValue(b,sortKey);
      if(va===vb) return 0;
      return va>vb ? sortDir : -sortDir;
    });
    return out;
  }
  function updateSortIndicators(){
    ui.querySelectorAll('th[data-sort]').forEach((th)=>{
      const base=th.dataset.baseLabel||th.textContent.replace(/\s[\^v]$/,'');
      th.dataset.baseLabel=base;
      const key=th.getAttribute('data-sort');
      th.textContent=(sortKey===key)?`${base} ${sortDir===1?'^':'v'}`:base;
    });
  }
  function initSorting(){
    ui.querySelectorAll('th[data-sort]').forEach((th)=>{
      th.addEventListener('click',()=>{
        const key=th.getAttribute('data-sort');
        if(sortKey===key) sortDir=sortDir*-1; else { sortKey=key; sortDir=1; }
        render();
      });
    });
  }
  function render(){
    const term=search(); const st=filterStatus();
    const data=snapshot.filter(s=>{
      const text=[s.codigo,s.nombre,s.dependenciaNombre,depNameByCode(s.dependenciaCodigo),s.zonaNombre,zoneNameByCode(s.zonaCodigo)].join(' ').toLowerCase();
      return (!term || text.includes(term)) && (!st || s.estado===st);
    });
    tbody.replaceChildren(...sortData(data).map(s=> row(s)));
    const msg=qs('#msg',ui); if(msg) msg.textContent=`Total registros filtrados: ${data.length}`;
    updateSortIndicators();
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
    tds[2].replaceChildren(el('input',{className:'input',list:'sDepList',value:labelByCode(depList,cur.dependenciaCodigo),style:'max-width:260px'}));
    tds[3].replaceChildren(el('input',{className:'input',list:'sZoneList',value:labelByCode(zoneList,cur.zonaCodigo),style:'max-width:260px'}));
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
      const newDepCode=resolveCode(depList, tds[2].querySelector('input').value);
      const newZoneCode=resolveCode(zoneList, tds[3].querySelector('input').value);
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
  qs('#txtSearch',ui).addEventListener('input',render);
  qs('#selStatus',ui).addEventListener('change',render);
  initSorting();
  mount.replaceChildren(ui);
  let un=()=>{};
  try{
    unDeps=deps.streamDependencies?.((arr)=>{ depList=(arr||[]).filter(d=>d.estado!=='inactivo'); renderSelects(); render(); }) || (()=>{});
    unZones=deps.streamZones?.((arr)=>{ zoneList=(arr||[]).filter(z=>z.estado!=='inactivo'); renderSelects(); render(); }) || (()=>{});
    un=deps.streamSedes?.((arr)=>{ snapshot=arr||[]; render(); }) || (()=>{});
  }catch(e){
    const msg=qs('#msg',ui); if(msg) msg.textContent='Error cargando sedes: '+(e?.message||e);
  }
  return ()=>{ un?.(); unDeps?.(); unZones?.(); };
};
