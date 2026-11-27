# MEMORY.md — FRENYER

## Despliegue
- `frenyer` / `frenyer.vercel.app` es el entorno de pruebas.
- `origin` / `compuflores.vercel.app` es comercial; se sincroniza solo con orden explícita del usuario (última: «sube los dos repositorios», 2026-11-10 → ambos quedan igualados con HEAD).
- Trabajar sobre la rama abierta; no publicar ni sincronizar sin autorización explícita.

## Estado y decisiones vigentes
- ERP/POS bimonetario USD/VES, multi-tenant; toda operación debe respetar organización, sucursal, tasa de cambio y redondeo monetario (2 decimales en importes y cantidades).
- Supabase exige RLS y verificación de membresía; Alma nunca ejecuta SQL arbitrario desde el cliente. Alma permanece oculto (no listo para producción).
- Autorización en servidor, sesiones por cookie httpOnly, logout con revocación real; consulta de cédula por proxy del servidor con caché y límite.
- 2026-11-10 (commit 7e12acc): cantidades decimales funcionales en todo el sistema para productos con unidad Kilogramo, Litro o Metro (y abreviaturas KG/L/MTS). Núcleo en `src/lib/inventory/units.ts` (`isDecimalUnit` normaliza acentos/abreviaturas, `roundQuantity2`, `parseQuantityInput`). Cableado: POS ventas (stepper, input 0.01, validación stock con tolerancia 0.0001), Cotizaciones (carrito + ítems cargados con `unit`), Pedidos (cantidad manual), Reporte diario de inventario (formulario de movimiento, `formQty` ahora string), Kárdex/ajustes (step 0.01) y `recordInventoryAdjustmentInSupabase` redondea stock/delta a 2 decimales. Formulario Nuevo/Editar producto y ajuste de stock de Inventario ya lo tenían.
- 2026-11-26: Módulo ANTICIPOS DE CLIENTES (migración `0033_customer_advances.sql`). Tablas `customer_advances` y `customer_advance_movements`; RPC transaccionales; API `/api/customer-advances*`; UI pestaña en CxC; reglas puras + 13 tests. Aplicar a CxC no genera ingreso bancario.
- 2026-11-27: Slug de tienda online generado dinámicamente desde `businessName` (`slugify` / `getStoreSlug`). Pantalla de inicio de sesión (`LoginPage.tsx`) compactada y redistribuida en modo PC (`100vh`) para mostrar todo en una sola pantalla sin scroll, manteniendo el centrado en tablet y móvil. Compilación y linter limpios.

## Diseño y botones
- Mantener el sistema existente: antracita/amarillo en el panel y colores propios de marca en la tienda; sin reestructurar páginas.
- Botones compartidos: Primary, Secondary, Danger y Ghost; radio 10 px, transiciones 200 ms, pulsación 0.95 y foco visible.
- 2026-11-08: componente compartido aplicado a acciones de compra de la tienda y a eliminaciones en Configuración, Bancos, Gastos, Inventario, Cotizaciones y ventas pendientes; encabezados y modales de Productos/Proveedores con amarillo corporativo.
- 2026-11-09: Reporte diario de inventario abre con periodo «Este Mes»; Reporte de Cuentas con versión móvil propia `.rep-acc-root`.
- 2026-11-09/10 — Transformación móvil completa (commits badcd84..1444f05): sistema compartido `M-SYSTEM` en globals.css (solo ≤640px, opt-in vía `m-root`; modales `.modal-container` como hoja inferior); tramo extra ≤360px `POS-S`; POS ≤640px con 3 fichas por fila y carrito ultra-compacto (6ba4ea4); navegación móvil global (MobileHeader, MobileBottomNav 5 accesos, MobileMoreSheet filtrado por permisos) en DashboardLayout, oculta topbar/sidebar ≤767px (44d9212); Dashboard y Configuración adoptan `m-root`.
- Librería móvil `src/components/mobile/` (14 componentes) creada y cableada: MobileSearchBar en Inventario, POS, CxC, CxP, Gastos, Clientes; MobileFilterSheet (Inventario, CxC, CxP, Gastos); MobileEmptyState/MobileLoadingState (Inventario, CxC, Gastos); FAB + ConfirmationDialog (Inventario); MobilePagination (Reporte inventario).
- Regla permanente en AGENTS.md: todo código nuevo debe adaptarse a móvil (320-430 px y 768 px), reutilizando `src/components/mobile/` y clases compartidas, sin desbordes ni targets <28 px. No usar PowerShell Set-Content para editar .tsx: corrompe acentos.
- Respetar `prefers-reduced-motion` y las reglas responsive existentes. Tailwind no está instalado; usar clases semánticas de `src/styles/globals.css`.

