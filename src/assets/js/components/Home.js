import { el, qs } from '../utils/dom.js';

export const Home = async (mount, deps = {}) => {
  const ui = el('section', { className: 'main-card' }, [
    el('h2', {}, ['Dashboard de operacion']),
    el('div', { className: 'form-row mt-2' }, [
      el('div', {}, [el('label', { className: 'label' }, ['Mes']), el('input', { id: 'monthPick', className: 'input', type: 'month' })]),
      el('button', { id: 'btnLoad', className: 'btn btn--primary', type: 'button' }, ['Actualizar']),
      el('span', { id: 'msg', className: 'text-muted' }, [' '])
    ]),
    el('div', { className: 'perms-grid mt-2' }, [
      statCard('Servicios planeados', 'kPlanned'),
      statCard('No contratados', 'kNotContracted'),
      statCard('Ausentismo', 'kAbsenteeism'),
      statCard('Servicios pagados', 'kPaid')
    ]),
    el('div', { className: 'section-block mt-2' }, [
      el('h3', { className: 'section-title' }, ['Servicios contratados por dia']),
      el('div', { style: 'min-height:320px;' }, [el('canvas', { id: 'chartPaid' })])
    ])
  ]);

  mount.replaceChildren(ui);

  const msg = qs('#msg', ui);
  const monthPick = qs('#monthPick', ui);
  const btnLoad = qs('#btnLoad', ui);
  let chart = null;
  let ChartMod = null;

  monthPick.value = await getDefaultMonth();
  btnLoad.addEventListener('click', () => loadMonth(monthPick.value));
  await loadMonth(monthPick.value);

  return () => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  };

  async function getDefaultMonth() {
    const latest = await getLatestDashboardDate();
    return String(latest || todayBogota()).slice(0, 7);
  }

  async function getLatestDashboardDate() {
    try {
      const today = todayBogota();
      const from = shiftDay(today, -62);
      const [metricRows, closureRows] = await Promise.all([
        typeof deps.listDailyMetricsRange === 'function' ? deps.listDailyMetricsRange(from, today) : [],
        typeof deps.listDailyClosuresRange === 'function' ? deps.listDailyClosuresRange(from, today) : []
      ]);
      const sorted = [...(Array.isArray(metricRows) ? metricRows : []), ...(Array.isArray(closureRows) ? closureRows : [])]
        .map((r) => String(r?.fecha || r?.id || '').trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      return sorted.length ? sorted[sorted.length - 1] : '';
    } catch {
      return '';
    }
  }

  async function loadMonth(month) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      msg.textContent = 'Selecciona un mes valido.';
      return;
    }

    const { from, to } = monthRange(month);
    const days = eachDay(from, to);
    msg.textContent = 'Consultando metricas mensuales...';

    try {
      const rows = await buildRowsFromMonthlySources(days, from, to);

      const closedRows = rows.filter((r) => r.cerrada);
      const lastWithData = [...rows].reverse().find((r) => r.planeados || r.contratados || r.ausentismos || r.pagados || r.noContratados);
      const refDay = lastWithData?.fecha || days[days.length - 1];
      const ref = rows.find((r) => r.fecha === refDay) || { planeados: 0, noContratados: 0, ausentismos: 0, pagados: 0 };

      qs('#kPlanned', ui).textContent = String(ref.planeados || 0);
      qs('#kNotContracted', ui).textContent = String(ref.noContratados || 0);
      qs('#kAbsenteeism', ui).textContent = String(ref.ausentismos || 0);
      qs('#kPaid', ui).textContent = String(ref.pagados || 0);

      await renderContractedChart(rows, month);
      msg.textContent = `Dashboard actualizado. Dias con cierre: ${closedRows.length}. Dia de referencia: ${refDay || '-'}.`;
    } catch (e) {
      msg.textContent = 'Error: ' + (e?.message || e);
    }
  }

  async function buildRowsFromMonthlySources(days = [], from = '', to = '') {
    const [metricsRows, closuresRows] = await Promise.all([
      typeof deps.listDailyMetricsRange === 'function' ? deps.listDailyMetricsRange(from, to) : [],
      typeof deps.listDailyClosuresRange === 'function' ? deps.listDailyClosuresRange(from, to) : []
    ]);
    const metricsByDay = new Map();
    (Array.isArray(metricsRows) ? metricsRows : []).forEach((row) => {
      const fecha = String(row?.fecha || row?.id || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
      metricsByDay.set(fecha, row || {});
    });
    const closuresByDay = new Map();
    (Array.isArray(closuresRows) ? closuresRows : []).forEach((row) => {
      const fecha = String(row?.fecha || row?.id || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
      closuresByDay.set(fecha, row || {});
    });

    return days.map((day) => {
      const m = metricsByDay.get(day) || {};
      const c = closuresByDay.get(day) || {};
      const planeados = readNumMaybe(c, ['planeados', 'planned', 'operariosPlaneados']) ?? readNumMaybe(m, ['planned', 'planeados', 'operariosEsperados']) ?? 0;
      const contratados = readNumMaybe(c, ['contratados', 'expected', 'contracted']) ?? readNumMaybe(m, ['expected', 'contratados', 'contracted']) ?? 0;
      const ausentismos = readNumMaybe(c, ['ausentismos', 'absenteeism']) ?? readNumMaybe(m, ['absenteeism', 'ausentismos', 'absentCount']) ?? 0;
      const pagados =
        readNumMaybe(m, ['paidServices', 'pagados']) ??
        Math.max(0, contratados - ausentismos);
      const noContratados = readNumMaybe(m, ['noContracted', 'noContratados']) ?? Math.max(0, planeados - contratados);
      return {
        fecha: day,
        cerrada: Boolean(closuresByDay.has(day) || c.locked === true || String(c.status || '').trim() === 'closed' || m.closed === true),
        planeados,
        contratados,
        noContratados,
        ausentismos,
        pagados
      };
    });
  }

  async function renderContractedChart(rows, month) {
    if (!ChartMod) {
      ChartMod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm');
      ChartMod.Chart.register(...ChartMod.registerables);
    }
    const canvas = qs('#chartPaid', ui);
    const labels = rows.map((r) => r.fecha.slice(8, 10));
    const paidData = rows.map((r) => Number(r.pagados || 0));
    const absData = rows.map((r) => Number(r.ausentismos || 0));
    const notContractedData = rows.map((r) => Number(r.noContratados || 0));
    const plannedData = rows.map((r) => Number(r.planeados || 0));
    if (chart) {
      chart.destroy();
      chart = null;
    }
    const { Chart } = ChartMod;
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: `Pagados (${month})`, data: paidData, backgroundColor: '#0ea5e9', stack: 'totales' },
          { label: `Ausentismo (${month})`, data: absData, backgroundColor: '#ef4444', stack: 'totales' },
          { label: `No contratados (${month})`, data: notContractedData, backgroundColor: '#f59e0b', stack: 'totales' },
          {
            type: 'line',
            label: `Planeados (${month})`,
            data: plannedData,
            borderColor: '#1e3a8a',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 2,
            pointHoverRadius: 3,
            fill: false,
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { beginAtZero: true, ticks: { precision: 0 }, stacked: true }
        }
      }
    });
  }
};

function statCard(label, id) {
  return el('div', { className: 'perm-item' }, [
    el('div', {}, [el('div', { className: 'text-muted' }, [label]), el('div', { id, style: 'font-size:1.45rem;font-weight:700;line-height:1.2;' }, ['0'])])
  ]);
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { from: toIso(first), to: toIso(last) };
}

function eachDay(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(toIso(d));
  return out;
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function todayBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function shiftDay(day, delta) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '').trim()) ? `${day}T00:00:00Z` : new Date().toISOString();
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + Number(delta || 0));
  return toIso(d);
}

function readNum(obj, keys = []) {
  for (const k of keys) {
    const n = Number(obj?.[k] ?? 0);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  for (const k of keys) {
    const n = Number(obj?.[k] ?? 0);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function readNumMaybe(obj, keys = []) {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj || {}, k)) continue;
    const n = Number(obj?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
