import { el, qs } from '../utils/dom.js';

export const CargueMasivoAdmin=(mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Cargue masivo de empleados']),
    el('div',{className:'form-row mt-2'},[
      el('input',{id:'fileInput',className:'input',type:'file',accept:'.csv,.xls,.xlsx'}),
      el('button',{id:'btnValidate',className:'btn btn--primary'},['Validar archivo']),
      el('button',{id:'btnImport',className:'btn',disabled:true},['Importar empleados']),
      el('span',{id:'msg',className:'text-muted'},[' '])
    ]),
    el('div',{className:'divider'}),
    el('div',{className:'form-row'},[
      el('div',{},[ el('label',{className:'label'},['Filas leidas']), el('input',{id:'sumRows',className:'input',disabled:true}) ]),
      el('div',{},[ el('label',{className:'label'},['Validas']), el('input',{id:'sumOk',className:'input',disabled:true}) ]),
      el('div',{},[ el('label',{className:'label'},['Errores']), el('input',{id:'sumErr',className:'input',disabled:true}) ])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table',id:'tblPreview'},[
        el('thead',{},[ el('tr',{},[
          el('th',{},['Documento']),
          el('th',{},['Nombre']),
          el('th',{},['Telefono']),
          el('th',{},['Cargo']),
          el('th',{},['Sede']),
          el('th',{},['Fecha ingreso']),
          el('th',{},['Estado'])
        ]) ]),
        el('tbody',{})
      ])
    ]),
    el('div',{className:'mt-2 table-wrap'},[
      el('table',{className:'table',id:'tblErrors'},[
        el('thead',{},[ el('tr',{},[ el('th',{},['Fila']), el('th',{},['Error']) ]) ]),
        el('tbody',{})
      ])
    ])
  ]);

  const msg=qs('#msg',ui);
  const btnImport=qs('#btnImport',ui);
  const fileInput=qs('#fileInput',ui);
  let employees=[]; let cargos=[]; let sedes=[];
  let validRows=[];

  const unEmp=deps.streamEmployees?.((arr)=>{ employees=arr||[]; });
  const unCargo=deps.streamCargos?.((arr)=>{ cargos=arr||[]; });
  const unSede=deps.streamSedes?.((arr)=>{ sedes=arr||[]; });

  qs('#btnValidate',ui).addEventListener('click',async()=>{
    msg.textContent='Validando archivo...';
    btnImport.disabled=true;
    validRows=[];
    try{
      const file=fileInput.files?.[0];
      if(!file){ msg.textContent='Selecciona un archivo CSV/XLS/XLSX.'; return; }
      const rows=await readInputFile(file);
      const result=validateRows(rows, employees, cargos, sedes);
      renderSummary(result.rows.length, result.valid.length, result.errors.length);
      renderPreview(result.preview);
      renderErrors(result.errors);
      validRows=result.valid;
      btnImport.disabled=result.valid.length===0;
      msg.textContent=result.errors.length? 'Validacion finalizada con errores.' : 'Archivo valido. Puedes importar.';
    }catch(e){
      msg.textContent='Error: '+(e?.message||e);
    }
  });

  btnImport.addEventListener('click',async()=>{
    if(!validRows.length){ msg.textContent='No hay filas validas para importar.'; return; }
    btnImport.disabled=true;
    msg.textContent='Importando empleados...';
    try{
      const out=await deps.createEmployeesBulk?.(validRows);
      await deps.addAuditLog?.({
        targetType:'employee',
        action:'bulk_create_employees',
        after:{ total: out?.created||validRows.length }
      });
      msg.textContent=`Importacion completada. Creados: ${out?.created||validRows.length}`;
      validRows=[];
    }catch(e){
      msg.textContent='Error al importar: '+(e?.message||e);
      btnImport.disabled=false;
    }
  });

  function renderSummary(total, ok, err){
    qs('#sumRows',ui).value=String(total||0);
    qs('#sumOk',ui).value=String(ok||0);
    qs('#sumErr',ui).value=String(err||0);
  }

  function renderPreview(rows){
    const tb=qs('#tblPreview tbody',ui);
    tb.replaceChildren(...rows.map(r=>el('tr',{},[
      el('td',{},[r.documento||'-']),
      el('td',{},[r.nombre||'-']),
      el('td',{},[r.telefono||'-']),
      el('td',{},[r.cargoNombre||'-']),
      el('td',{},[r.sedeNombre||'-']),
      el('td',{},[r.fechaIngreso||'-']),
      el('td',{},[r.ok? 'OK':'ERROR'])
    ])));
  }

  function renderErrors(errors){
    const tb=qs('#tblErrors tbody',ui);
    tb.replaceChildren(...errors.map(err=>el('tr',{},[
      el('td',{},[String(err.row)]),
      el('td',{},[err.message||'Error'])
    ])));
  }

  function validateRows(rows, employeesList, cargosList, sedesList){
    const existingDocs=new Set((employeesList||[]).map(e=> String(e.documento||'').trim()).filter(Boolean));
    const localDocs=new Set();
    const cargoByName=new Map((cargosList||[]).map(c=> [String(c.nombre||'').trim().toLowerCase(), c]));
    const sedeByName=new Map((sedesList||[]).map(s=> [String(s.nombre||'').trim().toLowerCase(), s]));
    const errors=[]; const valid=[]; const preview=[];

    rows.forEach((raw,idx)=>{
      const rowNum=idx+2;
      const documento=String(raw.documento||'').trim();
      const nombre=String(raw.nombre||'').trim();
      const telefono=String(raw.telefono||'').trim();
      const cargoTxt=String(raw.cargo||'').trim().toLowerCase();
      const sedeTxt=String(raw.sede||'').trim().toLowerCase();
      const fechaIngreso=normalizeDate(raw.fechaIngreso||raw.fecha_ingreso||raw.fecha||'');
      const issues=[];
      if(!documento) issues.push('Documento requerido.');
      if(!nombre) issues.push('Nombre requerido.');
      if(!telefono) issues.push('Telefono requerido.');
      if(!cargoTxt) issues.push('Cargo requerido.');
      if(!sedeTxt) issues.push('Sede requerida.');
      if(!fechaIngreso) issues.push('Fecha ingreso invalida.');
      const cargo=cargoByName.get(cargoTxt);
      const sede=sedeByName.get(sedeTxt);
      if(cargoTxt && !cargo) issues.push(`Cargo no existe: ${cargoTxt}`);
      if(sedeTxt && !sede) issues.push(`Sede no existe: ${sedeTxt}`);
      if(documento && existingDocs.has(documento)) issues.push('Documento ya existe en empleados.');
      if(documento && localDocs.has(documento)) issues.push('Documento duplicado en archivo.');
      if(documento) localDocs.add(documento);

      if(issues.length){
        errors.push({ row:rowNum, message: issues.join(' ') });
        preview.push({ documento, nombre, telefono, cargoNombre:cargo?.nombre||raw.cargo||'', sedeNombre:sede?.nombre||raw.sede||'', fechaIngreso, ok:false });
        return;
      }

      valid.push({
        documento,
        nombre,
        telefono,
        cargoCodigo:cargo.codigo,
        cargoNombre:cargo.nombre,
        sedeCodigo:sede.codigo,
        sedeNombre:sede.nombre,
        fechaIngreso: new Date(`${fechaIngreso}T00:00:00`)
      });
      preview.push({ documento, nombre, telefono, cargoNombre:cargo.nombre, sedeNombre:sede.nombre, fechaIngreso, ok:true });
    });

    return { rows, valid, errors, preview };
  }

  async function readInputFile(file){
    const name=(file.name||'').toLowerCase();
    if(name.endsWith('.csv')) return parseCSVRows(await file.text());
    if(name.endsWith('.xls') || name.endsWith('.xlsx')){
      const mod=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
      const buff=await file.arrayBuffer();
      const wb=mod.read(buff, { type:'array' });
      const first=wb.SheetNames[0];
      const ws=wb.Sheets[first];
      const rows=mod.utils.sheet_to_json(ws,{ defval:'' });
      return rows.map(r=> normalizeInputRow(r));
    }
    throw new Error('Formato no soportado. Usa CSV/XLS/XLSX.');
  }

  function parseCSVRows(text){
    const rows=[]; let row=[]; let cur=''; let inQuotes=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i]; const next=text[i+1];
      if(ch==='\"'){
        if(inQuotes && next==='\"'){ cur+='\"'; i++; } else { inQuotes=!inQuotes; }
      } else if((ch===',' || ch===';' || ch==='\t') && !inQuotes){
        row.push(cur); cur='';
      } else if((ch==='\n' || ch==='\r') && !inQuotes){
        if(cur!=='' || row.length){ row.push(cur); rows.push(row); row=[]; cur=''; }
      } else {
        cur+=ch;
      }
    }
    if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
    if(!rows.length) return [];
    const headers=rows[0].map(h=> String(h||'').trim());
    return rows.slice(1).map(cols=>{
      const obj={}; headers.forEach((h,i)=>{ obj[h]=cols[i]??''; }); return normalizeInputRow(obj);
    });
  }

  function normalizeInputRow(obj){
    const out={ documento:'', nombre:'', telefono:'', cargo:'', sede:'', fechaIngreso:'' };
    Object.keys(obj||{}).forEach((k)=>{
      const key=String(k||'').trim().toLowerCase();
      const v=String(obj[k]??'').trim();
      if(key==='documento' || key==='doc') out.documento=v;
      if(key==='nombre' || key==='nombre completo') out.nombre=v;
      if(key==='telefono' || key==='celular' || key==='numero cel') out.telefono=v;
      if(key==='cargo') out.cargo=v;
      if(key==='sede') out.sede=v;
      if(key==='fecha ingreso' || key==='fecha_ingreso' || key==='fecha') out.fechaIngreso=v;
    });
    return out;
  }

  function normalizeDate(value){
    const v=String(value||'').trim();
    if(!v) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const parts=v.split(/[\/\-.]/).map(p=> p.trim()).filter(Boolean);
    if(parts.length===3){
      let d=''; let m=''; let y='';
      if(parts[0].length===4){ y=parts[0]; m=parts[1]; d=parts[2]; }
      else { d=parts[0]; m=parts[1]; y=parts[2]; }
      let yy=Number(y); const dd=Number(d); const mm=Number(m);
      if(!Number.isFinite(yy)||!Number.isFinite(dd)||!Number.isFinite(mm)) return '';
      if(y.length===2) yy=2000+yy;
      if(dd<1||dd>31||mm<1||mm>12) return '';
      return `${String(yy).padStart(4,'0')}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    }
    return '';
  }

  mount.replaceChildren(ui);
  return ()=>{ unEmp?.(); unCargo?.(); unSede?.(); };
};

