# Plan: Frenyer de ERP monousuario a SaaS multi-tenant real

> Estado: plan (sin cambios de código todavía). Objetivo: que varias empresas/personas se registren y operen con datos 100 % aislados, sin romper el código actual.

## 0. Diagnóstico del estado actual

Lo que **ya** es multi-tenant:
- Esquema: `organizations`, `organization_members`, `branches` con `organization_id`.
- Casi todas las tablas de negocio tienen `organization_id` (productos, clientes, ventas, bancos, CxC/CxP, gastos, anticipos, compras, inventario, tasas).
- El trigger `provision_new_auth_user_organization` (0010) crea una organización por cada usuario nuevo y lo registra como `admin`.
- La API resuelve `membershipOrgId` desde `organization_members` para usuarios autenticados con Supabase.
- RLS cerrada (0032): anon/authenticated no tienen acceso; solo `service_role`.

Lo que **sigue siendo single-tenant** (riesgo de cruce de datos):
1. `register` y `local-login` fijan `organizationId = '0000…0001'` ("Frenyer Principal") en vez de la org creada por el trigger.
2. ~100 fallbacks `|| '0000…0001'` en `api/server.ts`: si una sesión no trae org, se cae en la org compartida → posible fuga.
3. `shop_customers`, `customer_wishlist`, `customer_orders` no tienen `organization_id`: la tienda es global.
4. `profiles.role` es un rol global por usuario, no por organización.
5. Espejos locales (`organizations.json`, `loadPersistedUsers`) son de un solo tenant.
6. No hay pruebas de aislamiento ni auditoría automática de filtros por org.
7. No hay onboarding ni selección de organización activa.

Conclusión: la base de datos ya soporta multi-tenant; el trabajo está en la **capa de aplicación** (resolución de tenant, fallbacks, tienda) y en **pruebas**.

## 1. Principios no negociables

- **No se borra ni se reescribe** ningún módulo existente; solo se endurecen puntos de entrada y se añaden columnas/adaptaciones aditivas (migraciones `if not exists` / `add column if not exists`).
- **Cada fase es desplegable sola** y no rompe la anterior.
- **Compatibilidad retroactiva**: la org por defecto `0000…0001` se conserva como "organización demo/legacy"; los usuarios existentes siguen funcionando.
- **Aislamiento verificable**: una prueba automatizada debe demostrar que el tenant A no ve datos del tenant B.
- **Sin SQL arbitrario desde el cliente** (regla de Alma) y sin bypass de RLS.

## 2. Fases

### Fase 0 — Línea base y seguridad (sin cambios funcionales)
- Crear rama `feature/saas-multitenant`.
- Congelar el esquema actual (ya existe `supabase/schema_completo.sql`).
- Añadir una prueba de humo de compilación/lint/test al CI (si aplica) para detectar regresiones.
- **Entregable**: rama creada, sin tocar código.

### Fase 1 — Resolver el tenant desde la sesión (alto impacto, bajo riesgo)
Objetivo: que cada request use la organización del usuario, nunca la compartida.

Archivos: `api/server.ts` (función `resolveRequestSession`/`resolveSessionUser`, `register`, `local-login`, todos los `|| '0000…0001'`).

Cambios:
- En `register`: tras el signup, consultar `organization_members` del nuevo `user.id` y usar esa `organization_id` en `enforceSingleSessionOnLogin` y en la respuesta. Si no existe aún (trigger asíncrono), reintentar con espera corta o crear la org desde la API como fallback.
- En `local-login`: mantener la org por defecto solo para modo desarrollo; en producción (`NODE_ENV=production`) exigir un usuario real.
- Reemplazar todos los `organizationId || '0000…0001'` por `organizationId || null` y, si es `null`, responder `401/403` en vez de consultar con la org compartida.
- Añadir un helper central `requireOrganizationId(res)` que falle rápido si no hay tenant.

Riesgo: endpoints que hoy dependen silenciosamente del fallback. Mitigación: buscar y revisar cada uso (grep) antes de cambiar, y ejecutar la app completa en dev.

Verificación: login con dos usuarios distintos → cada uno ve solo sus datos.

### Fase 2 — Onboarding y selección de organización activa
Objetivo: flujo claro para el nuevo usuario.

- Pantalla de registro ya captura `companyName`; asegurar que se guarde y que el trigger lo use (ya lo hace).
- Tras el primer login, redirigir a un "asistente de inicio" (crear sucursal, caja/banco, tasa) si la org no tiene datos.
- Soporte de **varias organizaciones por usuario**: guardar `active_organization_id` en `profiles` (o en la sesión opaca) y permitir cambiarla desde el menú. El API ya toma la primera por `created_at`; cambiar a "la activa elegida por el usuario".
- Migración aditiva: `alter table public.profiles add column if not exists active_organization_id uuid references public.organizations(id)`.

Riesgo: usuarios existentes sin org activa → default a la primera membership.

### Fase 3 — Tienda (shop) multi-tenant
Objetivo: que la tienda pública sea por empresa.

