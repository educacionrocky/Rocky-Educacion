import { el } from '../utils/dom.js';

export const About = (mount) => {
  mount.replaceChildren(
    el('section', { className: 'main-card' }, [
      el('h2', {}, ['Acerca de']),
      el('p', { className: 'mt-1' }, ['RockyEDU v1.0.0.']),
      el('p', { className: 'mt-1' }, ['todos los derechos reservados a CAPCOL S.A.S.']),
      el('p', { className: 'mt-1' }, ['nit 900.939.656-7']),
      el('p', { className: 'mt-1' }, ['Calle 20 # 18-62 Caramanta - Antioquia - Colombia']),
      el('p', { className: 'mt-1' }, ['Telefono 3502624742']),
      el('p', { className: 'mt-1' }, ['email: capcol@capcol.com.co'])
    ])
  );
};
