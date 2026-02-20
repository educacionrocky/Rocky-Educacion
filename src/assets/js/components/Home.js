import { el, qs } from '../utils/dom.js';

export const Home=async (mount,deps={})=>{
  const ui=el('section',{className:'main-card'},[
    el('h2',{},['Dashboard de operacion']),
    el('div',{className:'form-row mt-2'},[
      el('div',{},[
        el('label',{className:'label'},['Mes']),
        el('input',{id:'monthPick',className:'input',type:'month'})
      ]),
      el('button',{id:'btnLoad',className:'btn btn--primary',type:'button'},['Actualizar']),
      el('span',{id:'msg',className:'text-muted'},[' '])
    ]),
    el('div',{className:'perms-grid mt-2'},[
      statCard('Servicios contratados (planeados)','kPlanned'),
      statCard('No contratados','kNotContracted'),
      statCard('Ausentismos','kAbsenteeism'),
      statCard('Servicios pagados','kPaid')
    ]),
    el('div',{className:'section-block mt-2'},[
      el('h3',{className:'section-title'},['Servicios pagados por dia']),
      el('div',{style:'min-height:320px;'},[
        el('canvas',{id:'chartPaid'})
      ])
    ])
  ]);

  mount.replaceChildren(ui);

  const msg=qs('#msg',ui);
  const monthPick=qs('#monthPick',ui);
  const btnLoad=qs('#btnLoad',ui);
  let chart=null;
  let ChartMod=null;

  monthPick.value=await getDefaultMonth();
  btnLoad.addEventListener('click',()=> loadMonth(monthPick.value));
  await loadMonth(monthPick.value);

  return ()=>{
    if(chart){ chart.destroy(); chart=null; }
  };

  async function getDefaultMonth(){
    const latest=await getLatestImportDate();
    return String(latest||todayBogota()).slice(0,7);
  }

  async function getLatestImportDate(){
    if(typeof deps.streamImportHistory!=='function') return '';
    return new Promise((resolve)=>{
      let done=false;
      let unsub=null;
      const finish=(value)=>{
        if(done) return;
        done=true;
        try{ if(typeof unsub==='function') unsub(); }catch{}
        resolve(value||'');
      };
      unsub=deps.streamImportHistory((rows)=>{
        const first=Array.isArray(rows) && rows.length ? rows[0] : null;
        finish(first?.fechaOperacion||'');
      },1);
      setTimeout(()=> finish(''), 3500);
    });
  }

  async function loadMonth(month){
    if(!month || !/^\d{4}-\d{2}$/.test(month)){ msg.textContent='Selecciona un mes valido.'; return; }
    const { from,to }=monthRange(month);
    msg.textContent='Consultando...';
    try{
      const [sedeStatus,replacements]=await Promise.all([
        deps.listSedeStatusRange?.(from,to) || [],
        deps.listImportReplacementsRange?.(from,to) || []
      ]);

      const byDay=new Map();
      eachDay(from,to).forEach((d)=> byDay.set(d,{ fecha:d, planeados:0, noContratados:0, ausentismos:0, pagados:0 }));
      (sedeStatus||[]).forEach((s)=>{
        const day=String(s.fecha||'');
        if(!byDay.has(day)) return;
        const item=byDay.get(day);
        item.planeados+=Number(s.operariosEsperados||0);
        item.noContratados+=Number(s.faltantes||0);
      });
      (replacements||[]).forEach((r)=>{
        if(r.decision==='reemplazo') return;
        const day=String(r.fecha||'');
        if(!byDay.has(day)) return;
        byDay.get(day).ausentismos+=1;
      });
      byDay.forEach((d)=>{
        d.pagados=Math.max(0, d.planeados-d.noContratados-d.ausentismos);
      });

      const values=Array.from(byDay.values()).sort((a,b)=> a.fecha.localeCompare(b.fecha));
      const totals=values.reduce((acc,v)=>({
        planeados:acc.planeados+v.planeados,
        noContratados:acc.noContratados+v.noContratados,
        ausentismos:acc.ausentismos+v.ausentismos,
        pagados:acc.pagados+v.pagados
      }),{ planeados:0, noContratados:0, ausentismos:0, pagados:0 });

      qs('#kPlanned',ui).textContent=String(totals.planeados);
      qs('#kNotContracted',ui).textContent=String(totals.noContratados);
      qs('#kAbsenteeism',ui).textContent=String(totals.ausentismos);
      qs('#kPaid',ui).textContent=String(totals.pagados);
      await renderPaidChart(values,month);
      msg.textContent='Dashboard actualizado.';
    }catch(e){
      msg.textContent='Error: '+(e?.message||e);
    }
  }

  async function renderPaidChart(rows,month){
    if(!ChartMod){
      ChartMod=await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm');
      ChartMod.Chart.register(...ChartMod.registerables);
    }
    const canvas=qs('#chartPaid',ui);
    const labels=rows.map((r)=> r.fecha.slice(8,10));
    const data=rows.map((r)=> r.pagados);
    if(chart){ chart.destroy(); chart=null; }
    const { Chart }=ChartMod;
    chart=new Chart(canvas,{
      type:'bar',
      data:{
        labels,
        datasets:[{
          label:`Servicios pagados (${month})`,
          data,
          backgroundColor:'#0ea5e9'
        },{
          label:`No contratados (${month})`,
          data:rows.map((r)=> r.noContratados),
          backgroundColor:'#f59e0b'
        },{
          label:`Ausentismos (${month})`,
          data:rows.map((r)=> r.ausentismos),
          backgroundColor:'#ef4444'
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        scales:{
          x:{ stacked:true },
          y:{ beginAtZero:true, ticks:{ precision:0 }, stacked:true }
        }
      }
    });
  }
};

function statCard(label,id){
  return el('div',{className:'perm-item'},[
    el('div',{},[
      el('div',{className:'text-muted'},[label]),
      el('div',{id,style:'font-size:1.45rem;font-weight:700;line-height:1.2;'},['0'])
    ])
  ]);
}

function monthRange(month){
  const [y,m]=month.split('-').map(Number);
  const first=new Date(Date.UTC(y,m-1,1));
  const last=new Date(Date.UTC(y,m,0));
  return { from:toIso(first), to:toIso(last) };
}

function eachDay(from,to){
  const out=[];
  const start=new Date(`${from}T00:00:00Z`);
  const end=new Date(`${to}T00:00:00Z`);
  for(let d=new Date(start); d<=end; d.setUTCDate(d.getUTCDate()+1)){
    out.push(toIso(d));
  }
  return out;
}

function toIso(d){
  return d.toISOString().slice(0,10);
}

function todayBogota(){
  const fmt=new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(new Date());
}
