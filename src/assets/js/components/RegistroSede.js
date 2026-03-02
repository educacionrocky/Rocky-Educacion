import { el, qs, enableSectionToggles } from '../utils/dom.js';

export const RegistroSede = (mount, deps = {}) => {
  const today = todayBogota();
  const ui = el('section', { className: 'main-card' }, [
    el('h2', {}, ['Registro Sede']),
    el('div', { className: 'form-row mt-2' }, [
      el('div', {}, [el('label', { className: 'label' }, ['Fecha']), el('input', { id: 'opDate', className: 'input', type: 'date', value: today, disabled: true })]),
      el('button', { id: 'btnRun', className: 'btn btn--primary', type: 'button' }, ['Actualizar']),
      el('span', { id: 'msg', className: 'text-muted' }, [' '])
    ]),
    el('div', { className: 'section-block mt-2' }, [
      el('h3', { className: 'section-title' }, ['Resumen por dependencia']),
      el('div', { className: 'table-wrap' }, [
        el('table', { className: 'table', id: 'tblDependency' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', {}, ['Dependencia']),
            el('th', {}, ['Planeados']),
            el('th', {}, ['Contratados']),
            el('th', {}, ['No contratado']),
            el('th', {}, ['Novedad sin reemplazo']),
            el('th', {}, ['Total ausentismo']),
            el('th', {}, ['Total a pagar']),
            el('th', {}, ['Detalle'])
          ])]),
          el('tbody', {})
        ])
      ]),
      el('p', { id: 'totDependency', className: 'text-muted' }, ['Total dependencias - Planeados: 0, Contratados: 0, No contratado: 0, Novedad sin reemplazo: 0, Total ausentismo: 0, Total a pagar: 0'])
    ]),
    el('div', { className: 'section-block mt-2' }, [
      el('h3', { className: 'section-title' }, ['Resumen por sede']),
      el('div', { className: 'table-wrap' }, [
        el('table', { className: 'table', id: 'tblTotals' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', {}, ['Sede']),
            el('th', {}, ['Planeados']),
            el('th', {}, ['Contratados']),
            el('th', {}, ['No contratado']),
            el('th', {}, ['Novedad sin reemplazo']),
            el('th', {}, ['Total ausentismo']),
            el('th', {}, ['Total a pagar']),
            el('th', {}, ['Detalle'])
          ])]),
          el('tbody', {})
        ])
      ]),
      el('p', { id: 'totRange', className: 'text-muted' }, ['Total del dia a pagar: 0'])
    ]),
    el('div', { className: 'section-block mt-2' }, [
      el('h3', { id: 'detailTitle', className: 'section-title' }, ['Detalle']),
      el('div', { className: 'table-wrap' }, [
        el('table', { className: 'table', id: 'tblDetail' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', {}, ['Fecha']),
            el('th', {}, ['Sede']),
            el('th', {}, ['Documento']),
            el('th', {}, ['Nombre']),
            el('th', {}, ['Estado'])
          ])]),
          el('tbody', {})
        ])
      ])
    ])
  ]);

  const msg = qs('#msg', ui);
  let sedeDailyRows = [];
  let dependencyRows = [];
  let attendanceByKey = new Map();
  let replByEmpDate = new Map();
  let replacementSuperByDateDoc = new Set();
  let novedadRules = { byCode: new Map(), byName: new Map() };

  qs('#btnRun', ui).addEventListener('click', run);

  async function run() {
    const date = todayBogota();
    msg.textContent = 'Consultando...';
    try {
      const [sedeStatus, attendance, replacements, sedes, novedades, employees, supernumerarios] = await Promise.all([
        deps.listSedeStatusRange?.(date, date) || [],
        deps.listAttendanceRange?.(date, date) || [],
        deps.listImportReplacementsRange?.(date, date) || [],
        loadSedesSnapshot(),
        loadNovedadesSnapshot(),
        loadEmployeesSnapshot(),
        loadSupernumerariosSnapshot()
      ]);
      novedadRules = buildNovedadReplacementRules(novedades || []);

      const sedeMetaByCode = new Map();
      (sedes || []).forEach((s) => {
        sedeMetaByCode.set(String(s.codigo || ''), {
          dependenciaCodigo: String(s.dependenciaCodigo || '').trim(),
          dependenciaNombre: String(s.dependenciaNombre || '').trim()
        });
      });

      replByEmpDate = new Map();
      replacementSuperByDateDoc = new Set();
      (replacements || []).forEach((r) => {
        const empKey = `${r.fecha || ''}|${r.empleadoId || ''}`;
        replByEmpDate.set(empKey, r);
        if (r.decision === 'reemplazo') {
          const superDoc = String(r.supernumerarioDocumento || '').trim();
          if (superDoc) replacementSuperByDateDoc.add(`${r.fecha || ''}|${superDoc}`);
        }
      });

      attendanceByKey = new Map();
      (attendance || []).forEach((a) => {
        const attDoc = String(a.documento || '').trim();
        if (attDoc && replacementSuperByDateDoc.has(`${a.fecha || ''}|${attDoc}`)) return;
        const key = `${a.fecha || ''}|${a.sedeCodigo || ''}`;
        if (!attendanceByKey.has(key)) attendanceByKey.set(key, []);
        attendanceByKey.get(key).push(a);
      });

      const statusBySede = new Map((sedeStatus || []).map((s) => [String(s.sedeCodigo || ''), s]));
      const superDocs = new Set(
        (supernumerarios || [])
          .filter((s) => isEmployeeExpectedForDate(s, date))
          .map((s) => String(s.documento || '').trim())
          .filter(Boolean)
      );
      const contratadosBySede = new Map();
      (employees || []).forEach((e) => {
        if (!isEmployeeExpectedForDate(e, date)) return;
        const doc = String(e.documento || '').trim();
        if (doc && superDocs.has(doc)) return;
        const sedeCode = String(e.sedeCodigo || '').trim();
        if (!sedeCode) return;
        contratadosBySede.set(sedeCode, Number(contratadosBySede.get(sedeCode) || 0) + 1);
      });

      sedeDailyRows = (sedes || [])
        .filter((s) => String(s.estado || 'activo').trim().toLowerCase() !== 'inactivo')
        .map((s) => {
          const sedeCode = String(s.codigo || '').trim();
          const key = `${date}|${sedeCode}`;
          const atts = attendanceByKey.get(key) || [];
          const status = statusBySede.get(sedeCode) || {};
          const planeadosRaw = s.numeroOperarios ?? status.operariosPlaneados ?? status.operariosEsperados ?? 0;
          const planeados = parseOperatorCount(planeadosRaw);
          const contratados = Number(contratadosBySede.get(sedeCode) || 0);
          const noContratado = Math.max(0, planeados - contratados);
          const novSinReemplazo = atts.filter((a) => {
            if (a.asistio === true) return false;
            const rep = replByEmpDate.get(`${a.fecha || ''}|${a.empleadoId || ''}`);
            if (rep && rep.decision === 'reemplazo') return false;
            return attendanceRequiresReplacementForSummary(a, novedadRules);
          }).length;
          const ausentismoTotal = noContratado + novSinReemplazo;
          const totalPagar = Math.max(0, planeados - noContratado - novSinReemplazo);
          const meta = sedeMetaByCode.get(sedeCode) || {};
          const dependenciaCodigo = String(meta.dependenciaCodigo || '').trim();
          const dependenciaNombre = String(meta.dependenciaNombre || '').trim() || 'Sin dependencia';
          const dependenciaKey = dependenciaCodigo || `NO_DEP:${dependenciaNombre}`;
          return {
            fecha: date,
            sedeCodigo: sedeCode,
            sedeNombre: String(s.nombre || sedeCode || '-'),
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
        })
        .sort((a, b) => String(a.sedeNombre || '').localeCompare(String(b.sedeNombre || '')));

      const depMap = new Map();
      sedeDailyRows.forEach((r) => {
        if (!depMap.has(r.dependenciaKey)) {
          depMap.set(r.dependenciaKey, {
            dependenciaKey: r.dependenciaKey,
            dependenciaCodigo: r.dependenciaCodigo,
            dependenciaNombre: r.dependenciaNombre || 'Sin dependencia',
            planeados: 0,
            contratados: 0,
            noContratado: 0,
            novSinReemplazo: 0,
            ausentismoTotal: 0,
            totalPagar: 0
          });
        }
        const t = depMap.get(r.dependenciaKey);
        t.planeados += r.planeados;
        t.contratados += r.contratados;
        t.noContratado += r.noContratado;
        t.novSinReemplazo += r.novSinReemplazo;
        t.ausentismoTotal += r.ausentismoTotal;
        t.totalPagar += r.totalPagar;
      });
      dependencyRows = Array.from(depMap.values()).sort((a, b) => String(a.dependenciaNombre || '').localeCompare(String(b.dependenciaNombre || '')));

      renderDependency(date);
      renderTotals(date);
      msg.textContent = `Consulta OK (${date}). Dependencias: ${dependencyRows.length}`;
    } catch (e) {
      msg.textContent = 'Error: ' + (e?.message || e);
    }
  }

  function renderDependency(date) {
    const tb = qs('#tblDependency tbody', ui);
    tb.replaceChildren(...dependencyRows.map((r) => {
      const tr = el('tr', {}, []);
      const btn = el('button', { className: 'btn', type: 'button' }, ['Ver']);
      btn.addEventListener('click', () => renderDependencyDetail(r.dependenciaKey, r.dependenciaNombre, date));
      tr.append(
        el('td', {}, [r.dependenciaNombre || '-']),
        el('td', {}, [String(r.planeados)]),
        el('td', {}, [String(r.contratados)]),
        el('td', {}, [String(r.noContratado)]),
        el('td', {}, [String(r.novSinReemplazo)]),
        el('td', {}, [String(r.ausentismoTotal)]),
        el('td', {}, [String(r.totalPagar)]),
        el('td', {}, [btn])
      );
      return tr;
    }));

    const totals = dependencyRows.reduce((acc, r) => ({
      planeados: acc.planeados + Number(r.planeados || 0),
      contratados: acc.contratados + Number(r.contratados || 0),
      noContratado: acc.noContratado + Number(r.noContratado || 0),
      novSinReemplazo: acc.novSinReemplazo + Number(r.novSinReemplazo || 0),
      ausentismoTotal: acc.ausentismoTotal + Number(r.ausentismoTotal || 0),
      totalPagar: acc.totalPagar + Number(r.totalPagar || 0)
    }), { planeados: 0, contratados: 0, noContratado: 0, novSinReemplazo: 0, ausentismoTotal: 0, totalPagar: 0 });
    qs('#totDependency', ui).textContent = `Total dependencias - Planeados: ${totals.planeados}, Contratados: ${totals.contratados}, No contratado: ${totals.noContratado}, Novedad sin reemplazo: ${totals.novSinReemplazo}, Total ausentismo: ${totals.ausentismoTotal}, Total a pagar: ${totals.totalPagar}`;
  }

  function renderTotals(date) {
    const bySede = new Map();
    sedeDailyRows.forEach((r) => {
      if (!bySede.has(r.sedeCodigo)) {
        bySede.set(r.sedeCodigo, {
          sedeCodigo: r.sedeCodigo,
          sedeNombre: r.sedeNombre || '-',
          planeados: 0,
          contratados: 0,
          noContratado: 0,
          novSinReemplazo: 0,
          ausentismoTotal: 0,
          totalPagar: 0
        });
      }
      const t = bySede.get(r.sedeCodigo);
      t.planeados += r.planeados;
      t.contratados += r.contratados;
      t.noContratado += r.noContratado;
      t.novSinReemplazo += r.novSinReemplazo;
      t.ausentismoTotal += r.ausentismoTotal;
      t.totalPagar += r.totalPagar;
    });
    const rows = Array.from(bySede.values()).sort((a, b) => String(a.sedeNombre || '').localeCompare(String(b.sedeNombre || '')));
    const tb = qs('#tblTotals tbody', ui);
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr', {}, []);
      const btn = el('button', { className: 'btn', type: 'button' }, ['Ver']);
      btn.addEventListener('click', () => renderSedeDetail(r.sedeCodigo, r.sedeNombre, date));
      tr.append(
        el('td', {}, [r.sedeNombre || '-']),
        el('td', {}, [String(r.planeados)]),
        el('td', {}, [String(r.contratados)]),
        el('td', {}, [String(r.noContratado)]),
        el('td', {}, [String(r.novSinReemplazo)]),
        el('td', {}, [String(r.ausentismoTotal)]),
        el('td', {}, [String(r.totalPagar)]),
        el('td', {}, [btn])
      );
      return tr;
    }));
    const totalRange = rows.reduce((acc, r) => acc + Number(r.totalPagar || 0), 0);
    qs('#totRange', ui).textContent = `Total del dia a pagar: ${totalRange}`;
  }

  function renderDependencyDetail(dependenciaKey, dependenciaNombre, date) {
    qs('#detailTitle', ui).textContent = `Detalle dependencia: ${dependenciaNombre || '-'} (${date})`;
    const rows = buildDetailRows(
      sedeDailyRows.filter((r) => r.dependenciaKey === dependenciaKey)
    );
    renderDetailRows(rows);
  }

  function renderSedeDetail(sedeCodigo, sedeNombre, date) {
    qs('#detailTitle', ui).textContent = `Detalle sede: ${sedeNombre || '-'} (${date})`;
    const rows = buildDetailRows(
      sedeDailyRows.filter((r) => r.sedeCodigo === sedeCodigo)
    );
    renderDetailRows(rows);
  }

  function buildDetailRows(rows = []) {
    const detailRows = [];
    rows.forEach((d) => {
      const key = `${d.fecha}|${d.sedeCodigo}`;
      const atts = attendanceByKey.get(key) || [];
      atts.forEach((a) => {
        const rep = replByEmpDate.get(`${a.fecha || ''}|${a.empleadoId || ''}`);
        let estado = 'Trabajo';
        if (rep) {
          estado = rep.decision === 'reemplazo'
            ? `Reemplazado por ${rep.supernumerarioNombre || rep.supernumerarioDocumento || '-'}`
            : 'Ausentismo';
        } else if (a.asistio === false) {
          estado = attendanceRequiresReplacementForSummary(a, novedadRules)
            ? 'Ausentismo'
            : `Novedad: ${a.novedadNombre || a.novedad || '-'}`;
        }
        detailRows.push({
          fecha: d.fecha,
          sede: d.sedeNombre,
          documento: a.documento || '-',
          nombre: a.nombre || '-',
          estado
        });
      });
      for (let i = 0; i < Number(d.noContratado || 0); i += 1) {
        detailRows.push({
          fecha: d.fecha,
          sede: d.sedeNombre,
          documento: '-',
          nombre: `No contratado ${i + 1}`,
          estado: 'No contratado'
        });
      }
    });
    return detailRows;
  }

  function renderDetailRows(rows = []) {
    const tb = qs('#tblDetail tbody', ui);
    tb.replaceChildren(...rows.map((r) => el('tr', {}, [
      el('td', {}, [r.fecha || '-']),
      el('td', {}, [r.sede || '-']),
      el('td', {}, [r.documento || '-']),
      el('td', {}, [r.nombre || '-']),
      el('td', {}, [r.estado || '-'])
    ])));
  }

  async function loadSedesSnapshot() {
    if (typeof deps.streamSedes !== 'function') return [];
    return snapshotOnce(deps.streamSedes);
  }

  async function loadNovedadesSnapshot() {
    if (typeof deps.streamNovedades !== 'function') return [];
    return snapshotOnce(deps.streamNovedades);
  }

  async function loadEmployeesSnapshot() {
    if (typeof deps.streamEmployees !== 'function') return [];
    return snapshotOnce(deps.streamEmployees);
  }

  async function loadSupernumerariosSnapshot() {
    if (typeof deps.streamSupernumerarios !== 'function') return [];
    return snapshotOnce(deps.streamSupernumerarios);
  }

  mount.replaceChildren(ui);
  enableSectionToggles(ui);
  run();
  return () => {};
};

function snapshotOnce(streamFn) {
  return new Promise((resolve) => {
    let settled = false;
    let unsub = null;
    const finish = (rows) => {
      if (settled) return;
      settled = true;
      try { if (typeof unsub === 'function') unsub(); } catch {}
      resolve(Array.isArray(rows) ? rows : []);
    };
    unsub = streamFn((rows) => finish(rows));
    setTimeout(() => finish([]), 5000);
  });
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

function todayBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}
