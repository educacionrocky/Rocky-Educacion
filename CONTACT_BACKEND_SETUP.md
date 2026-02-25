# Contacto automatico con Firebase Functions (modo temporal sin Secret Manager)

## 1) Instalar dependencias del backend

```powershell
cd "C:\Users\deiby\OneDrive\Documentos\RockyEducacion\functions"
npm install
```

## 2) Configurar variables de entorno locales para Functions

Crear archivo `functions/.env` usando `functions/.env.example` como base:

```dotenv
BREVO_API_KEY=tu_api_key_de_brevo
CONTACT_TO_EMAIL=capcol@capcol.com.co
CONTACT_FROM_EMAIL=capcol@capcol.com.co
```

Importante: `functions/.env` esta ignorado por Git para no subir credenciales.

## 3) Desplegar Functions + Hosting

```powershell
cd "C:\Users\deiby\OneDrive\Documentos\RockyEducacion"
firebase deploy --only functions,hosting --project educacion-rocky
```

## 4) Resultado esperado

- El formulario `Contacto` envia `POST /api/contact`.
- Hosting redirige a la Function `sendContactEmail`.
- La Function:
  - guarda el registro en Firestore (`contact_submissions`)
  - envia correo automatico a `capcol@capcol.com.co`.

## Seguridad y Firestore

No se deben poner credenciales de Firestore en frontend.
En el backend (Cloud Functions) se usa `firebase-admin` con la identidad del proyecto, sin exponer llaves en cliente.

## Nota para produccion

Este modo es temporal. Al migrar a Blaze, se recomienda volver a Secret Manager para `BREVO_API_KEY`.
