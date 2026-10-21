# Configuración

## Descripción

Panel de administración para configurar los parámetros del negocio, el almacén, la gestión de
usuarios y la auditoría. Es la pantalla más grande del ERP (3 418 líneas) y concentra el perfil
del negocio que se propaga a todos los membretes de las exportaciones.

## Estructura Actual

- **Ubicación**: `src/modules/alma/pages/Config.tsx` (3 418 líneas)
- **Ruta**: `/configuracion` — visible en el menú solo si el usuario tiene el permiso
  `usuarios` (`Sidebar.tsx:293-306`).
- **Componentes relacionados**: `src/components/modals/ManualBcvRateModal.tsx`,
  `src/components/modals/SupabaseConnectionModal.tsx`.

- **Endpoints principales**:
  `GET/POST/PATCH/DELETE /api/users`, `POST /api/users/:id/toggle-status`,
  `GET/POST/PATCH/DELETE /api/branches`, `GET/POST/PATCH/DELETE /api/payment-methods`,
  `GET /api/exchange-rates/history`, `GET /api/bcv/rates`, `POST /api/bcv/rates/manual`.

## Funcionalidades Clave

### Pestaña 1 — Negocio

- Identidad fiscal: razón social, RIF, eslogan, dirección, correo, teléfono, WhatsApp.
- Logo y favicon (con espacio de carga y vista previa).
- Métodos de pago de la organización.
- **Historial de tipos de cambio** (`GET /api/exchange-rates/history`).
- **Tasa BCV manual** (`ManualBcvRateModal`): fija la tasa vigente, admite **tasa futura** con
  fecha valor y notas, y queda registrada en `exchange_rates`.

El perfil se guarda en `localStorage.frenyer_business_profile` y se propaga mediante
`frenyer:business-profile-updated` a todas las pantallas y a los membretes de exportación.

### Pestaña 2 — Almacén

CRUD de sedes (sucursales) con: código, nombre, dirección, teléfono, estado y **número de cajas**
(`cash_registers`).

### Pestaña 3 — Usuarios asociados

- Alta, edición, baja y cambio de estado de los usuarios del ERP.
- **Matriz de permisos** con las claves `ventas`, `inventario`, `finanzas`, `reportes`, `usuarios`
  (`Config.tsx:2646`).
- Traducción de roles a la interfaz con `normalizeRoleForUi` (`:63-69`).

| En la base de datos | En la interfaz |
|---|---|
| `gerente` | `Manager` |
| `administrador` | `Admin` |
| `cajero` | `Cashier` |
| `cliente` | `Viewer` |

### Pestaña 4 — Auditoría

Consulta de auditoría de cuentas y del estado de la base de datos.

## Modelo de usuario

El alta combina **dos fuentes**:

| Fuente | Guarda | Precedencia |
|---|---|---|
| `public.profiles` (Supabase) | `full_name`, `email`, `role` | subordinada |
| `data/users.json` (local) | `role`, `title`, `active`, `permissions` | **dominante** |

> ℹ️ `profiles` solo tiene `id, full_name, email, role, created_at`, y su `role` admite
> únicamente `gerente | administrador | cajero | cliente`.

**Alta de un usuario con acceso a Supabase:**
1. `auth.signUp` con la contraseña ⇒ Supabase Auth genera el `id` real.
2. Se inserta o actualiza `profiles` con ese `id` y el rol traducido con `toProfileRole()`.
3. Se escribe el registro local en `data/users.json`.

> 🚫 **Nunca inventar el `id`.** La FK `profiles.id → auth.users.id` lo rechaza y el trigger de
> Auth crea la fila con su propio id, dejando al usuario **duplicado** en el listado.

## Guía de Reestructuración / Mantenimiento

- **Los cambios en configuración son sensibles: siempre incluir validación en el servidor.**
- **La auditoría debe ser inmutable y registrarse en tiempo real.**
- **Tasa manual:** solo los roles autorizados pueden fijarla
  (`admin`, `administrador`, `superadmin`, `gerente`, `gerente general`, `manager`, `owner`).
  El modal comprueba el rol contra `GET /api/auth/session` y bloquea a los demás.
- **Al guardar el perfil del negocio**, llama a `saveBusinessProfile()` de
  `src/lib/businessProfile.ts`: actualiza el `<link rel="shortcut icon">` y emite el evento
  `frenyer:business-profile-updated`.
- **Al tocar `profiles.role`**, tradúcelo siempre con `toProfileRole()`. El CHECK de la base de
  datos rechaza en silencio los valores fuera del conjunto de 4.
- **`Config.tsx` está cerca del límite de lo mantenible.** Si hay que añadir una pestaña
  significativa, extrae la pestaña a su propio componente dentro de `src/modules/alma/`.
- **Cuidado con el `SupabaseConnectionModal`:** es de **solo lectura**. Ya no pide ni guarda
  credenciales. No reintroducir esa funcionalidad.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `POST /api/users` es **público** ⇒ cualquiera crea usuarios del ERP (y de Supabase Auth con contraseña) | `server.ts:4390` | 🔴 |
| 2 | `POST /api/users/:id/toggle-status` es **público** ⇒ cualquiera desactiva cuentas | `server.ts:4562` | 🔴 |
| 3 | `auth.admin.createUser` / `updateUserById` se invocan sobre el cliente **anon** ⇒ fallan con una anon key real | `server.ts:180-185` (nunca invocado) | 🟠 |
| 4 | `branches` **no tiene aislamiento de tenant** | `0015:49-52` | 🔴 |
| 5 | La tasa manual **nunca se aplica** a la tasa en memoria | `server.ts:774-848` | 🟠 |
| 6 | La lista de roles de la tasa manual **omite `administrador`** | `server.ts:778` | 🟠 |
| 7 | `AuthContext.resolveProfile` usa por defecto los permisos `['compras']` ⇒ el usuario ve el menú casi vacío | `AuthContext.tsx:86` | 🟠 |
| 8 | `Config.tsx` tiene 3 418 líneas en un solo archivo | `src/modules/alma/pages/Config.tsx` | 🟡 |
| 9 | `GET /api/branches` **sobrescribe** `data/branches.json` con el resultado de Supabase | `server.ts:4070` | ⚪ |
| 10 | `branches.code` es nullable en la práctica ⇒ códigos duplicados | `0015:23` | ⚪ |
| 11 | `branches.address` no existe en ninguna migración | `0002:30` (no-op) | 🟠 |

## Referencias

- [API — usuarios y administración](architecture/API.md#2-usuarios-y-administración--apiusers-apadminusers)
- [API — tasas BCV](architecture/API.md#3-tasas-de-cambio-bcv--apibcv-apiexchange-rates)
- [Reglas de negocio §10 (configuración), §11 (autorización)](architecture/BUSINESS_RULES.md)
- [Seguridad §3 (autenticación), §4 (autorización)](architecture/SECURITY.md)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
