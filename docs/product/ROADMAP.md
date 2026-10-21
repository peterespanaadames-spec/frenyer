# Roadmap — Frenyer ERP

> Estado actual, deuda técnica priorizada y plan de trabajo.
> Verificado en la revisión de octubre 2026.

---

## 1. Madurez del producto

```
Fundación ──► Multiempresa/RLS ──► Catálogos/CRM ──► Inventario ──► POS
                                                              │
                        ┌─────────────────────────────────────┘
                        ▼
        Finanzas/CxC/CxP ──► Reportes ──► Alma ──► Importaciones/Integraciones
                                                     ──► PWA/Producción
```

| Etapa | Estado |
|---|---|
| Fundación | ✅ Hecha — monorepo modular, Design System, servidor Express |
| Multiempresa / RLS | ⚠ **Parcial** — el modelo existe, pero 13 de 30 tablas perdieron el aislamiento |
| Catálogos / CRM | ✅ Hecha — productos, clientes, proveedores |
| Inventario | ✅ Hecha — catálogo, compras, kárdex, reporte diario |
| POS | ⚠ **Parcial** — la interfaz funciona, pero la venta no se persiste |
| Finanzas / CxC / CxP | ✅ Hecha — tesorería, cuentas, gastos |
| Reportes | ⚠ **Parcial** — los reportes que leen de Supabase desde el navegador fallan |
| Alma | 🔴 No iniciada |
| Importaciones / Integraciones | ⬜ No iniciada |
| PWA / Producción | 🔴 Bloqueada por los defectos críticos de la lista siguiente |

---

## 2. Antes de producción — bloqueantes

Ninguna de estas tareas es opcional. Están detalhadas en
[KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md).

| # | Tarea | Problema | Esfuerzo |
|---|---|---|---|
| 1 | Corregir `app.get('*')` → `app.get('/{*splat}')` | El servidor **no arranca** en producción | 5 min |
| 2 | Corregir el mojibake de `server.ts`, `README.md`, `metadata.json`, `index.html` | 61 textos con acentos corruptos | 1 h |
| 3 | Aplicar la tasa manual a `lastCertifiedRate` | Las ventas no usan la tasa que el usuario fija | 30 min |
| 4 | Proteger `POST /api/users` y `POST /api/users/:id/toggle-status` | Cualquiera crea y desactiva usuarios | 15 min |
| 5 | Proteger `/api/inventory/*` | Cualquiera lee el kárdex y escribe stock | 15 min |
| 6 | Eliminar o proteger `/api/debug/*` | Dos endpoints vuelcan la tesorería | 15 min |
| 7 | Restringir las 13 tablas con `allow_all_*` | Fuga de datos entre tenants | 3-5 días |
| 8 | Migrar los 10 módulos que usan el cliente Supabase inerte a `/api/*` | **Las ventas y los reportes no persisten** | 1 semana |
| 9 | Habilitar `trust proxy` | Se puede evadir el rate limit falseando la IP | 15 min |
| 10 | Unificar los tres vocabularios de rol | Un `administrador` no puede fijar la tasa; sin membresía ⇒ admin | 1 día |

**Estimación total: ~2,5 semanas** de trabajo focalizado.

---

## 3. Iteración 1 — Desbloquear y pulir

> Objetivo: que la aplicación sea **usable de punta a punta** y que ningún texto se vea roto.

- [ ] Corregir el arranque en producción (P-01)
- [ ] Corregir el mojibake (P-05)
- [ ] Aplicar la tasa manual (P-06)
- [ ] Quitar las cifras de negocio inventadas: 45 % / 55 % de costo de ventas, `MOCK_PAYABLES`,
      la tasa inicial `36.5`, `"CAJA ABIERTA (#77138)"` y `"Sucursal Principal"` (P-22)
- [ ] Quitar la etiqueta "Ventas (7 días)" o aplicar el filtro real en el panel (P-22)
- [ ] Sustituir la sede de ejemplo `"Tienda Bella Vista (SP-01)"` por la sede activa (P-22)
- [ ] Añadir el `@keyframes spin` para que los spinners giren (P-18)
- [ ] Unificar la familia `.auth-*` (P-19)
- [ ] Reescribir `AuthCallback.tsx` y `SaleDetailModal.tsx` con clases semánticas (P-17)
- [ ] Añadir un manejador de errores JSON global (P-26)
- [ ] Estandarizar los códigos de respuesta de la API (P-25)

---

## 4. Iteración 2 — Cerrar la superficie expuesta

> Objetivo: que la API sea segura por construcción.

