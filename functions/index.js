const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

const DEFAULT_TO_EMAIL = 'capcol@capcol.com.co';
const DEFAULT_FROM_EMAIL = 'capcol@capcol.com.co';
const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const WHATSAPP_ACCESS_TOKEN = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const WHATSAPP_PHONE_NUMBER_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const WHATSAPP_GRAPH_VERSION = String(process.env.WHATSAPP_GRAPH_VERSION || 'v25.0').trim();
const WHATSAPP_APP_SECRET = String(process.env.WHATSAPP_APP_SECRET || '').trim();
const DAILY_CLOSURES_COL = 'daily_closures';
const DAILY_SNAPSHOTS_COL = 'daily_closure_snapshots';

exports.sendContactEmail = onRequest(
  {
    region: 'us-central1'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      const { name, email, subject, message } = req.body || {};
      const cleaned = {
        name: String(name || '').trim(),
        email: String(email || '').trim().toLowerCase(),
        subject: String(subject || '').trim(),
        message: String(message || '').trim()
      };

      if (!cleaned.name || !cleaned.email || !cleaned.subject || !cleaned.message) {
        res.status(400).json({ ok: false, error: 'Missing required fields' });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
        res.status(400).json({ ok: false, error: 'Invalid email format' });
        return;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const docRef = await admin.firestore().collection('contact_submissions').add({
        ...cleaned,
        source: 'web_contact_form',
        createdAt: now,
        status: 'pending'
      });

      const apiKey = String(process.env.BREVO_API_KEY || '').trim();
      if (!apiKey) {
        logger.error('BREVO_API_KEY is not configured in functions env');
        await docRef.update({ status: 'failed', failureReason: 'missing_brevo_api_key_env' });
        res.status(500).json({ ok: false, error: 'Email service is not configured' });
        return;
      }

      const toEmail = process.env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL;
      const fromEmail = process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM_EMAIL;
      const mailSubject = `[RockyEDU Contacto] ${cleaned.subject}`;
      const mailText =
        `Nombre: ${cleaned.name}\n` +
        `Correo: ${cleaned.email}\n\n` +
        `Mensaje:\n${cleaned.message}`;

      const mailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: 'RockyEDU Contacto' },
          to: [{ email: toEmail }],
          replyTo: { email: cleaned.email, name: cleaned.name },
          subject: mailSubject,
          textContent: mailText
        })
      });

      if (!mailResp.ok) {
        const errText = await mailResp.text();
        logger.error('Brevo API error', { status: mailResp.status, body: errText });
        await docRef.update({ status: 'failed', failureReason: 'brevo_error', providerStatus: mailResp.status });
        res.status(502).json({ ok: false, error: 'Email provider rejected the request' });
        return;
      }

      const providerPayload = await mailResp.json();
      await docRef.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        providerMessageId: providerPayload?.messageId || null
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('Unexpected contact submission error', err);
      res.status(500).json({ ok: false, error: 'Unexpected server error' });
    }
  }
);

exports.whatsappWebhook = onRequest(
  {
    region: 'us-central1'
  },
  async (req, res) => {
    try {
      if (req.method === 'GET') {
        const mode = String(req.query['hub.mode'] || '').trim();
        const token = String(req.query['hub.verify_token'] || '').trim();
        const challenge = String(req.query['hub.challenge'] || '').trim();
        if (mode === 'subscribe' && token && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
          res.status(200).send(challenge);
          return;
        }
        res.status(403).send('Forbidden');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'Method not allowed' });
        return;
      }

      if (!isValidWhatsAppSignature(req)) {
        logger.warn('Invalid WhatsApp webhook signature');
        res.status(401).json({ ok: false, error: 'Invalid signature' });
        return;
      }

      const payload = req.body || {};
      if (payload.object && payload.object !== 'whatsapp_business_account') {
        res.status(400).json({ ok: false, error: 'Unsupported webhook object' });
        return;
      }
      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      let stored = 0;

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const metadata = value?.metadata || {};
          const phoneNumberId = String(metadata.phone_number_id || '').trim() || null;
          const displayPhoneNumber = String(metadata.display_phone_number || '').trim() || null;

          const messages = Array.isArray(value?.messages) ? value.messages : [];
          for (const msg of messages) {
            const messageId = String(msg?.id || '').trim();
            if (!messageId) continue;
            const docRef = admin.firestore().collection('whatsapp_incoming').doc(messageId);
            const messageData = {
              source: 'whatsapp_cloud_api',
              eventType: 'message',
              messageId,
              from: String(msg?.from || '').trim() || null,
              timestamp: String(msg?.timestamp || '').trim() || null,
              type: String(msg?.type || '').trim() || 'unknown',
              text: extractIncomingTextFromMetaMessage(msg),
              phoneNumberId,
              displayPhoneNumber,
              raw: msg,
              receivedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            logger.info('WhatsApp incoming message', {
              messageId,
              from: messageData.from,
              type: messageData.type,
              hasText: Boolean(messageData.text)
            });
            await docRef.set(messageData, { merge: true });
            stored += 1;
          }

          const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
          for (const st of statuses) {
            const statusId = String(st?.id || '').trim();
            const statusName = String(st?.status || '').trim();
            const ts = String(st?.timestamp || '').trim();
            const docId = statusId ? `${statusId}_${statusName || 'status'}` : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const docRef = admin.firestore().collection('whatsapp_incoming').doc(docId);
            await docRef.set(
              {
                source: 'whatsapp_cloud_api',
                eventType: 'status',
                messageId: statusId || null,
                status: statusName || null,
                timestamp: ts || null,
                recipientId: String(st?.recipient_id || '').trim() || null,
                conversationId: String(st?.conversation?.id || '').trim() || null,
                pricingCategory: String(st?.pricing?.category || '').trim() || null,
                phoneNumberId,
                displayPhoneNumber,
                raw: st,
                receivedAt: admin.firestore.FieldValue.serverTimestamp()
              },
              { merge: true }
            );
            stored += 1;
          }
        }
      }

      res.status(200).json({ ok: true, stored });
    } catch (err) {
      logger.error('whatsappWebhook error', err);
      res.status(500).json({ ok: false, error: 'Unexpected server error' });
    }
  }
);

exports.processWhatsAppIncoming = onDocumentCreated(
  {
    region: 'us-central1',
    document: 'whatsapp_incoming/{docId}'
  },
  async (event) => {
    const snap = event.data;
    if (!snap?.exists) return;
    await processIncomingMessage(snap.ref, snap.data() || {});
  }
);

exports.finalizeDailyAbsenteeism = onSchedule(
  {
    region: 'us-central1',
    schedule: '5 0 * * *',
    timeZone: 'America/Bogota'
  },
  async () => {
    const day = shiftDateIso(todayInBogota(), -1);
    if (await isDayClosed(day)) {
      logger.info('finalizeDailyAbsenteeism skipped: day already closed', { day });
      return;
    }
    await ensureAutoAttendanceWithNovedad8(day);
    await ensureAusentismoAssignmentsForDate(day);
    await rebuildSedeStatusForDate(day, { force: true });
    const snapshotStats = await snapshotDailyState(day);
    await markDayClosed(day, {
      source: 'auto_scheduler',
      ...snapshotStats
    });
    logger.info('finalizeDailyAbsenteeism completed', { day, ...snapshotStats });
  }
);

