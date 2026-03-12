import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { supabaseAdmin } from './supabase.js';

const app = express();
app.use(express.json({
  verify(req, _res, buf) {
    req.rawBody = buf;
  }
}));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/webhooks/whatsapp', (req, res) => {
  const mode = String(req.query['hub.mode'] || '').trim();
  const token = String(req.query['hub.verify_token'] || '').trim();
  const challenge = String(req.query['hub.challenge'] || '').trim();
  if (mode === 'subscribe' && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Forbidden');
});

app.post('/webhooks/whatsapp', async (req, res) => {
  try {
    if (!isValidWhatsAppSignature(req)) {
      res.status(401).json({ ok: false, error: 'Invalid signature' });
      return;
    }

    const payload = req.body || {};
    if (payload.object && payload.object !== 'whatsapp_business_account') {
      res.status(400).json({ ok: false, error: 'Unsupported webhook object' });
      return;
    }

    let stored = 0;
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};
        const phoneNumberId = String(metadata.phone_number_id || '').trim() || null;
        const displayPhoneNumber = String(metadata.display_phone_number || '').trim() || null;

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          const messageId = String(msg?.id || '').trim();
          if (!messageId) continue;
          const row = {
            id: messageId,
            source: 'whatsapp_cloud_api',
            event_type: 'message',
            message_id: messageId,
            wa_from: String(msg?.from || '').trim() || null,
            wa_timestamp: String(msg?.timestamp || '').trim() || null,
            wa_type: String(msg?.type || '').trim() || 'unknown',
            text_body: extractIncomingText(msg),
            phone_number_id: phoneNumberId,
            display_phone_number: displayPhoneNumber,
            raw_payload: msg,
            process_status: 'pending'
          };
          const { error } = await supabaseAdmin.from('whatsapp_incoming').upsert(row, { onConflict: 'id' });
          if (error) throw error;
          stored += 1;
        }

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          const statusId = String(status?.id || '').trim();
          if (!statusId) continue;
          const row = {
            id: `status_${statusId}_${String(status?.status || 'unknown').trim()}`,
            source: 'whatsapp_cloud_api',
            event_type: 'status',
            message_id: statusId,
            wa_from: String(status?.recipient_id || '').trim() || null,
            wa_timestamp: String(status?.timestamp || '').trim() || null,
            wa_type: 'status',
            text_body: null,
            phone_number_id: phoneNumberId,
            display_phone_number: displayPhoneNumber,
            raw_payload: status,
            process_status: 'ignored'
          };
          const { error } = await supabaseAdmin.from('whatsapp_incoming').upsert(row, { onConflict: 'id' });
          if (error) throw error;
          stored += 1;
        }
      }
    }

    res.status(200).json({ ok: true, stored });
  } catch (error) {
    console.error('whatsapp webhook error', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

export default app;

function extractIncomingText(message = {}) {
  if (message?.text?.body) return String(message.text.body).trim();
  if (message?.button?.text) return String(message.button.text).trim();
  if (message?.interactive?.button_reply?.title) return String(message.interactive.button_reply.title).trim();
  if (message?.interactive?.list_reply?.title) return String(message.interactive.list_reply.title).trim();
  return '';
}

function isValidWhatsAppSignature(req) {
  if (!config.whatsappAppSecret) return true;
  const signature = String(req.get('x-hub-signature-256') || '').trim();
  if (!signature.startsWith('sha256=')) return false;
  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const expected = `sha256=${crypto.createHmac('sha256', config.whatsappAppSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
