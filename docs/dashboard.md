# Dashboard

## Descripción

El dashboard es el punto central de entrada a Frenyer ERP. Proporciona una visión general de los
indicadores clave de desempeño (KPIs) del negocio, con foco en ventas, utilidad, inventario y
obligaciones próximas a vencer.

## Estructura Actual

- **Ubicación**: `src/pages/Dashboard.tsx` (395 líneas)
- **Componentes**: utiliza componentes reutilizables de UI (`Card`, `Badge`) para mostrar
  resúmenes financieros y operativos.
- **Rutas**: `/dashboard` y `/admin` (alias).

> ℹ️ El componente `Kpi` de `src/components/data-display/Kpi.tsx` **existe pero no se usa**: las
> tarjetas se construyen a mano con `<Card>` + `.kpi-label` + `.kpi-value`.

### Datos que consume

Seis peticiones en paralelo (`Dashboard.tsx:87-94`), más dos relecturas explícitas
(`:198` y `:226`):

| Endpoint | Uso |
|---|---|
| `GET /api/products` | Stock, `cost_usd`, `min_stock` |
| `GET /api/sales` | Ingresos, ventas de la semana, costo de las ventas |
| `GET /api/sale-items` | Ítems de cada venta (para el costo y el top de productos) |
| `GET /api/expenses` | Gastos del periodo |
| `GET /api/accounts-receivable` | CxC y saldos por vencer |
| `GET /api/accounts-payable` | CxP y saldos por vencer |

## Funcionalidades Clave

### KPIs (`.grid.grid-4`, `:292-311`)

| Tarjeta | Cálculo |
|---|---|
| **Ventas (7 días)** | Suma de `total_usd` de las ventas `COMPLETADA` |
| **Utilidad Mensual** | Ingresos − costo de ventas − gastos |
| **Inventario (Unidades)** | Suma de `stock` |
| **Productos bajo mínimo** | Conteo de productos con `stock <= min_stock` |

### Bloques (2 × `.grid.grid-2`, `:313-365`)

| Bloque | Contenido |
|---|---|
| **Top-5 productos más vendidos** | Ranking por cantidad vendida (`:139-151`) |
| **Productos con bajo stock** | Lista de productos en o por debajo del mínimo (`:153-157`) |

### Bloques de obligaciones (`:367-390`)

- **CxC a vencer** y **CxP a vencer**, con ventana de **21 días** o el mes en curso
  (`:159-190`).

### Cálculos

- **Costo por venta**: `sale_items.quantity × products.cost_usd` (`:108-114`).
- **Utilidad**: ingresos − costo de ventas − gastos (`:136-137`).

## Guía de Reestructuración / Mantenimiento

- **Para añadir nuevos KPIs**, importa los servicios de datos necesarios
  (`src/lib/supabase/db.ts`) dentro de un `useEffect` y actualiza el estado local del
  componente. Actualmente las peticiones son `fetch` directos a `/api/*` dentro del mismo
  `useEffect` (`:87-94`).
- **Seguir el Design System unificado** (colores de acento, tipografía) definido en
  [`design-system/DESIGN_SYSTEM.md`](design-system/DESIGN_SYSTEM.md).
- **Reutiliza `formatUSD` / `formatVES`** de `src/lib/currency.ts` para todos los importes. Nunca
  `toFixed` suelto.
- **Usa `<EmptyState>`** cuando una sección no tenga datos, en vez de una sección vacía.
- **El panel no usa gráficos.** Si añades uno, sigue el patrón de `CompanyHealth.tsx` con
  Recharts y los tokens de color.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | La etiqueta "Ventas (7 días)" **no aplica ningún filtro de fecha**: suma todas las ventas `COMPLETADA` | `Dashboard.tsx:294` y `:96,117-124` | 🟠 |
| 2 | Costo de ventas **hardcodeado al 45 %** cuando una venta no tiene ítems | `Dashboard.tsx:121` | 🟠 |
| 3 | Filtra `status = 'PAGADO'` sobre filas escritas como `'PAGADA'` ⇒ saldos pagados que aparecen como pendientes | `Dashboard.tsx:172` | 🟠 |
| 4 | El componente `Kpi` no se usa | `src/components/data-display/Kpi.tsx` | ⚪ |
| 5 | Seis peticiones en paralelo dentro de un `useEffect` sin caché ni cancelación al desmontar | `Dashboard.tsx:87-94` | ⚪ |
| 6 | Relecturas explícitas de CxC y CxP que duplican las peticiones iniciales | `Dashboard.tsx:198,226` | ⚪ |

## Referencias

- [Design System — KPIs y rejillas](design-system/DESIGN_SYSTEM.md#5-6-kpi)
- [Reglas de negocio §1 (bimonetario)](architecture/BUSINESS_RULES.md#1-principio-bimonetario)
- [API — dashboard](architecture/API.md)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
