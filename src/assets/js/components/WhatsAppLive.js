import { el, qs } from '../utils/dom.js';

export const WhatsAppLive = (mount, deps = {}) => {
  const today = todayBogota();
  const ui = el('section', { className: 'main-card' }, [
    el('section', { className: 'wa-header' }, [
      el('div', { className: 'wa-header__left' }, [
        el('h2', {}, ['Registro Diario']),
        el('div', { className: 'wa-filters' }, [
          el('div', { className: 'wa-field' }, [
            el('label', { className: 'label' }, ['Fecha']),
            el('input', { className: 'input wa-input', type: 'date', value: today, disabled: true })
          ]),
          el('div', { className: 'wa-field wa-field--search' }, [
            el('label', { className: 'label' }, ['Buscar']),
            el('input', { id: 'waSearch', className: 'input wa-input', placeholder: 'Cedula, nombre o novedad...' })
          ])
        ])
      ]),
      el('div', { className: 'wa-stats wa-stats--summary' }, [
        el('article', { className: 'wa-stat card wa-stat--wide' }, [
          el('small', { className: 'wa-stat__label wa-stat__label--title' }, ['Resumen Operativo']),
          el('div', { className: 'wa-kpis' }, [
            kpiItem('Planeados', 'waPlanned', '0'),
            kpiItem('Esperados', 'waExpected', '0'),
            kpiItem('Registros', 'waUnique', '0'),
            kpiItem('Faltantes', 'waMissing', '0')
          ])
        ])
      ])
    ]),
    el('section', { className: 'wa-stats wa-stats--nov mt-2' }, [
      statCard('Novedades', 'waNoveltyTotal', '0'),
      statCard('Gestionadas', 'waNoveltyHandled', '0'),
      statCard('Pendientes', 'waNoveltyPending', '0')
    ]),
    el('div', { className: 'mt-2 table-wrap' }, [
        el('table', { className: 'table wa-live-table' }, [
          el('colgroup', {}, [
            el('col', { style: 'width:90px' }),
            el('col', { style: 'width:72px' }),
            el('col', { style: 'width:106px' }),
            el('col', { style: 'width:200px' }),
            el('col', { style: 'width:220px' }),
            el('col', { style: 'width:64px' }),
            el('col', { style: 'width:220px' })
          ]),
          el('thead', {}, [
            el('tr', {}, [
              el('th', {}, ['Fecha']),
              el('th', {}, ['Hora']),
              el('th', {}, ['Cedula']),
              el('th', {}, ['Nombre']),
              el('th', {}, ['Novedad']),
              el('th', {}, ['Dias']),
              el('th', {}, ['Reemplazo'])
            ])
          ]),
        el('tbody', {})
      ])
    ]),
    el('p', { id: 'waMsg', className: 'text-muted mt-2' }, ['Conectando...'])
  ]);

  const tbody = qs('tbody', ui);
  const msg = qs('#waMsg', ui);
  const searchInput = qs('#waSearch', ui);

  let attendance = [];
  let replacements = [];
  let supernumerarios = [];
  let novedades = [];
  let employees = [];
  let sedes = [];

  let unAttendance = null;
  let unReplacements = null;
  let unSupernumerarios = null;
  let unNovedades = null;
  let unEmployees = null;
  let unSedes = null;

  function replacementMap() {
    const map = new Map();
    (replacements || []).forEach((r) => {
      const key = `${r.fecha || ''}_${r.empleadoId || ''}`;
      map.set(key, r);
    });
    return map;
  }

  function classifyRow(row) {
    if (isSupernumerarioAttendance(row)) return 'super_replacement';
    const raw = String(row.novedadNombre || row.novedad || '').trim();
    const code = String(row.novedadCodigo || '').trim();
    if ((!raw && !code) || code === '1' || raw === '1') return row.asistio ? 'replace_no' : 'none';
    const rawNorm = normalize(raw);
    if (rawNorm.startsWith('otra sede')) return 'otra_sede';

    const base = baseNovedadName(raw);
    const nov = findNovedadCatalog(base);
    if (nov) return nov.reemplazo === true ? 'replace_yes' : 'replace_no';

    const fallback = inferNovedadByKeyword(base);
    if (fallback) return fallback;

    return 'none';
  }

  function canAssignReplacement(row) {
    return classifyRow(row) === 'replace_yes';
  }

  function isSupernumerarioAttendance(row) {
    if (row?.isSupernumerario === true) return true;
    const doc = String(row?.documento || '').trim();
    if (!doc) return false;
    return (supernumerarios || []).some((s) => {
      if (!isPersonActiveForDate(s, String(row?.fecha || '').trim() || today)) return false;
      return String(s?.documento || '').trim() === doc;
    });
  }

  function rowStyleByClass(kind) {
    return '';
  }

  function novedadTextStyleByClass(kind) {
    if (kind === 'super_replacement') return 'color:#1d4ed8;';
    if (kind === 'replace_no') return 'color:#15803d;';
    if (kind === 'otra_sede') return 'color:#c2410c;';
    if (kind === 'replace_yes') return 'color:#b91c1c;';
    return '';
  }

  function baseNovedadName(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    const noParens = raw.replace(/\s*\(.*\)\s*$/, '').trim();
    if (/^OTRA\s+SEDE\s*:/i.test(noParens)) return 'OTRA SEDE';
    return noParens;
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function findNovedadCatalog(name) {
    const target = normalize(name);
    if (!target) return null;
    const rows = (novedades || []).map((n) => ({
      ...n,
      _nameNorm: normalize(n.nombre),
      _codeNorm: normalize(n.codigoNovedad || n.codigo || '')
    }));

    let row = rows.find((n) => n._nameNorm === target || n._codeNorm === target);
    if (!row) {
      row = rows.find((n) => n._nameNorm.includes(target) || target.includes(n._nameNorm));
    }
    if (!row) {
      const targetTokens = target.split(' ').filter(Boolean);
      row = rows.find((n) => {
        const nameTokens = n._nameNorm.split(' ').filter(Boolean);
        const overlap = targetTokens.filter((t) => nameTokens.includes(t)).length;
        return overlap >= Math.min(2, targetTokens.length);
      });
    }
    if (!row) return null;
    const replNorm = normalize(row.reemplazo);
    const reemplazo = ['si', 'yes', 'true', '1', 'reemplazo'].includes(replNorm);
    return {
      nombre: String(row.nombre || '').trim() || null,
      reemplazo
    };
  }

  function inferNovedadByKeyword(baseName) {
    const t = normalize(baseName);
    if (!t) return null;
    if (t.includes('incapacidad')) return 'replace_yes';
    if (t.includes('accidente laboral')) return 'replace_yes';
    if (t.includes('calamidad')) return 'replace_yes';
    if (t.includes('permiso no remunerado')) return 'replace_yes';
    if (t.includes('compensatorio')) return 'replace_yes';
    return null;
  }

  function displayNovedad(row) {
    const baseRaw = String(row.novedadNombre || row.novedad || '').trim();
    const code = String(row.novedadCodigo || '').trim();
    const raw = baseRaw || code;
    if (!raw || raw === '1' || code === '1') return 'TRABAJANDO';
    const rawNorm = normalize(raw);
    if (rawNorm.startsWith('otra sede')) return raw;

    const base = baseNovedadName(raw);
    const nov = findNovedadCatalog(base);
    if (!nov) return raw;

    const daysMatch = raw.match(/\(([^)]+)\)\s*$/);
    const daysLabel = daysMatch ? ` (${daysMatch[1]})` : '';
    return `${nov.nombre}${daysLabel}`;
  }

  function optionsForRow(row) {
    const active = (supernumerarios || []).filter((s) => String(s.estado || 'activo') !== 'inactivo');
    const sameSede = active.filter((s) => String(s.sedeCodigo || '').trim() === String(row.sedeCodigo || '').trim());
    const list = sameSede.length ? sameSede : active;
    const used = usedReplacementDocsForDate(row.fecha, row.empleadoId);
    return list
      .map((s) => ({
        id: s.id,
        documento: String(s.documento || '').trim() || '',
        nombre: String(s.nombre || '').trim() || '-'
      }))
      .filter((s) => {
        const doc = String(s.documento || '').trim();
        if (!doc) return false;
        return !used.has(doc);
      })
      .sort((a, b) => `${a.nombre}${a.documento}`.localeCompare(`${b.nombre}${b.documento}`));
  }

  function usedReplacementDocsForDate(fecha, currentEmployeeId = null) {
    const set = new Set();
    (replacements || []).forEach((r) => {
      if (String(r.fecha || '').trim() !== String(fecha || '').trim()) return;
      if (String(r.decision || '').trim() !== 'reemplazo') return;
      if (currentEmployeeId && String(r.empleadoId || '').trim() === String(currentEmployeeId).trim()) return;
      const doc = String(r.supernumerarioDocumento || '').trim();
      if (doc) set.add(doc);
    });
    return set;
  }

  function applyFilters(rows) {
    const term = String(searchInput.value || '').trim().toLowerCase();
    let out = rows.filter((r) => String(r.fecha || '').trim() === today);

    if (!term) return out;
    return out.filter((r) => {
      const blob = [
        r.documento || '',
        r.nombre || '',
        r.novedadCodigo || '',
        r.novedadNombre || '',
        r.incapacidadDias || '',
        r.novedad || '',
        r.sedeNombre || '',
        r.sedeCodigo || ''
      ].join(' ').toLowerCase();
      return blob.includes(term);
    });
  }

  async function saveReplacement(row, selectedDoc, btn, selectEl = null) {
    const selectedValue = String(selectedDoc || '').trim();
    const wantsAusentismo = selectedValue === '__ausentismo__' || !selectedValue;
    const selected = wantsAusentismo
      ? null
      : (supernumerarios || []).find((s) => String(s.documento || '').trim() === selectedValue) || null;
    if (selected) {
      const used = usedReplacementDocsForDate(row.fecha, row.empleadoId);
      if (used.has(String(selected.documento || '').trim())) {
        msg.textContent = 'Ese supernumerario ya fue usado en otro registro del mismo dia.';
        return;
      }
    }

    const assignment = {
      fecha: row.fecha,
      empleadoId: row.empleadoId,
      documento: row.documento || null,
      nombre: row.nombre || null,
      sedeCodigo: row.sedeCodigo || null,
      sedeNombre: row.sedeNombre || null,
      novedadCodigo: row.novedadCodigo || null,
      novedadNombre: row.novedadNombre || row.novedad || null,
      decision: selected ? 'reemplazo' : 'ausentismo',
      supernumerarioId: selected?.id || null,
      supernumerarioDocumento: selected?.documento || null,
      supernumerarioNombre: selected?.nombre || null
    };

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Guardando...';
    msg.textContent = 'Guardando reemplazo...';

    try {
      await deps.saveImportReplacements?.({
        importId: null,
        fechaOperacion: row.fecha,
        assignments: [assignment]
      });
      msg.textContent = selected ? 'Reemplazo guardado correctamente.' : 'Ausentismo guardado correctamente.';
      if (selectEl) selectEl.disabled = true;
      btn.disabled = true;
      btn.textContent = 'Guardado';
    } catch (err) {
      msg.textContent = `Error guardando reemplazo: ${err?.message || err}`;
    } finally {
      if (!btn.disabled) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    }
  }

  function render() {
    const replMap = replacementMap();
    const sorted = [...attendance].sort((a, b) => {
      const ah = String(a.hora || '');
      const bh = String(b.hora || '');
      if (ah === bh) return String(b.createdAt?.seconds || 0) - String(a.createdAt?.seconds || 0);
      return bh.localeCompare(ah);
    });
    const rows = applyFilters(sorted);
    const stats = calculateStats();

    tbody.replaceChildren(
      ...rows.map((r) => {
        const key = `${r.fecha || ''}_${r.empleadoId || ''}`;
        const repl = replMap.get(key) || null;
        const rowClass = classifyRow(r);
        const canAssign = canAssignReplacement(r);
        const opts = canAssign ? optionsForRow(r) : [];
        const isSuperRow = rowClass === 'super_replacement';
        const baseNovedadText = String(r.novedadNombre || displayNovedad(r) || '-').trim() || '-';
        const novedadText = isSuperRow ? `${baseNovedadText} · SUPERNUMERARIO` : baseNovedadText;
        const novedadStyle = novedadTextStyleByClass(rowClass);

        if (isSuperRow) {
          const sedeTxt = String(r.sedeNombre || r.sedeCodigo || '').trim() || '-';
          return el('tr', { style: rowStyleByClass(rowClass) }, [
            el('td', {}, [r.fecha || '-']),
            el('td', {}, [r.hora || '-']),
            el('td', {}, [r.documento || '-']),
            el('td', {}, [r.nombre || '-']),
            el('td', {}, [el('span', { style: novedadStyle }, [novedadText])]),
            el('td', {}, [r.incapacidadDias != null ? String(r.incapacidadDias) : '-']),
            el('td', {}, [el('span', { style: 'color:#1d4ed8;' }, [`REEMPLAZO EN SEDE: ${sedeTxt}`])])
          ]);
        }

        if (!canAssign) {
          return el('tr', { style: rowStyleByClass(rowClass) }, [
            el('td', {}, [r.fecha || '-']),
            el('td', {}, [r.hora || '-']),
            el('td', {}, [r.documento || '-']),
            el('td', {}, [r.nombre || '-']),
            el('td', {}, [el('span', { style: novedadStyle }, [novedadText])]),
            el('td', {}, [r.incapacidadDias != null ? String(r.incapacidadDias) : '-']),
            el('td', {}, [el('span', { className: 'text-muted' }, ['No aplica'])])
          ]);
        }

        if (repl && String(repl.decision || '').trim() === 'ausentismo') {
          return el('tr', { style: rowStyleByClass(rowClass) }, [
            el('td', {}, [r.fecha || '-']),
            el('td', {}, [r.hora || '-']),
            el('td', {}, [r.documento || '-']),
            el('td', {}, [r.nombre || '-']),
            el('td', {}, [el('span', { style: novedadStyle }, [novedadText])]),
            el('td', {}, [r.incapacidadDias != null ? String(r.incapacidadDias) : '-']),
            el('td', {}, [el('span', { style: 'color:#b91c1c;' }, ['Ausentismo confirmado'])])
          ]);
        }

        if (repl && String(repl.decision || '').trim() === 'reemplazo') {
          const repName = String(repl.supernumerarioNombre || '').trim();
          const repDoc = String(repl.supernumerarioDocumento || '').trim();
          const repTxt = repName && repDoc ? `${repName} (${repDoc})` : repName || repDoc || 'Reemplazo confirmado';
          return el('tr', { style: rowStyleByClass(rowClass) }, [
            el('td', {}, [r.fecha || '-']),
            el('td', {}, [r.hora || '-']),
            el('td', {}, [r.documento || '-']),
            el('td', {}, [r.nombre || '-']),
            el('td', {}, [el('span', { style: novedadStyle }, [novedadText])]),
            el('td', {}, [r.incapacidadDias != null ? String(r.incapacidadDias) : '-']),
            el('td', {}, [el('span', { style: 'color:#15803d;' }, [repTxt])])
          ]);
        }

        const select = el(
          'select',
          {
            className: 'input wa-repl-select',
            style: 'width:170px;min-width:170px;max-width:170px;padding:.42rem .5rem;font-size:.78rem;',
            disabled: !canAssign
          },
          [
            el('option', { value: '__ausentismo__' }, ['Ausentismo']),
            ...opts.map((o) => el('option', { value: o.documento }, [`${o.nombre} (${o.documento || '-'})`]))
          ]
        );
        if (repl?.decision === 'ausentismo') select.value = '__ausentismo__';
        if (repl?.supernumerarioDocumento) select.value = String(repl.supernumerarioDocumento);
        const selectedLabel = () => select.options[select.selectedIndex]?.text || '';
        select.title = selectedLabel();
        const selectedPreview = el(
          'span',
          { className: 'text-muted', style: 'font-size:.78rem;line-height:1.25;white-space:normal;word-break:break-word;' },
          [selectedLabel()]
        );

        const saveBtn = el(
          'button',
          {
            className: 'btn',
            type: 'button',
            disabled: !canAssign,
            style: 'padding:3px 7px;font-size:.74rem;line-height:1.05;min-height:24px;'
          },
          ['Guardar']
        );
        saveBtn.addEventListener('click', () => saveReplacement(r, select.value, saveBtn, select));
        select.addEventListener('change', () => {
          const label = selectedLabel();
          select.title = label;
          selectedPreview.textContent = label;
          if (String(select.value || '').trim() === '__ausentismo__') {
            saveReplacement(r, select.value, saveBtn, select);
          } else if (!saveBtn.disabled) {
            saveBtn.textContent = 'Guardar';
          }
        });

        const replacementCell = el('div', { style: 'display:grid;gap:4px;min-width:0;' }, [
          el('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;' }, [select, saveBtn]),
          selectedPreview
        ]);

        return el('tr', { style: rowStyleByClass(rowClass) }, [
          el('td', {}, [r.fecha || '-']),
          el('td', {}, [r.hora || '-']),
          el('td', {}, [r.documento || '-']),
          el('td', {}, [r.nombre || '-']),
          el('td', {}, [el('span', { style: novedadStyle }, [novedadText])]),
          el('td', {}, [r.incapacidadDias != null ? String(r.incapacidadDias) : '-']),
          el('td', {}, [replacementCell])
        ]);
      })
    );

    qs('#waPlanned', ui).textContent = String(stats.planned);
    qs('#waExpected', ui).textContent = String(stats.expected);
    qs('#waUnique', ui).textContent = String(stats.unique);
    qs('#waMissing', ui).textContent = String(stats.missing);
    qs('#waNoveltyTotal', ui).textContent = String(stats.noveltyTotal);
    qs('#waNoveltyHandled', ui).textContent = String(stats.noveltyHandled);
    qs('#waNoveltyPending', ui).textContent = String(stats.noveltyPending);
    msg.textContent = `Total registros: ${rows.length}`;
  }

  function calculateStats() {
    const dayRows = (attendance || []).filter((r) => String(r.fecha || '').trim() === today);
    const unique = new Set(dayRows.map((r) => String(r.empleadoId || '').trim()).filter(Boolean)).size;
    const supernumerarioDocs = new Set(
      (supernumerarios || [])
        .filter((s) => isEmployeeExpectedForDate(s, today))
        .map((s) => String(s?.documento || '').trim())
        .filter(Boolean)
    );
    const expected = (employees || []).filter((e) => {
      if (!isEmployeeExpectedForDate(e, today)) return false;
      const doc = String(e?.documento || '').trim();
      if (!doc) return true;
      return !supernumerarioDocs.has(doc);
    }).length;
    const planned = (sedes || []).reduce((acc, s) => {
      const n = parseOperatorCount(s?.numeroOperarios);
      return acc + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    const missing = Math.max(0, expected - unique);
    const replMap = replacementMap();
    const noveltyTotal = dayRows.filter((r) => canAssignReplacement(r)).length;
    const noveltyHandled = dayRows.filter((r) => {
      if (!canAssignReplacement(r)) return false;
      const key = `${r.fecha || ''}_${r.empleadoId || ''}`;
      const repl = replMap.get(key);
      if (!repl) return false;
      const decision = String(repl.decision || '').trim();
      return decision === 'reemplazo' || decision === 'ausentismo';
    }).length;
    const noveltyPending = Math.max(0, noveltyTotal - noveltyHandled);
    return { planned, expected, unique, missing, noveltyTotal, noveltyHandled, noveltyPending };
  }

  function bindDateStreams() {
    unAttendance?.();
    unReplacements?.();

    if (!deps.streamAttendanceByDate || !deps.streamImportReplacementsByDate) {
      msg.textContent = 'No hay conexion de datos para registros en vivo.';
      return;
    }

    const attendanceOnData = (rows) => {
      attendance = rows || [];
      render();
    };
    const attendanceOnError = (err) => {
      msg.textContent = `Error leyendo attendance: ${err?.code || err?.message || err}`;
    };

    unAttendance = deps.streamAttendanceByDate(
      today,
      attendanceOnData,
      attendanceOnError
    );

    unReplacements = deps.streamImportReplacementsByDate(
      today,
      (rows) => {
        replacements = rows || [];
        render();
      },
      (err) => {
        msg.textContent = `Error leyendo replacements: ${err?.code || err?.message || err}`;
      }
    );
  }

  searchInput.addEventListener('input', render);

  if (deps.streamSupernumerarios) {
    unSupernumerarios = deps.streamSupernumerarios((rows) => {
      supernumerarios = rows || [];
      render();
    });
  }
  if (deps.streamNovedades) {
    unNovedades = deps.streamNovedades((rows) => {
      novedades = rows || [];
      render();
    });
  }
  if (deps.streamEmployees) {
    unEmployees = deps.streamEmployees((rows) => {
      employees = rows || [];
      render();
    });
  }
  if (deps.streamSedes) {
    unSedes = deps.streamSedes((rows) => {
      sedes = rows || [];
      render();
    });
  }

  bindDateStreams();
  mount.replaceChildren(ui);

  return () => {
    unAttendance?.();
    unReplacements?.();
    unSupernumerarios?.();
    unNovedades?.();
    unEmployees?.();
    unSedes?.();
  };
};

function statCard(label, id, value) {
  return el('article', { className: 'wa-stat card' }, [
    el('small', { className: 'wa-stat__label' }, [label]),
    el('strong', { id, className: 'wa-stat__value' }, [value])
  ]);
}

function kpiItem(label, id, value) {
  return el('div', { className: 'wa-kpi' }, [
    el('small', { className: 'wa-kpi__label' }, [label]),
    el('strong', { id, className: 'wa-kpi__value' }, [value])
  ]);
}

function isEmployeeExpectedForDate(emp, selectedDate) {
  if (!selectedDate) return false;
  const ingreso = toISODate(emp?.fechaIngreso);
  if (!ingreso || ingreso > selectedDate) return false;

  const retiro = toISODate(emp?.fechaRetiro);
  if (String(emp?.estado || '').toLowerCase() === 'inactivo') {
    return Boolean(retiro && retiro >= selectedDate);
  }
  if (retiro && retiro < selectedDate) return false;

  return true;
}

function isEmployeeActiveTodayStrict(emp, selectedDate) {
  return isPersonActiveForDate(emp, selectedDate);
}

function isPersonActiveForDate(person, selectedDate) {
  if (!selectedDate) return false;
  const estado = String(person?.estado || '').trim().toLowerCase();
  if (estado === 'inactivo') return false;
  const ingreso = toISODate(person?.fechaIngreso);
  if (!ingreso || ingreso > selectedDate) return false;
  const retiro = toISODate(person?.fechaRetiro);
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
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
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
