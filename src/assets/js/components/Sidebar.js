import { el, qs } from '../utils/dom.js';
import { navigate } from '../router.js';
import { getState, subscribe } from '../state.js';
import { can, isSuperAdmin, PERMS } from '../permissions.js';

export const Sidebar = () => {
  const container = el('div', {});
  const top = el('div', { className: 'sidebar__top' }, [
    el('div', { className: 'sidebar__brand' }, ['RockyPro']),
    el('button', { className: 'btn sidebar__collapse-btn', id: 'btnCollapse' }, ['<>'])
  ]);

  const sections = [];
  const { user, userProfile } = getState();

  if (user && userProfile) {
    const govLinks = [];
    if (isSuperAdmin()) govLinks.push(navLink('Centro de Permisos', '/permissions'));
    if (can(PERMS.MANAGE_USERS)) govLinks.push(navLink('Usuarios', '/users'));
    if (govLinks.length) sections.push(section('Gobierno', govLinks));

    const adminLinks = [];
    if (can(PERMS.MANAGE_ZONES)) adminLinks.push(navLink('Zonas', '/zones'));
    if (can(PERMS.MANAGE_DEPENDENCIES)) adminLinks.push(navLink('Dependencias', '/dependencies'));
    if (can(PERMS.MANAGE_SEDES)) adminLinks.push(navLink('Sedes', '/sedes'));
    if (can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Cargos', '/cargos'));
    if (can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Novedades', '/novedades'));
    if (can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Empleados', '/employees'));
    if (can(PERMS.MANAGE_SUPERVISORS)) adminLinks.push(navLink('Supervisores', '/supervisors'));
    if (can(PERMS.MANAGE_EMPLOYEES)) adminLinks.push(navLink('Supernumerarios', '/supernumerarios'));
    if (adminLinks.length) sections.push(section('Administracion', adminLinks));

    const bulkLinks = [];
    if (can(PERMS.MANAGE_SEDES)) bulkLinks.push(navLink('Cargue sedes', '/bulk-upload-sedes'));
    if (can(PERMS.MANAGE_EMPLOYEES)) bulkLinks.push(navLink('Cargue empleados', '/bulk-upload'));
    if (can(PERMS.MANAGE_EMPLOYEES)) bulkLinks.push(navLink('Cargue supernumerarios', '/bulk-upload-supernumerarios'));
    if (bulkLinks.length) sections.push(section('Cargue masivo', bulkLinks));

    const opLinks = [];
    if (can(PERMS.IMPORT_DATA)) opLinks.push(navLink('Importar datos', '/imports'));
    if (can(PERMS.VIEW_IMPORT_HISTORY)) opLinks.push(navLink('Historial de importaciones', '/import-history'));
    if (can(PERMS.RUN_PAYROLL)) opLinks.push(navLink('Nomina', '/payroll'));
    if (can(PERMS.MANAGE_ABSENTEEISM)) opLinks.push(navLink('Ausentismo', '/absenteeism'));
    if (opLinks.length) sections.push(section('Operacion', opLinks));

    if (can(PERMS.VIEW_REPORTS)) {
      sections.push(section('Reportes', [navLink('Reportes', '/reports')]));
    }

    if (can(PERMS.UPLOAD_DATA)) {
      sections.push(section('Carga de informacion', [navLink('Carga de datos', '/upload')]));
    }
  }

  container.replaceChildren(top, ...sections);

  const btn = qs('#btnCollapse', container);
  btn.addEventListener('click', () => {
    const aside = document.getElementById('app-sidebar');
    const collapsed = aside.getAttribute('data-collapsed') === 'true';
    aside.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
  });

  const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
  applyTheme(getState().theme);
  const unsub = subscribe('theme', applyTheme);
  container._cleanup = () => unsub?.();

  return container;
};

function section(title, links) {
  return el('div', { className: 'sidebar__section' }, [
    el('div', { className: 'sidebar__section-title' }, [title]),
    el('nav', { className: 'sidebar__nav' }, links)
  ]);
}

function navLink(text, to) {
  const a = el('a', { href: `#${to}`, className: 'sidebar__nav-link' }, [
    el('span', { className: 'sidebar__item-text' }, [text])
  ]);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(to);
    document.querySelectorAll('.sidebar__nav-link').forEach((n) => n.classList.remove('is-active'));
    a.classList.add('is-active');
  });
  return a;
}
