# Backend Setup: Contacto + WhatsApp Cloud API

Este documento deja el proyecto listo para operacion en productivo con WhatsApp Cloud API.

## 1) Instalar dependencias

```powershell
cd "C:\Users\deiby\OneDrive\Documentos\RockyEducacion\functions"
npm install
```

## 2) Configurar variables en `functions/.env`

Crea `functions/.env` a partir de `functions/.env.example`:

```dotenv
BREVO_API_KEY=tu_api_key_de_brevo
CONTACT_TO_EMAIL=capcol@capcol.com.co
CONTACT_FROM_EMAIL=capcol@capcol.com.co

WHATSAPP_VERIFY_TOKEN=token_privado_para_webhook
WHATSAPP_ACCESS_TOKEN=token_cloud_api
WHATSAPP_PHONE_NUMBER_ID=1043552115502719
WHATSAPP_WABA_ID=1647710306238306
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_APP_SECRET=app_secret_de_meta
```

Notas:
- `functions/.env` no se sube a Git.
- Usa un token nuevo si uno quedó expuesto.

## 3) Desplegar Functions + Hosting

```powershell
cd "C:\Users\deiby\OneDrive\Documentos\RockyEducacion"
firebase deploy --only functions,hosting --project educacion-rocky
```

## 4) Configurar webhook en Meta (productivo)

Endpoint:
- `Callback URL`: `https://<tu-dominio>/api/whatsapp/webhook`
- `Verify Token`: el mismo `WHATSAPP_VERIFY_TOKEN`

Suscribe estos campos del objeto WhatsApp:
- `messages`
- `message_template_status_update` (opcional)
- `message_status` (si aparece en tu panel)

Validación:
- Meta llama `GET /api/whatsapp/webhook` con `hub.challenge`
- La función responde 200 con el challenge cuando el token coincide.

## 5) Probar flujo end-to-end

1. Enviar plantilla `hello_world` al número de prueba.
2. Confirmar documentos en Firestore:
   - `whatsapp_incoming` (entradas y estados)
   - `whatsapp_sessions` (estado de conversación)
   - `attendance` y `absenteeism` (cuando aplique)

## 6) Paso a productivo

1. Verificar negocio en Meta Business.
2. Pasar app de Meta a `Live`.
3. Cambiar a token permanente (System User).
4. Mantener `WHATSAPP_APP_SECRET` configurado para validar firma del webhook.
5. Aprobar y usar plantillas para conversaciones iniciadas por empresa.

## 7) Seguridad mínima recomendada

- Rotar token si fue compartido.
- No exponer credenciales en frontend.
- Mantener todo envío y recepción en Cloud Functions.
