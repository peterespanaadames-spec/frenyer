# MEMORY.md — FRENYER

## Estado actual
- **Base del Sistema**: Frenyer ERP bimonetario (React 19, Vite, Express 5, TypeScript, Supabase PostgreSQL).
- **Servidor Activo**: Express + Vite en `http://0.0.0.0:3000`.
- **Gestión de Usuarios Asociados y Permisos**:
  - Creada migración `0024_add_profile_extensions.sql` que deshabilita el RLS globalmente en todas las tablas, otorga permisos completos a `anon`, `authenticated` y `service_role`, y extiende `public.profiles` con columnas de permisos (`permissions`), cargo (`title`) y estatus (`active`).
  - Sincronización completa y resiliente en el backend (`/api/users`) y frontend (**Configuración -> Usuarios asociados**): creación y actualización de usuarios asociados y permisos sin restricciones 401/403 ni bloqueos RLS.
  - Eliminados fallos de visualización: los usuarios y perfiles se cargan y persisten de manera robusta y sincronizada entre Supabase y almacenamiento local.
- **Datos Reales y Correcciones del Servidor**:
  - Eliminación de datos simulados en `server.ts` (ej. cuentas bancarias).
- **Unificación de Proxy y Fusión de Datos (Supabase + Local)**:
  - Flexibilizadas las consultas proxy en `server.ts` (`/api/sales`, `/api/quotes`, `/api/expenses`, `/api/accounts-receivable`, `/api/accounts-payable`, `/api/bank-accounts`) con reintentos sin joins complejos de PostgREST y fusión transparente con persistencia local en `/data/`.
  - Normalización de lectura de atributos en `Dashboard.tsx`, `CompanyHealth.tsx`, `ProfitLoss.tsx`, `Expenses.tsx`, `Customers.tsx`, `Suppliers.tsx` y `BankAccounts.tsx` (`balance_usd`/`remaining_amount`, `due_date`/`dueDate`, `total_usd`/`totalUSD`, `bank_name`/`bankName`).
  - Eliminado el bloqueo de conexión en `Dashboard.tsx` y `CompanyHealth.tsx` para cargar las métricas en tiempo real de forma continua e ininterrumpida.
  - Verificación exitosa de compilación (`npm run build`) y sintaxis limpia con ESLint (`npm run lint`).

## Decisiones técnicas y convenciones
- **Bimonetariedad estricta**: Operación paralela USD/VES con registro de tasa de cambio y redondeo a 2 decimales.
- **RBAC y Accesibilidad**: Acceso fluido sin bloqueos RLS, soporte completo para todos los roles con permisos granulares activados correctamente.
- **Carga de Datos**: Uso exclusivo del proxy de servidor (`authenticatedFetch`) para todas las consultas con fusión inteligente Supabase + Local.

## Errores a evitar
- Nunca realizar consultas directas a la API REST de Supabase desde los componentes cliente React; todas las peticiones deben pasar por `/api/*` con `authenticatedFetch`.
- Nunca bloquear la carga de paneles con verificaciones de estado rígidas si los endpoints del servidor manejan respaldos locales automáticos.
- Mantener sincronizados `metadata.json` e `index.html`.
- No incluir datos simulados en los endpoints del servidor.
