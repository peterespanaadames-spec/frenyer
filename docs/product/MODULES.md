# Módulos — Frenyer ERP

> Inventario de los módulos de dominio, su alcance, su estado y su ubicación en el código.
> Verificado contra `src/modules/` y `src/app/router/index.tsx` en la revisión de octubre 2026.

---

## Mapa de módulos

| # | Módulo | Directorio | Estado | Documentación |
|---|---|---|---|---|
| 1 | Ventas y POS | `src/modules/sales/` | 🟢 Funcional | [sales.md](../sales.md) |
| 2 | Inventario | `src/modules/inventory/` | 🟢 Funcional | [inventory.md](../inventory.md) |
| 3 | Finanzas | `src/modules/finance/` | 🟢 Funcional | [finance_general.md](../finance_general.md) |
| 4 | Cuentas por cobrar/pagar | `src/modules/accounts-receivable/`, `src/modules/finance/pages/AccountsPayable.tsx` | 🟢 Funcional | [finance_accounts.md](../finance_accounts.md) |
| 5 | CRM / Contactos | `src/modules/customers/` | 🟢 Funcional | [contacts.md](../contacts.md) |
| 6 | Alma | `src/modules/alma/` | 🔴 Stub | [configuration.md](../configuration.md) |
| + | Tienda online | `src/modules/shop/` | 🟢 Funcional (público) | [shop.md](../shop.md) |
| + | Configuración | `src/modules/alma/pages/Config.tsx` | 🟢 Funcional | [configuration.md](../configuration.md) |
| + | Panel | `src/pages/Dashboard.tsx` | 🟢 Funcional | [dashboard.md](../dashboard.md) |

---

## 1. Ventas y POS — `src/modules/sales/`