exports.closeOperationDay = onRequest(
  {
    region: 'us-central1'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const token = String(req.get('x-admin-token') || req.body?.token || req.query?.token || '').trim();
    if (WHATSAPP_VERIFY_TOKEN && token !== WHATSAPP_VERIFY_TOKEN) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const body = req.body || {};
    const list = Array.isArray(body.dates) ? body.dates : [body.date];
    const days = list
      .map((d) => String(d || '').trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (!days.length) {
      res.status(400).json({ ok: false, error: 'Missing valid date or dates[] in YYYY-MM-DD' });
      return;
    }

    const results = [];
    for (const day of days) {
      try {
        if (await isDayClosed(day)) {
          results.push({ day, status: 'already_closed' });
          continue;
        }
        await ensureAutoAttendanceWithNovedad8(day);
        await ensureAusentismoAssignmentsForDate(day);
        await rebuildSedeStatusForDate(day, { force: true });
        const snapshotStats = await snapshotDailyState(day);
        await markDayClosed(day, {
          source: 'manual_http',
          ...snapshotStats
        });
        results.push({ day, status: 'closed', ...snapshotStats });
      } catch (err) {
        logger.error('closeOperationDay error', { day, err: String(err?.message || err) });
        results.push({ day, status: 'error', error: String(err?.message || err) });
      }
    }

    res.status(200).json({ ok: true, results });
  }
);

async function processIncomingMessage(docRef, data) {
  const row = data || {};
  if (String(row.eventType || '') !== 'message') return;
  const text = extractIncomingTextFromStoredRow(row);
  if (!text) return;

  const fromDigits = digitsOnly(row.from);
  if (!fromDigits) {
    await setIncomingProcess(docRef, 'error', 'missing_sender_phone');
    return;
  }

  const sessionRef = admin.firestore().collection('whatsapp_sessions').doc(fromDigits);
  const sessionSnap = await sessionRef.get();
  const session = sessionSnap.exists ? sessionSnap.data() || {} : {};
  const normalizedText = normalizeUserText(text);

  if (session.stage === 'awaiting_document_lookup') {
    const documento = digitsOnly(text);
    if (!documento) {
      await sendWhatsAppText(fromDigits, 'Por favor escribe solo tu numero de cedula (solo digitos).', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'invalid_document_input');
      return;
    }
    const employee = await findEmployeeByDocument(documento);
    if (!employee) {
      await sendWhatsAppText(
        fromDigits,
        'No encontramos esa cedula en la base de datos. Verifica el numero o contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'document_not_registered', { documento });
      return;
    }
    const emp = employee.data || {};
    const fechaRegistro = todayInBogota();
    if (!isEmployeeEligibleForRegistration(emp, fechaRegistro)) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_by_document', { documento, fechaRegistro });
      return;
    }
    const employeeDocument = String(emp.documento || documento || '').trim();
    const supernumerario = await findActiveSupernumerarioByDocument(employeeDocument);
    const isSupernumerario = Boolean(supernumerario);
    const prompt = buildMainPrompt({
      nombre: String(emp.nombre || 'colaborador(a)'),
      cedula: employeeDocument,
      sede: String(emp.sedeNombre || emp.sedeCodigo || 'sin sede'),
      isSupernumerario
    });
    await sendWhatsAppMainOptions(fromDigits, prompt, {
      isSupernumerario,
      phoneNumberIdHint: row.phoneNumberId
    });
    await sessionRef.set(
      {
        phone: fromDigits,
        stage: 'awaiting_main_option',
        employeeId: employee.id,
        employeeName: String(emp.nombre || null),
        employeeDocument: employeeDocument,
        employeeSede: String(emp.sedeNombre || emp.sedeCodigo || null),
        employeePhone: String(emp.telefono || fromDigits),
        isSupernumerario,
        supernumerarioId: supernumerario?.id || null,
        lastInboundMessageId: row.messageId || docRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await setIncomingProcess(docRef, 'processed', 'employee_identified_by_document', { employeeId: employee.id });
    return;
  }

  if (isGreeting(normalizedText) || !String(session.stage || '').trim() || String(session.stage || '').trim() === 'completed') {
    const employee = await findEmployeeByPhone(fromDigits);
    if (!employee) {
      await sendWhatsAppText(
        fromDigits,
        'Hola, no encontramos tu numero registrado en la base de datos, por favor escribe tu cedula.\n\nEscribelo sin puntos.',
        row.phoneNumberId
      );
      await sessionRef.set(
        {
          phone: fromDigits,
          stage: 'awaiting_document_lookup',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_document_lookup', { from: fromDigits });
      return;
    }

    const emp = employee.data || {};
    const fechaRegistro = todayInBogota();
    if (!isEmployeeEligibleForRegistration(emp, fechaRegistro)) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_by_phone', { from: fromDigits, fechaRegistro });
      return;
    }
    const nombre = String(emp.nombre || 'colaborador(a)');
    const cedula = String(emp.documento || '-');
    const sede = String(emp.sedeNombre || emp.sedeCodigo || 'sin sede');
    const supernumerario = await findActiveSupernumerarioByDocument(cedula);
    const isSupernumerario = Boolean(supernumerario);
    const prompt = buildMainPrompt({ nombre, cedula, sede, isSupernumerario });

    await sendWhatsAppMainOptions(fromDigits, prompt, {
      isSupernumerario,
      phoneNumberIdHint: row.phoneNumberId
    });
    await sessionRef.set(
      {
        phone: fromDigits,
        stage: 'awaiting_main_option',
        employeeId: employee.id,
        employeeName: nombre,
        employeeDocument: cedula,
        employeeSede: sede,
        employeePhone: String(emp.telefono || fromDigits),
        isSupernumerario,
        supernumerarioId: supernumerario?.id || null,
        lastInboundMessageId: row.messageId || docRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await setIncomingProcess(docRef, 'processed', 'conversation_started', { employeeId: employee.id });
    return;
  }

  if (session.stage === 'awaiting_main_option' && session.employeeId) {
    const empDoc = await admin.firestore().collection('employees').doc(String(session.employeeId)).get();
    if (!empDoc.exists) {
      await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'error', 'employee_not_found_in_session');
      return;
    }
    if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_session');
      return;
    }

    const isSupernumerario = Boolean(session.isSupernumerario);
    const mainOption = parseMainOption(normalizedText, { isSupernumerario });
    if (mainOption === 'si') {
      if (isSupernumerario) {
        await sendWhatsAppText(fromDigits, 'Escribe la sede en la que te encuentras.', row.phoneNumberId);
        await sessionRef.set(
          {
            stage: 'awaiting_super_sede_search',
            lastDecision: 'si',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        await setIncomingProcess(docRef, 'processed', 'awaiting_super_sede_search');
        return;
      }
      const novelty = await resolveNovedadByCode('1');
      await finalizeAttendanceNow({
        sessionRef,
        employeeId: String(session.employeeId),
        fromDigits,
        row,
        docRef,
        pendingAttendance: {
          asistio: true,
          novedadCodigo: novelty.codigo,
          novedadNombre: novelty.nombre,
          novedad: novelty.nombre,
          messageId: row.messageId || docRef.id,
          phone: fromDigits
        },
        processReason: 'attendance_registered_working',
        lastDecision: 'si'
      });
      return;
    }

    if (mainOption === 'compensatorio') {
      const novelty = await resolveNovedadByCode('7');
      await finalizeAttendanceNow({
        sessionRef,
        employeeId: String(session.employeeId),
        fromDigits,
        row,
        docRef,
        pendingAttendance: {
          asistio: false,
          novedadCodigo: novelty.codigo,
          novedadNombre: novelty.nombre,
          novedad: novelty.nombre,
          messageId: row.messageId || docRef.id,
          phone: fromDigits
        },
        processReason: 'attendance_registered_compensatorio',
        lastDecision: 'compensatorio'
      });
      return;
    }

    if (mainOption === 'novedad') {
      await sendWhatsAppNovedadList(
        fromDigits,
        'Selecciona el tipo de novedad a registrar.',
        row.phoneNumberId
      );
      await sessionRef.set(
        {
          stage: 'awaiting_novedad_type',
          lastDecision: 'novedad',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_novedad_type');
      return;
    }

    if (mainOption === 'traslado') {
      if (isSupernumerario) {
        await sendWhatsAppText(fromDigits, 'Respuesta no valida. Por favor selecciona una opcion: TRABAJANDO o NOVEDAD.', row.phoneNumberId);
        await setIncomingProcess(docRef, 'ignored', 'invalid_main_option_supernumerario');
        return;
      }
      await sendWhatsAppText(fromDigits, 'Escribe el nombre de la sede a la que te trasladaron.', row.phoneNumberId);
      await sessionRef.set(
        {
          stage: 'awaiting_traslado_search',
          lastDecision: 'traslado',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_traslado_search');
      return;
    }

    if (isSupernumerario) {
      await sendWhatsAppText(fromDigits, 'Respuesta no valida. Por favor selecciona una opcion: TRABAJANDO o NOVEDAD.', row.phoneNumberId);
    } else {
      await sendWhatsAppText(fromDigits, 'Respuesta no valida. Por favor selecciona una opcion: TRABAJANDO, COMPENSATORIO, NOVEDAD o TRASLADO.', row.phoneNumberId);
    }
    await setIncomingProcess(docRef, 'ignored', 'invalid_main_option');
    return;
  }

  if (session.stage === 'awaiting_super_sede_search' && session.employeeId) {
    const empDoc = await admin.firestore().collection('employees').doc(String(session.employeeId)).get();
    if (!empDoc.exists) {
      await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'error', 'employee_not_found_in_super_sede');
      return;
    }
    if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_super_sede');
      return;
    }

    const candidates = await findSedeCandidatesByName(text);
    if (!candidates.length) {
      await sendWhatsAppText(fromDigits, 'No encontramos sedes con ese nombre. Escribe nuevamente una palabra clave de la sede.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'super_sede_candidates_not_found');
      return;
    }

    const sent = await sendWhatsAppSedeList(fromDigits, 'Selecciona la sede en la que te encuentras.', candidates, row.phoneNumberId);
    if (!sent.ok) {
      const alt = candidates.slice(0, 10).map((s, i) => `${i + 1}. ${s.nombre || s.codigo || '-'}`).join('\n');
      await sendWhatsAppText(fromDigits, `Selecciona una sede respondiendo el numero:\n${alt}`, row.phoneNumberId);
      await sessionRef.set(
        {
          stage: 'awaiting_super_sede_pick',
          superSedeCandidates: candidates.slice(0, 10).map((s, i) => ({
            index: String(i + 1),
            id: s.id,
            codigo: s.codigo || null,
            nombre: s.nombre || null
          })),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_super_sede_pick_text');
      return;
    }

    await sessionRef.set(
      {
        stage: 'awaiting_super_sede_pick',
        superSedeCandidates: candidates.slice(0, 10).map((s, i) => ({
          index: String(i + 1),
          id: s.id,
          codigo: s.codigo || null,
          nombre: s.nombre || null
        })),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await setIncomingProcess(docRef, 'processed', 'awaiting_super_sede_pick');
    return;
  }

  if (session.stage === 'awaiting_super_sede_pick' && session.employeeId) {
    const empDoc = await admin.firestore().collection('employees').doc(String(session.employeeId)).get();
    if (!empDoc.exists) {
      await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'error', 'employee_not_found_in_super_sede_pick');
      return;
    }
    if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_super_sede_pick');
      return;
    }
    const selectedSede = await resolveSelectedSede(text, session.superSedeCandidates || []);
    if (!selectedSede) {
      await sendWhatsAppText(fromDigits, 'Seleccion no valida. Elige una sede del listado para continuar.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'invalid_super_sede_pick');
      return;
    }

    const novelty = await resolveNovedadByCode('1');
    await finalizeAttendanceNow({
      sessionRef,
      employeeId: String(session.employeeId),
      fromDigits,
      row,
      docRef,
      pendingAttendance: {
        asistio: true,
        novedadCodigo: novelty.codigo,
        novedadNombre: novelty.nombre,
        novedad: novelty.nombre,
        isSupernumerario: true,
        messageId: row.messageId || docRef.id,
        phone: fromDigits,
        sedeCodigo: selectedSede.codigo || null,
        sedeNombre: selectedSede.nombre || null
      },
      processReason: 'attendance_registered_super_trabajando',
      processExtra: {
        sedeCodigo: selectedSede.codigo || null
      },
      lastDecision: 'si'
    });
    return;
  }

  if (session.stage === 'awaiting_traslado_search' && session.employeeId) {
    const empDoc = await admin.firestore().collection('employees').doc(String(session.employeeId)).get();
    if (!empDoc.exists) {
      await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'error', 'employee_not_found_in_traslado');
      return;
    }
    if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_traslado');
      return;
    }

    const candidates = await findSedeCandidatesByName(text);
    if (!candidates.length) {
      await sendWhatsAppText(fromDigits, 'No encontramos sedes con ese nombre. Escribe nuevamente una palabra clave de la sede.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'sede_candidates_not_found');
      return;
    }

    const sent = await sendWhatsAppSedeList(fromDigits, 'Selecciona la sede a la que te trasladaron.', candidates, row.phoneNumberId);
    if (!sent.ok) {
      const alt = candidates.slice(0, 10).map((s, i) => `${i + 1}. ${s.nombre || s.codigo || '-'}`).join('\n');
      await sendWhatsAppText(fromDigits, `Selecciona una sede respondiendo el numero:\n${alt}`, row.phoneNumberId);
      await sessionRef.set(
        {
          stage: 'awaiting_traslado_pick',
          trasladoCandidates: candidates.slice(0, 10).map((s, i) => ({
            index: String(i + 1),
            id: s.id,
            codigo: s.codigo || null,
            nombre: s.nombre || null
          })),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_traslado_pick_text');
      return;
    }

    await sessionRef.set(
      {
        stage: 'awaiting_traslado_pick',
        trasladoCandidates: candidates.slice(0, 10).map((s, i) => ({
          index: String(i + 1),
          id: s.id,
          codigo: s.codigo || null,
          nombre: s.nombre || null
        })),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await setIncomingProcess(docRef, 'processed', 'awaiting_traslado_pick');
    return;
  }

  if (session.stage === 'awaiting_traslado_pick' && session.employeeId) {
    const empDoc = await admin.firestore().collection('employees').doc(String(session.employeeId)).get();
    if (!empDoc.exists) {
      await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'error', 'employee_not_found_in_traslado_pick');
      return;
    }
    if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
      await sendWhatsAppText(
        fromDigits,
        'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_traslado_pick');
      return;
    }
    const selectedSede = await resolveSelectedSede(text, session.trasladoCandidates || []);
    if (!selectedSede) {
      await sendWhatsAppText(fromDigits, 'Seleccion no valida. Elige una sede del listado para continuar.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'invalid_traslado_pick');
      return;
    }

    await admin
      .firestore()
      .collection('employees')
      .doc(String(session.employeeId))
      .set(
        {
          sedeCodigo: selectedSede.codigo || null,
          sedeNombre: selectedSede.nombre || null,
          lastModifiedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    const novelty = await resolveNovedadByCode('1');
    await finalizeAttendanceNow({
      sessionRef,
      employeeId: String(session.employeeId),
      fromDigits,
      row,
      docRef,
      pendingAttendance: {
        asistio: true,
        novedadCodigo: novelty.codigo,
        novedadNombre: novelty.nombre,
        novedad: novelty.nombre,
        messageId: row.messageId || docRef.id,
        phone: fromDigits,
        sedeCodigo: selectedSede.codigo || null,
        sedeNombre: selectedSede.nombre || null
      },
      processReason: 'attendance_registered_traslado',
      processExtra: {
        sedeCodigo: selectedSede.codigo || null
      },
      lastDecision: 'traslado'
    });
    return;
  }

  if (session.stage === 'awaiting_novedad_type' && session.employeeId) {
    const parsedNovedad = parseNovedadType(text);
    if (!parsedNovedad) {
      await sendWhatsAppText(
        fromDigits,
        'Novedad no valida. Selecciona una opcion valida: ENFERMEDAD GENERAL, ACCIDENTE LABORAL, CALAMIDAD o LICENCIA NO REMUNERADA.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'ignored', 'invalid_novedad_type');
      return;
    }

    if (parsedNovedad === 'ENFERMEDAD GENERAL' || parsedNovedad === 'ACCIDENTE LABORAL') {
      await sendWhatsAppText(fromDigits, '¿Cuantos dias te incapacitaron? Escribe un numero entero.', row.phoneNumberId);
      await sessionRef.set(
        {
          stage: 'awaiting_incapacidad_days',
          selectedNovedad: parsedNovedad,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      await setIncomingProcess(docRef, 'processed', 'awaiting_incapacidad_days');
      return;
    }

    const prepared = await prepareNovedadFlow({
      sessionRef,
      session,
      empId: String(session.employeeId),
      fromDigits,
      row,
      docRef,
      novedadType: parsedNovedad,
      incapacidadDays: null
    });
    if (prepared) return;
  }

  if (session.stage === 'awaiting_incapacidad_days' && session.employeeId) {
    const days = parsePositiveInt(text);
    if (!days) {
      await sendWhatsAppText(fromDigits, 'Respuesta no valida. Escribe solo el numero de dias, por ejemplo: 3.', row.phoneNumberId);
      await setIncomingProcess(docRef, 'ignored', 'invalid_incapacidad_days');
      return;
    }

    const selectedNovedad = String(session.selectedNovedad || 'ENFERMEDAD GENERAL');
    const prepared = await prepareNovedadFlow({
      sessionRef,
      session,
      empId: String(session.employeeId),
      fromDigits,
      row,
      docRef,
      novedadType: selectedNovedad,
      incapacidadDays: days
    });
    if (prepared) return;
  }

  if (session.stage === 'awaiting_phone_confirm' && session.employeeId) {
    await finalizeAttendanceNow({
      sessionRef,
      employeeId: String(session.employeeId),
      fromDigits,
      row,
      docRef,
      pendingAttendance: session.pendingAttendance || {},
      processReason: 'attendance_registered_after_phone_confirm_migration',
      lastDecision: String(session.lastDecision || '').trim() || null
    });
    return;
  }

  const parsed = parseWhatsAppAttendanceText(text, row);
  if (!parsed.ok) {
    await setIncomingProcess(docRef, 'ignored', parsed.reason || 'unsupported_message_format');
    return;
  }

  const employeesRef = admin.firestore().collection('employees');
  const empSnap = await employeesRef.where('documento', '==', parsed.documento).limit(1).get();
  if (empSnap.empty) {
    await setIncomingProcess(docRef, 'error', 'employee_not_found', { parsed });
    return;
  }

  const saved = await registerAttendanceFromEmployeeDoc(empSnap.docs[0], {
    asistio: parsed.asistio,
    novedad: parsed.novedad || null,
    fecha: parsed.fecha || todayInBogota(),
    messageId: row.messageId || docRef.id
  });
  await setIncomingProcess(docRef, 'processed', 'attendance_registered_direct', {
    attendanceId: saved.attendanceId,
    parsed: {
      fecha: saved.fecha,
      documento: parsed.documento,
      asistio: parsed.asistio,
      novedad: parsed.novedad || null,
      empleadoId: saved.employeeId
    }
  });
}

async function prepareNovedadFlow({
  sessionRef,
  empId,
  fromDigits,
  row,
  docRef,
  novedadType,
  incapacidadDays = null
}) {
  const empDoc = await admin.firestore().collection('employees').doc(String(empId)).get();
  if (!empDoc.exists) {
    await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
    await setIncomingProcess(docRef, 'error', 'employee_not_found_in_novedad_flow');
    return true;
  }

  const noveltyMap = {
    'ENFERMEDAD GENERAL': '3',
    'ACCIDENTE LABORAL': '2',
    CALAMIDAD: '4',
    'LICENCIA NO REMUNERADA': '5'
  };
  const novCode = noveltyMap[String(novedadType || '').trim()] || null;
  const novelty = await resolveNovedadByCode(novCode);
  const emp = empDoc.data() || {};
  const superByDoc = await findActiveSupernumerarioByDocument(String(emp.documento || '').trim());
  const isSupernumerario = Boolean(superByDoc);
  const novedadLabel =
    incapacidadDays && ['ENFERMEDAD GENERAL', 'ACCIDENTE LABORAL'].includes(String(novedadType || '').trim())
      ? `${novelty.nombre} (${incapacidadDays} dias)`
      : novelty.nombre;
  await finalizeAttendanceNow({
    sessionRef,
    employeeId: String(empId),
    fromDigits,
    row,
    docRef,
    pendingAttendance: {
      asistio: false,
      novedadCodigo: novelty.codigo,
      novedadNombre: novelty.nombre,
      novedad: novedadLabel,
      incapacidadDias: incapacidadDays || null,
      isSupernumerario,
      messageId: row.messageId || docRef.id,
      phone: fromDigits
    },
    processReason: 'attendance_registered_novedad',
    processExtra: { novedadType, novedadCodigo: novelty.codigo },
    lastDecision: 'novedad'
  });
  return true;
}

async function finalizeAttendanceNow({
  sessionRef,
  employeeId,
  fromDigits,
  row,
  docRef,
  pendingAttendance = {},
  processReason = 'attendance_registered',
  processExtra = {},
  lastDecision = null
}) {
  const empRef = admin.firestore().collection('employees').doc(String(employeeId || ''));
  const empDoc = await empRef.get();
  if (!empDoc.exists) {
    await sendWhatsAppText(fromDigits, 'No fue posible encontrar tu registro de empleado. Por favor contacta a administracion.', row.phoneNumberId);
    await setIncomingProcess(docRef, 'error', 'employee_not_found_in_finalize');
    return null;
  }
  if (!isEmployeeEligibleForRegistration(empDoc.data() || {}, todayInBogota())) {
    await sendWhatsAppText(
      fromDigits,
      'Tu registro no esta habilitado para hoy por estado o fecha de retiro. Por favor contacta a administracion.',
      row.phoneNumberId
    );
    await setIncomingProcess(docRef, 'error', 'employee_not_eligible_in_finalize');
    return null;
  }

  let saved = null;
  try {
    saved = await registerAttendanceFromEmployeeDoc(empDoc, {
      ...(pendingAttendance || {}),
      messageId: pendingAttendance?.messageId || row.messageId || docRef.id,
      phone: normalizePhoneForStorage(fromDigits)
    });
  } catch (err) {
    const code = String(err?.message || '');
    if (code === 'day_closed') {
      await sendWhatsAppText(
        fromDigits,
        'El registro para esa fecha ya fue cerrado y no admite cambios.',
        row.phoneNumberId
      );
      await setIncomingProcess(docRef, 'error', 'day_closed_for_registration');
      return null;
    }
    throw err;
  }

  const novedadNombre = String(pendingAttendance?.novedadNombre || pendingAttendance?.novedad || '').trim();
  const novTxt = novedadNombre ? ` Novedad: ${novedadNombre}.` : '';
  await sendWhatsAppText(
    fromDigits,
    `Gracias, registro confirmado. Fecha: ${saved.fecha}, hora: ${saved.hora}.${novTxt}`,
    row.phoneNumberId
  );
  await sessionRef.set(
    {
      stage: 'completed',
      pendingAttendance: admin.firestore.FieldValue.delete(),
      trasladoCandidates: admin.firestore.FieldValue.delete(),
      superSedeCandidates: admin.firestore.FieldValue.delete(),
      selectedNovedad: admin.firestore.FieldValue.delete(),
      incapacidadDays: admin.firestore.FieldValue.delete(),
      lastDecision: lastDecision || admin.firestore.FieldValue.delete(),
      lastAttendanceId: saved.attendanceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await setIncomingProcess(docRef, 'processed', processReason, {
    attendanceId: saved.attendanceId,
    ...processExtra
  });
  return saved;
}

function parseMainOption(normalizedText, opts = {}) {
  const isSupernumerario = Boolean(opts.isSupernumerario);
  const t = String(normalizedText || '').trim();
  if (['trabajando', 'si', 'sí', 'ok', '1', 'main_trabajando'].includes(t)) return 'si';
  if (isSupernumerario) {
    if (['novedad', '2', 'main_novedad'].includes(t)) return 'novedad';
    return null;
  }
  if (['compensatorio', '2', 'main_compensatorio'].includes(t)) return 'compensatorio';
  if (['novedad', '3', 'main_novedad'].includes(t)) return 'novedad';
  if (['traslado', 'otra sede', 'otra_sede', 'otrasede', '4', 'main_traslado'].includes(t)) return 'traslado';
  return null;
}

function parseNovedadType(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const norm = normalizeUserText(raw).replace(/\s+/g, ' ').trim();
  if (norm === '1' || norm === 'enfermedad general' || norm === 'nov_enfermedad_general') return 'ENFERMEDAD GENERAL';
  if (norm === '2' || norm === 'accidente laboral' || norm === 'nov_accidente_laboral') return 'ACCIDENTE LABORAL';
  if (norm === '3' || norm === 'calamidad' || norm === 'nov_calamidad') return 'CALAMIDAD';
  if (norm === '4' || norm === 'licencia no remunerada' || norm === 'nov_licencia_no_remunerada') return 'LICENCIA NO REMUNERADA';
  return null;
}

function parseYesNo(normalizedText) {
  const t = String(normalizedText || '').trim();
  if (['si', 'sí', 'yes', 'ok', '1'].includes(t)) return 'si';
  if (['no', '2'].includes(t)) return 'no';
  return null;
}

function buildMainPrompt({ nombre, cedula, sede, isSupernumerario = false }) {
  if (isSupernumerario) {
    return [
      'Hola, soy Rocky',
      '',
      `Eres: ${nombre || 'colaborador(a)'}`,
      `Cedula: ${cedula || '-'}`,
      'Estas como SUPERNUMERARIO',
      '',
      'Elige una opcion:'
    ].join('\n');
  }
  return [
    'Hola, soy Rocky',
    '',
    `Eres: ${nombre || 'colaborador(a)'}`,
    `Cedula: ${cedula || '-'}`,
    `Estas en: ${sede || '-'}`,
    '',
    'Elige una opcion:'
  ].join('\n');
}

function normalizePhoneForStorage(phoneDigits) {
  const d = digitsOnly(phoneDigits);
  if (!d) return null;
  if (d.startsWith('57')) return d;
  if (d.length === 10) return `57${d}`;
  return d;
}

async function resolveNovedadByCode(code) {
  const desired = String(code || '').trim();
  if (!desired) return { codigo: null, nombre: 'SIN NOVEDAD' };
  const ref = admin.firestore().collection('novedades');
  const byCodigoNovedad = await ref.where('codigoNovedad', '==', desired).limit(1).get();
  if (!byCodigoNovedad.empty) {
    const row = byCodigoNovedad.docs[0].data() || {};
    return {
      codigo: String(row.codigoNovedad || desired).trim() || desired,
      nombre: String(row.nombre || `NOVEDAD ${desired}`).trim() || `NOVEDAD ${desired}`
    };
  }
  const byCodigo = await ref.where('codigo', '==', desired).limit(1).get();
  if (!byCodigo.empty) {
    const row = byCodigo.docs[0].data() || {};
    return {
      codigo: String(row.codigoNovedad || row.codigo || desired).trim() || desired,
      nombre: String(row.nombre || `NOVEDAD ${desired}`).trim() || `NOVEDAD ${desired}`
    };
  }
  return { codigo: desired, nombre: `NOVEDAD ${desired}` };
}

async function findSedeCandidatesByName(text, max = 10) {
  const normNeedle = normalizeUserText(text);
  if (!normNeedle) return [];
  const snap = await admin.firestore().collection('sedes').limit(500).get();
  const rows = [];
  for (const d of snap.docs) {
    const row = d.data() || {};
    const codigo = String(row.codigo || '').trim();
    const nombre = String(row.nombre || '').trim();
    if (!codigo && !nombre) continue;
    const blob = `${normalizeUserText(nombre)} ${normalizeUserText(codigo)}`;
    if (!blob.includes(normNeedle)) continue;
    rows.push({ id: d.id, codigo: codigo || null, nombre: nombre || codigo || null });
  }
  rows.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  return rows.slice(0, max);
}

async function resolveSelectedSede(rawText, storedCandidates = []) {
  const txt = String(rawText || '').trim();
  if (!txt) return null;
  if (txt.startsWith('sede_pick_')) {
    const sedeId = txt.replace('sede_pick_', '').trim();
    if (!sedeId) return null;
    const snap = await admin.firestore().collection('sedes').doc(sedeId).get();
    if (!snap.exists) return null;
    const row = snap.data() || {};
    return {
      id: snap.id,
      codigo: String(row.codigo || '').trim() || null,
      nombre: String(row.nombre || '').trim() || null
    };
  }
  const opt = (Array.isArray(storedCandidates) ? storedCandidates : []).find((c) => String(c.index || '').trim() === txt);
  if (!opt) return null;
  const snap = await admin.firestore().collection('sedes').doc(String(opt.id || '')).get();
  if (!snap.exists) return null;
  const row = snap.data() || {};
  return {
    id: snap.id,
    codigo: String(row.codigo || '').trim() || null,
    nombre: String(row.nombre || '').trim() || null
  };
}

function extractIncomingTextFromMetaMessage(msg) {
  const row = msg || {};
  if (row?.text?.body) return String(row.text.body).trim() || null;
  if (row?.type === 'interactive') {
    const buttonId = String(row?.interactive?.button_reply?.id || '').trim();
    if (buttonId) return buttonId;
    const buttonTitle = String(row?.interactive?.button_reply?.title || '').trim();
    if (buttonTitle) return buttonTitle;
    const listId = String(row?.interactive?.list_reply?.id || '').trim();
    if (listId) return listId;
    const listTitle = String(row?.interactive?.list_reply?.title || '').trim();
    if (listTitle) return listTitle;
  }
  if (row?.type === 'button') {
    const buttonText = String(row?.button?.text || '').trim();
    if (buttonText) return buttonText;
  }
  return null;
}

function extractIncomingTextFromStoredRow(row) {
  const direct = String(row?.text || '').trim();
  if (direct) return direct;
  return String(extractIncomingTextFromMetaMessage(row?.raw || {}) || '').trim();
}

function parsePositiveInt(text) {
  const n = Number(String(text || '').trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function findSedeByUserInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const sedesRef = admin.firestore().collection('sedes');
  const byCode = await sedesRef.where('codigo', '==', raw).limit(1).get();
  if (!byCode.empty) {
    const d = byCode.docs[0];
    return { id: d.id, ...(d.data() || {}) };
  }

  const byName = await sedesRef.where('nombre', '==', raw).limit(1).get();
  if (!byName.empty) {
    const d = byName.docs[0];
    return { id: d.id, ...(d.data() || {}) };
  }

  const normalized = normalizeUserText(raw);
  const snap = await sedesRef.limit(300).get();
  for (const d of snap.docs) {
    const row = d.data() || {};
    if (normalizeUserText(row.nombre) === normalized || normalizeUserText(row.codigo) === normalized) {
      return { id: d.id, ...row };
    }
  }
  return null;
}

function parseWhatsAppAttendanceText(text, data) {
  const out = { ok: false, reason: 'unsupported_message_format' };
  const clean = String(text || '').trim();
  if (!clean) return out;

  const from = String(data?.from || '').trim();
  const compact = clean.replace(/\s+/g, ' ').trim();

  const kv = parseKeyValue(compact);
  const documentoKV = digitsOnly(kv.documento || kv.doc || kv.cc || kv.cedula);
  const estadoKV = normalizeState(kv.estado || kv.asistencia || kv.status);
  const fechaKV = normalizeDate(kv.fecha || kv.date);
  const novedadKV = String(kv.novedad || kv.nov || '').trim() || null;
  if (documentoKV && estadoKV) {
    return {
      ok: true,
      documento: documentoKV,
      asistio: estadoKV === 'asistio',
      fecha: fechaKV || todayInBogota(),
      novedad: novedadKV,
      from
    };
  }

  const m = compact.match(/^(ASISTIO|AUSENTE)\s+(\d{5,20})(?:\s+(.+))?$/i);
  if (m) {
    return {
      ok: true,
      documento: digitsOnly(m[2]),
      asistio: m[1].toUpperCase() === 'ASISTIO',
      fecha: todayInBogota(),
      novedad: m[3] ? String(m[3]).trim() : null,
      from
    };
  }

  return out;
}

function parseKeyValue(text) {
  const out = {};
  const parts = String(text || '')
    .replace(/\n/g, ';')
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf('=');
    const idx2 = part.indexOf(':');
    const cut = idx >= 0 ? idx : idx2;
    if (cut < 0) continue;
    const key = part.slice(0, cut).trim().toLowerCase();
    const val = part.slice(cut + 1).trim();
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

function digitsOnly(value) {
  const v = String(value || '').replace(/\D+/g, '');
  return v || null;
}

function normalizeState(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (['asistio', 'asistencia', 'presente', 'ok', '1', 'si', 'sí'].includes(v)) return 'asistio';
  if (['ausente', 'falta', 'falto', 'no', '0', 'inasistencia'].includes(v)) return 'ausente';
  return null;
}

function normalizeDate(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

function todayInBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date());
}

function shiftDateIso(isoDate, days) {
  const base = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
  const [y, m, d] = base.split('-').map((n) => Number(n));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function timeInBogota() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return fmt.format(new Date());
}

async function setIncomingProcess(ref, status, reason, extra = {}) {
  await ref.set(
    {
      processStatus: status,
      processReason: reason || null,
      ...extra,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function normalizeUserText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isGreeting(text) {
  return /^(hola|buenas|buenos dias|buen dia|saludo)\b/.test(String(text || '').trim());
}

function isYes(text) {
  const t = String(text || '').trim();
  return ['si', 'sí', 'ok', '1'].includes(t);
}

function isNovedad(text) {
  return String(text || '').trim() === 'novedad';
}

function phoneCandidates(phoneDigits) {
  const d = digitsOnly(phoneDigits);
  if (!d) return [];
  const set = new Set([d]);
  const local10 = d.length > 10 ? d.slice(-10) : d;
  set.add(local10);
  set.add(`+${d}`);
  set.add(`57${local10}`);
  set.add(`+57${local10}`);
  return Array.from(set).filter(Boolean).slice(0, 10);
}

async function findEmployeeByPhone(phoneDigits) {
  const candidates = phoneCandidates(phoneDigits);
  if (!candidates.length) return null;
  const snap = await admin.firestore().collection('employees').where('telefono', 'in', candidates).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() || {} };
}

async function findEmployeeByDocument(documento) {
  const docNum = digitsOnly(documento);
  if (!docNum) return null;
  const snap = await admin.firestore().collection('employees').where('documento', '==', docNum).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() || {} };
}

async function findActiveSupernumerarioByDocument(documento) {
  const docNum = digitsOnly(documento);
  if (!docNum) return null;
  const snap = await admin
    .firestore()
    .collection('supernumerarios')
    .where('documento', '==', docNum)
    .where('estado', '==', 'activo')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() || {};
  if (!isEmployeeEligibleForRegistration(data, todayInBogota())) return null;
  return { id: doc.id, data };
}

async function registerAttendanceFromEmployeeDoc(empDoc, opts = {}) {
  const emp = empDoc.data() || {};
  const fecha = String(opts.fecha || todayInBogota()).trim();
  if (await isDayClosed(fecha)) throw new Error('day_closed');
  const hora = String(opts.hora || timeInBogota()).trim();
  const asistio = Boolean(opts.asistio);
  const novedad = opts.novedad == null ? null : String(opts.novedad).trim() || null;
  const novedadCodigo = opts.novedadCodigo == null ? null : String(opts.novedadCodigo).trim() || null;
  const novedadNombre = opts.novedadNombre == null ? novedad : String(opts.novedadNombre).trim() || null;
  const incapacidadDias = Number.isInteger(Number(opts.incapacidadDias)) ? Number(opts.incapacidadDias) : null;
  const isSupernumerario = opts.isSupernumerario === true;
  const attendanceId = `${fecha}_${empDoc.id}`;
  const messageId = String(opts.messageId || '').trim() || null;
  const telefono = String(opts.phone || emp.telefono || '').trim() || null;
  const sedeCodigo = opts.sedeCodigo == null ? emp.sedeCodigo || null : opts.sedeCodigo;
  const sedeNombre = opts.sedeNombre == null ? emp.sedeNombre || null : opts.sedeNombre;

  const batch = admin.firestore().batch();
  const attendanceRef = admin.firestore().collection('attendance').doc(attendanceId);
  batch.set(
    attendanceRef,
    {
      fecha,
      hora,
      empleadoId: empDoc.id,
      documento: String(emp.documento || '').trim() || null,
      nombre: emp.nombre || null,
      telefono,
      sedeCodigo,
      sedeNombre,
      asistio,
      novedad,
      novedadCodigo,
      novedadNombre,
      incapacidadDias,
      isSupernumerario,
      source: 'whatsapp_cloud_api',
      whatsappMessageId: messageId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  if (!asistio) {
    const absenteeismRef = admin.firestore().collection('absenteeism').doc(attendanceId);
    batch.set(
      absenteeismRef,
      {
        fecha,
        hora,
        empleadoId: empDoc.id,
        documento: String(emp.documento || '').trim() || null,
        nombre: emp.nombre || null,
        telefono,
        sedeCodigo,
        sedeNombre,
        estado: 'pendiente',
        novedad,
        novedadCodigo,
        novedadNombre,
        incapacidadDias,
        isSupernumerario,
        source: 'whatsapp_cloud_api',
        whatsappMessageId: messageId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: null,
        createdByEmail: null
      },
      { merge: true }
    );
  }

  await batch.commit();
  await rebuildSedeStatusForDate(fecha);
  return { attendanceId, fecha, hora, employeeId: empDoc.id };
}

async function rebuildSedeStatusForDate(fecha, opts = {}) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  if (!opts?.force && (await isDayClosed(day))) return;

  const db = admin.firestore();
  const [sedesSnap, employeesSnap, attendanceSnap, replacementsSnap, currentStatusSnap, novedadesSnap] = await Promise.all([
    db.collection('sedes').get(),
    db.collection('employees').get(),
    db.collection('attendance').where('fecha', '==', day).get(),
    db.collection('import_replacements').where('fecha', '==', day).get(),
    db.collection('sede_status').where('fecha', '==', day).get(),
    db.collection('novedades').get()
  ]);

  const sedeNameByCode = new Map();
  const plannedBySede = new Map();
  for (const s of sedesSnap.docs) {
    const row = s.data() || {};
    const code = String(row.codigo || '').trim();
    if (!code) continue;
    sedeNameByCode.set(code, String(row.nombre || '').trim() || code);
    const planned = Number(row.numeroOperarios || 0);
    plannedBySede.set(code, Number.isFinite(planned) && planned > 0 ? planned : 0);
  }

  const contractedBySede = new Map();
  for (const d of employeesSnap.docs) {
    const emp = d.data() || {};
    const sedeCodigo = String(emp.sedeCodigo || '').trim();
    if (!sedeCodigo) continue;
    if (!isEmployeeEligibleForRegistration(emp, day)) continue;
    contractedBySede.set(sedeCodigo, Number(contractedBySede.get(sedeCodigo) || 0) + 1);
  }

  const registeredBySede = new Map();
  const novedadSinReemplazoBySede = new Map();
  const replacedAttendanceKey = new Set();
  const novedadRules = buildNovedadReplacementRules(novedadesSnap.docs.map((d) => d.data() || {}));

  for (const d of replacementsSnap.docs) {
    const repl = d.data() || {};
    if (String(repl.decision || '').trim() !== 'reemplazo') continue;
    const empId = String(repl.empleadoId || '').trim();
    if (!empId) continue;
    replacedAttendanceKey.add(`${day}_${empId}`);
  }

  for (const d of attendanceSnap.docs) {
    const a = d.data() || {};
    const sedeCodigo = String(a.sedeCodigo || '').trim();
    if (!sedeCodigo) continue;
    registeredBySede.set(sedeCodigo, Number(registeredBySede.get(sedeCodigo) || 0) + 1);
    if (!sedeNameByCode.has(sedeCodigo)) {
      const sedeNombre = String(a.sedeNombre || '').trim() || sedeCodigo;
      sedeNameByCode.set(sedeCodigo, sedeNombre);
    }
    if (attendanceCountsAsAusentismo(a, String(d.id || '').trim(), replacedAttendanceKey, novedadRules)) {
      novedadSinReemplazoBySede.set(sedeCodigo, Number(novedadSinReemplazoBySede.get(sedeCodigo) || 0) + 1);
    }
  }

  const keys = new Set([...plannedBySede.keys(), ...contractedBySede.keys(), ...registeredBySede.keys()]);
  const batch = db.batch();

  for (const sedeCodigo of keys) {
    const operariosPlaneados = Number(plannedBySede.get(sedeCodigo) || 0);
    const operariosContratados = Number(contractedBySede.get(sedeCodigo) || 0);
    const operariosNoContratados = Math.max(0, operariosPlaneados - operariosContratados);
    const operariosRegistrados = Number(registeredBySede.get(sedeCodigo) || 0);
    const faltantesContratados = Math.max(0, operariosContratados - operariosRegistrados);
    const novedadSinReemplazo = Number(novedadSinReemplazoBySede.get(sedeCodigo) || 0);
    const ref = db.collection('sede_status').doc(`${day}_${sedeCodigo}`);
    batch.set(
      ref,
      {
        fecha: day,
        sedeCodigo,
        sedeNombre: sedeNameByCode.get(sedeCodigo) || sedeCodigo,
        operariosPlaneados,
        operariosContratados,
        operariosNoContratados,
        operariosRegistrados,
        faltantesContratados,
        operariosEsperados: operariosPlaneados,
        operariosPresentes: operariosRegistrados,
        faltantes: faltantesContratados,
        novedadSinReemplazo,
        source: 'whatsapp_cloud_api',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  for (const d of currentStatusSnap.docs) {
    const row = d.data() || {};
    const sedeCodigo = String(row.sedeCodigo || '').trim();
    if (!sedeCodigo) continue;
    if (keys.has(sedeCodigo)) continue;
    batch.delete(d.ref);
  }

  await batch.commit();
}

async function isDayClosed(fecha) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const snap = await admin.firestore().collection(DAILY_CLOSURES_COL).doc(day).get();
  if (!snap.exists) return false;
  const row = snap.data() || {};
  return String(row.status || '').trim() === 'closed' || row.locked === true;
}

async function markDayClosed(fecha, extra = {}) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  await admin
    .firestore()
    .collection(DAILY_CLOSURES_COL)
    .doc(day)
    .set(
      {
        fecha: day,
        status: 'closed',
        locked: true,
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...extra
      },
      { merge: true }
    );
}

async function snapshotDailyState(fecha) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { attendanceCount: 0, absenteeismCount: 0, replacementsCount: 0, sedeStatusCount: 0 };

  const db = admin.firestore();
  const [attendanceSnap, absenteeismSnap, replacementsSnap, sedeStatusSnap] = await Promise.all([
    db.collection('attendance').where('fecha', '==', day).get(),
    db.collection('absenteeism').where('fecha', '==', day).get(),
    db.collection('import_replacements').where('fecha', '==', day).get(),
    db.collection('sede_status').where('fecha', '==', day).get()
  ]);

  const rootRef = db.collection(DAILY_SNAPSHOTS_COL).doc(day);
  await rootRef.set(
    {
      fecha: day,
      snappedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await writeSnapshotSubcollection(rootRef.collection('attendance'), attendanceSnap.docs);
  await writeSnapshotSubcollection(rootRef.collection('absenteeism'), absenteeismSnap.docs);
  await writeSnapshotSubcollection(rootRef.collection('replacements'), replacementsSnap.docs);
  await writeSnapshotSubcollection(rootRef.collection('sede_status'), sedeStatusSnap.docs);

  return {
    attendanceCount: attendanceSnap.size,
    absenteeismCount: absenteeismSnap.size,
    replacementsCount: replacementsSnap.size,
    sedeStatusCount: sedeStatusSnap.size
  };
}

async function writeSnapshotSubcollection(targetColRef, docs) {
  const db = admin.firestore();
  let batch = db.batch();
  let ops = 0;
  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const d of docs || []) {
    batch.set(
      targetColRef.doc(String(d.id || '')),
      {
        ...(d.data() || {}),
        snapshotAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    ops += 1;
    if (ops >= 400) await commitBatch();
  }
  await commitBatch();
}

async function ensureAutoAttendanceWithNovedad8(fecha) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;

  const db = admin.firestore();
  const [employeesSnap, attendanceSnap, superSnap] = await Promise.all([
    db.collection('employees').get(),
    db.collection('attendance').where('fecha', '==', day).get(),
    db.collection('supernumerarios').where('estado', '==', 'activo').get()
  ]);

  const novelty = await resolveNovedadByCode('8');
  const existing = new Set(attendanceSnap.docs.map((d) => String(d.id || '').trim()));
  const superDocs = new Set();
  for (const d of superSnap.docs) {
    const row = d.data() || {};
    if (!isEmployeeActiveOnDate(row, day)) continue;
    const docNum = String(row.documento || '').trim();
    if (docNum) superDocs.add(docNum);
  }

  let pendingBatch = db.batch();
  let batchOps = 0;
  let created = 0;
  const commitBatch = async () => {
    if (batchOps === 0) return;
    await pendingBatch.commit();
    pendingBatch = db.batch();
    batchOps = 0;
  };

  for (const d of employeesSnap.docs) {
    const emp = d.data() || {};
    if (!isEmployeeEligibleForRegistration(emp, day)) continue;
    const sedeCodigo = String(emp.sedeCodigo || '').trim();
    if (!sedeCodigo) continue;

    const attendanceId = `${day}_${d.id}`;
    if (existing.has(attendanceId)) continue;

    const docNum = String(emp.documento || '').trim();
    const isSupernumerario = docNum ? superDocs.has(docNum) : false;
    if (isSupernumerario) continue;
    const hora = '23:59:00';

    pendingBatch.set(
      db.collection('attendance').doc(attendanceId),
      {
        fecha: day,
        hora,
        empleadoId: d.id,
        documento: docNum || null,
        nombre: emp.nombre || null,
        telefono: String(emp.telefono || '').trim() || null,
        sedeCodigo: sedeCodigo || null,
        sedeNombre: String(emp.sedeNombre || '').trim() || sedeCodigo || null,
        asistio: false,
        novedad: novelty.nombre,
        novedadCodigo: novelty.codigo,
        novedadNombre: novelty.nombre,
        incapacidadDias: null,
        isSupernumerario,
        source: 'auto_end_of_day',
        whatsappMessageId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    batchOps += 1;

    pendingBatch.set(
      db.collection('absenteeism').doc(attendanceId),
      {
        fecha: day,
        hora,
        empleadoId: d.id,
        documento: docNum || null,
        nombre: emp.nombre || null,
        telefono: String(emp.telefono || '').trim() || null,
        sedeCodigo: sedeCodigo || null,
        sedeNombre: String(emp.sedeNombre || '').trim() || sedeCodigo || null,
        estado: 'pendiente',
        novedad: novelty.nombre,
        novedadCodigo: novelty.codigo,
        novedadNombre: novelty.nombre,
        incapacidadDias: null,
        isSupernumerario,
        source: 'auto_end_of_day',
        whatsappMessageId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: null,
        createdByEmail: null
      },
      { merge: true }
    );
    batchOps += 1;
    created += 1;

    if (batchOps >= 400) await commitBatch();
  }

  await commitBatch();
  return created;
}

async function ensureAusentismoAssignmentsForDate(fecha) {
  const day = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;

  const db = admin.firestore();
  const [attendanceSnap, replacementsSnap, novedadesSnap] = await Promise.all([
    db.collection('attendance').where('fecha', '==', day).get(),
    db.collection('import_replacements').where('fecha', '==', day).get(),
    db.collection('novedades').get()
  ]);

  const rules = buildNovedadReplacementRules(novedadesSnap.docs.map((d) => d.data() || {}));
  const existing = new Set(replacementsSnap.docs.map((d) => String(d.id || '').trim()));
  let batch = db.batch();
  let batchOps = 0;
  let created = 0;
  const commitBatch = async () => {
    if (batchOps === 0) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const d of attendanceSnap.docs) {
    const row = d.data() || {};
    if (row.asistio === true) continue;
    if (!attendanceRequiresReplacement(row, rules)) continue;
    const empId = String(row.empleadoId || '').trim();
    if (!empId) continue;
    const replacementId = `${day}_${empId}`;
    if (existing.has(replacementId)) continue;

    batch.set(
      db.collection('import_replacements').doc(replacementId),
      {
        importId: null,
        fechaOperacion: day,
        fecha: day,
        empleadoId: empId,
        documento: String(row.documento || '').trim() || null,
        nombre: row.nombre || null,
        sedeCodigo: row.sedeCodigo || null,
        sedeNombre: row.sedeNombre || null,
        novedadCodigo: row.novedadCodigo || null,
        novedadNombre: row.novedadNombre || row.novedad || null,
        decision: 'ausentismo',
        supernumerarioId: null,
        supernumerarioDocumento: null,
        supernumerarioNombre: null,
        source: 'auto_end_of_day',
        ts: admin.firestore.FieldValue.serverTimestamp(),
        actorUid: null,
        actorEmail: null
      },
      { merge: true }
    );
    created += 1;
    batchOps += 1;
    if (batchOps >= 400) await commitBatch();
  }

  await commitBatch();
  return created;
}

function buildNovedadReplacementRules(novedadesRows = []) {
  const byCode = new Map();
  const byName = new Map();
  for (const row of Array.isArray(novedadesRows) ? novedadesRows : []) {
    const code = String(row.codigoNovedad || row.codigo || '').trim();
    const name = normalizeUserText(row.nombre);
    const repl = normalizeUserText(row.reemplazo);
    const needs = ['si', 'yes', 'true', '1', 'reemplazo'].includes(repl);
    if (code) byCode.set(code, needs);
    if (name) byName.set(name, needs);
  }
  return { byCode, byName };
}

function attendanceRequiresReplacement(attendanceRow = {}, rules = {}) {
  const code = String(attendanceRow.novedadCodigo || '').trim();
  if (code === '8') return true;
  if (code && rules?.byCode?.has(code)) return rules.byCode.get(code) === true;
  const name = normalizeUserText(baseNovedadNameForRules(attendanceRow.novedadNombre || attendanceRow.novedad));
  if (name && rules?.byName?.has(name)) return rules.byName.get(name) === true;
  return false;
}

function attendanceCountsAsAusentismo(attendanceRow = {}, attendanceId, replacedAttendanceKey = new Set(), rules = {}) {
  if (attendanceRow.asistio === true) return false;
  if (replacedAttendanceKey.has(String(attendanceId || '').trim())) return false;
  return attendanceRequiresReplacement(attendanceRow, rules);
}

function baseNovedadNameForRules(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  return raw.replace(/\s*\(.*\)\s*$/, '').trim();
}

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    return null;
  }
  if (value && typeof value.toDate === 'function') {
    return toDateOnlyIso(value.toDate());
  }
  if (value instanceof Date) return toDateOnlyIso(value);
  return null;
}

function toDateOnlyIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isEmployeeActiveOnDate(emp, day) {
  const ingreso = normalizeDateOnly(emp.fechaIngreso);
  const retiro = normalizeDateOnly(emp.fechaRetiro);
  if (ingreso && ingreso > day) return false;
  if (retiro && retiro < day) return false;
  return true;
}

function isEmployeeEligibleForRegistration(emp, day) {
  const fecha = String(day || '').trim();
  if (!fecha) return false;
  const ingreso = normalizeDateOnly(emp?.fechaIngreso);
  if (ingreso && ingreso > fecha) return false;

  const estado = String(emp?.estado || '').trim().toLowerCase();
  const retiro = normalizeDateOnly(emp?.fechaRetiro);

  if (estado === 'inactivo') {
    return Boolean(retiro && retiro >= fecha);
  }
  if (retiro && retiro < fecha) return false;
  return true;
}

async function sendWhatsAppText(to, bodyText, phoneNumberIdHint = null) {
  const toDigits = digitsOnly(to);
  if (!toDigits || !bodyText) return { ok: false, error: 'missing_to_or_body' };
  return sendWhatsAppPayload(
    toDigits,
    {
      type: 'text',
      text: { body: String(bodyText) }
    },
    phoneNumberIdHint
  );
}

async function sendWhatsAppMainOptions(to, prompt, opts = {}) {
  const phoneNumberIdHint = opts?.phoneNumberIdHint || null;
  const isSupernumerario = Boolean(opts?.isSupernumerario);
  const toDigits = digitsOnly(to);
  if (!toDigits) return { ok: false, error: 'missing_to' };
  const rows = isSupernumerario
    ? [
        { id: 'main_trabajando', title: 'TRABAJANDO' },
        { id: 'main_novedad', title: 'NOVEDAD' }
      ]
    : [
        { id: 'main_trabajando', title: 'TRABAJANDO' },
        { id: 'main_compensatorio', title: 'COMPENSATORIO' },
        { id: 'main_novedad', title: 'NOVEDAD' },
        { id: 'main_traslado', title: 'TRASLADO' }
      ];
  const interactiveResp = await sendWhatsAppPayload(
    toDigits,
    {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: String(prompt || '').trim() || 'Confirma tu opcion.' },
        footer: { text: 'Capcol - Registro Diario' },
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: 'Opciones de registro',
              rows
            }
          ]
        }
      }
    },
    phoneNumberIdHint
  );
  if (interactiveResp.ok) return interactiveResp;
  const fallbackOptions = isSupernumerario
    ? 'TRABAJANDO o NOVEDAD'
    : 'TRABAJANDO, COMPENSATORIO, NOVEDAD o TRASLADO';
  return sendWhatsAppText(
    toDigits,
    `${prompt}\nResponde una opcion: ${fallbackOptions}.`,
    phoneNumberIdHint
  );
}

async function sendWhatsAppNovedadList(to, prompt, phoneNumberIdHint = null) {
  const toDigits = digitsOnly(to);
  if (!toDigits) return { ok: false, error: 'missing_to' };
  const interactiveResp = await sendWhatsAppPayload(
    toDigits,
    {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: String(prompt || '').trim() || 'Selecciona tu novedad.' },
        footer: { text: 'Capcol - Registro Diario' },
        action: {
          button: 'Ver novedades',
          sections: [
            {
              title: 'Novedades',
              rows: [
                { id: 'nov_enfermedad_general', title: 'ENFERMEDAD GENERAL' },
                { id: 'nov_accidente_laboral', title: 'ACCIDENTE LABORAL' },
                { id: 'nov_calamidad', title: 'CALAMIDAD' },
                { id: 'nov_licencia_no_remunerada', title: 'LICENCIA NO REMUNERADA' }
              ]
            }
          ]
        }
      }
    },
    phoneNumberIdHint
  );
  if (interactiveResp.ok) return interactiveResp;
  return sendWhatsAppText(
    toDigits,
    'Por favor indica tu novedad: ENFERMEDAD GENERAL, ACCIDENTE LABORAL, CALAMIDAD o LICENCIA NO REMUNERADA.',
    phoneNumberIdHint
  );
}

async function sendWhatsAppSedeList(to, prompt, sedes, phoneNumberIdHint = null) {
  const toDigits = digitsOnly(to);
  if (!toDigits) return { ok: false, error: 'missing_to' };
  const rows = (Array.isArray(sedes) ? sedes : [])
    .filter(Boolean)
    .slice(0, 10)
    .map((s, i) => ({
      id: `sede_pick_${String(s.id || '').trim()}`,
      title: String(s.nombre || s.codigo || `SEDE ${i + 1}`).slice(0, 24),
      description: String(s.codigo || '').trim().slice(0, 72) || undefined
    }))
    .filter((r) => r.id !== 'sede_pick_');
  if (!rows.length) return { ok: false, error: 'no_rows' };
  return sendWhatsAppPayload(
    toDigits,
    {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: String(prompt || '').trim() || 'Selecciona una sede.' },
        footer: { text: 'Capcol - Registro Diario' },
        action: {
          button: 'Ver sedes',
          sections: [{ title: 'Sedes sugeridas', rows }]
        }
      }
    },
    phoneNumberIdHint
  );
}

async function sendWhatsAppPayload(toDigits, payload, phoneNumberIdHint = null) {
  const token = WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = String(phoneNumberIdHint || WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (!token || !phoneNumberId) {
    logger.error('Missing WhatsApp send credentials', {
      hasToken: Boolean(token),
      hasPhoneNumberId: Boolean(phoneNumberId)
    });
    return { ok: false, error: 'missing_whatsapp_credentials' };
  }
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      ...payload
    })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    logger.error('WhatsApp send API error', {
      status: resp.status,
      body: errText,
      requestType: payload?.type || null
    });
    return { ok: false, error: 'send_failed', status: resp.status };
  }
  return { ok: true };
}

function isValidWhatsAppSignature(req) {
  if (!WHATSAPP_APP_SECRET) return true;

  const signature = String(req.get('x-hub-signature-256') || '').trim();
  if (!signature.startsWith('sha256=')) return false;

  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}), 'utf8');

  const expected = `sha256=${crypto
    .createHmac('sha256', WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
