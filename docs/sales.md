# Ventas

## Descripción

Módulo encargado de la gestión de ventas del comercio, incluyendo ventas rápidas, pedidos,
cotizaciones y reportes de venta. Es el módulo con mayor densidad funcional del ERP: el POS
("Venta Flash") concentra más de 2 900 líneas en un solo archivo.

## Estructura Actual

- **Ubicación**: `src/modules/sales/`
- **Componentes clave**:

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Sales.tsx` | ~2 900 | POS "Venta Flash" |
| `pages/Orders.tsx` | 1 486 | Control de pedidos |
| `pages/Quotes.tsx` | ~2 961 | Cotizaciones |
| `pages/SalesReport.tsx` | 1 280 | Reporte de ventas |
| `pages/SaleDetailPage.tsx` | 476 | Detalle de comprobante |
| `utils/quoteDocument.ts` | 395 | Documento imprimible de cotización |
| `components/SalesKPIs.tsx`, `SalesCharts.tsx`, `SalesFilters.tsx`, `SalesTransactionsTable.tsx` | — | ⚠ **Stubs sin importadores** |

- **Rutas**: `/ventas-flash/ventas`, `/ventas-flash/pedidos`, `/ventas-flash/cotizaciones`,
  `/ventas-flash/reporte`, `/ventas-flash/reporte/:id`.
  (Compatibilidad: `/ventas`, `/pedidos`.)

- **Endpoints principales**:
  `GET /api/sales`, `GET /api/sale-items`, `GET /api/products`,
  `GET/POST/PATCH/DELETE /api/quotes`, `GET/POST /api/orders`,
  `PATCH /api/orders/:id/delivery-status`, `PATCH /api/orders/:id/payment-status`,
  `GET /api/bank-accounts`, `POST /api/bank-movements`, `GET /api/bcv/rates`.

## Funcionalidades Clave

### Punto de venta (Venta Flash)

- Cuadrícula de productos con búsqueda por nombre, SKU o código de barras, filtros por categoría
  y pestañas de categoría.
- Carrito pegajoso con edición de cantidad y eliminación de líneas.
- **Checkout de 3 pasos**: (1) datos del cliente con autocompletado y alta de cliente nuevo;
  (2) forma de pago; (3) tipo de documento y observaciones.
- Pago `CONTADO` o `CREDITO`, con **abonos múltiples** y capital inicial en crédito.
- Descuento porcentual, toggle de **IVA 16 %** y toggle de **IGTF 3 %**.
- Tipos de documento `FACTURA`, `NOTA` y `ESPERA`; las facturas en espera se pueden restaurar.
- "Venta Libre" para un ítem abierto.
- Impresión del comprobante.

> ⚠ En crédito se exige cliente real (no "Consumidor final") con nombre, RIF, teléfono y
> dirección (`Sales.tsx:803-825`).

### Control de pedidos

- KPIs: total de pedidos, pendientes, completados, facturación activa.
- Filtros por estado de entrega, estado de pago, método de entrega, fecha y búsqueda.
- Vista en **tabla ⇄ kanban** (`viewMode`, `Sales/Orders.tsx:116`).
- Detalle del pedido, alta manual y exportación XLSX.
- Campana sonora (Web Audio) cuando entra un pedido nuevo, con preferencia persistida en
  `frenyer_order_sound`.

### Cotizaciones

- Listado con filtros por búsqueda, cliente, producto y estado (`Creada` / `Facturada` /
  `Expirada` / `Rechazada`).
- Modal a pantalla completa para crear y editar, con selector de catálogo, días de validez,
  descuento, IVA/IGTF.
- **Conversión a factura**: valida el stock real por ítem; los ítems sin existencias se retiran
  y se reportan; en `CREDITO` genera la cuenta por cobrar.
- Rechazo, borrado e impresión/descarga del documento (HTML con CSS `@page { size: letter }`).

### Reporte de ventas

- Selector de periodo: hoy / semana / mes / todo / personalizado.
- Tres vistas: `VENTAS`, `PRODUCTOS`, `METODOS_PAGO`.
- KPIs: total de órdenes, ingresos facturados, utilidad estimada, ticket promedio.
- Exportación XLSX con membrete fiscal, impresión y acceso al detalle.

## Flujos de negocio

### Venta en contado

```
Carrito → checkout paso 1 (cliente) → paso 2 (CONTADO)
       → cuenta bancaria + método de pago
       → POST /api/bank-movements  (ENTRADA, saldo de la cuenta)
       → descuento de stock: PATCH /api/products/:sku/stock
       → venta + ítems + pago en la base de datos
