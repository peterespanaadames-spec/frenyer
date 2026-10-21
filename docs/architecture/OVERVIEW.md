# Arquitectura — Frenyer ERP

> Documento de referencia técnica. Todo lo aquí descrito fue verificado contra el código fuente
> (`server.ts`, `src/`, `supabase/migrations/`) en la revisión de octubre 2026.
> Las rutas de archivo se indican como `archivo:línea`.

---

## 1. Resumen ejecutivo

Frenyer es un ERP/POS bimonetario (USD + VES) para comercio. Es un **monolito modular** con
tres capas lógicas dentro de un solo proceso Node:

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                          │
│  React 19 + Vite + React Router 6                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │ App Router   │  │ AuthContext  │  │  db.ts       │                │
│  │ ProtectedRte │  │ (cookie)     │  │ (fachada)    │                │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘                │
└─────────┼─────────────────────────────────────┼──────────────────────┘
          │  fetch(..., {credentials:'include'}) │
          ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SERVIDOR — server.ts (Express 5.3, 6 613 líneas, único backend)      │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────────────────┐    │
│  │ authenticateS..│ │  /api/*      │ │  createLocalCollection   │    │
│  │ upabaseRequest │ │  87 rutas    │ │  → data/*.json           │    │
│  └───────┬────────┘ └──────┬───────┘ └────────────┬─────────────┘    │
└──────────┼─────────────────┼──────────────────────┼──────────────────┘
           │                 │                      │
           ▼                 ▼                      ▼
┌──────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Supabase Auth    │  │ PostgREST + RLS    │  │ Respaldo local     │
│ (JWT en cookie   │  │ PostgreSQL         │  │ data/*.json        │
│  httpOnly)       │  │ 30 tablas          │  │ (modo degradado)   │
└──────────────────┘  └────────────────────┘  └────────────────────┘
```

**Principio rector declarado:** el navegador **nunca** recibe una clave de Supabase.
Todas las consultas pasan por `/api/*`; el servidor resuelve las credenciales, valida la
sesión y aplica las políticas RLS en nombre del usuario.

> ⚠ **Estado real:** este principio se cumple para las rutas `/api/*`, pero **no en todas partes**.
> Diez módulos del frontend siguen llamando al cliente Supabase del navegador directamente
> (que está inerte) y fallan silenciosamente. Ver
> [KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md#datos-no-se-persisten).

---

## 2. Stack tecnológico

### 2.1 Dependencias de producción

| Paquete | Versión | Uso real en el proyecto |
|---|---|---|
| `react` / `react-dom` | 19.0.0 | Componentes funcionales, `StrictMode` |
| `express` | ^5.2.1 (5.3.0) | Servidor HTTP + API + hosting de Vite en modo middleware |
| `@supabase/supabase-js` | ^2.118.0 | Cliente **anon** en servidor; cliente inerte en navegador |
| `react-router-dom` | latest | `createBrowserRouter` |
| `lucide-react` | latest | Iconografía (~40 iconos) |
| `recharts` | latest | Gráficos — **solo** en `CompanyHealth.tsx` |
| `xlsx` | ^0.18.5 | Exportación a Excel/CSV |
| `jspdf` + `html2canvas` | ^4.2.1 / ^1.4.1 | Exportación a PDF (`CompanyHealth`, `ProfitLoss`) |
| `zod` | latest | **Declarado pero sin importar en `src/`** |
| `react-hook-form` | latest | **Declarado pero sin importar en `src/`** |
| `redux`, `react-redux`, `reselect`, `@tanstack/react-query` | latest | **Instalados pero 100 % sin uso** (verificado por grep: 0 coincidencias) |

### 2.2 Dependencias de desarrollo

`vite`, `@vitejs/plugin-react`, `typescript`, `tsx` (ejecutor de `server.ts`), `eslint`,
`vitest`, `@playwright/test`.

> ⚠ **No hay ni un solo archivo de test** (`.test.ts` / `.spec.ts`) en el repositorio, ni
> `playwright.config.ts`, ni sección `test` en `vite.config.ts`.
> `npm run test` arranca Vitest y sale sin pruebas; `npm run test:e2e` falla por falta de configuración.
> `eslint.config.js` solo contiene `{ ignores: ['dist','node_modules'] }` — **no hay reglas activas**,
> por lo que `npm run lint` siempre pasa.
> Ver [KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md#calidad-de-código).

### 2.3 Estilado — CSS semántico, no Tailwind

**No hay Tailwind en el proyecto.** No existe `tailwind.config.*` ni `postcss.config.*`, y
`tailwindcss` no está en `package.json`. Todo el diseño vive en dos archivos:

- `src/styles/tokens.css` — 21 variables CSS en `:root`.
- `src/styles/globals.css` — 1 440 líneas de clases semánticas (`.card`, `.btn`, `.input`, `.table`…).

> ⚠ Seis archivos usan utilidades de Tailwind que **no tienen efecto**
> (`AuthCallback.tsx`, `SaleDetailModal.tsx`, `ProtectedRoute.tsx`, `LoginPage.tsx`,
> `Suppliers.tsx`, y los componentes `SalesKPIs`/`SalesTransactionsTable`).
> `className="animate-spin"` aparece en 14 sitios y **no hay ningún `@keyframes` en el CSS**:
> todos los spinners son iconos estáticos.

Detalle completo en [Design System](../design-system/DESIGN_SYSTEM.md).

---

## 3. Estructura del repositorio

```
.
├── server.ts                 Backend completo (6 613 líneas) — Express 5
├── vite.config.ts            Configuración de build del cliente
├── eslint.config.js          Configuración de ESLint (stub vacío)
├── data/                     Respaldo local en JSON (gitignored, contiene PII)
├── docs/                     Documentación (este directorio)
├── supabase/migrations/      22 archivos SQL (0001 → 0022)
├── workspace/supabase/       Migración huérfana fuera del flujo (ver DATABASE.md)
├── scripts/checkMovements.ts Script auxiliar de verificación de movimientos
└── src/
    ├── main.tsx              Punto de entrada: StrictMode → AuthProvider → RouterProvider
    ├── app/router/index.tsx  Árbol de rutas (34 rutas)
    ├── layouts/              DashboardLayout (shell del ERP)
    ├── components/
    │   ├── ui/               Sidebar, Button, Card, Badge, EmptyState
    │   ├── auth/             ProtectedRoute
    │   ├── data-display/     Kpi (sin uso)
    │   └── modals/           ManualBcvRate, NewPurchase, SaleDetail, SupabaseConnection
    ├── context/AuthContext.tsx
    ├── lib/
    │   ├── currency.ts       Núcleo bimonetario
    │   ├── businessProfile.ts
    │   ├── reportUtils.ts    Membrete fiscal para exportaciones
    │   └── supabase/         client.ts (inerte) · api.ts (fetch) · db.ts (3 922 líneas)
    ├── modules/              sales · inventory · finance · accounts-receivable ·
    │                         customers · alma · shop
    ├── pages/                Dashboard · auth/LoginPage · auth/AuthCallback
    ├── styles/               tokens.css · globals.css
    └── types/domain.ts       Tipos de dominio (camelloCase)
```

---

## 4. Capa de servidor (`server.ts`)

### 4.1 Arranque

| Aspecto | Detalle |
|---|---|
| Puerto | `3000` **hardcodeado** (`server.ts:23`) — `process.env.PORT` se ignora |
| Host | `0.0.0.0` (`server.ts:6608`) |
| Desarrollo | `npm run dev` → `tsx server.ts` → Vite en **modo middleware** (`server.ts:6596-6600`). Express es el único dueño del puerto; Vite no abre puerto propio |
| Producción | `NODE_ENV=production` → `express.static(dist)` + fallback SPA (`server.ts:6602-6605`) |
| Variables | `loadEnv(mode, cwd, '')` con **prefijo vacío** (`server.ts:71`) — carga *todas* las variables de `.env*` y de `process.env` |
| DNS | `dns.setDefaultResultOrder('ipv4first')` (`server.ts:1-2`) — sortea un problema de resolución con Supabase/BCV |

> 🔴 **Defecto crítico en producción:** `app.get('*', ...)` (`server.ts:6603`) es sintaxis
> inválida en Express 5. `path-to-regexp` v8 lanza
> `PathError: Missing parameter name at index 1: *` al registrar la ruta.
> Como `startServer()` se invoca sin `.catch()` (`server.ts:6613`), la excepción termina en
> una promesa rechazada sin manejar y **el proceso muere al arrancar**.
> Forma correcta en Express 5: `app.get('/{*splat}', ...)`.
> Verificado con `path-to-regexp@8.4.2` instalado en `node_modules`.

### 4.2 Middleware y orden de ejecución

```
1. app.use(cors())                             server.ts:19   ← permisivo, sin credentials
2. app.use(express.json({ limit:'15mb' }))     server.ts:20
3. app.use(express.urlencoded({...}))          server.ts:21
4. app.use([...17 prefijos], authenticate..)   server.ts:458  ← guarda de sesión
5. app.use('/api/orders',   requireAuthForMethods([...]))  server.ts:480
   app.use('/api/users',    requireAuthForMethods([...]))  server.ts:481
   app.use('/api/inventory-movements', requireAuthForMethods([...])) server.ts:482
6. ... 87 manejadores de ruta ...              server.ts:597-6589
7. Vite middleware | static + SPA fallback      server.ts:6600 / 6602
8. app.listen(3000, '0.0.0.0')                 server.ts:6608
```

**No hay** `helmet`, `compression`, `cookie-parser`, middleware de CSRF, ni manejador de
errores JSON. Los errores no capturados producen la página HTML por defecto de Express.

**Prefijos protegidos para todos los métodos** (`server.ts:458-476`):
`/api/bcv/rates/manual`, `/api/exchange-rates/history`, `/api/reports/process-transactions`,
`/api/customers`, `/api/bank-accounts`, `/api/payment-methods`, `/api/bank-movements`,
`/api/bank-transfers`, `/api/suppliers`, `/api/quotes`, `/api/sales`,
`/api/accounts-receivable`, `/api/accounts-payable`, `/api/purchases`, `/api/branches`,
`/api/expenses`, `/api/expense-categories`.

> ⚠ **El guard de `/api/inventory-movements` (`server.ts:482`) está muerto**: no existe ninguna
> ruta con ese prefijo. Las rutas reales son `/api/inventory/movements` y
> `/api/inventory/adjustments`, y **ninguna de las dos está protegida**.

### 4.3 Resolución de credenciales Supabase

Orden exacto (gana el primer valor **válido**, no el primer valor no vacío):

| # | Origen | Variables |
|---|---|---|
| 1 | `data/supabase-credentials.json` (gitignored) | `.url`, `.anonKey`, `.serviceRoleKey` |
| 2 | `process.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 3 | `.env.local` (parser propio, `server.ts:48-69`) | mismas variables, **sin** prefijo `VITE_` |
| 4 | `loadedEnv` (Vite `loadEnv`) | mismas variables |
| 5 | `process.env` / `.env.local` / `loadedEnv` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — **deprecadas** |
| 6 | Constante | `https://knyqrwpaksawuxoqcayu.supabase.co` (`server.ts:74`) |

Validadores: `isRealSupabaseUrl` (`server.ts:26-34`) rechaza `your-project` y `example.com`;
`isRealSupabaseKey` (`server.ts:36-45`) rechaza `your-supabase` y `configure_supabase`.

> 🔴 **Nunca reintroducir `https://your-project.supabase.co`**: rompe el OAuth de Google
> (redirige a un host inexistente) y falsea `/api/supabase/status`.

### 4.4 Capa de persistencia

Dos mecanismos conviven:

**a) Supabase (PostgREST + RLS).** Cliente **anon** creado en `server.ts:176`.
Para peticiones autenticadas se usa el **JWT del usuario** como `Authorization: Bearer`, de
modo que RLS evalúa al usuario real. El helper `authenticatedSupabaseRestRequest`
(`server.ts:1005-1035`) fuerza `organization_id = context.organizationId` en cuerpos
`POST`/`PATCH` para las 17 tablas de `tenantScopedTables` (`server.ts:377-395`) y devuelve
**403** si el cuerpo ya traía una organización distinta.

**b) Respaldo local en JSON.** Helper genérico `createLocalCollection` (`server.ts:2308-2363`):

```ts
const local = createLocalCollection('customers.json');
local.load(orgId?)  // filtra por organization_id; filas sin org son visibles para todos
local.save(items)    // reescribe el archivo completo, sin bloqueo ni renombre atómico
local.upsert(item, matchKeys)  // fusiona por primera clave coincidente
local.remove(predicate)
```

Rutas: `path.resolve(process.cwd(), 'data', fileName)` — **relativas al CWD**, no a la raíz
del proyecto. Ejecutar el servidor desde otro directorio crea un árbol `data/` vacío en silencio.

**Precedencia de lectura por colección:**

| Colección | Precedencia | ¿Sobrescribe el archivo local? |
|---|---|---|
| `customers` | Supabase → local | No |
| `sales` | Supabase → local | No |
| `quotes` | Solo Supabase (sin fallback) | No |
| `expenses` / `expense_categories` | Solo Supabase | No |
| `exchange_rates` | Supabase → local | No (`localExchangeRateHistory` nunca se escribe) |
| `bank_accounts` | Fusión por `id` (Supabase gana) | No |
| `bank_movements` | Fusión por `id` | No |
| `payment_methods` | Supabase → local | No |
| `suppliers` | Reconciliación local + fusión Supabase | Sí |
| `branches` | Supabase → local | **Sí** (sobrescribe `data/branches.json`) |
| `users` | Fusión `profiles` + `users.json` (local gana en rol/estado/permisos) | No |
| `accounts_receivable` | Supabase (3 niveles de fallback) → local | **Sí** (actúa como caché) |
| `accounts_payable` | Fusión local + Supabase | No |
| `purchases` | Fusión local + Supabase | No |
| `orders` | Fusión Supabase + local | No (escribe local primero) |
| `inventory_movements` | Supabase + ajustes locales + filas sintéticas de ventas/compras | No |

Archivos presentes en `data/`: `.session-secret`, `accounts_receivable.json`,
`auth-audit.log`, `bank_movements.json`, `branches.json`, `inventory_adjustments.json`,
`orders.json`, `payment_methods.json`, `suppliers.json`, `users.json`.

---

## 5. Capa de cliente (`src/`)

### 5.1 Árbol de rutas

`src/app/router/index.tsx` define un único `createBrowserRouter` con 34 rutas.

**Públicas** (sin `DashboardLayout`): `/` (tienda), `/login`, `/registro`, `/auth/callback`.

**Protegidas** (dentro de `<ProtectedRoute><DashboardLayout/></ProtectedRoute>`):

| Ruta | Componente |
|---|---|
| `/dashboard`, `/admin` | `pages/Dashboard.tsx` |
| `/ventas-flash/ventas` | `modules/sales/pages/Sales.tsx` |
| `/ventas-flash/pedidos` | `modules/sales/pages/Orders.tsx` |
| `/ventas-flash/cotizaciones` | `modules/sales/pages/Quotes.tsx` |
| `/ventas-flash/reporte`, `/ventas-flash/reporte/:id` | `SalesReport.tsx`, `SaleDetailPage.tsx` |
| `/inventarios/productos` | `modules/inventory/pages/Inventory.tsx` |
| `/inventarios/compras` | `InternalPurchases.tsx` |
| `/inventarios/movimientos` | `Movements.tsx` |
| `/inventarios/reporte-diario` | `DailyInventoryReport.tsx` |
| `/cuentas/caja` | `modules/finance/pages/Cash.tsx` (stub) |
| `/cuentas/bancos` | `BankAccounts.tsx` |
| `/cuentas/cobrar` | `modules/accounts-receivable/pages/Accounts.tsx` |
| `/cuentas/pagar` | `modules/finance/pages/AccountsPayable.tsx` |
| `/cuentas/reporte` | `AccountsReport.tsx` |
| `/gastos` | `Expenses.tsx` |
| `/contactos/clientes` | `modules/customers/pages/Customers.tsx` |
| `/contactos/proveedores`, `/contactos/proveedores/nuevo` | `Suppliers.tsx` |
| `/marketing` | `Marketing.tsx` (stub) |
| `/finanzas/salud`, `/finanzas/salud-del-negocio` | `CompanyHealth.tsx` |
| `/finanzas/ganancias-perdidas` | `ProfitLoss.tsx` |
| `/configuracion` | `modules/alma/pages/Config.tsx` |
| `/alma` | `modules/alma/pages/Alma.tsx` (stub) |

**Rutas de compatibilidad** (sin enlace en el menú): `/pedidos`, `/ventas`, `/inventario`,
`/finanzas`, `/cuentas`, `/cuentas-por-pagar`, `/finanzas/cuentas-por-pagar`, `/clientes`.

### 5.2 `ProtectedRoute`

`src/components/auth/ProtectedRoute.tsx` (50 líneas):

- `isLoading === true` → pantalla `.auth-loading-card` con icono `Sparkles`.
- `!user` → `<Navigate to="/login" state={{ from: location }} replace />`.
- `allowedRoles` no vacío y rol no coincide → `<Navigate to="/" replace />` (a la tienda pública).
- En otro caso → renderiza `children`.

> ⚠ La prop `allowedRoles` **nunca se pasa** por el router. La protección real por rol es un
> `useEffect` dentro de `DashboardLayout` (`DashboardLayout.tsx:86-151`) que corre **después**
> del montaje: un usuario con rol `cliente` ve un frame del ERP antes de ser redirigido.

### 5.3 Capa de datos del cliente

| Archivo | Tamaño | Rol |
|---|---|---|
| `src/lib/supabase/client.ts` | 88 líneas | Cliente Supabase **inerte** (`hasBrowserSupabaseClient = false`, línea 13). `refreshSupabaseStatus()` consulta `/api/auth/mode` y actualiza flags de módulo |
| `src/lib/supabase/api.ts` | 12 líneas | **No es un wrapper de API**: solo exporta `authenticatedFetch(input, init)`, que inyecta `credentials: 'include'` |
| `src/lib/supabase/db.ts` | 3 922 líneas | La superficie real: ~50 funciones async + ~20 interfaces `Db*` + 4 enums de gastos |

**Patrón de cada función en `db.ts`**: ① proxy del servidor (`/api/*`) → ② cliente Supabase
directo (normalmente protegido por `if (isSupabaseConfigured)`) → ③ espejo en `localStorage`.

> 🔴 `db.ts:1` importa `hasBrowserSupabaseClient as isSupabaseConfigured`, que es la
> **constante `false`**. Por tanto **todos los bloques `if (isSupabaseConfigured) { … }` de
> `db.ts` están muertos**. La variable mutable `isSupabaseConfigured` que exporta `client.ts:16`
> es otro binding distinto que `db.ts` nunca lee.
>
> Consecuencia: diez módulos llaman al cliente inerte **sin condición** —
> `recordSaleInSupabase` (todo el camino de emisión del POS), `getNextInvoiceCorrelative`,
> todo el CRUD de `bank_accounts`, `convertQuoteToInvoiceInSupabase`, más
> `SalesReport.tsx`, `AccountsReport.tsx`, `SaleDetailPage.tsx`, `ProfitLoss.tsx`,
> `CompanyHealth.tsx`, `Customers.tsx:113/164` y `Movements.tsx:54`. Esas llamadas fallan con
> JWT inválido y las páginas quedan vacías.

**Espejos en `localStorage`** (fallback offline): `frenyer_local_suppliers`,
`frenyer_local_quotes`, `frenyer_local_sales`, `frenyer_local_cxc`, `frenyer_local_purchases`,
`frenyer_local_payables`, `frenyer_local_branches`, `frenyer_local_expenses`,
`frenyer_expense_categories`, `frenyer_local_adjustments`, `frenyer_local_orders`,
`frenyer_local_bank_movements`, `frenyer_org_id`.

### 5.4 Estado global

**No hay Redux ni React Query en uso**, pese a estar instalados. `src/main.tsx` monta solo:

```
React.StrictMode → AuthProvider → RouterProvider
```

Todo el estado remoto es `useEffect` + `useState` a mano. `AuthContext` (`src/context/AuthContext.tsx`,
309 líneas) expone `user`, `session`, `profile`, `role`, `isLoading`, `signInWithEmail`,
`signUpWithEmail`, `signInWithAccessKey`, `signInWithGoogle`, `signOut`, `refreshProfile`.

Al arrancar: `GET /api/auth/session` con `credentials: 'include'`. Si responde 401, la
aplicación entra en **modo público** (sin usuario) en lugar de fallar.

### 5.5 Navegación lateral

`src/components/ui/Sidebar.tsx` (317 líneas) + `src/layouts/DashboardLayout.tsx` (574 líneas).

| Sección | Clave de permiso | Hijos |
|---|---|---|
| Dashboard | — | `/dashboard` (hoja) |
| Ventas Flash | `ventas` | Ventas, Pedidos, Cotizaciones, Reporte de ventas |
| Inventarios | `inventario` | Productos, Compras internas, Movimientos, Reporte diario |
| Cuentas | `finanzas` | Cuentas bancarias, Cuentas por cobrar, Cuentas por pagar, Reporte de cuentas |
| Gastos | `finanzas` | `/gastos` (hoja) |
| Gestión de Contactos | *(ninguna)* | Clientes, Proveedores |
| Finanzas | `reportes` | Salud de empresa, Ganancias y pérdidas |

Bloque inferior: "Tienda Online" (`/`), "Configuración" (`/configuracion`, **solo** si el
usuario tiene el permiso `usuarios`), nombre del negocio y el literal `Bs. / USD`.

Los permisos se leen de `localStorage.frenyer_active_user` / `frenyer_user_permissions`, con
fallback `['ventas','inventario','finanzas','reportes','usuarios']`, y se refrescan con el
evento de ventana `frenyer:active-user-changed`.

**Acordeón:** `expanded` es un `Record<string, boolean>` con clave = etiqueta de la sección.
Al pulsar el padre dos veces, la sección **se cierra** (`Sidebar.tsx:199-204`).
Auto-expansión: un efecto abre la sección que contiene la ruta activa
(`Sidebar.tsx:180-197`).

> ⚠ El resaltado activo usa **igualdad exacta** de ruta (`Sidebar.tsx:186` y `:219`), por lo que
> en `/ventas-flash/reporte/123` la sección "Reporte de ventas" queda sin marcar.

**Responsive:** breakpoint `640px` (`globals.css:7-13`). `.mobile-menu` se muestra, el sidebar
pasa a cajón fijo (`width: min(280px,85vw); height:100dvh; z-index:31`) y aparece un
`.mobile-sidebar-backdrop` a `z-index:30`. Cada `NavLink` recibe `onNavigate` para cerrar el
cajón al navegar.

### 5.6 Cabecera (`DashboardLayout`)

De izquierda a derecha: botón de menú móvil · nombre del negocio · pastilla de estado
Supabase (verde/ámbar) · pastilla de tasa BCV (`Bs. {tasa}`) · botón "Tienda Online" ·
"Sucursal Principal" (**texto fijo, no es un selector**) · chip de usuario (iniciales, nombre,
rol) · botón de salida.

Además: banner azul de "nueva tasa oficial" cuando el servidor propone una tasa distinta de
la manual, botón flotante `.alma-fab` hacia `/alma`, y los modales de tasa manual y de estado
de Supabase.

---

## 6. Modelo de datos (resumen)

30 tablas en el esquema `public`. El detalle completo está en
[DATABASE.md](DATABASE.md).

| Dominio | Tablas |
|---|---|
| Tenant | `organizations`, `organization_members`, `branches`, `profiles`, `audit_logs` |
| CRM | `customers`, `suppliers` |
| Catálogo | `products`, `inventory_movements` |
| Ventas | `sales` (facturas, notas, esperas y cotizaciones), `sale_items`, `payments`, `orders`, `order_items` |
| Tesorería | `bank_accounts`, `bank_movements`, `payment_methods`, `exchange_rates` |
| Obligaciones | `accounts_receivable`, `receivable_payments`, `accounts_payable`, `payable_payments` |
| Compras | `purchases`, `purchase_items` |
| Gastos | `expenses`, `expense_categories`, `expense_payments` |
| Tienda | `shop_customers`, `customer_wishlist`, `customer_orders` |

**Función generadora de UUID:** `gen_random_uuid()` (pgcrypto). `uuid-ossp` se instala en
`0002:10` pero no se usa.

**Vistas y buckets de Storage:** ninguno. Todo el "reporting" son *joins embebidos* de
PostgREST en tiempo de ejecución.

---

## 7. Reglas de negocio bimonetarias

Detalle completo en [BUSINESS_RULES.md](BUSINESS_RULES.md).

- **Moneda base:** USD. Cada transacción guarda `total_usd`, `total_ves` **y** la
  `exchange_rate` aplicada.
- **Instantánea de tasa:** la tasa vigente se copia al registro en el momento de la
  transacción (ventas, cotizaciones, compras, pagos, movimientos bancarios, ajustes).
  Cambiar la tasa después **no** reescribe la historia.
- **Redondeo:** importes a 2 decimales (`Math.round(x * 100) / 100`); tasas a 4 decimales.
- **Tasa BCV:** triple fuente — scraping de `bcv.org.ve` (8 s) → `ve.dolarapi.com` (5 s) →
  última tasa certificada en memoria. Si no hay ninguna, **503**.
- **Regla de tasa futura:** si la fecha valor es futura **o** son las **16:00 en
  `America/Caracas`**, la tasa pasa a ser "futura" y `appliedRate = futureRate`.
- **Tasa EUR:** sintética (`appliedRate * 1.08`), nunca una cotización real del BCV/ECB.

---

## 8. Puntos de extensión

| Para extender… | Modifica… | Nota |
|---|---|---|
| Una ruta nueva | `src/app/router/index.tsx` + `src/components/ui/Sidebar.tsx` | Añade el enlace al menú o la ruta queda inalcanzable |
| Un endpoint nuevo | `server.ts` + `src/lib/supabase/db.ts` | Preferir `/api/*`; nunca cliente Supabase en el navegador |
| Un campo de base de datos | `supabase/migrations/00XX_nueva.sql` | Aplicar **a mano** en el SQL Editor: no hay CLI ni `config.toml` |
| Una columna de negocio | `src/types/domain.ts` (camelloCase) **y** `src/lib/supabase/db.ts` (snake_case) | Los dos modelos coexisten y no están aliaseados |
| Un estilo nuevo | `src/styles/globals.css` usando `var(--token)` | Nada de utilidades Tailwind: no están instaladas |
| Un componente compartido | `src/components/ui/` | Patrón: props explícitas y desestructuradas, tipo estricto |

---

## 9. Documentos relacionados

- [Referencia de API](API.md) — las 87 rutas del servidor
- [Seguridad](SECURITY.md) — credenciales, sesión, RLS, superficie expuesta
- [Base de datos](DATABASE.md) — esquema por tabla, funciones, políticas
- [Reglas de negocio](BUSINESS_RULES.md) — bimonetariedad, tasas, redondeo
- [Instalación y operación](../operations/SETUP.md)
- [Problemas conocidos](../operations/KNOWN_ISSUES.md)
- [Índice general](../README.md)