- [ ] Migrar las 13 tablas abiertas a políticas por organización (P-04)
- [ ] Restringir las FKs que bloquean operaciones legítimas (P-12)
- [ ] Estandarizar los estados de pago en `PAGADO` y migrar los datos (P-13)
- [ ] `cors()` con `credentials: true` y origen explícito (P-11)
- [ ] Token CSRF de doble envío en los métodos mutantes (P-23)
- [ ] `sessionCache` con expulsión (P-24)
- [ ] Unificar los roles: una sola fuente de verdad (P-07)
- [ ] Añadir índices de tenant a `bank_accounts`, `payment_methods`, `bank_movements` y
      `accounts_receivable` (P-27)
- [ ] Reescribir el historial del repositorio para eliminar la PII (P-29)

---

## 5. Iteración 3 — Persistencia correcta

> Objetivo: que **toda** la información del ERP se guarde y se lea desde un único sitio.

- [ ] Crear `POST /api/sales` y migrar `recordSaleInSupabase` a la vía del servidor (P-02)
- [ ] Crear `GET /api/exchange-rates` y migrar los reportes (P-02)
- [ ] Migrar `SalesReport`, `AccountsReport`, `SaleDetailPage`, `ProfitLoss`, `CompanyHealth`,
      `Customers` y `Movements` a `/api/*` (P-02)
- [ ] Convertir `localStorage` en caché de solo lectura, no en segunda fuente de verdad (P-20)
- [ ] Correlativo de factura atómico + índice único (P-16)
- [ ] Deduplicar el kárdex por una clave compuesta más fuerte (P-15)
- [ ] Aplicar el trigger de descuento de stock, con filtro de organización (P-28)

---

## 6. Iteración 4 — Calidad y cobertura

> Objetivo: que los errores se detecten antes de llegar a producción.

- [ ] Configurar ESLint con el plugin de React Hooks y las reglas de TypeScript (P-10)
- [ ] Configurar Vitest y escribir las primeras pruebas de `src/lib/currency.ts` (puro, 9
      funciones) (P-10)
- [ ] Pruebas de la API: arranque, sesión, 401 en rutas protegidas, `success` en la respuesta
- [ ] Pruebas de los endpoints de dinero: movimiento bancario, pago de CxC, pago de CxP
- [ ] Playwright: login → panel → venta → verificar stock
- [ ] Eliminar el código muerto y las dependencias sin uso (P-21)
- [ ] Consolidar las dos familias de CSS de tienda (`.store-*` vs. `cr-*`)
- [ ] Extraer el patrón de export PDF a `reportUtils.ts`

---

## 7. Iteración 5 — Base de datos reproducible

> Objetivo: que un entorno nuevo se construya con un solo comando.

- [ ] Volcar el esquema real de la base viva y convertirlo en una migración canónica (P-09)
- [ ] Renumerar `0016_fix_…` para eliminar la colisión de versión (P-14)
- [ ] Añadir `supabase/config.toml` y scripts de la CLI
- [ ] Convertir `workspace/0019_auto_deduct_inventory_stock.sql` en una migración real
- [ ] Eliminar los `CREATE TABLE IF NOT EXISTS` sobre tablas que ya existen
- [ ] Sustituir el `DEFAULT` centinela de `organization_id` por `NOT NULL` (P-04)
- [ ] Añadir `UNIQUE (organization_id, sku)` en `products`
- [ ] Migrar la numeración de proveedores a un generador no destructivo (hoy `0020` renumera
      todo y no es idempotente)

---

## 6. Producto — functionality pendiente

| Módulo | Estado | Trabajo pendiente |
|---|---|---|
| **Alma** | 🔴 Stub | Servidor con las herramientas autorizadas, cliente de chat con streaming, auditoría de invocaciones |
| **Marketing** | 🔴 Stub | Campañas y segmentación sobre la base de clientes |
| **Caja** | 🔴 Stub | Registro de caja (hoy solo hay cuentas bancarias) |
| **Multiempresa** | ⚠ | Selector de organización y sede; hoy la cabecera muestra "Sucursal Principal" como texto fijo |
| **Facturación electrónica** | ⬜ | Depende de la aprobación fiscal |
| **Importaciones / Integraciones** | ⬜ | Bancos, pasarelas de pago, PWA |

### 6.1 Especificación de Alma

Es el módulo con más valor diferencial y el que menos está avanzado. Contrato propuesto:

**Capa de servidor**
- Un router dedicado `/api/alma/*` con las herramientas de dominio.
- Un conjunto **cerrado** de operaciones: leer KPIs, listar ventas, consultar stock, listar
  clientes, resumir cuentas por cobrar, generar un reporte.
- Cada herramienta con un esquema de entrada y salida validado (el proyecto ya tiene `zod`
  declarado y sin usar).
