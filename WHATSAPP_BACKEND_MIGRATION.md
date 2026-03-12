# Migracion del webhook de WhatsApp fuera de Firebase

## Estado actual
- Ya existe una base inicial de backend en `whatsapp-backend/src/server.js:1`.
- Este backend:
  - verifica el webhook de Meta
  - valida la firma `x-hub-signature-256`
  - recibe mensajes y estados
  - guarda eventos en `public.whatsapp_incoming`

## 1. Crear tablas en Supabase
- Ejecuta `supabase/schema_whatsapp_phase4.sql:1` en `SQL Editor`.

## 2. Preparar variables de entorno
- Copia `whatsapp-backend/.env.example:1` como `.env`.
- Completa:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WHATSAPP_VERIFY_TOKEN`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_APP_SECRET`

## 3. Instalar y correr localmente
- Entra a `whatsapp-backend`
- Ejecuta:

```bash
npm install
npm run dev
```

- El backend quedara escuchando por defecto en `http://localhost:8787`

## 4. Exponer el webhook
- Para pruebas locales, expone el puerto con tu herramienta habitual (`ngrok`, `cloudflared`, etc.).
- La URL del webhook debe quedar asi:
  - `GET /webhooks/whatsapp` para verificacion
  - `POST /webhooks/whatsapp` para eventos

## 5. Configurar Meta
- En tu app de Meta / WhatsApp Cloud API:
  - actualiza la URL del webhook
  - usa el mismo `WHATSAPP_VERIFY_TOKEN`
- Una vez guardado, Meta validara por `GET`.

## 6. Que ya queda resuelto
- Salida del webhook fuera de Firebase.
- Persistencia inicial de eventos entrantes en Supabase.

## 7. Que sigue despues
- Portar el procesador conversacional que hoy vive en `functions/index.js`
- Reemplazar lecturas Firestore por Supabase:
  - sesiones
  - empleados
  - sedes
  - novedades
  - asistencias
  - incapacidades
- Conectar envio de respuestas a Meta desde este backend

## 8. Nota importante
- Esta fase saca el webhook de Firebase, pero todavia no migra toda la logica conversacional.
- El siguiente bloque de trabajo sera portar el flujo de negocio de WhatsApp sobre este backend.
