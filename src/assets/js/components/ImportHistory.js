import { el, qs } from '../utils/dom.js';

export const ImportHistory=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Historial de importaciones']),
    el('div',{className:'form-row mt-2'},[
      el('div',{},[ el('label',{className:'label'},['Buscar']), el('input',{id:'txtSearch',className:'input',placeholder:'Fecha, usuario o origen...'}) ]),
      el('div',{},[ el('label',{className:'label'},['Fecha']), el('input',{id:'fltDate',className:'input',type:'date'}) ]),
      el('button',{id:'btnClear',className:'btn',type:'button'},['Limpiar filtros'])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table'},[
        el('thead',{},[ el('tr',{},[
          el('th',{'data-sort':'fechaOperacion',style:'cursor:pointer'},['Fecha operacion']),
          el('th',{'data-sort':'confirmedBy',style:'cursor:pointer'},['Confirmado por']),
          el('th',{'data-sort':'plannedCount',style:'cursor:pointer'},['Planeados']),
          el('th',{'data-sort':'expectedCount',style:'cursor:pointer'},['Esperados']),
          el('th',{'data-sort':'foundCount',style:'cursor:pointer'},['Encontrados']),
          el('th',{'data-sort':'missingCount',style:'cursor:pointer'},['Faltan']),
          el('th',{'data-sort':'extraCount',style:'cursor:pointer'},['Sobran']),
          el('th',{'data-sort':'ts',style:'cursor:pointer'},['Fecha confirmacion']),
          el('th',{},['Detalle'])
        ]) ]),
        el('tbody',{})
      ])
    ]),
    el('p',{id:'msg',className:'text-muted mt-2'},['Cargando...'])
  ]);

  const tbody=qs('tbody',ui);
  let snapshot=[];
  let sortKey='ts';
  let sortDir=-1;

  const toMillis=(v)=>{
    try{
      const d=v?.toDate ? v.toDate() : (v ? new Date(v) : null);
      return d ? d.getTime() : 0;
    }catch{ return 0; }
  };

  const sortVal=(r,key)=>{
    if(key==='ts') return toMillis(r.ts);
    if(key==='fechaOperacion') return String(r.fechaOperacion||'');
    if(key==='confirmedBy') return String((r.confirmadoPorEmail||r.confirmadoPorUid||'')).toLowerCase();
    if(key==='plannedCount' || key==='expectedCount' || key==='foundCount' || key==='missingCount' || key==='extraCount') return Number(r[key]||0);
    return String(r[key]??'').toLowerCase();
  };

  function updateSortIndicators(){
    ui.querySelectorAll('th[data-sort]').forEach((th)=>{
      const base=th.dataset.baseLabel||th.textContent.replace(/\s[\^v]$/,'');
      th.dataset.baseLabel=base;
      const key=th.getAttribute('data-sort');
      th.textContent=(sortKey===key)?`${base} ${sortDir===1?'^':'v'}`:base;
    });
  }

  function applyFilters(){
    const term=String(qs('#txtSearch',ui).value||'').trim().toLowerCase();
    const fltDate=qs('#fltDate',ui).value;
    const filtered=snapshot.filter((r)=>{
      const opDate=String(r.fechaOperacion||'');
      const email=String(r.confirmadoPorEmail||r.confirmadoPorUid||'').toLowerCase();
      const src=`${r?.source?.sheetName||''} ${r?.source?.sheetId||''}`.toLowerCase();
      const matchesTerm=!term || `${opDate} ${email} ${src}`.includes(term);
      const matchesDate=!fltDate || opDate===fltDate;
      return matchesTerm && matchesDate;
    });
    const sorted=[...filtered].sort((a,b)=>{
      const va=sortVal(a,sortKey); const vb=sortVal(b,sortKey);
      if(va===vb) return 0;
      return va>vb ? sortDir : -sortDir;
    });
    return { filtered:sorted, count:filtered.length };
  }

  function formatDateTime(v){
    try{
      const d=v?.toDate ? v.toDate() : (v ? new Date(v) : null);
      return d ? d.toLocaleString() : '-';
    }catch{ return '-'; }
  }

  function showDetail(row){
    const lines=[
      `Fecha operacion: ${row.fechaOperacion||'-'}`,
      `Confirmado por: ${row.confirmadoPorEmail||row.confirmadoPorUid||'-'}`,
      `Origen: ${row?.source?.sheetName||'-'} (${row?.source?.sheetId||'-'})`,
      `Planeados: ${Number(row.plannedCount||0)}`,
      `Esperados: ${Number(row.expectedCount||0)}`,
      `Encontrados: ${Number(row.foundCount||0)}`,
      `Faltan: ${Number(row.missingCount||0)}`,
      `Sobran: ${Number(row.extraCount||0)}`
    ];
    alert(lines.join('\n'));
  }

  function render(){
    const { filtered, count }=applyFilters();
    tbody.replaceChildren(...filtered.map((r)=>{
      const tr=el('tr',{},[]);
      const btn=el('button',{className:'btn',type:'button'},['Ver']);
      btn.addEventListener('click',()=> showDetail(r));
      tr.append(
        el('td',{},[r.fechaOperacion||'-']),
        el('td',{},[r.confirmadoPorEmail||r.confirmadoPorUid||'-']),
        el('td',{},[String(Number(r.plannedCount||0))]),
        el('td',{},[String(Number(r.expectedCount||0))]),
        el('td',{},[String(Number(r.foundCount||0))]),
        el('td',{},[String(Number(r.missingCount||0))]),
        el('td',{},[String(Number(r.extraCount||0))]),
        el('td',{},[formatDateTime(r.ts)]),
        el('td',{},[btn])
      );
      return tr;
    }));
    qs('#msg',ui).textContent=`Total registros filtrados: ${count}`;
    updateSortIndicators();
  }

  qs('#txtSearch',ui).addEventListener('input',render);
  qs('#fltDate',ui).addEventListener('change',render);
  qs('#btnClear',ui).addEventListener('click',()=>{
    qs('#txtSearch',ui).value='';
    qs('#fltDate',ui).value='';
    render();
  });
  ui.querySelectorAll('th[data-sort]').forEach((th)=>{
    th.addEventListener('click',()=>{
      const key=th.getAttribute('data-sort');
      if(sortKey===key) sortDir=sortDir*-1; else { sortKey=key; sortDir=1; }
      render();
    });
  });

  mount.replaceChildren(ui);

  const un=deps.streamImportHistory?.((arr)=>{
    snapshot=arr||[];
    render();
  });

  if(!deps.streamImportHistory){
    qs('#msg',ui).textContent='No hay conexion para historial.';
  }

  return ()=> un?.();
};