- Autenticación y autorización por rol: Alma no puede hacer más que el usuario que pregunta.
- Registro de auditoría por invocación (herramienta, argumentos, resultado, duración).

**Capa de cliente**
- Chat con streaming, historial de la conversación y citas a las herramientas usadas.
- Sin acceso directo a la base de datos: el cliente **nunca** compone SQL.
- Respuestas con los importes formateados con `formatUSD` / `formatVES`.

**Derivados**
- Extender la familia `.alma-chat` (ya en `globals.css`) en lugar de inventar un estilo nuevo.
- Reutilizar `EmptyState` mientras no haya herramientas configuradas.

---

## 7. Decisiones de arquitectura a cerrar

| # | Decisión | Estado actual | Recomendación |
|---|---|---|---|
| 1 | **¿Redux o React Query?** | Ambos instalados, ninguno en uso | **React Query.** Encaja con el modelo de "datos del servidor + caché" y elimina el reintento manual de `useEffect` + `useState` |
| 2 | **¿`localStorage` como segunda fuente de verdad?** | Sí, en 13 claves | **No.** Solo caché de lectura |
| 3 | **¿Tailwind o CSS semántico?** | CSS semántico | **CSS semántico.** No introducir Tailwind sin acuerdo del equipo de diseño |
| 4 | **¿Una fila de `server.ts` o dividirlo?** | 6 613 líneas en un archivo | **Dividir** por dominio (`src/server/auth.ts`, `sales.ts`, `finance.ts`…) cuando se toque el archivo por tercera vez |
| 5 | **¿Store de datos local?** | Archivos JSON con reescritura completa | **SQLite** o **Postgres local** cuando el volumen lo justifique; ahora la reescritura completa es un riesgo de pérdida de escrituras |
| 6 | **¿Migraciones con la CLI de Supabase?** | Aplicación manual | **Sí**, en cuanto exista una migración canónica |

---

## 8. Hitos

| Hito | Contenido | Estado |
|---|---|---|
| **H1 · Base de datos reproducible** | Esquema canónico + CLI + migraciones sin colisión | ⬜ |
| **H2 · Cero fugas** | 13 tablas aisladas + endpoints protegidos + CSRF | ⬜ |
| **H3 · Persistencia completa** | Todos los módulos escriben por `/api/*` | ⬜ |
| **H4 · Cobertura de pruebas** | Unitarias del núcleo bimonetario + e2e del flujo de venta | ⬜ |
| **H5 · Producción** | Arranque corregido, CORS, logging, backups, PII fuera del historial | ⬜ |
| **H6 · Alma** | Herramientas autorizadas + chat con streaming | ⬜ |

---

## 9. Qué no hacer

Reglas aprendidas del proyecto, para evitar repetir errores:

| ❌ No hacer | Motivo |
|---|---|
| Usar el prefijo `VITE_` para credenciales | Vite las inyecta en el bundle del navegador |
| Introducir `https://your-project.supabase.co` | Rompe el OAuth de Google y el estado de Supabase |
| Enviar `'admin'` o `'cashier'` a `profiles.role` | El CHECK los rechaza **en silencio**; usar `toProfileRole()` |
| Insertar en `profiles` con un id inventado | La FK a `auth.users` lo rechaza; duplica el usuario |
| Confiar en `x-forwarded-for` sin `trust proxy` | Permite evadir el rate limit |
| Escribir SQL desde el cliente | RLS lo bloquea, pero el error es confuso |
| Usar utilidades de Tailwind | Tailwind no está instalado: el elemento sale sin estilo |
| Reusar el prefijo de versión `0016` | Colisión en la CLI de Supabase |
| Derivar el tipo de cambio en el cliente y enviarlo al servidor | El servidor es la única fuente de la tasa vigente |
| Ajustar un importe a mano para cuadrar un balance | El redondeo a 2 decimales es la regla; las diferencias son bugs |

---

## 10. Registro de decisiones

| Decisión | Por qué | Cuándo |
|---|---|---|
| El navegador nunca recibe claves de Supabase | La RLS solo es fiable si el servidor controla el contexto del inquilino | Punto de partida |
| Respaldo local en `data/` como modo degradado | El negocio debe poder operar aunque Supabase no responda | foundation |
| Un solo archivo `server.ts` | Empezar rápido con un monolito; se dividirá cuando crezca | foundation |
| CSS semántico con tokens, sin Tailwind | Coherencia y control del resultado visual | foundation |
| Numeración correlativa de 4 dígitos para facturas | Formato comercial, más fácil de leer | POS |
| La tasa se congela en el documento | La historia financiera no debe cambiar al recalcular | foundation |
| Compra a crédito ⇒ CxP automática | Evita la doble captura y el olvido de la deuda | Finanzas |
