<<<<<<< HEAD
# RockyEDU v1.0.1.

automatico. Incluye:
- Login primero (pestanas Acceso/Crear cuenta)
- Centro de Permisos v2 (bloqueo de SuperAdmin, confirmaciones, auditorÃ­a before/after)
- Gestion de usuarios (cambio de rol)
- **Zonas (CRUD)** con **codigo automatico**: `ZON-0001`, `ZON-0002`, â€¦
- **Dependencias (CRUD)** con **cÃ³digo automÃ¡tico**: `DEP-0001`, `DEP-0002`, â€¦
- Stubs: Sedes, Empleados, Supervisores, Import history, NÃ³mina, Ausentismo, Reportes, Carga de datos

## Firebase
Configuración integrada (educacion-rocky) en `src/assets/js/firebase.js`.

## Reglas Firestore (desarrollo sugeridas)
Consulta y pega el contenido de `firestore.rules` en la consola de Firestore.

## Rutas
- `#/login`, `#/`, `#/settings`, `#/about`, `#/notes`
- Gobierno: `#/permissions` (solo SuperAdmin)
- AdministraciÃ³n: `#/users`, `#/zones`, `#/dependencies`, `#/sedes`, `#/employees`, `#/supervisors`
- OperaciÃ³n: `#/imports`, `#/import-history`, `#/payroll`, `#/absenteeism`
- Consultor: `#/reports`
- Supervisor/Empleado: `#/upload`

## Ejecutar
1) Abrir `index.html` con **Live Server**.
2) Crear cuenta / iniciar sesiÃ³n (`#/login`).
3) Asignar `role` a tu usuario en `#/users` (admin o superadmin).
4) Probar `#/zones` y `#/dependencies` para ver cÃ³digos automÃ¡ticos y CRUD.
=======
# Rocky-Educacion
>>>>>>> 690e2e041413ab6b065332a8eb1c01e742fba46d
