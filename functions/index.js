const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const DEFAULT_TO_EMAIL = 'capcol@capcol.com.co';
const DEFAULT_FROM_EMAIL = 'capcol@capcol.com.co';

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
