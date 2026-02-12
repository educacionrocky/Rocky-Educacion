# RockyPro — **v5.2 All‑in‑One**

**Integrado completo** (como v4) + **CRUD de Dependencias** con **código automático**. Incluye:
- Login primero (pestañas Acceso/Crear cuenta)
- Centro de Permisos v2 (bloqueo de SuperAdmin, confirmaciones, auditoría before/after)
- Gestión de usuarios (cambio de rol)
- **Zonas (CRUD)** con **código automático**: `ZON-0001`, `ZON-0002`, …
- **Dependencias (CRUD)** con **código automático**: `DEP-0001`, `DEP-0002`, …
- Stubs: Sedes, Empleados, Supervisores, Import history, Nómina, Ausentismo, Reportes, Carga de datos

## Firebase
Configuración integrada (rockypro-98390) en `src/assets/js/firebase.js`.

## Reglas Firestore (desarrollo sugeridas)
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || isAdminLike());
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && (request.auth.uid == uid || isAdminLike());
    }
    match /roles_matrix/{role} { allow read: if request.auth != null; allow write: if isSuperAdmin(); }
    match /user_overrides/{uid} { allow read: if request.auth != null && (request.auth.uid == uid || isSuperAdmin()); allow write: if isSuperAdmin(); }
    match /audit_logs/{doc} { allow read, write: if isSuperAdmin(); }

    // Counters (códigos automáticos)
    match /counters/{name} { allow read, write: if isAdminLike(); }

    // Colecciones
    match /zones/{id} { allow read: if request.auth != null; allow create, update: if isAdminLike(); }
    match /dependencies/{id} { allow read: if request.auth != null; allow create, update: if isAdminLike(); }

    function isAdminLike(){
      return request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['superadmin','admin']
      );
    }
    function isSuperAdmin(){
      return request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'superadmin'
      );
    }
  }
}
```

## Rutas
- `#/login`, `#/`, `#/settings`, `#/about`, `#/notes`
- Gobierno: `#/permissions` (solo SuperAdmin)
- Administración: `#/users`, `#/zones`, `#/dependencies`, `#/sedes`, `#/employees`, `#/supervisors`
- Operación: `#/imports`, `#/import-history`, `#/payroll`, `#/absenteeism`
- Consultor: `#/reports`
- Supervisor/Empleado: `#/upload`

## Ejecutar
1) Abrir `index.html` con **Live Server**.
2) Crear cuenta / iniciar sesión (`#/login`).
3) Asignar `role` a tu usuario en `#/users` (admin o superadmin).
4) Probar `#/zones` y `#/dependencies` para ver códigos automáticos y CRUD.