## Verificación y trampas
- Comandos: `npm run build`, `npm run lint`, `npm run test -- --run`; Vitest puede no encontrar pruebas.
- En cambios visuales revisar escritorio y móvil; evitar sustituir selectores personalizados por utilidades Tailwind.
- Build puede advertir chunks >500 kB; no cambiar el code-splitting sin tarea específica. `git push` suele reportar exit 1 por ruido de DNS/Select-String: verificar con `git fetch` + `rev-parse` del remoto.
- Mantener tasas históricas y cálculos financieros; no cambiar flujos de autorización ni migraciones core sin consultar.

## Referencias útiles
- Constitución y mapa: `02-DOCS/wiki/sdd/constitution.md`, `02-DOCS/wiki/index.md`.
- Diseño: `docs/design-system/README.md`, `DESIGN_SYSTEM.md`, `COMPONENTS_AND_PATTERNS.md`.
- Sesiones y adaptaciones móviles: `02-DOCS/wiki/features/2026-11-*`.

## RLS (2026-11-25)
- Implementado: `api/server.ts` usa SERVICE_ROLE en `supabaseServer` y en `supabaseRestRequest`; la anon queda solo para `/auth/v1`. Migración `0032_enable_rls_security.sql`: habilita RLS en todas las tablas de public, borra políticas (incluidas las `USING (true)`), revoca anon/authenticated y conserva service_role.
- PENDIENTE DEL USUARIO: esperar el despliegue de frenyer y después ejecutar la 0032 en el SQL Editor de Supabase. Si se ejecuta antes del despliegue, la app se cae.
- Riesgo abierto: fuga cross-tenant si un GET no filtra `organization_id` (auditar 1-2 días).
- Frontend sin acceso directo (cliente inerte, clave falsa); realtime muerto; `SaleDetailModal` consulta `sales` directo y probablemente no muestra ventas del POS.

## Fase 2 (Multi-tenant) - Implementada 2026-11-27
- Migración `0034_add_active_organization_id.sql`: columna `active_organization_id` en `public.profiles` (referencia a `organizations.id`, `on delete set null`).
- `api/server.ts` `resolveSessionUser`: ahora lee TODAS las membresías del usuario y usa `profiles.active_organization_id` si está seteada y el usuario es miembro de ella; de lo contrario usa la primera membresía por `created_at` (comportamiento legacy).
- `api/server.ts` nuevos endpoints: `GET /api/auth/organizations` (lista orgs del usuario con rol y cuál está activa) y `PATCH /api/auth/organization/active` (cambia org activa, valida membresía, actualiza `profiles`).
- `src/context/AuthContext.tsx`: nuevos campos `activeOrganizationId`, `userOrganizations`, `setActiveOrganization`; `bootstrapSession` extraído como `useCallback` reusable; `clearClientSession` reseta org activa.
- `src/components/ui/OrganizationSelector.tsx`: componente de selector de organización en el topbar (desplegable con todas las orgs del usuario).
- `src/layouts/DashboardLayout.tsx`: `OrganizationSelector` insertado en la barra superior entre Tienda y Cerrar Sesión.
- `src/pages/OnboardingPage.tsx`: asistente de 5 pasos (bienvenida → seleccionar org → sucursal → tasa → listo) para usuarios nuevos.
- `src/app/router/index.tsx`: ruta `/onboarding` agregada dentro de `ProtectedRoute`.