```

### Venta en crédito

```
… paso 2 (CREDITO) → capital inicial (abono)
       →CxC con saldo = total − capital inicial
       → abonos posteriores: POST /api/accounts-receivable/:id/payments
                             (depósito en la cuenta + movimiento ENTRADA)
```

### Cotización a factura

```
Cotización (Creada) → PATCH /api/quotes/:id/status  (validación de stock)
                    → factura con correlativo de 4 dígitos
                    → en CREDITO: CxP/CxC según el tipo de pago
```

## Guía de Reestructuración / Mantenimiento

- **Para modificar la lógica de emisión**, actualiza `handleFinalizeSale` en `Sales.tsx`.
- **Las consultas a la base de datos se manejan mediante `src/lib/supabase/db.ts`.** Asegura
  siempre el uso de RLS y, preferentemente, la vía `/api/*` (ver el aviso de abajo).
- **Reportes**: los exportes (Excel/PDF) siguen el estándar: encabezados gris oscuro con
  letras blancas, datos en celdas blancas/transparentes con texto oscuro, membrete dinámico con
  los datos del negocio. La lógica está centralizada en `src/lib/reportUtils.ts`.
- **Al añadir una vista al POS**, respétala estructura de 3 pasos del checkout y el bloque de
  tipos de movimiento (`ENTRADA` / `SALIDA` / `CORRECCION`).
- **Al añadir un endpoint nuevo**, sigue el patrón de [API.md](architecture/API.md): devuelve
  `{ success, data?, error? }` y lee `success` en el cliente.

### ⚠ Aviso crítico de persistencia

`recordSaleInSupabase` (`src/lib/supabase/db.ts:1022`) escribe la venta, los ítems, el pago, el
saldo bancario, el descuento de stock, el kárdex y la CxC **a través del cliente Supabase del
navegador, que está inerte** (la clave es el literal
`'sin-credencial-en-el-navegador'`, `src/lib/supabase/client.ts:38-44`).

Consecuencia: **las ventas no se persisten** cuando Supabase está conectado. Solo llega al
servidor la actualización del stock (`PATCH /api/products/:sku/stock`).

Además, `recordSaleInSupabase` **no usa transacción**: la venta, los ítems, los pagos, el saldo,
el stock, el kárdex y la CxC son escrituras separadas, y los fallos parciales solo se reportan
como avisos ("La venta se creó, pero no se guardaron sus productos").

**Acción requerida:** crear `POST /api/sales` y migrar la función a la vía del servidor.
Ver [KNOWN_ISSUES P-02](operations/KNOWN_ISSUES.md#p-02).

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | La venta no se persiste | `db.ts:1022` | 🔴 |
| 2 | El correlativo de factura se lee de Supabase desde el navegador | `db.ts` `getNextInvoiceCorrelative` | 🔴 |
| 3 | `SalesReport`, `SaleDetailPage` y `Sales.tsx` leen de Supabase desde el navegador | varios | 🔴 |
| 4 | Etiqueta fija `"CAJA ABIERTA (#77138)"` | `Sales.tsx:1135` | 🟡 |
| 5 | La conversión de quotation valida el stock en el cliente y en el servidor (doble fuente) | `Quotes.tsx` / `server.ts` | 🟡 |
| 6 | Cuatro componentes stub sin importadores | `components/Sales*.tsx` | 🟡 |
| 7 | `SaleDetailModal` estilado con utilidades de Tailwind (sin efecto) | `SaleDetailModal.tsx:267-482` | 🟡 |
| 8 | Resaltado del sidebar con igualdad exacta: `/ventas-flash/reporte/:id` no marca la sección | `Sidebar.tsx:186,219` | ⚪ |

## Referencias

- [API — módulo de ventas](architecture/API.md#14-ventas--apisales-apisale-items)
- [Reglas de negocio §5 (impuestos), §7 (tesorería), §8 (CxC/CxP)](architecture/BUSINESS_RULES.md)
- [Esquema de datos §2.5](architecture/DATABASE.md#25-ventas-cotizaciones-y-pedidos)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
