# RockyEDU

Plataforma de gestion operativa y administrativa para el seguimiento de servicios, personal y novedades.

## Flujo de acceso
- Pagina principal informativa: `index.html`
- Ingreso a la aplicacion: `app.html#/login`

## Modulos principales
- Login (acceso y creacion de cuenta)
- Centro de permisos
- Gestion administrativa (usuarios, zonas, dependencias, sedes, empleados, supervisores)
- Operacion (registros en vivo, historial, reemplazos, nomina, ausentismo)
- Consultas y reportes

## Firebase
Configuracion integrada en `src/assets/js/firebase.js`.
Backend en `functions/index.js` para contacto y webhook de WhatsApp Cloud API.

## Reglas Firestore
Usa el archivo `firestore.rules` como base para configurar reglas en Firebase.

## Rutas de la app
- `#/login`
- `#/`
- `#/about`
- `#/notes`
- `#/permissions`
- `#/users`
- `#/zones`
- `#/dependencies`
- `#/sedes`
- `#/employees`
- `#/supervisors`
- `#/registros-vivo`
- `#/imports-replacements`
- `#/import-history`
- `#/payroll`
- `#/absenteeism`
- `#/reports`
- `#/upload`

## Ejecucion local
1. Abrir `index.html` con Live Server.
2. Entrar a la app desde `app.html#/login`.
3. Iniciar sesion y validar modulos segun rol/permisos.

## Integracion WhatsApp Cloud API
Guia completa en `CONTACT_BACKEND_SETUP.md`.