## Fase 3 (Tienda multi-tenant) - Implementada 2026-11-27
- Migración `0035_shop_multi_tenant.sql`: 
  - Columna `slug` (única) en `public.organizations`
  - Columna `organization_id` en `public.shop_customers`, `public.customer_wishlist`, `public.customer_orders` (FK a organizations, on delete cascade)
  - Backfill: asigna la organización por defecto a filas existentes sin organization_id
  - Índices en `organization_id` para las 3 tablas de tienda y en `slug` para organizations
- `api/server.ts` nuevos endpoints públicos por slug:
  - `GET /api/public/organization/:slug` — resolver organización por slug
  - `GET /api/public/config/:slug` — configuración pública de tienda por slug (nombre, RIF, teléfono, logo, etc.)
  - `GET /api/public/products/:slug` — productos filtrados por organización (vía slug)
- `src/lib/supabase/db.ts`: 
  - `fetchPublicConfigFromApi(slug?)` — acepta slug opcional para llamar al endpoint por slug
  - `fetchPublicProductsFromSupabase(slug)` — obtiene productos públicos de una organización por slug
- `src/modules/shop/pages/ShopPage.tsx`: acepta `slug` desde `useParams`; cuando hay slug, carga productos y configuración desde endpoints públicos por slug; mantien compatibilidad con `/` (tienda por defecto)
- `src/app/router/index.tsx`: ruta `/tienda/:slug` agregada (mantiene `/` para tienda por defecto/organización legacy)