Migración 0034 (aditiva):
- `alter table public.shop_customers add column if not exists organization_id uuid references public.organizations(id) on delete cascade;`
- ídem `customer_wishlist`, `customer_orders`.
- Backfill: asignar la org por defecto a las filas existentes.

Código:
- `api/server.ts`: endpoints de tienda filtran por `organization_id` (del host/subdominio o del vendedor autenticado).
- Definir cómo se identifica la tienda de una empresa: subdominio (`empresa.frenyer.com`), slug en la URL (`/tienda/:slug`) o código de tienda. Recomendación: slug en URL + tabla `organizations.slug` (único).

Riesgo: romper enlaces existentes de la tienda. Mitigación: mantener `/tienda` apuntando a la org por defecto durante un periodo de transición.

### Fase 4 — Rol por organización (RBAC real)
Objetivo: que un usuario pueda ser gerente en una empresa y cajero en otra.

- Mover el rol efectivo desde `profiles.role` a `organization_members.role`.
- Mantener `profiles.role` como "rol global máximo" por compatibilidad, pero el API debe usar `membership.role` para permisos por org.
- Migración: asegurar que `organization_members.role` tenga los mismos valores permitidos y backfill desde `profiles`.

Riesgo: endpoints que leen `profileRow.role` directamente. Mitigación: crear helper `getOrgRole(userId, orgId)` y reemplazar gradualmente.

### Fase 5 — Aislamiento verificable (pruebas)
Objetivo: demostrar que los datos no se cruzan.

- Crear script de prueba (Vitest o script Node) que:
  1. Crea dos organizaciones (A y B) con usuarios.
  2. Inserta datos en cada una (producto, cliente, venta, cuenta bancaria, CxC, anticipo).
  3. Autentica como usuario A y verifica que no aparece ningún dato de B en listados, búsquedas ni por id directo.
  4. Repite como B.
- Añadir un **auditor estático** (script que falla si algún `authenticatedSupabaseRestRequest` o `supabaseRestRequest` no incluye `organization_id=eq.` en el endpoint). Ejecutar en CI.
- Prueba de RLS directa: con la clave anon, todas las tablas deben responder `permission denied`.

### Fase 6 — Limpieza del legado single-tenant
Objetivo: eliminar caminos que asumen una sola empresa.

- Quitar el espejo `organizations.json` y `loadPersistedOrganizations` (o dejarlo solo como caché opcional).
- Eliminar `loadPersistedUsers`/`savePersistedUser` o acotarlos a modo offline.
- La org por defecto `0000…0001` se conserva pero se marca como "demo" (columna `is_demo` o simplemente se deja para usuarios legacy).
- Revisar `DashboardLayout`, `Sidebar` y páginas que lean `organizationId` del localStorage.

Riesgo: usuarios que usan modo offline. Mitigación: mantener degradación elegante.

### Fase 7 (opcional) — SaaS comercial
- Planes y suscripciones (tabla `subscriptions`, límites por org: usuarios, sucursales, productos).
- Panel de administración del SaaS (super-admin) para ver orgs, uso y soporte.
- Facturación del SaaS (Stripe/PayPal) — fuera del alcance del ERP actual.
- Invitaciones por correo para unir usuarios a una org existente.

## 3. Orden recomendado de ejecución

1. Fase 0 → 1 → 5 (primero endurecer el tenant y probar aislamiento; es lo que evita la fuga).
2. Fase 2 (onboarding) en paralelo con 3 (tienda).
3. Fase 4 (roles por org) después de que Fase 1 esté estable.
4. Fase 6 (limpieza) al final, cuando ya no haya dependencias del legado.
5. Fase 7 solo si se va a comercializar.

## 4. Lo que NO se debe hacer

- No desactivar RLS ni otorgar permisos a anon/authenticated (0032 se mantiene).
- No permitir que un endpoint acepte `organization_id` desde el cliente (siempre del servidor/sesión).
- No mezclar refactor de roles con cambios de UI en el mismo commit.
- No borrar la org por defecto hasta que no exista ningún usuario legacy apuntando a ella.

## 5. Criterio de "terminado"

- Dos usuarios registrados independientemente no pueden ver ni modificar datos del otro (prueba automatizada en verde).
- `grep "00000000-0000-0000-0000-000000000001"` en `api/server.ts` devuelve solo referencias explícitas de legacy/demo, no fallbacks silenciosos.
- La tienda pública muestra solo los productos de la empresa dueña del slug.
- `npm run build`, `npm run lint` y las pruebas de aislamiento pasan.
- RLS sigue activa y sin políticas (solo `service_role`).

## 6. Estimación gruesa

- Fase 1: 2–3 días (la más crítica).
- Fase 2: 1–2 días.
- Fase 3: 2–3 días.
- Fase 4: 2–3 días.
- Fase 5: 2 días.
- Fase 6: 1–2 días.
- Fase 7: fuera de alcance del ERP (proyecto aparte).

Total hasta "SaaS funcional y aislado": ~2 semanas de trabajo incremental, sin tocar módulos de negocio.