**Propósito:** el punto de venta, el control de pedidos, las cotizaciones y los reportes de
venta.

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Sales.tsx` | ~2 900 | POS "Venta Flash" con checkout de 3 pasos |
| `pages/Orders.tsx` | 1 486 | Control de pedidos (tabla ⇄ kanban) |
| `pages/Quotes.tsx` | ~2 961 | Cotizaciones con conversión a factura |
| `pages/SalesReport.tsx` | 1 280 | Reporte de ventas (3 vistas) |
| `pages/SaleDetailPage.tsx` | 476 | Detalle de comprobante |
| `utils/quoteDocument.ts` | 395 | Documento imprimible de cotización |
| `components/SalesKPIs.tsx`, `SalesCharts.tsx`, `SalesFilters.tsx`, `SalesTransactionsTable.tsx` | — | ⚠ **Stubs sin importadores** |

**Rutas:** `/ventas-flash/ventas`, `/ventas-flash/pedidos`, `/ventas-flash/cotizaciones`,
`/ventas-flash/reporte`, `/ventas-flash/reporte/:id`.

**Endpoints principales:** `GET /api/sales`, `GET /api/sale-items`, `GET /api/products`,
`GET/POST /api/quotes`, `GET/POST /api/orders`, `PATCH /api/orders/:id/*`,
`GET /api/bank-accounts`, `POST /api/bank-movements`, `GET /api/bcv/rates`.

⚠ **Punto crítico:** el registro de la venta (`recordSaleInSupabase`) escribe por el cliente
Supabase inerte del navegador ⇒ **las ventas no se persisten**. Ver
[KNOWN_ISSUES P-02](../operations/KNOWN_ISSUES.md#p-02).

---

## 2. Inventario — `src/modules/inventory/`

**Propósito:** catálogo de productos, compras internas y kárdex de movimientos.

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Inventory.tsx` | 2 207 | Catálogo, valoración, ajustes, importación/exportación XLSX |
| `pages/InternalPurchases.tsx` | 722 | Compras internas + voucher imprimible |
| `pages/Movements.tsx` | 2 604 | Kárdex con 6 filtros, paginación y exportación |
| `pages/DailyInventoryReport.tsx` | 1 819 | Reporte diario con preview imprimible |

**Rutas:** `/inventarios/productos`, `/inventarios/compras`, `/inventarios/movimientos`,
`/inventarios/reporte-diario`.

**Endpoints principales:** `GET/POST/PUT/DELETE /api/products`,
`PATCH /api/products/:sku/stock`, `GET /api/inventory/movements`,
`POST /api/inventory/adjustments`, `GET/POST /api/purchases`, `GET /api/branches`.

⚠ `GET /api/inventory/movements` y `POST /api/inventory/adjustments` son **públicos**. Ver
[KNOWN_ISSUES P-03](../operations/KNOWN_ISSUES.md#p-03).

---

## 3. Finanzas — `src/modules/finance/`

**Propósito:** cuentas bancarias, gastos, salud del negocio, ganancias y pérdidas, cuentas por
pagar y reportes de cuentas.

| Archivo | Líneas | Función |
|---|---|---|
| `pages/BankAccounts.tsx` | 2 212 | Cuentas, métodos de pago, movimientos, transferencias |
| `pages/Expenses.tsx` | 2 125 | Gastos fijos y variables, categorías, pagos |
| `pages/AccountsPayable.tsx` | 2 732 | Cuentas por pagar |
| `pages/CompanyHealth.tsx` | 1 215 | Salud del negocio con gráficos Recharts y export PDF |
| `pages/AccountsReport.tsx` | 354 | Reporte de cuentas y pagos |
| `pages/ProfitLoss.tsx` | 357 | Estado de ganancias y pérdidas |
| `pages/Cash.tsx` | 18 | 🔴 **Stub** (sin enlace en el menú) |
| `pages/Finance.tsx` | 18 | 🔴 **Stub** (ruta heredada `/finanzas`) |

**Rutas:** `/cuentas/bancos`, `/cuentas/pagar`, `/cuentas/reporte`, `/gastos`,
`/finanzas/salud`, `/finanzas/ganancias-perdidas`, `/cuentas/caja` (stub).

**Endpoints principales:** `GET/POST/PATCH/DELETE /api/bank-accounts`,
`GET/POST/PATCH/DELETE /api/payment-methods`, `GET/POST /api/bank-movements`,
`POST /api/bank-transfers`, `GET/POST/PATCH/PUT/DELETE /api/expenses`,
`POST /api/expenses/:id/pay`, `GET/POST /api/expense-categories`,
`GET/POST /api/accounts-payable`, `POST /api/accounts-payable/:id/payments`.

---

## 4. Cuentas por cobrar y por pagar

**Propósito:** registro y seguimiento de obligaciones con clientes y proveedores, con su
respectivo flujo de pagos y su efecto en tesorería.

| Ubicación | Estado |
|---|---|
| `src/modules/accounts-receivable/pages/Accounts.tsx` (2 089 líneas) | 🟢 Funcional — vista agrupada ⇄ plana por cliente |
| `src/modules/finance/pages/AccountsPayable.tsx` (2 732 líneas) | 🟢 Funcional — con `MOCK_PAYABLES` de ejemplo |

**Rutas:** `/cuentas/cobrar`, `/cuentas/pagar`.

**Endpoints principales:** `GET/POST /api/accounts-receivable`,
`POST /api/accounts-receivable/:id/payments`, `GET/POST /api/accounts-payable`,
`POST /api/accounts-payable/:id/payments`, `GET /api/suppliers`.

⚠ `AccountsPayable.tsx` incluye un array `MOCK_PAYABLES` de proveedores y facturas de muestra
(`:99`). Ver [KNOWN_ISSUES P-22](../operations/KNOWN_ISSUES.md#p-22).

---

## 5. CRM / Contactos — `src/modules/customers/`

**Propósito:** directorio de clientes y proveedores, con analítica por cliente y ficha de
proveedor.

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Customers.tsx` | 984 | Listado, filtros, panel analítico por cliente |
| `pages/Suppliers.tsx` | 831 | Listado de proveedores con KPIs de deuda |
| `components/SupplierDetailModal.tsx` | 1 149 | Ficha de proveedor (movimientos + edición) |
| `pages/Marketing.tsx` | 18 | 🔴 **Stub** (sin enlace en el menú) |

**Rutas:** `/contactos/clientes`, `/contactos/proveedores`, `/contactos/proveedores/nuevo`,
`/marketing` (stub).

**Endpoints principales:** `GET/POST/PATCH/DELETE /api/customers`,
`GET/POST/PATCH/DELETE /api/suppliers`, `GET /api/accounts-receivable`,
`GET /api/accounts-payable`.

---

## 6. Alma — `src/modules/alma/`

**Propósito:** asistente inteligente corporativo.

| Archivo | Líneas | Estado |
|---|---|---|
| `pages/Alma.tsx` | 18 | 🔴 **Stub**: título + `EmptyState`. Sin chat, sin streaming, sin llamadas a la API |
| `pages/Config.tsx` | 3 418 | 🟢 Funcional: configuración del negocio, almacén, usuarios y auditoría |

**Rutas:** `/alma`, `/configuracion`.

⚠ **No hay ninguna ruta de Alma en el servidor.** El único punto de entrada es el botón
flotante `.alma-fab` de `DashboardLayout`, que navega a `/alma`.

El CSS del chat (`.alma-chat`, `.bubble`, `.assistant`, `.chat-input`, `.suggestion`) ya está
preparado en `globals.css` para cuando se implemente.

El contrato previsto (herramientas estrictas en el servidor, sin SQL desde el cliente) está en
[BUSINESS_RULES §12](../architecture/BUSINESS_RULES.md#12-alma--herramientas-autorizadas).

---

## 7. Tienda online — `src/modules/shop/`

**Propósito:** tienda pública para clientes finales.

| Archivo | Líneas | Función |
|---|---|---|
| `pages/ShopPage.tsx` | 4 044 | Catálogo, carrito, checkout de 4 pasos, seguimiento de pedido |

**Ruta:** `/` (pública, sin sesión).

**Estilo:** CSS propio con espacio de nombres `cr-*` en un bloque `<style>` en línea
(`:847-1830`), **no** las clases `.store-*` de `globals.css` (que están sin uso).

**Endpoints:** `GET /api/public/products`, `GET /api/public/config`,
`POST /api/orders` (público), `GET /api/auth/session`, `POST /api/auth/login`,
`POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/bcv/rates`.

---

## 8. Configuración — `src/modules/alma/pages/Config.tsx`

**Propósito:** configuración del negocio, gestión de sedes, usuarios asociados y auditoría.

**4 pestañas:** Negocio · Almacén · Usuarios asociados · Auditoría.

**Endpoints:** `GET/POST/PATCH/DELETE /api/users`, `POST /api/users/:id/toggle-status`,
`GET/POST/PATCH/DELETE /api/branches`, `GET/POST/PATCH/DELETE /api/payment-methods`,
`GET /api/exchange-rates/history`, `GET /api/bcv/rates`, `POST /api/bcv/rates/manual`.

Detalle en [configuration.md](../configuration.md).

---

## 9. Panel — `src/pages/Dashboard.tsx`

**Propósito:** punto de entrada al ERP con los indicadores clave.

**Rutas:** `/dashboard`, `/admin`.

**Datos:** `GET /api/products`, `/api/sales`, `/api/sale-items`, `/api/expenses`,
`/api/accounts-receivable`, `/api/accounts-payable`.

**KPIs:** Ventas (7 días) · Utilidad mensual · Inventario (unidades) · Productos bajo mínimo.
**Bloques:** Top-5 productos más vendidos · Productos con bajo stock · CxC a vencer · CxP a vencer.

Detalle en [dashboard.md](../dashboard.md).

---

## 10. Dependencias entre módulos

```
              ┌──────────────┐
              │  Dashboard   │
              └──────┬───────┘
   ┌───────────┬──────┴───────┬────────────┐
   ▼           ▼              ▼            ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Ventas │ │Inventario│ │ Finanzas │ │ Contactos│
└───┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
    │           │            │            │
    │  ┌────────┴────────┐   │            │
    │  │  Compras        │   │            │
    │  └─────────────────┘   │            │
    └────────┬───────────────┴────────────┘
             ▼
      ┌─────────────┐
      │  Tesorería  │  (cuentas bancarias, pagos)
      └─────────────┘

  Compras a crédito ──► CxP ──► pago ──► movimiento bancario
  Venta a crédito  ──► CxC ──► pago ──► movimiento bancario
  Cotización ──► factura ──► (mismos flujos)
```

**Reglas de acoplamiento:**

- Ventas y Compras **no** escriben directamente en `bank_accounts`: generan movimientos.
- CxC y CxP **no** tocan el saldo: disparan un movimiento en la cuenta resuelta.
- Inventario se actualiza desde Ventas (descuento), Compras (incremento) y Ajustes (corrección).
- Todo módulo que consulte datos del tenant lo hace a través de `/api/*` (el servidor aplica el
  contexto de organización).

---

## 11. Fuera de los módulos de dominio

| Elemento | Ubicación | Función |
|---|---|---|
| Autenticación | `src/pages/auth/LoginPage.tsx`, `AuthCallback.tsx` | Login, registro, Google, clave de acceso |
| Contexto de sesión | `src/context/AuthContext.tsx` | Estado global de sesión y perfil |
| Shell | `src/layouts/DashboardLayout.tsx` | Cabecera, banner de tasa, botón de Alma, modales |
| Navegación | `src/components/ui/Sidebar.tsx` | Menú lateral con acordeones y permisos |
| Capa de datos | `src/lib/supabase/db.ts` | Fachada de acceso a datos |
| Utilidades | `src/lib/currency.ts`, `businessProfile.ts`, `reportUtils.ts` | Bimonetario, perfil del negocio, exportación |
| Tipos | `src/types/domain.ts` | Tipos de dominio en camelCase |