## Pendiente
- 2026-11-27: Fases 2-4 código implementado y verificado (build/lint ok). Migraciones 0034/0035 aplicadas por el usuario; 0036 ya estaba aplicada. Endpoints /api/auth/organizations y /api/auth/organization/active funcionando.
- 2026-11-27: FASE 5 (aislamiento verificable): auditor estático + prueba end-to-end PASS. Fugas corregidas en `/api/products/:sku`, stock, suppliers, branches, bank-accounts, public/products, fetchReconciled*. Scripts npm: `audit:tenant`, `test:tenant-isolation`.
- 2026-11-27: FASE 6 (limpieza legado): eliminados ~30 fallbacks `|| '0000…0001'` a nivel de handler; eliminado `req.body.organizationId` en quotes; eliminado el espejo `organizations.json`; migración `0037_mark_default_org_as_demo.sql`; `GET /api/users` filtra por membresía de la org; `POST /api/users` asigna membresía. Build y lint limpios.
- 2026-11-27: Rediseño visual de la página de login (`src/pages/auth/LoginPage.tsx`) basado en la referencia HTML: layout de dos columnas (hero con título resaltado en amarillo + 3 pilares + mockup interactivo con KPIs + tarjeta flotante a la izquierda, panel de bienvenida/login/registro a la derecha), paleta zinc-900/amarillo-400, tipografía Plus Jakarta Sans, inputs redondeados, animaciones fadeInUp. Mockup con 3 vistas (Dashboard con KPIs y top productos/bajo stock, Ventas Flash con POS, Tienda Online con catálogo). Lógica de auth intacta.
- 2026-11-26: migración `0033_customer_advances.sql` APLICADA y verificada. Falta prueba funcional con datos reales (crear → aplicar → devolver) desde la UI.
- Pruebas integrales en 320/360/390/430/768 px + escritorio (bloqueadas: sesión expirada sin credenciales de prueba).
- Ejecutar migración `0032_enable_rls_security.sql` en Supabase tras despliegue de frenyer (pendiente del usuario).
- Fase 4: rol por organización (`organization_members.role` en vez de `profiles.role`).
- Fase 5: pruebas de aislamiento cross-tenant (dos organizaciones, verificar que A no ve datos de B).
- 2026-11-16 (commit 26f6a42): Módulo de FILTROS y BÚSQUEDA de movimientos en la pestaña Bancarias del Reporte de Cuentas (`AccountsReport.tsx`): tarjeta de 2 filas — (1) pestañas de periodo «Hoy / 7 días / Este mes (activa por defecto) / Mes anterior / Histórico completo» estilo píldora (`.acc-period-tabs`, fondo #f0f1f6 + activo blanco con sombra) y selector de Tipo con ícono embudo (Todos / Ingresos (+) / Egresos (-)); (2) Desde/Hasta con `<input type="date">` + ícono calendario y buscador en línea «Referencia, concepto, notas...» + botón Limpiar (aparece solo con filtros activos). Los KPI ahora responden al periodo: saldo inicial = saldo al corte − neto del periodo; saldo al corte = saldo de la cuenta − neto de movimientos posteriores al corte. «Histórico completo» = comportamiento anterior. Fechas comparadas con clave local AAAA-MM-DD (no ISO UTC, desfase UTC-4). Cambiar fecha manual marca periodo «custom». CxC/CxP conservan su buscador simple. CSS: `.acc-filters*` con bloques ≤767px (periodo a ancho, fechas en par, búsqueda completa) y ≤360px (un punto menos). Build y lint limpios. Ambos repos sincronizados.
- 2026-11-16 (commit 9b146aa): CORRECCIÓN bimonetaria del Reporte de Cuentas (pestaña Bancarias): `bank_accounts.balance` y `bank_movements.amount` están en la MONEDA de la propia cuenta (USD o VES; todos los flujos convierten antes de guardar, `rate` es solo auditoría) y el reporte pintaba todo como dólares. Ahora cada cuenta se muestra en su moneda (chips, KPI, cronología, encabezados Débito/Crédito/Saldo), el equivalente usa la tasa del propio movimiento (si ≤1, la vigente; sin doble conversión), la comisión de egresos entra en el saldo corrido y en el saldo inicial reconstruido, y el Excel incluye moneda/comisión/equivalente. CxC/CxP auditados: `total_usd`/`balance_usd` son USD reales, sin cambios. Caso borde: comisiones Porcentuales viejas vía fallback podrían duplicarse en el saldo inicial reconstruido (aceptado salvo reporte). Build y lint limpios. Ambos repos sincronizados.
- 2026-11-16 (commit 2fa6a97): REESTRUCTURA del Reporte de Cuentas (`AccountsReport.tsx`, ruta `/cuentas/reporte` intacta): título «Reporte de Cuentas» en una línea en móvil; tres pestañas (Bancarias con chips de cuenta + KPI saldo inicial/ingresos/egresos/saldo al corte + cronología con saldo corrido; CxC con KPI y consolidado por cliente + «Ver estado» desplegable; CxP análogo por proveedor); datos de `/api/bank-accounts|bank-movements|accounts-receivable|accounts-payable` + `/api/bcv/rates`; Excel por pestaña. Móvil con fichas nuevas y tramo ≤360px un punto menos. Build y lint limpios. Ambos repos sincronizados.
- 2026-11-16 (commit aac6168): Móvil — Ganancias y Pérdidas compactada (bloque final `pnl-root` ≤640px: membrete ceñido, h1 13.5px, botones 28px; selector de periodo en cuadrícula 2x2 sin etiqueta; KPI 2 por fila con el tercero a ancho completo, valor 14px y equivalente oculto; fichas bimonetarias ceñidas; consejo gerencial compacto; tramo ≤360px con un punto menos: botones 26px/9.5px, KPI 12.5px). Tabla de gastos con clase estable `pnl-exp-table` (ficha propia: categoría · USD · %; la regla vieja `table:nth-of-type(2)` nunca aplicaba porque cada tarjeta tiene una sola tabla). CONSEJO GERENCIAL dinámico: menciona el periodo activo, ventas, margen bruto, % que consumen los gastos operativos del margen, neto en bolsillo y estado (verde o pérdidas); mensajes propios de carga y de periodo sin ventas. Build y lint limpios. Ambos repos sincronizados.
- 2026-11-13 (commit 74b0d95): Móvil — (1) Cotizaciones compactadas (bloque final `cot-root` en globals.css: cabecera con logo 28px y título 14px, botones 28px; KPI 2 por fila con número 15px e icono 26px; toolbar de filtros apilada a ancho completo con controles 30px; fichas de tabla ceñidas a folio·monto [acciones]/cliente·estado, ocultando Bs/tasa, documento y teléfono; tramo ≤360px aún más ceñido). (2) Reporte diario: cabecera móvil SIN título (h1 oculto ≤640px, commit 3ad6f4b elimina el ensayo «Movimientos» a pedido del usuario); solo los botones Mov./Sinc/Exportar en línea horizontal; escritorio conserva «Reporte Diario de Inventario». Build y lint limpios. Ambos repos sincronizados.
- 2026-11-13 (commit c33b594): Facturas en espera PERSISTIDAS en Supabase (tabla nueva `parked_invoices`, migración `0031_parked_invoices.sql`: organization_id, control_number único por organización, ítems jsonb, RLS según patrón 0028). `db.ts` agrega fetch/create/delete por control_number+org. Sales.tsx: carga en `loadSupabaseData` (mapea control_number→id), creación al colocar en espera, borrado al recuperar o descartar; degrada con aviso si la tabla no existe. PENDIENTE: el usuario debe ejecutar la migración 0031 (o el bundle de `/api/supabase/migrations-bundle`) en el SQL Editor de Supabase — no se aplica automáticamente. Build y lint limpios. Ambos repos sincronizados.
- 2026-11-13 (commit 545c96f): Ventas — facturas/pedidos en espera (FACT. PEND.) identificados por nombre del cliente + número de control secuencial del propio POS: `id` ahora es `ESP-001, ESP-002, …` (máximo existente + 1, antes últimos 4 dígitos del timestamp); si no hay cliente registrado se guarda «Cliente sin registrar» (al recuperar el carrito, ese texto no se pega como nombre). El modal de espera incluye buscador por nombre o número de control y cada ítem muestra la insignia `ESP-###`; toasts de guardar/recuperar mencionan nombre + control. Las facturas en espera siguen siendo de sesión (en memoria, no en Supabase). Build y lint limpios. Ambos repos sincronizados.
- 2026-11-13 (commits 45f5ff5, 63278fa, de92a50): Cobranza móvil compactada (pasos 2-3 con clases estables `pos-paymode-grid`/`pos-multiabonos-hint`, sin selectores frágiles); consulta de cédula en POS verifica la base de clientes (doc normalizado, tolera dígito verificador del RIF): si existe la base manda, si no `ConfirmationDialog` pregunta «¿Deseas guardarlo?» y lo crea vía `createCustomerInSupabase`.
- 2026-11-13 (commit 9b51576): Ambos repos sincronizados en el mismo SHA. Nota: los cambios del 12/11 (sesión única/iframe, optimización API, unificación móvil 767px) se habían subido a `frenyer` en 4 commits en inglés desde otra sesión sin commit local; se realineó `main` sobre `frenyer`, se limpiaron marcadores de plantilla `<TOOL>` de `.env.example` y `origin` (compuflores) se actualizó con force-with-lease. rsc actualizado a 4.1.8 (sync opencode; `.rsc.json`/`.gitignore` de harness commiteados aparte). Fallas intermitentes de DNS (`Could not resolve host: github.com`) al empujar: reintentar tras verificar `Resolve-DnsName github.com`.
- 2026-11-10/12: Adaptación móvil completada en Kárdex (`mov-*` + `MobilePagination`), Producto (`MobileFormSection`), Proveedor/CxP (1 columna ≤640px), Reporte de Ventas y PyG (`MobileEmptyState`); optimización de arranque y API (`api/server.ts`, `db.ts`): Keep-Alive hacia Supabase, sesión paralela, cachés de modo/tasa/organización, `/api/dashboard/summary` paralelo.
