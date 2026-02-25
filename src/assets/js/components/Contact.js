import { el, qs } from '../utils/dom.js';

const TARGET_EMAIL = 'capcol@capcol.com.co';

export const Contact = (mount) => {
  const section = el('section', { className: 'main-card' }, [
    el('h2', {}, ['Contacto']),
    el('p', { className: 'text-muted mt-1' }, ['Completa el formulario para enviar un correo a ', TARGET_EMAIL]),
    el('div', { className: 'mt-2' }, [
      el('label', { className: 'label' }, ['Nombre']),
      el('input', { id: 'contactName', className: 'input', placeholder: 'Tu nombre completo' })
    ]),
    el('div', { className: 'mt-2' }, [
      el('label', { className: 'label' }, ['Correo']),
      el('input', { id: 'contactEmail', className: 'input', type: 'email', placeholder: 'tu@correo.com' })
    ]),
    el('div', { className: 'mt-2' }, [
      el('label', { className: 'label' }, ['Asunto']),
      el('input', { id: 'contactSubject', className: 'input', placeholder: 'Asunto del mensaje' })
    ]),
    el('div', { className: 'mt-2' }, [
      el('label', { className: 'label' }, ['Mensaje']),
      el('textarea', {
        id: 'contactMessage',
        className: 'input',
        rows: 6,
        placeholder: 'Escribe tu mensaje',
        style: 'max-width:680px;width:100%;resize:vertical;'
      })
    ]),
    el('button', { id: 'btnContactSend', className: 'btn btn--primary mt-2', type: 'button' }, ['Enviar correo'])
  ]);

  qs('#btnContactSend', section).addEventListener('click', async () => {
    const name = qs('#contactName', section).value.trim();
    const email = qs('#contactEmail', section).value.trim();
    const subject = qs('#contactSubject', section).value.trim();
    const message = qs('#contactMessage', section).value.trim();
    const btn = qs('#btnContactSend', section);

    if (!name || !email || !subject || !message) {
      alert('Completa todos los campos para enviar el correo.');
      return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Enviando...';

    try {
      const resp = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo enviar el mensaje.');
      }

      qs('#contactName', section).value = '';
      qs('#contactEmail', section).value = '';
      qs('#contactSubject', section).value = '';
      qs('#contactMessage', section).value = '';
      alert(`Mensaje enviado correctamente a ${TARGET_EMAIL}.`);
    } catch (err) {
      alert(err?.message || 'Ocurrio un error enviando el mensaje.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  mount.replaceChildren(section);
};
