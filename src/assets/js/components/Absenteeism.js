import { el, qs, enableSectionToggles } from '../utils/dom.js';

export const Absenteeism=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Ausentismo y pago por dependencia']),
    el('div',{className:'form-row mt-2'},[
      el('div',{},[ el('label',{className:'label'},['Fecha']), el('input',{id:'opDate',className:'input',type:'date'}) ]),
      el('button',{id:'btnRun',className:'btn btn--primary',type:'button'},['Consultar fecha']),
      el('button',{id:'btnExportSummary',className:'btn',type:'button'},['Exportar resumen Excel']),
      el('button',{id:'btnExportSede',className:'btn',type:'button'},['Exportar sedes Excel']),
      el('button',{id:'btnExportDetail',className:'btn',type:'button'},['Exportar detalle Excel']),
      el('span',{id:'msg',className:'text-muted'},[' '])
    ]),
    el('div',{className:'section-block mt-2'},[
      el('h3',{className:'section-title'},['Resumen por dependencia']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblDependency'},[
          el('thead',{},[el('tr',{},[
            el('th',{},['Dependencia']),
            el('th',{},['Planeados']),
            el('th',{},['Contratados']),
            el('th',{},['No contratado']),
            el('th',{},['Novedad sin reemplazo']),
            el('th',{},['Total ausentismo']),
            el('th',{},['Total a pagar']),
            el('th',{},['Detalle'])
          ])]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totDependency',className:'text-muted'},['Total dependencias - Planeados: 0, Contratados: 0, No contratado: 0, Novedad sin reemplazo: 0, Total ausentismo: 0, Total a pagar: 0'])
    ]),
    el('div',{className:'section-block mt-2'},[
      el('h3',{className:'section-title'},['Resumen por sede']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblTotals'},[
          el('thead',{},[el('tr',{},[
            el('th',{},['Sede']),
            el('th',{},['Planeados']),
            el('th',{},['Contratados']),
            el('th',{},['No contratado']),
            el('th',{},['Novedad sin reemplazo']),
            el('th',{},['Total ausentismo']),
            el('th',{},['Total a pagar']),
            el('th',{},['Detalle'])
          ])]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totRange',className:'text-muted'},['Total rango a pagar: 0'])
    ]),
    el('div',{className:'section-block mt-2'},[
      el('h3',{id:'detailTitle',className:'section-title'},['Detalle dependencia']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblDetail'},[
          el('thead',{},[el('tr',{},[
            el('th',{},['Fecha']),
            el('th',{},['Sede']),
            el('th',{},['Documento']),
            el('th',{},['Nombre']),
            el('th',{},['Estado'])
          ])]),
          el('tbody',{})
        ])
      ])
    ])
  ]);

  const msg=qs('#msg',ui);
  const day=todayBogota();
  qs('#opDate',ui).value=day;

  let sedeDailyRows=[];
  let dependencyRows=[];
  let attendanceByKey=new Map();
  let replByEmpDate=new Map();
  let replacementSuperByDateDoc=new Set();
  let totalsRows=[];
  let detailRowsCache=[];

  qs('#btnRun',ui).addEventListener('click', run);
  qs('#btnExportSummary',ui).addEventListener('click',()=> exportSummaryExcel());
  qs('#btnExportSede',ui).addEventListener('click',()=> exportSedeExcel());
  qs('#btnExportDetail',ui).addEventListener('click',()=> exportDetailExcel());

  async function run(){
    const date=qs('#opDate',ui).value;
    if(!date){ msg.textContent='Selecciona una fecha.'; return; }
    msg.textContent='Consultando...';
    try{
      const [sedeStatus, attendance, replacements, sedes]=await Promise.all([
        deps.listSedeStatusRange?.(date,date) || [],
        deps.listAttendanceRange?.(date,date) || [],
        deps.listImportReplacementsRange?.(date,date) || [],
        loadSedesSnapshot()
      ]);

      const sedeMetaByCode=new Map();
      (sedes||[]).forEach((s)=>{
        sedeMetaByCode.set(String(s.codigo||''), {
          dependenciaCodigo: String(s.dependenciaCodigo||'').trim(),
          dependenciaNombre: String(s.dependenciaNombre||'').trim()
        });
      });

      replByEmpDate=new Map();
      replacementSuperByDateDoc=new Set();
      const replBySedeDate=new Map();
      (replacements||[]).forEach((r)=>{
        const empKey=`${r.fecha||''}|${r.empleadoId||''}`;
        replByEmpDate.set(empKey,r);
        if(r.decision==='reemplazo'){
          const superDoc=String(r.supernumerarioDocumento||'').trim();
          if(superDoc){
            replacementSuperByDateDoc.add(`${r.fecha||''}|${superDoc}`);
          }
        }
        const sdKey=`${r.fecha||''}|${r.sedeCodigo||''}`;
        if(!replBySedeDate.has(sdKey)) replBySedeDate.set(sdKey,[]);
        replBySedeDate.get(sdKey).push(r);
      });
      attendanceByKey=new Map();
      (attendance||[]).forEach((a)=>{
        const attDoc=String(a.documento||'').trim();
        if(attDoc && replacementSuperByDateDoc.has(`${a.fecha||''}|${attDoc}`)) return;
        const key=`${a.fecha||''}|${a.sedeCodigo||''}`;
        if(!attendanceByKey.has(key)) attendanceByKey.set(key,[]);
        attendanceByKey.get(key).push(a);
      });

      sedeDailyRows=(sedeStatus||[]).map((s)=>{
        const key=`${s.fecha||''}|${s.sedeCodigo||''}`;
        const atts=attendanceByKey.get(key)||[];
        const contratados=atts.length;
        const planeados=Number(s.operariosEsperados||0);
        const noContratado=Math.max(0, planeados-contratados);
        const novSinReemplazo=(replBySedeDate.get(key)||[]).filter((r)=> r.decision!=='reemplazo').length;
        const ausentismoTotal=noContratado+novSinReemplazo;
        const totalPagar=Math.max(0, planeados-noContratado-novSinReemplazo);
        const meta=sedeMetaByCode.get(String(s.sedeCodigo||''))||{};
        const dependenciaCodigo=String(meta.dependenciaCodigo||'').trim();
        const dependenciaNombre=String(meta.dependenciaNombre||'').trim()||'Sin dependencia';
        const dependenciaKey=dependenciaCodigo || `NO_DEP:${dependenciaNombre}`;
        return {
          fecha:s.fecha||'',
          sedeCodigo:s.sedeCodigo||'',
          sedeNombre:s.sedeNombre||s.sedeCodigo||'-',
          dependenciaCodigo,
          dependenciaNombre,
          dependenciaKey,
          planeados,
          contratados,
          noContratado,
          novSinReemplazo,
          ausentismoTotal,
          totalPagar
        };
      }).sort((a,b)=> (a.fecha+a.sedeNombre).localeCompare(b.fecha+b.sedeNombre));

      const depMap=new Map();
      sedeDailyRows.forEach((r)=>{
        if(!depMap.has(r.dependenciaKey)){
          depMap.set(r.dependenciaKey,{
            dependenciaKey:r.dependenciaKey,
            dependenciaCodigo:r.dependenciaCodigo,
            dependenciaNombre:r.dependenciaNombre||'Sin dependencia',
            planeados:0,
            contratados:0,
            noContratado:0,
            novSinReemplazo:0,
            ausentismoTotal:0,
            totalPagar:0
          });
        }
        const t=depMap.get(r.dependenciaKey);
        t.planeados+=r.planeados;
        t.contratados+=r.contratados;
        t.noContratado+=r.noContratado;
        t.novSinReemplazo+=r.novSinReemplazo;
        t.ausentismoTotal+=r.ausentismoTotal;
        t.totalPagar+=r.totalPagar;
      });
      dependencyRows=Array.from(depMap.values()).sort((a,b)=> String(a.dependenciaNombre||'').localeCompare(String(b.dependenciaNombre||'')));

      renderDependency(date);
      renderTotals();
      msg.textContent=`Consulta OK. Dependencias: ${dependencyRows.length}`;
    }catch(e){
      msg.textContent='Error: '+(e?.message||e);
    }
  }

  function renderDependency(date){
    const tb=qs('#tblDependency tbody',ui);
    tb.replaceChildren(...dependencyRows.map((r)=>{
      const tr=el('tr',{},[]);
      const btn=el('button',{className:'btn',type:'button'},['Ver']);
      btn.addEventListener('click',()=> renderDetail(r.dependenciaKey,r.dependenciaNombre,date));
      tr.append(
        el('td',{},[r.dependenciaNombre||'-']),
        el('td',{},[String(r.planeados)]),
        el('td',{},[String(r.contratados)]),
        el('td',{},[String(r.noContratado)]),
        el('td',{},[String(r.novSinReemplazo)]),
        el('td',{},[String(r.ausentismoTotal)]),
        el('td',{},[String(r.totalPagar)]),
        el('td',{},[btn])
      );
      return tr;
    }));
    const totals=dependencyRows.reduce((acc,r)=>({
      planeados:acc.planeados+Number(r.planeados||0),
      contratados:acc.contratados+Number(r.contratados||0),
      noContratado:acc.noContratado+Number(r.noContratado||0),
      novSinReemplazo:acc.novSinReemplazo+Number(r.novSinReemplazo||0),
      ausentismoTotal:acc.ausentismoTotal+Number(r.ausentismoTotal||0),
      totalPagar:acc.totalPagar+Number(r.totalPagar||0)
    }),{ planeados:0, contratados:0, noContratado:0, novSinReemplazo:0, ausentismoTotal:0, totalPagar:0 });
    qs('#totDependency',ui).textContent=`Total dependencias - Planeados: ${totals.planeados}, Contratados: ${totals.contratados}, No contratado: ${totals.noContratado}, Novedad sin reemplazo: ${totals.novSinReemplazo}, Total ausentismo: ${totals.ausentismoTotal}, Total a pagar: ${totals.totalPagar}`;
  }

  function renderTotals(){
    const bySede=new Map();
    sedeDailyRows.forEach((r)=>{
      if(!bySede.has(r.sedeCodigo)) bySede.set(r.sedeCodigo,{
        sedeCodigo:r.sedeCodigo,
        sedeNombre:r.sedeNombre||'-',
        planeados:0,
        contratados:0,
        noContratado:0,
        novSinReemplazo:0,
        ausentismoTotal:0,
        totalPagar:0
      });
      const t=bySede.get(r.sedeCodigo);
      t.planeados+=r.planeados;
      t.contratados+=r.contratados;
      t.noContratado+=r.noContratado;
      t.novSinReemplazo+=r.novSinReemplazo;
      t.ausentismoTotal+=r.ausentismoTotal;
      t.totalPagar+=r.totalPagar;
    });
    const rows=Array.from(bySede.values()).sort((a,b)=> String(a.sedeNombre||'').localeCompare(String(b.sedeNombre||'')));
    totalsRows=rows;
    const tb=qs('#tblTotals tbody',ui);
    tb.replaceChildren(...rows.map((r)=>{
      const tr=el('tr',{},[]);
      const btn=el('button',{className:'btn',type:'button'},['Ver']);
      btn.addEventListener('click',()=> renderSedeDetail(r.sedeCodigo,r.sedeNombre));
      tr.append(
        el('td',{},[r.sedeNombre||'-']),
        el('td',{},[String(r.planeados)]),
        el('td',{},[String(r.contratados)]),
        el('td',{},[String(r.noContratado)]),
        el('td',{},[String(r.novSinReemplazo)]),
        el('td',{},[String(r.ausentismoTotal)]),
        el('td',{},[String(r.totalPagar)]),
        el('td',{},[btn])
      );
      return tr;
    }));
    const totalRange=rows.reduce((acc,r)=> acc+r.totalPagar,0);
    qs('#totRange',ui).textContent=`Total rango a pagar: ${totalRange}`;
  }

  function renderDetail(dependenciaKey,dependenciaNombre,date){
    qs('#detailTitle',ui).textContent=`Detalle dependencia: ${dependenciaNombre||'-'} (${date})`;
    const detailRows=[];
    const depDaily=sedeDailyRows
      .filter((r)=> r.dependenciaKey===dependenciaKey)
      .sort((a,b)=> (String(a.fecha)+String(a.sedeNombre)).localeCompare(String(b.fecha)+String(b.sedeNombre)));

    depDaily.forEach((d)=>{
      const key=`${d.fecha}|${d.sedeCodigo}`;
      const atts=attendanceByKey.get(key)||[];
      atts.forEach((a)=>{
        const rep=replByEmpDate.get(`${a.fecha||''}|${a.empleadoId||''}`);
        let estado='Trabajo';
        if(rep){
          estado=rep.decision==='reemplazo'
            ? `Reemplazado por ${rep.supernumerarioNombre||rep.supernumerarioDocumento||'-'}`
            : 'Ausentismo';
        }else if(!a.asistio){
          estado='Ausentismo';
        }
        detailRows.push({
          fecha:d.fecha,
          sede:d.sedeNombre,
          documento:a.documento||'-',
          nombre:a.nombre||'-',
          estado
        });
      });
      for(let i=0;i<Number(d.noContratado||0);i++){
        detailRows.push({
          fecha:d.fecha,
          sede:d.sedeNombre,
          documento:'-',
          nombre:`No contratado ${i+1}`,
          estado:'No contratado'
        });
      }
    });

    const tb=qs('#tblDetail tbody',ui);
    tb.replaceChildren(...detailRows.map((r)=> el('tr',{},[
      el('td',{},[r.fecha||'-']),
      el('td',{},[r.sede||'-']),
      el('td',{},[r.documento||'-']),
      el('td',{},[r.nombre||'-']),
      el('td',{},[r.estado||'-'])
    ])));
    detailRowsCache=detailRows;
  }

  function renderSedeDetail(sedeCodigo,sedeNombre){
    const date=qs('#opDate',ui).value;
    qs('#detailTitle',ui).textContent=`Detalle sede: ${sedeNombre||'-'} (${date})`;
    const detailRows=[];
    const sedeRows=sedeDailyRows
      .filter((r)=> r.sedeCodigo===sedeCodigo)
      .sort((a,b)=> String(a.fecha).localeCompare(String(b.fecha)));

    sedeRows.forEach((d)=>{
      const key=`${d.fecha}|${d.sedeCodigo}`;
      const atts=attendanceByKey.get(key)||[];
      atts.forEach((a)=>{
        const rep=replByEmpDate.get(`${a.fecha||''}|${a.empleadoId||''}`);
        let estado='Trabajo';
        if(rep){
          estado=rep.decision==='reemplazo'
            ? `Reemplazado por ${rep.supernumerarioNombre||rep.supernumerarioDocumento||'-'}`
            : 'Ausentismo';
        }else if(!a.asistio){
          estado='Ausentismo';
        }
        detailRows.push({
          fecha:d.fecha,
          sede:d.sedeNombre,
          documento:a.documento||'-',
          nombre:a.nombre||'-',
          estado
        });
      });
      for(let i=0;i<Number(d.noContratado||0);i++){
        detailRows.push({
          fecha:d.fecha,
          sede:d.sedeNombre,
          documento:'-',
          nombre:`No contratado ${i+1}`,
          estado:'No contratado'
        });
      }
    });

    const tb=qs('#tblDetail tbody',ui);
    tb.replaceChildren(...detailRows.map((r)=> el('tr',{},[
      el('td',{},[r.fecha||'-']),
      el('td',{},[r.sede||'-']),
      el('td',{},[r.documento||'-']),
      el('td',{},[r.nombre||'-']),
      el('td',{},[r.estado||'-'])
    ])));
    detailRowsCache=detailRows;
  }

  async function exportSummaryExcel(){
    if(!dependencyRows.length && !totalsRows.length){ msg.textContent='No hay datos para exportar.'; return; }
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const wb=mod.utils.book_new();
      const depData=dependencyRows.map((r)=>(
        {
          Dependencia:r.dependenciaNombre,
          Planeados:r.planeados,
          Contratados:r.contratados,
          NoContratado:r.noContratado,
          NovedadSinReemplazo:r.novSinReemplazo,
          TotalAusentismo:r.ausentismoTotal,
          TotalPagar:r.totalPagar
        }
      ));
      const totalsData=totalsRows.map((r)=>(
        {
          Sede:r.sedeNombre,
          Planeados:r.planeados,
          Contratados:r.contratados,
          NoContratado:r.noContratado,
          NovedadSinReemplazo:r.novSinReemplazo,
          TotalAusentismo:r.ausentismoTotal,
          TotalPagar:r.totalPagar
        }
      ));
      const wsDep=mod.utils.json_to_sheet(depData.length?depData:[{Info:'Sin datos'}]);
      const wsTotals=mod.utils.json_to_sheet(totalsData.length?totalsData:[{Info:'Sin datos'}]);
      mod.utils.book_append_sheet(wb,wsDep,'ResumenDependencia');
      mod.utils.book_append_sheet(wb,wsTotals,'ResumenSede');
      const date=qs('#opDate',ui).value||'fecha';
      mod.writeFile(wb,`ausentismo_resumen_${date}.xlsx`);
      msg.textContent='Resumen exportado a Excel.';
    }catch(e){
      msg.textContent='Error exportando resumen: '+(e?.message||e);
    }
  }

  async function exportDetailExcel(){
    if(!detailRowsCache.length){ msg.textContent='Primero abre un detalle de dependencia para exportar.'; return; }
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const wb=mod.utils.book_new();
      const data=detailRowsCache.map((r)=>(
        {
          Fecha:r.fecha,
          Sede:r.sede,
          Documento:r.documento,
          Nombre:r.nombre,
          Estado:r.estado
        }
      ));
      const ws=mod.utils.json_to_sheet(data);
      mod.utils.book_append_sheet(wb,ws,'DetalleDependencia');
      const date=qs('#opDate',ui).value||'fecha';
      mod.writeFile(wb,`ausentismo_detalle_${date}.xlsx`);
      msg.textContent='Detalle exportado a Excel.';
    }catch(e){
      msg.textContent='Error exportando detalle: '+(e?.message||e);
    }
  }

  async function exportSedeExcel(){
    if(!totalsRows.length){ msg.textContent='No hay resumen por sede para exportar.'; return; }
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const wb=mod.utils.book_new();
      const data=totalsRows.map((r)=>(
        {
          Sede:r.sedeNombre,
          Planeados:r.planeados,
          Contratados:r.contratados,
          NoContratado:r.noContratado,
          NovedadSinReemplazo:r.novSinReemplazo,
          TotalAusentismo:r.ausentismoTotal,
          TotalPagar:r.totalPagar
        }
      ));
      const ws=mod.utils.json_to_sheet(data);
      mod.utils.book_append_sheet(wb,ws,'ResumenSede');
      const date=qs('#opDate',ui).value||'fecha';
      mod.writeFile(wb,`ausentismo_resumen_sedes_${date}.xlsx`);
      msg.textContent='Resumen por sede exportado a Excel.';
    }catch(e){
      msg.textContent='Error exportando sedes: '+(e?.message||e);
    }
  }

  async function loadSedesSnapshot(){
    if(typeof deps.streamSedes!=='function') return [];
    return new Promise((resolve)=>{
      let settled=false;
      let unsub=null;
      const finish=(rows)=>{
        if(settled) return;
        settled=true;
        try{ if(typeof unsub==='function') unsub(); }catch{}
        resolve(Array.isArray(rows)? rows : []);
      };
      unsub=deps.streamSedes((rows)=> finish(rows));
      setTimeout(()=> finish([]), 5000);
    });
  }

  mount.replaceChildren(ui);
  enableSectionToggles(ui);
  return ()=>{};
};

function todayBogota(){
  const fmt=new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(new Date());
}
