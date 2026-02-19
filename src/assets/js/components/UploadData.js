import { el, qs, enableSectionToggles } from '../utils/dom.js';
import { SHEET_ID, SHEET_NAME, SHEET_GID } from '../config.js';
import { setState } from '../state.js';
import { navigate } from '../router.js';

export const UploadData=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Operacion - Registro']),
    el('div',{className:'form-row mt-2'},[
      el('div',{},[ el('label',{className:'label'},['Fecha a revisar']), el('input',{id:'opDate',className:'input',type:'date'}) ]),
      el('button',{id:'btnCheck',className:'btn btn--primary'},['Consultar registro']),
      el('button',{id:'btnConfirm',className:'btn',disabled:true},['Confirmar operacion']),
      el('span',{id:'msg',className:'text-muted'},[' '])
    ]),
    el('div',{className:'divider'}),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Resumen']),
      el('div',{className:'form-row'},[
        el('div',{},[ el('label',{className:'label'},['Empleados planeados']), el('input',{id:'opPlanned',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Empleados esperados']), el('input',{id:'opExpected',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Empleados en registro']), el('input',{id:'opFound',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Faltan']), el('input',{id:'opMissing',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Sobran']), el('input',{id:'opExtra',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Supervisores faltantes']), el('input',{id:'opMissingSup',className:'input',disabled:true}) ]),
        el('div',{},[ el('label',{className:'label'},['Supernumerarios faltantes']), el('input',{id:'opMissingSupn',className:'input',disabled:true}) ])
      ])
    ]),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Empleados faltantes']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblMissing'},[
          el('thead',{},[ el('tr',{},[ el('th',{},['Faltan (Empleados)']), el('th',{},['Documento']), el('th',{},['Nombre']), el('th',{},['Sede']), el('th',{},['Novedad']) ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totMissing',className:'text-muted'},['Total faltantes: 0'])
    ]),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Registros sobrantes']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblExtra'},[
          el('thead',{},[ el('tr',{},[ el('th',{},['Sobran (Registro)']), el('th',{},['Documento']), el('th',{},['Nombre en registro']), el('th',{},['Novedad']) ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totExtra',className:'text-muted'},['Total sobrantes: 0'])
    ]),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Supervisores faltantes']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblMissingSup'},[
          el('thead',{},[ el('tr',{},[ el('th',{},['Supervisores faltantes']), el('th',{},['Documento']), el('th',{},['Nombre']), el('th',{},['Zona']) ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totSup',className:'text-muted'},['Total supervisores faltantes: 0'])
    ]),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Supernumerarios faltantes']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblMissingSupn'},[
          el('thead',{},[ el('tr',{},[ el('th',{},['Supernumerarios faltantes']), el('th',{},['Documento']), el('th',{},['Nombre']), el('th',{},['Sede']) ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totSupn',className:'text-muted'},['Total supernumerarios faltantes: 0'])
    ]),
    el('div',{className:'section-block'},[
      el('h3',{className:'section-title'},['Personal por sede']),
      el('div',{className:'table-wrap'},[
        el('table',{className:'table',id:'tblSedes'},[
          el('thead',{},[ el('tr',{},[
            el('th',{},['Sede']),
            el('th',{},['Esperados']),
            el('th',{},['Presentes']),
            el('th',{},['Faltan']),
            el('th',{},['Sobran']),
            el('th',{},['Novedad'])
          ]) ]),
          el('tbody',{})
        ])
      ]),
      el('p',{id:'totSedes',className:'text-muted'},['Totales sedes - Esperados: 0, Presentes: 0, Faltan: 0, Sobran: 0, Novedad: 0'])
    ])
  ]);

  const msg=qs('#msg',ui);
  const btnConfirm=qs('#btnConfirm',ui);
  const inputDate=qs('#opDate',ui);
  inputDate.value = todayBogota();

  let employees=[]; let cargos=[]; let sedes=[]; let supervisors=[]; let supernumerarios=[]; let novedades=[];
  let lastResult=null;
  const unEmp=deps.streamEmployees?.((arr)=>{ employees=arr||[]; });
  const unCargo=deps.streamCargos?.((arr)=>{ cargos=arr||[]; });
  const unSedes=deps.streamSedes?.((arr)=>{ sedes=arr||[]; });
  const unSup=deps.streamSupervisors?.((arr)=>{ supervisors=arr||[]; });
  const unSupn=deps.streamSupernumerarios?.((arr)=>{ supernumerarios=arr||[]; });
  const unNov=deps.streamNovedades?.((arr)=>{ novedades=arr||[]; });

  qs('#btnCheck',ui).addEventListener('click',async()=>{
    msg.textContent='Cargando...';
    btnConfirm.disabled=true;
    try{
      const date=inputDate.value;
      if(!date){ msg.textContent='Selecciona una fecha.'; return; }

      const rows=await fetchSheetRows();
      const byDate=rows.filter(r=> normalizeDate(r.fecha)===date);
      if(!byDate.length){ msg.textContent='No hay registros para esa fecha.'; fillSummary(0,0,0,0,0,0,0); renderTables([],[],[],[]); return; }

      const activeSedesForDate=(sedes||[]).filter((s)=> s.estado!=='inactivo' && sedeOperaEnFecha(s, date));
      const activeSedeCodes=new Set(activeSedesForDate.map((s)=> String(s.codigo||'').trim()).filter(Boolean));
      const operarios=employees.filter((e)=>{
        if(!isEmployeeEligibleForDate(e, date)) return false;
        const sedeCode=String(e.sedeCodigo||'').trim();
        return !!sedeCode && activeSedeCodes.has(sedeCode);
      });
      const plannedCount=activeSedesForDate
        .reduce((acc,s)=> acc + (Number.isFinite(Number(s.numeroOperarios)) ? Number(s.numeroOperarios) : 0), 0);

      const regDocs=new Map();
      for(const r of byDate){
        const doc=String(r.documento||'').trim();
        if(!doc) continue;
        if(!regDocs.has(doc)) regDocs.set(doc,r);
      }

      const missing=[];
      const extra=[];
      const activeSupernumerarioDocs=new Set(
        (supernumerarios||[])
          .filter((s)=> String(s.estado||'').toLowerCase()!=='inactivo')
          .map((s)=> String(s.documento||'').trim())
          .filter(Boolean)
      );
      for(const op of operarios){
        const doc=String(op.documento||'').trim();
        if(!doc) continue;
        if(!regDocs.has(doc)){
          missing.push(op);
        }
      }
      for(const [doc,r] of regDocs.entries()){
        if(activeSupernumerarioDocs.has(doc)) continue;
        const exists=operarios.some(op=> String(op.documento||'').trim()===doc);
        if(!exists) extra.push(r);
      }

      const activeEmployeeDocs=new Set(operarios.map((e)=> String(e.documento||'').trim()).filter(Boolean));
      const supervisorsLinked=supervisors.filter((s)=>{
        if(s.estado==='inactivo') return false;
        const doc=String(s.documento||'').trim();
        return !!doc && activeEmployeeDocs.has(doc);
      });
      const missingSupervisors=supervisorsLinked.filter((s)=> !regDocs.has(String(s.documento||'').trim()));
      const supernumerariosLinked=supernumerarios.filter((s)=>{
        if(s.estado==='inactivo') return false;
        const doc=String(s.documento||'').trim();
        return !!doc && activeEmployeeDocs.has(doc);
      });
      const missingSupernumerarios=supernumerariosLinked.filter((s)=> !regDocs.has(String(s.documento||'').trim()));

      fillSummary(plannedCount, operarios.length, regDocs.size, missing.length, extra.length, missingSupervisors.length, missingSupernumerarios.length);
      renderTables(missing, extra, missingSupervisors, missingSupernumerarios, buildSedeDiffs(operarios, regDocs, activeSedesForDate, novedades));
      lastResult=buildResult(date, plannedCount, operarios, regDocs, missing, extra, missingSupervisors, missingSupernumerarios, activeSedesForDate, novedades, activeSupernumerarioDocs);
      btnConfirm.disabled=false;
      msg.textContent='Listo. Revisa faltan/sobran, supervisores y supernumerarios faltantes.';
    }catch(e){
      msg.textContent='Error: '+(e?.message||e);
    }
  });

  btnConfirm.addEventListener('click',async()=>{
    if(!lastResult){ msg.textContent='Primero realiza la consulta.'; return; }
    btnConfirm.disabled=true;
    msg.textContent='Guardando operacion...';
    try{
      const importId=await deps.confirmImportOperation?.(lastResult);
      const candidates=lastResult.replacementCandidates||[];
      setState({
        pendingReplacementFlow:{
          importId: importId||null,
          fechaOperacion: lastResult.fechaOperacion||null,
          candidates
        }
      });
      if(candidates.length){
        msg.textContent='Operacion guardada. Continuando a reemplazos...';
        navigate('/imports-replacements');
      }else{
        msg.textContent='Operacion guardada OK (sin novedades por reemplazar).';
      }
    }catch(e){
      msg.textContent='Error al guardar: '+(e?.message||e);
      btnConfirm.disabled=false;
    }
  });

  function fillSummary(planned, expected, found, missing, extra, missingSup, missingSupn){
    qs('#opPlanned',ui).value=String(planned);
    qs('#opExpected',ui).value=String(expected);
    qs('#opFound',ui).value=String(found);
    qs('#opMissing',ui).value=String(missing);
    qs('#opExtra',ui).value=String(extra);
    qs('#opMissingSup',ui).value=String(missingSup||0);
    qs('#opMissingSupn',ui).value=String(missingSupn||0);
  }
  function renderTables(missing, extra, missingSup, missingSupn, sedeDiffs){
    const tbMissing=qs('#tblMissing tbody',ui);
    const tbExtra=qs('#tblExtra tbody',ui);
    const tbMissingSup=qs('#tblMissingSup tbody',ui);
    const tbMissingSupn=qs('#tblMissingSupn tbody',ui);
    const tbSedes=qs('#tblSedes tbody',ui);
    tbMissing.replaceChildren(...missing.map(op=>{
      return el('tr',{},[
        el('td',{},['Empleado']),
        el('td',{},[op.documento||'-']),
        el('td',{},[op.nombre||'-']),
        el('td',{},[op.sedeNombre||op.sedeCodigo||'-']),
        el('td',{},['-'])
      ]);
    }));
    tbExtra.replaceChildren(...extra.map(r=>{
      return el('tr',{},[
        el('td',{},['Registro']),
        el('td',{},[String(r.documento||'-')]),
        el('td',{},[String(r.nombre||'-')]),
        el('td',{},[String(r.novedad||'-')])
      ]);
    }));
    tbMissingSup.replaceChildren(...(missingSup||[]).map(s=>{
      return el('tr',{},[
        el('td',{},['Supervisor']),
        el('td',{},[String(s.documento||'-')]),
        el('td',{},[String(s.nombre||'-')]),
        el('td',{},[String(s.zonaNombre||s.zonaCodigo||'-')])
      ]);
    }));
    tbMissingSupn.replaceChildren(...(missingSupn||[]).map(s=>{
      return el('tr',{},[
        el('td',{},['Supernumerario']),
        el('td',{},[String(s.documento||'-')]),
        el('td',{},[String(s.nombre||'-')]),
        el('td',{},[String(s.sedeNombre||s.sedeCodigo||'-')])
      ]);
    }));
    const conNovedad=(sedeDiffs||[]).filter((s)=> Number(s.faltan||0)>0 || Number(s.sobran||0)>0 || Number(s.novedad||0)>0);
    tbSedes.replaceChildren(...conNovedad.map(s=>{
      return el('tr',{},[
        el('td',{},[s.sedeNombre||s.sedeCodigo||'-']),
        el('td',{},[String(s.esperados)]),
        el('td',{},[String(s.presentes)]),
        el('td',{},[String(s.faltan)]),
        el('td',{},[String(s.sobran)]),
        el('td',{},[String(Number(s.novedad||0))])
      ]);
    }));
    qs('#totMissing',ui).textContent=`Total faltantes: ${missing.length}`;
    qs('#totExtra',ui).textContent=`Total sobrantes: ${extra.length}`;
    qs('#totSup',ui).textContent=`Total supervisores faltantes: ${(missingSup||[]).length}`;
    qs('#totSupn',ui).textContent=`Total supernumerarios faltantes: ${(missingSupn||[]).length}`;
    const totalEsperados=conNovedad.reduce((acc,s)=> acc + Number(s.esperados||0),0);
    const totalPresentes=conNovedad.reduce((acc,s)=> acc + Number(s.presentes||0),0);
    const totalFaltan=conNovedad.reduce((acc,s)=> acc + Number(s.faltan||0),0);
    const totalSobran=conNovedad.reduce((acc,s)=> acc + Number(s.sobran||0),0);
    const totalNovedad=conNovedad.reduce((acc,s)=> acc + Number(s.novedad||0),0);
    qs('#totSedes',ui).textContent=`Totales sedes - Esperados: ${totalEsperados}, Presentes: ${totalPresentes}, Faltan: ${totalFaltan}, Sobran: ${totalSobran}, Novedad: ${totalNovedad}`;
  }

  function buildSedeDiffs(operarios, regDocs, sedesList, novedadesList){
    const novedadReemplazoSi=new Set((novedadesList||[])
      .filter((n)=> String(n.reemplazo||'').toLowerCase()==='si')
      .flatMap((n)=> [String(n.codigoNovedad||'').trim(), String(n.codigo||'').trim()])
      .filter(Boolean));
    const map=new Map();
    for(const sede of (sedesList||[])){
      const key=sede.codigo||'';
      if(!key) continue;
      map.set(key,{
        sedeCodigo:key,
        sedeNombre:sede.nombre||null,
        esperados: typeof sede.numeroOperarios==='number' ? sede.numeroOperarios : 0,
        presentes:0,
        novedad:0
      });
    }
    for(const op of operarios){
      const key=op.sedeCodigo||'';
      if(!key || !map.has(key)) continue;
      const doc=String(op.documento||'').trim();
      if(regDocs.has(doc)){
        const stat=map.get(key);
        stat.presentes+=1;
        const reg=regDocs.get(doc);
        const novCode=String(reg?.novedad||'').trim();
        if(novCode && novedadReemplazoSi.has(novCode)) stat.novedad+=1;
      }
    }
    return Array.from(map.values()).map(s=>{
      const faltan=Math.max(0, s.esperados - s.presentes);
      const sobran=Math.max(0, s.presentes - s.esperados);
      return { ...s, faltan, sobran };
    }).sort((a,b)=>{
      const aIssues=(a.faltan>0 || a.sobran>0) ? 1 : 0;
      const bIssues=(b.faltan>0 || b.sobran>0) ? 1 : 0;
      if(aIssues!==bIssues) return bIssues - aIssues;
      if(a.faltan!==b.faltan) return b.faltan - a.faltan;
      if(a.sobran!==b.sobran) return b.sobran - a.sobran;
      if(a.novedad!==b.novedad) return b.novedad - a.novedad;
      return (a.sedeNombre||a.sedeCodigo||'').localeCompare(b.sedeNombre||b.sedeCodigo||'');
    });
  }
  function sedeOperaEnFecha(sede, dateStr){
    const jornada=String(sede?.jornada||'lun_vie').toLowerCase();
    const d=new Date(`${dateStr}T00:00:00`);
    if(Number.isNaN(d.getTime())) return false;
    const day=d.getDay(); // 0=domingo, 6=sabado
    if(jornada==='lun_dom') return true;
    if(jornada==='lun_sab') return day>=1 && day<=6;
    return day>=1 && day<=5;
  }
  function buildResult(date, plannedCount, operarios, regDocs, missing, extra, missingSupervisors, missingSupernumerarios, sedesList, novedadesList, activeSupernumerarioDocs=new Set()){
    const missingDocs=missing.map(op=>({
      empleadoId: op.id||op.uid||null,
      documento: op.documento||null,
      nombre: op.nombre||null,
      sedeCodigo: op.sedeCodigo||null,
      sedeNombre: op.sedeNombre||null
    }));
    const extraDocs=Array.from(regDocs.values()).filter(r=>{
      const doc=String(r.documento||'').trim();
      if(activeSupernumerarioDocs.has(doc)) return false;
      return !operarios.some(op=> String(op.documento||'').trim()===doc);
    }).map(r=>({
      documento: String(r.documento||'').trim()||null,
      nombre: String(r.nombre||'').trim()||null,
      novedad: String(r.novedad||'').trim()||null
    }));

    const attendance=operarios.map(op=>{
      const doc=String(op.documento||'').trim();
      const reg=regDocs.get(doc);
      return {
        fecha: date,
        empleadoId: op.id||op.uid||null,
        documento: op.documento||null,
        nombre: op.nombre||null,
        sedeCodigo: op.sedeCodigo||null,
        sedeNombre: op.sedeNombre||null,
        asistio: Boolean(reg),
        novedad: reg? String(reg.novedad||'').trim()||null : null
      };
    });

    const absences=missing.map(op=>({
      fecha: date,
      empleadoId: op.id||op.uid||null,
      documento: op.documento||null,
      nombre: op.nombre||null,
      sedeCodigo: op.sedeCodigo||null,
      sedeNombre: op.sedeNombre||null,
      estado: 'pendiente'
    }));

    const novedadReemplazoSi=new Set((novedadesList||[])
      .filter((n)=> String(n.reemplazo||'').toLowerCase()==='si')
      .flatMap((n)=> [String(n.codigoNovedad||'').trim(), String(n.codigo||'').trim()])
      .filter(Boolean));
    const sedeMap=new Map();
    for(const sede of (sedesList||[])){
      const key=sede.codigo||'';
      if(!key) continue;
      sedeMap.set(key,{
        sedeCodigo:key,
        sedeNombre:sede.nombre||null,
        operariosEsperados: typeof sede.numeroOperarios==='number' ? sede.numeroOperarios : 0,
        operariosPresentes:0,
        novedades:0
      });
    }
    for(const op of operarios){
      const key=op.sedeCodigo||'';
      if(!key || !sedeMap.has(key)) continue;
      const s=sedeMap.get(key);
      const doc=String(op.documento||'').trim();
      if(regDocs.has(doc)){
        s.operariosPresentes+=1;
        const reg=regDocs.get(doc);
        const novCode=String(reg?.novedad||'').trim();
        if(novCode && novedadReemplazoSi.has(novCode)) s.novedades+=1;
      }
    }
    const sedeStatus=Array.from(sedeMap.values()).map(s=>({
      fecha: date,
      sedeCodigo: s.sedeCodigo,
      sedeNombre: s.sedeNombre||null,
      operariosEsperados: s.operariosEsperados,
      operariosPresentes: s.operariosPresentes,
      faltantes: Math.max(0, s.operariosEsperados - s.operariosPresentes),
      novedades: s.novedades||0
    }));

    const missingSupervisorsDocs=(missingSupervisors||[]).map((s)=>({
      supervisorId: s.id||null,
      documento: s.documento||null,
      nombre: s.nombre||null,
      zonaCodigo: s.zonaCodigo||null,
      zonaNombre: s.zonaNombre||null
    }));
    const missingSupernumerariosDocs=(missingSupernumerarios||[]).map((s)=>({
      supernumerarioId: s.id||null,
      documento: s.documento||null,
      nombre: s.nombre||null,
      sedeCodigo: s.sedeCodigo||null,
      sedeNombre: s.sedeNombre||null
    }));
    const replacementCandidates=buildReplacementCandidates(date, operarios, regDocs, novedadesList);

    return {
      fechaOperacion: date,
      source: { sheetId: SHEET_ID, sheetName: SHEET_NAME, sheetGid: SHEET_GID },
      plannedCount: plannedCount,
      expectedCount: operarios.length,
      foundCount: regDocs.size,
      missingCount: missing.length,
      extraCount: extra.length,
      missingSupervisorsCount: missingSupervisorsDocs.length,
      missingSupernumerariosCount: missingSupernumerariosDocs.length,
      missingDocs,
      extraDocs,
      missingSupervisors: missingSupervisorsDocs,
      missingSupernumerarios: missingSupernumerariosDocs,
      replacementCandidates,
      errores: [],
      attendance,
      absences,
      sedeStatus
    };
  }
  function buildReplacementCandidates(date, operarios, regDocs, novedadesList){
    const novedadByCode=new Map();
    (novedadesList||[]).forEach((n)=>{
      if(String(n.reemplazo||'').toLowerCase()!=='si') return;
      const c1=String(n.codigoNovedad||'').trim();
      const c2=String(n.codigo||'').trim();
      if(c1) novedadByCode.set(c1,n);
      if(c2) novedadByCode.set(c2,n);
    });
    const out=[];
    operarios.forEach((op)=>{
      const doc=String(op.documento||'').trim();
      if(!doc || !regDocs.has(doc)) return;
      const reg=regDocs.get(doc);
      const novCode=String(reg?.novedad||'').trim();
      const nov=novedadByCode.get(novCode);
      if(!nov) return;
      out.push({
        fecha: date,
        empleadoId: op.id||op.uid||null,
        documento: op.documento||null,
        nombre: op.nombre||null,
        sedeCodigo: op.sedeCodigo||null,
        sedeNombre: op.sedeNombre||null,
        novedadCodigo: novCode||null,
        novedadNombre: nov.nombre||null
      });
    });
    return out;
  }

  async function fetchSheetRows(){
    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&gid=${encodeURIComponent(SHEET_GID)}`;
    const res=await fetch(url);
    if(!res.ok) throw new Error('No se pudo leer la hoja. Revisa permisos o nombre de pestaña.');
    const text=await res.text();
    let rows=parseCSV(text);
    if(!rows.length) return [];
    // Si viene TSV (sin comas), intenta parseo alterno
    if(rows.length===1 && rows[0].length===1 && text.includes('\t')){
      rows=parseTSV(text);
    }
    if(!rows.length) return [];
    let headers=rows[0].map(h=> String(h||'').trim());
    const hasHeader=headers.some(h=> canonicalHeader(h));
    if(!hasHeader){
      headers=['HORA','FECHA','NUMERO CEL','NOMBRE','DOCUMENTO','NOVEDAD'];
      return rows.map(cols=> toCanonicalRow(mapRow(headers, cols)));
    }
    return rows.slice(1).map(cols=> toCanonicalRow(mapRow(headers, cols)));
  }

  function parseCSV(text){
    const rows=[]; let row=[]; let cur=''; let inQuotes=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i]; const next=text[i+1];
      if(ch==='\"'){
        if(inQuotes && next==='\"'){ cur+='\"'; i++; }
        else { inQuotes=!inQuotes; }
      } else if(ch===',' && !inQuotes){
        row.push(cur); cur='';
      } else if((ch==='\n' || ch==='\r') && !inQuotes){
        if(cur!=='' || row.length){ row.push(cur); rows.push(row); row=[]; cur=''; }
      } else {
        cur+=ch;
      }
    }
    if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
    return rows;
  }

  function parseTSV(text){
    const lines=text.split(/\r?\n/).filter(l=> l.trim()!=='');
    return lines.map(line=> line.split('\t'));
  }

  function mapRow(headers, cols){
    const row={};
    headers.forEach((h,i)=>{ row[h]=cols[i]??''; });
    return row;
  }

  function canonicalHeader(value){
    const h=String(value||'').trim().toUpperCase();
    if(!h) return '';
    if(h==='HORA') return 'hora';
    if(h==='FECHA') return 'fecha';
    if(h==='NUMERO CEL' || h==='NUMERO_CEL' || h==='CELULAR' || h==='NUMERO CELULAR') return 'numeroCel';
    if(h==='NOMBRE') return 'nombre';
    if(h==='DOCUMENTO') return 'documento';
    if(h==='NOVEDAD') return 'novedad';
    return '';
  }

  function toCanonicalRow(row){
    const out={ hora:'', fecha:'', numeroCel:'', nombre:'', documento:'', novedad:'' };
    Object.keys(row||{}).forEach((k)=>{
      const key=canonicalHeader(k);
      if(!key) return;
      out[key]=row[k]??'';
    });
    out.hora=normalizeTime(out.hora);
    return out;
  }

  function normalizeTime(value){
    const v=String(value||'').trim();
    if(!v) return '';
    // Soporta h,m | h.m | hh.mm | hh,mm | hh:mm
    const cleaned=v.replace(/\s+/g,'');
    const parts=cleaned.split(/[:.,]/).map(p=> p.trim()).filter(Boolean);
    if(parts.length===0) return '';
    let h=Number(parts[0]);
    let m=parts.length>1 ? Number(parts[1]) : 0;
    if(!Number.isFinite(h) || !Number.isFinite(m)) return '';
    if(h<0 || h>23 || m<0 || m>59) return '';
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function normalizeDate(value){
    const v=String(value||'').trim();
    if(!v) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

    // Acepta d-m-aaaa, d-m-aa, dd-m-aaaa, dd-mm-aaaa, d-mm-aa (tambien con / o .)
    const parts=v.split(/[\/\-.]/).map(p=> p.trim()).filter(Boolean);
    if(parts.length===3){
      let day=''; let month=''; let year='';
      if(parts[0].length===4){
        // yyyy-m-d
        year=parts[0]; month=parts[1]; day=parts[2];
      }else{
        // d-m-yyyy o d-m-yy
        day=parts[0]; month=parts[1]; year=parts[2];
      }

      const dNum=Number(day);
      const mNum=Number(month);
      let yNum=Number(year);
      if(!Number.isFinite(dNum) || !Number.isFinite(mNum) || !Number.isFinite(yNum)) return '';
      if(year.length===2) yNum=2000+yNum;
      if(dNum<1 || dNum>31 || mNum<1 || mNum>12) return '';

      const dStr=String(dNum).padStart(2,'0');
      const mStr=String(mNum).padStart(2,'0');
      const yStr=String(yNum).padStart(4,'0');
      return `${yStr}-${mStr}-${dStr}`;
    }
    return '';
  }

  function isEmployeeEligibleForDate(employee, reportDate){
    if(String(employee?.estado||'').toLowerCase()==='inactivo') return false;
    const startDate=extractDate(employee?.fechaIngreso);
    if(!startDate) return false;
    // Regla solicitada: fecha de inicio igual o menor a la fecha del reporte.
    return startDate <= reportDate;
  }

  function extractDate(value){
    if(!value) return '';
    if(typeof value==='string') return normalizeDate(value);
    if(value instanceof Date){
      if(Number.isNaN(value.getTime())) return '';
      return value.toISOString().slice(0,10);
    }
    if(typeof value?.toDate==='function'){
      const d=value.toDate();
      if(!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0,10);
    }
    return '';
  }

  function todayBogota(){
    const fmt=new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' });
    return fmt.format(new Date());
  }

  mount.replaceChildren(ui);
  enableSectionToggles(ui);
  return ()=>{ unEmp?.(); unCargo?.(); unSedes?.(); unSup?.(); unSupn?.(); unNov?.(); };
};
