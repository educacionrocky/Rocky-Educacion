import { el } from '../utils/dom.js';

export const Footer = () =>
  el('div', { className: 'container' }, [
    el('p', { className: 'text-muted footer-brand' }, [
      '© 2026 - RockyEDU by ',
      el('img', {
        className: 'footer-brand__logo',
        src: 'src/assets/img/capcol-logo.png',
        alt: 'Capcol SAS',
        loading: 'lazy'
      }),
      el('span', { className: 'footer-brand__name' }, ['CAPCOL SAS'])
    ])
  ]);
