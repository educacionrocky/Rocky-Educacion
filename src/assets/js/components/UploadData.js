import { el, qs } from '../utils/dom.js';
import { SHEET_ID, SHEET_NAME, SHEET_GID } from '../config.js';

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
    el('div',{className:'form-row'},[
      el('div',{},[ el('label',{className:'label'},['Operarios esperados']), el('input',{id:'opExpected',className:'input',disabled:true}) ]),
      el('div',{},[ el('label',{className:'label'},['Documentos en registro']), el('input',{id:'opFound',className:'input',disabled:true}) ]),
      el('div',{},[ el('label',{className:'label'},['Faltan']), el('input',{id:'opMissing',className:'input',disabled:true}) ]),
      el('div',{},[ el('label',{className:'label'},['Sobran']), el('input',{id:'opExtra',className:'input',disabled:true}) ])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table',id:'tblMissing'},[
        el('thead',{},[ el('tr',{},[ el('th',{},['Faltan (Operarios)']), el('th',{},['Documento']), el('th',{},['Nombre']), el('th',{},['Sede']), el('th',{},['Novedad']) ]) ]),
        el('tbody',{})
      ])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table',id:'tblExtra'},[
        el('thead',{},[ el('tr',{},[ el('th',{},['Sobran (Registro)']), el('th',{},['Documento']), el('th',{},['Nombre en registro']), el('th',{},['Novedad']) ]) ]),
        el('tbody',{})
      ])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table',id:'tblSedes'},[
        el('thead',{},[ el('tr',{},[
          el('th',{},['Sede']),
          el('th',{},['Esperados']),
          el('th',{},['Presentes']),
          el('th',{},['Faltan']),
          el('th',{},['Sobran'])
        ]) ]),
        el('tbody',{})
      ])
    ])
  ]);

  const msg=qs('#msg',ui);
  const btnConfirm=qs('#btnConfirm',ui);
  const inputDate=qs('#opDate',ui);
  inputDate.value = todayBogota();

  let employees=[]; let cargos=[]; let sedes=[];
  let lastResult=null;
  const unEmp=deps.streamEmployees?.((arr)=>{ employees=arr||[]; });
  const unCargo=deps.streamCargos?.((arr)=>{ cargos=arr||[]; });
  const unSedes=deps.streamSedes?.((arr)=>{ sedes=arr||[]; });

  qs('#btnCheck',ui).addEventListener('click',async()=>{
    msg.textContent='Cargando...';
    btnConfirm.disabled=true;
    try{
      const date=inputDate.value;
      if(!date){ msg.textContent='Selecciona una fecha.'; return; }

      const rows=await fetchSheetRows();
      const byDate=rows.filter(r=> normalizeDate(r.fecha)===date);
      if(!byDate.length){ msg.textContent='No hay registros para esa fecha.'; fillSummary(0,0,0,0); renderTables([],[]); return; }

      const operarioCodes=new Set(cargos.filter(c=> (c.nombre||'').toLowerCase()==='operario').map(c=> c.codigo));
      const operarios=employees.filter(e=>{
        const name=(e.cargoNombre||'').toLowerCase();
        const code=e.cargoCodigo||'';
        return name==='operario' || (code && operarioCodes.has(code));
      });

      const regDocs=new Map();
      for(const r of byDate){
        const doc=String(r.documento||'').trim();
        if(!doc) continue;
        if(!regDocs.has(doc)) regDocs.set(doc,r);
      }

      const missing=[];
      const extra=[];
      for(const op of operarios){
        const doc=String(op.documento||'').trim();
        if(!doc) continue;
        if(!regDocs.has(doc)){
          missing.push(op);
        }
      }
      for(const [doc,r] of regDocs.entries()){
        const exists=operarios.some(op=> String(op.documento||'').trim()===doc);
        if(!exists) extra.push(r);
      }

      fillSummary(operarios.length, regDocs.size, missing.length, extra.length);
      renderTables(missing, extra, buildSedeDiffs(operarios, regDocs, sedes));
      lastResult=buildResult(date, operarios, regDocs, missing, extra, sedes);
      btnConfirm.disabled=false;
      msg.textContent='Listo. Revisa faltan/sobran.';
    }catch(e){
      msg.textContent='Error: '+(e?.message||e);
    }
  });

  btnConfirm.addEventListener('click',async()=>{
    if(!lastResult){ msg.textContent='Primero realiza la consulta.'; return; }
    btnConfirm.disabled=true;
    msg.textContent='Guardando operacion...';
    try{
      await deps.confirmImportOperation?.(lastResult);
      msg.textContent='Operacion guardada OK';
    }catch(e){
      msg.textContent='Error al guardar: '+(e?.message||e);
      btnConfirm.disabled=false;
    }
  });

  function fillSummary(expected, found, missing, extra){
    qs('#opExpected',ui).value=String(expected);
    qs('#opFound',ui).value=String(found);
    qs('#opMissing',ui).value=String(missing);
    qs('#opExtra',ui).value=String(extra);
  }
  function renderTables(missing, extra, sedeDiffs){
    const tbMissing=qs('#tblMissing tbody',ui);
    const tbExtra=qs('#tblExtra tbody',ui);
    const tbSedes=qs('#tblSedes tbody',ui);
    tbMissing.replaceChildren(...missing.map(op=>{
      return el('tr',{},[
        el('td',{},['Operario']),
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
    tbSedes.replaceChildren(...(sedeDiffs||[]).map(s=>{
      return el('tr',{},[
        el('td',{},[s.sedeNombre||s.sedeCodigo||'-']),
        el('td',{},[String(s.esperados)]),
        el('td',{},[String(s.presentes)]),
        el('td',{},[String(s.faltan)]),
        el('td',{},[String(s.sobran)])
      ]);
    }));
  }

  function buildSedeDiffs(operarios, regDocs, sedesList){
    const map=new Map();
    for(const sede of (sedesList||[])){
      const key=sede.codigo||'';
      if(!key) continue;
      map.set(key,{
        sedeCodigo:key,
        sedeNombre:sede.nombre||null,
        esperados: typeof sede.numeroOperarios==='number' ? sede.numeroOperarios : 0,
        presentes:0
      });
    }
    for(const op of operarios){
      const key=op.sedeCodigo||'';
      if(!key || !map.has(key)) continue;
      const doc=String(op.documento||'').trim();
      if(regDocs.has(doc)) map.get(key).presentes+=1;
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
      return (a.sedeNombre||a.sedeCodigo||'').localeCompare(b.sedeNombre||b.sedeCodigo||'');
    });
  }
  function buildResult(date, operarios, regDocs, missing, extra, sedesList){
    const missingDocs=missing.map(op=>({
      empleadoId: op.id||op.uid||null,
      documento: op.documento||null,
      nombre: op.nombre||null,
      sedeCodigo: op.sedeCodigo||null,
      sedeNombre: op.sedeNombre||null
    }));
    const extraDocs=Array.from(regDocs.values()).filter(r=>{
      const doc=String(r.documento||'').trim();
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

    const sedeMap=new Map();
    for(const sede of (sedesList||[])){
      const key=sede.codigo||'';
      if(!key) continue;
      sedeMap.set(key,{
        sedeCodigo:key,
        sedeNombre:sede.nombre||null,
        operariosEsperados: typeof sede.numeroOperarios==='number' ? sede.numeroOperarios : 0,
        operariosPresentes:0
      });
    }
    for(const op of operarios){
      const key=op.sedeCodigo||'';
      if(!key || !sedeMap.has(key)) continue;
      const s=sedeMap.get(key);
      const doc=String(op.documento||'').trim();
      if(regDocs.has(doc)) s.operariosPresentes+=1;
    }
    const sedeStatus=Array.from(sedeMap.values()).map(s=>({
      fecha: date,
      sedeCodigo: s.sedeCodigo,
      sedeNombre: s.sedeNombre||null,
      operariosEsperados: s.operariosEsperados,
      operariosPresentes: s.operariosPresentes,
      faltantes: Math.max(0, s.operariosEsperados - s.operariosPresentes)
    }));

    return {
      fechaOperacion: date,
      source: { sheetId: SHEET_ID, sheetName: SHEET_NAME, sheetGid: SHEET_GID },
      expectedCount: operarios.length,
      foundCount: regDocs.size,
      missingCount: missing.length,
      extraCount: extra.length,
      missingDocs,
      extraDocs,
      errores: [],
      attendance,
      absences,
      sedeStatus
    };
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

  function todayBogota(){
    const fmt=new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' });
    return fmt.format(new Date());
  }

  mount.replaceChildren(ui);
  return ()=>{ unEmp?.(); unCargo?.(); unSedes?.(); };
};
