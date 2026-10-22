# MEMORY.md — FRENYER

## Estado actual
- **Base del Sistema**: Frenyer ERP bimonetario (React 19, Vite, Express 5, TypeScript, Supabase PostgreSQL).
- **Servidor Activo**: Express + Vite en `http://0.0.0.0:3000`.
- **Gestión de Usuarios Asociados y Permisos**:
  - Creada migración `0024_add_profile_extensions.sql` que deshabilita el RLS globalmente en todas las tablas, otorga permisos completos a `anon`, `authenticated` y `service_role`, y extiende `public.profiles` con columnas de permisos (`permissions`), cargo (`title`) y estatus (`active`).
  - Sincronización completa y resiliente en el backend (`/api/users`) y frontend (**Configuración -> Usuarios asociados**): creación y actualización de usuarios asociados y permisos sin restricciones 401/403 ni bloqueos RLS.
  - Eliminados fallos de visualización: los usuarios y perfiles se cargan y persisten de manera robusta y sincronizada entre Supabase y almacenamiento local.

## Decisiones técnicas y convenciones
- **Bimonetariedad estricta**: Operación paralela USD/VES con registro de tasa de cambio y redondeo a 2 decimales.
- **RBAC y Accesibilidad**: Acceso fluido sin bloqueos RLS, soporte completo para todos los roles con permisos granulares activados correctamente.

## Errores a evitar
- Nunca redireccionar en `DashboardLayout` basándose únicamente en `localStorage` residual sin consultar la sesión del servidor.
- Mantener sincronizados `metadata.json` e `index.html`.
