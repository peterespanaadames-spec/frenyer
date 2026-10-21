# Finanzas Generales

## Descripción

Módulo para el control de gastos operativos, análisis de salud de la empresa y estado de
resultados (ganancias/pérdidas). Cierra el ciclo financiero del ERP: convierte la actividad
comercial en indicadores de salud del negocio.

## Estructura Actual

- **Ubicación**: `src/modules/finance/pages/`
- **Componentes clave**:

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Expenses.tsx` | 2 125 | Gastos operativos |
| `pages/CompanyHealth.tsx` | 1 215 | Salud del negocio (con gráficos Recharts) |
| `pages/ProfitLoss.tsx` | 357 | Estado de ganancias y pérdidas |
| `pages/Cash.tsx` | 18 | 🔴 **Stub** — título + `EmptyState` |
| `pages/Finance.tsx` | 18 | 🔴 **Stub** — ruta heredada `/finanzas` |

- **Rutas**: `/gastos`, `/finanzas/salud`, `/finanzas/salud-del-negocio`,
  `/finanzas/ganancias-perdidas`, `/cuentas/caja` (stub).

- **Endpoints principales**:
  `GET/POST/PATCH/PUT/DELETE /api/expenses`, `POST /api/expenses/:id/pay`,
  `GET/POST /api/expense-categories`, `GET /api/bank-accounts`, `GET /api/bcv/rates`.

## Funcionalidades Clave

### Gastos operativos (`Expenses.tsx`)

- Pestañas **FIJO** / **VARIABLE** / **TODOS**, con filtros por categoría y estado.
- KPIs del módulo.
- Campos: nombre, descripción, categoría, tipo, importe, moneda (USD/VES), tasa de cambio, fecha
  de vencimiento, frecuencia, estado, cuenta de pago y notas.
- Registro de pagos con opción de **reprogramar** la siguiente fecha de vencimiento.
- Gestión de categorías de gasto.
- Modal auxiliar con el SQL de ayuda para la instalación de las categorías.

### Salud del negocio (`CompanyHealth.tsx`)

- Selector de año.
- Métricas: valor del inventario, cuentas bancarias, CxC, CxP, ingresos, costos de ventas,
  gastos, utilidad bruta y utilidad neta.
- Evolución de 12 meses.
- **Es el único módulo que usa Recharts**: `ComposedChart`, `Bar`, `Line`, `PieChart`, `Pie`,
  `Cell` (`:21-32`).
- Exportación a PDF con `html2canvas` + `jsPDF`.
- Actualización cada 60 s (no hay realtime: el navegador no tiene claves de Supabase).

### Ganancias y pérdidas (`ProfitLoss.tsx`)

- Periodo: mes, trimestre, año o todo.
- En cascada: **1. Total vendido → 2. Ganancia bruta → 3. Ganancia limpia (neta)**.
- Desglose de gastos por categoría.
- Exportación a PDF (mismo patrón `html2canvas` + `jsPDF`, `:46-65`).

## Reglas de negocio

| Regla | Detalle |
|---|---|
| **Tipos de gasto** | `FIJO` (con `frequency` recurrente) o `VARIABLE` |
| **Frecuencias** | `SEMANAL`, `QUINCENAL`, `MENSUAL`, `BIMESTRAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL` |
| **Estados** | `PENDIENTE`, `PAGADO`, `VENCIDO` (CHECK estricto en la base de datos) |
| **Moneda** | `USD` o `VES`, cada uno con su `exchange_rate` |
| **Importe** | `amount > 0` (CHECK en la base de datos) |
| **Pago de un gasto** | Escribe `expense_payments`; si viene `bankAccountId` convierte el importe a la moneda de la cuenta, descuenta el saldo y crea un movimiento `SALIDA`; el gasto pasa a `PAGADO` o se reprograma con un nuevo `due_date` |
| **Clasificación automática** | `classifyExpenseConcept` (`src/lib/currency.ts:144-165`) infiere la categoría: Nómina, Servicios, Alquileres, Tributos, Fletes, Mantenimiento, Gastos Generales |
| **Bimonetario** | Todos los importes se guardan y se formatean con `formatUSD` / `formatVES` |

## Guía de Reestructuración / Mantenimiento

- **Los reportes financieros deben realizar consultas agregadas eficientes** a las tablas de
  ventas, compras y pagos. Hoy `CompanyHealth` y `ProfitLoss` **leen directamente de Supabase
  desde el navegador** ⇒ ambos fallan cuando la base está conectada.
- **Evitar lógica de cálculo pesada directamente en la UI**: pre-calcular en el backend o con
  `tanstack/react-query`.
- **El costo de ventas está hardcodeado**: `Dashboard.tsx:121` usa **45 %** cuando faltan los
  ítems de la venta, y `ProfitLoss.tsx:103` usa **55 %** de forma fija. Ambos deben derivarse de
  `sale_items × products.cost_usd`.
- **El patrón de export PDF está duplicado** en `CompanyHealth.tsx` y `ProfitLoss.tsx`.
  Extráelo a `src/lib/reportUtils.ts` como `exportPdf(element, filename)`.
- **El `activeRate` de `Expenses.tsx:53` se inicializa en 36,5** (valor obsoleto) antes de la
  carga asíncrona. Inicializa en `null` o en el valor de `getActiveExchangeRate()`.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `CompanyHealth` y `ProfitLoss` leen de Supabase desde el navegador ⇒ **los reportes salen vacíos** | `CompanyHealth.tsx`, `ProfitLoss.tsx` | 🔴 |
| 2 | Costo de ventas hardcodeado (45 % y 55 %) | `Dashboard.tsx:121`, `ProfitLoss.tsx:103` | 🟠 |
| 3 | `expenses`, `expense_categories` y `expense_payments` **no tienen aislamiento de tenant** | `0016_expenses:94-113` | 🔴 |
| 4 | `expenses.amount` con CHECK `> 0` impide registrar un gasto con residual 0 | `0016_expenses:29` | 🟡 |
| 5 | `expenses.currency` admite solo USD/VES, pero `payment_methods.currency` admite USDT/EUR/COP | `0016:30` vs `0004:26` | 🟡 |
| 6 | La tasa inicial `36.5` está obsoleta | `Expenses.tsx:53` | 🟡 |
| 7 | `Cash.tsx` y `Finance.tsx` son stubs sin enlace en el menú | `src/modules/finance/pages/` | ⚪ |
| 8 | El patrón de export PDF está duplicado | `CompanyHealth.tsx`, `ProfitLoss.tsx` | 🟡 |

## Referencias

- [API — gastos](architecture/API.md#13-gastos--apiexpenses-apiexpense-categories)
- [Reglas de negocio §5.4 (gastos), §10 (configuración)](architecture/BUSINESS_RULES.md)
- [Esquema de datos §2.7](architecture/DATABASE.md#27-gastos)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
