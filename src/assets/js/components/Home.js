import { el, qs } from '../utils/dom.js';

export const Home = async (mount, deps = {}) => {
  const ui = el('section', { className: 'main-card' }, [
    el('h2', {}, ['Dashboard de operacion']),
    el('div', { className: 'form-row mt-2' }, [
      el('div', {}, [
        el('label', { className: 'label' }, ['Mes']),
        el('input', { id: 'monthPick', className: 'input', type: 'month' })
      ]),
      el('button', { id: 'btnLoad', className: 'btn btn--primary', type: 'button' }, ['Actualizar']),
      el('span', { id: 'msg', className: 'text-muted' }, [' '])
    ]),
    el('div', { className: 'perms-grid mt-2' }, [
      statCard('Servicios contratados (planeados)', 'kPlanned'),
      statCard('No contratados', 'kNotContracted'),
      statCard('Ausentismos', 'kAbsenteeism'),
      statCard('Servicios pagados', 'kPaid')
    ]),
    el('div', { className: 'section-block mt-2' }, [
      el('h3', { className: 'section-title' }, ['Servicios pagados por dia']),
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
    const latest = await getLatestImportDate();
    return String(latest || todayBogota()).slice(0, 7);
  }

  async function getLatestImportDate() {
    if (typeof deps.streamImportHistory !== 'function') return '';
    return new Promise((resolve) => {
      let done = false;
      let unsub = null;
      const finish = (value) => {
        if (done) return;
        done = true;
        try {
          if (typeof unsub === 'function') unsub();
        } catch {}
        resolve(value || '');
      };
      unsub = deps.streamImportHistory((rows) => {
        const first = Array.isArray(rows) && rows.length ? rows[0] : null;
        finish(first?.fechaOperacion || '');
      }, 1);
      setTimeout(() => finish(''), 3500);
    });
  }

  async function loadMonth(month) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      msg.textContent = 'Selecciona un mes valido.';
      return;
    }
    const { from, to } = monthRange(month);
    msg.textContent = 'Consultando...';
    try {
      const [attendance, replacements, sedes, employees, supernumerarios, novedades, closedDays] = await Promise.all([
        deps.listAttendanceRange?.(from, to) || [],
        deps.listImportReplacementsRange?.(from, to) || [],
        loadSedesSnapshot(),
        loadEmployeesSnapshot(),
        loadSupernumerariosSnapshot(),
        loadNovedadesSnapshot(),
        deps.listClosedOperationDaysRange?.(from, to) || []
      ]);

      const days = eachDay(from, to);
      const closedSet = new Set((closedDays || []).map((d) => String(d || '').trim()).filter(Boolean));
      const novedadRules = buildNovedadReplacementRules(novedades || []);
      const replacementByEmpDay = new Map();
      (replacements || []).forEach((r) => {
        replacementByEmpDay.set(`${r.fecha || ''}|${r.empleadoId || ''}`, r);
      });

      const attendanceByDay = new Map();
      days.forEach((d) => attendanceByDay.set(d, []));
      (attendance || []).forEach((a) => {
        const day = String(a.fecha || '');
        if (!attendanceByDay.has(day)) return;
        attendanceByDay.get(day).push(a);
      });

      const activeSedes = (sedes || []).filter((s) => String(s.estado || 'activo').trim().toLowerCase() !== 'inactivo');
      const plannedBySede = new Map();
      activeSedes.forEach((s) => {
        const code = String(s.codigo || '').trim();
        if (!code) return;
        plannedBySede.set(code, parseOperatorCount(s.numeroOperarios));
      });

      const byDay = new Map();
      days.forEach((d) => byDay.set(d, { fecha: d, cerrada: false, planeados: 0, noContratados: 0, ausentismos: 0, pagados: 0 }));

      days.forEach((day) => {
        if (!closedSet.has(day)) return;
        const superDocs = new Set(
          (supernumerarios || [])
            .filter((s) => isEmployeeExpectedForDate(s, day))
            .map((s) => String(s.documento || '').trim())
            .filter(Boolean)
        );

        const contractedBySede = new Map();
        (employees || []).forEach((e) => {
          if (!isEmployeeExpectedForDate(e, day)) return;
          const doc = String(e.documento || '').trim();
          if (doc && superDocs.has(doc)) return;
          const sedeCode = String(e.sedeCodigo || '').trim();
          if (!sedeCode) return;
          contractedBySede.set(sedeCode, Number(contractedBySede.get(sedeCode) || 0) + 1);
        });

        let planeados = 0;
        let noContratados = 0;
        plannedBySede.forEach((planned, sedeCode) => {
          const contratados = Number(contractedBySede.get(sedeCode) || 0);
          planeados += planned;
          noContratados += Math.max(0, planned - contratados);
        });

        let ausentismos = 0;
        const dayRows = attendanceByDay.get(day) || [];
        dayRows.forEach((a) => {
          if (a.asistio === true) return;
          const rep = replacementByEmpDay.get(`${a.fecha || ''}|${a.empleadoId || ''}`);
          if (rep && String(rep.decision || '').trim() === 'reemplazo') return;
          if (attendanceRequiresReplacementForSummary(a, novedadRules)) ausentismos += 1;
        });

        const item = byDay.get(day);
        item.cerrada = true;
        item.planeados = planeados;
        item.noContratados = noContratados;
        item.ausentismos = ausentismos;
        item.pagados = Math.max(0, planeados - noContratados - ausentismos);
      });

      const values = Array.from(byDay.values())
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      const closedValues = values.filter((v) => v.cerrada === true);
      const totals = closedValues.reduce(
        (acc, v) => ({
          planeados: acc.planeados + v.planeados,
          noContratados: acc.noContratados + v.noContratados,
          ausentismos: acc.ausentismos + v.ausentismos,
          pagados: acc.pagados + v.pagados
        }),
        { planeados: 0, noContratados: 0, ausentismos: 0, pagados: 0 }
      );

      qs('#kPlanned', ui).textContent = String(totals.planeados);
      qs('#kNotContracted', ui).textContent = String(totals.noContratados);
      qs('#kAbsenteeism', ui).textContent = String(totals.ausentismos);
      qs('#kPaid', ui).textContent = String(totals.pagados);
      await renderPaidChart(values, month);
      msg.textContent = closedValues.length
        ? 'Dashboard actualizado (solo dias cerrados).'
        : 'No hay dias cerrados en el mes seleccionado.';
    } catch (e) {
      msg.textContent = 'Error: ' + (e?.message || e);
    }
  }

  async function renderPaidChart(rows, month) {
    if (!ChartMod) {
      ChartMod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm');
      ChartMod.Chart.register(...ChartMod.registerables);
    }
    const canvas = qs('#chartPaid', ui);
    const labels = rows.map((r) => r.fecha.slice(8, 10));
    const data = rows.map((r) => (r.cerrada ? r.pagados : null));
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
          {
            label: `Servicios pagados (${month})`,
            data,
            backgroundColor: '#0ea5e9'
          },
          {
            label: `No contratados (${month})`,
            data: rows.map((r) => (r.cerrada ? r.noContratados : null)),
            backgroundColor: '#f59e0b'
          },
          {
            label: `Ausentismos (${month})`,
            data: rows.map((r) => (r.cerrada ? r.ausentismos : null)),
            backgroundColor: '#ef4444'
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

  async function loadSedesSnapshot() {
    if (typeof deps.streamSedes !== 'function') return [];
    return loadStreamOnce((cb) => deps.streamSedes(cb));
  }

  async function loadEmployeesSnapshot() {
    if (typeof deps.streamEmployees !== 'function') return [];
    return loadStreamOnce((cb) => deps.streamEmployees(cb));
  }

  async function loadSupernumerariosSnapshot() {
    if (typeof deps.streamSupernumerarios !== 'function') return [];
    return loadStreamOnce((cb) => deps.streamSupernumerarios(cb));
  }

  async function loadNovedadesSnapshot() {
    if (typeof deps.streamNovedades !== 'function') return [];
    return loadStreamOnce((cb) => deps.streamNovedades(cb));
  }

  async function loadStreamOnce(subscribe) {
    return new Promise((resolve) => {
      let settled = false;
      let unsub = null;
      const finish = (rows) => {
        if (settled) return;
        settled = true;
        try {
          if (typeof unsub === 'function') unsub();
        } catch {}
        resolve(Array.isArray(rows) ? rows : []);
      };
      try {
        unsub = subscribe((rows) => finish(rows));
      } catch {
        finish([]);
      }
      setTimeout(() => finish([]), 5000);
    });
  }
};

function statCard(label, id) {
  return el('div', { className: 'perm-item' }, [
    el('div', {}, [
      el('div', { className: 'text-muted' }, [label]),
      el('div', { id, style: 'font-size:1.45rem;font-weight:700;line-height:1.2;' }, ['0'])
    ])
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
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toIso(d));
  }
  return out;
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function todayBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function parseOperatorCount(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function isEmployeeExpectedForDate(emp, selectedDate) {
  if (!selectedDate) return false;
  const ingreso = toISODate(emp?.fechaIngreso);
  if (!ingreso || ingreso > selectedDate) return false;
  const retiro = toISODate(emp?.fechaRetiro);
  const estado = String(emp?.estado || '').trim().toLowerCase();
  if (estado === 'inactivo') return Boolean(retiro && retiro >= selectedDate);
  if (retiro && retiro < selectedDate) return false;
  return true;
}

function toISODate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const dt = new Date(v);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }
  if (typeof value?.toDate === 'function') {
    const dt = value.toDate();
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return null;
  }
  return null;
}

function buildNovedadReplacementRules(rows = []) {
  const byCode = new Map();
  const byName = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const code = String(r.codigoNovedad || r.codigo || '').trim();
    const name = normalizeText(String(r.nombre || '').trim());
    const repl = normalizeText(String(r.reemplazo || '').trim());
    const needs = ['si', 'yes', 'true', '1', 'reemplazo'].includes(repl);
    if (code) byCode.set(code, needs);
    if (name) byName.set(name, needs);
  });
  return { byCode, byName };
}

function attendanceRequiresReplacementForSummary(att = {}, rules = {}) {
  const code = String(att.novedadCodigo || '').trim();
  if (code === '8') return true;
  if (code && rules?.byCode?.has(code)) return rules.byCode.get(code) === true;
  const name = normalizeText(baseNovedadNameForSummary(att.novedadNombre || att.novedad || ''));
  if (name && rules?.byName?.has(name)) return rules.byName.get(name) === true;
  return false;
}

function baseNovedadNameForSummary(raw) {
  return String(raw || '').replace(/\s*\(.*\)\s*$/, '').trim();
}

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
