# Inventario

## Descripción

Gestión integral de productos, compras internas y movimientos de inventario (entradas/salidas).
El módulo cubre el catálogo valorizado, el kárdex de movimientos y el reporte diario.

## Estructura Actual

- **Ubicación**: `src/modules/inventory/`
- **Componentes clave**:

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Inventory.tsx` | 2 207 | Catálogo de productos |
| `pages/InternalPurchases.tsx` | 722 | Compras internas |
| `pages/Movements.tsx` | 2 604 | Kárdex de movimientos |
| `pages/DailyInventoryReport.tsx` | 1 819 | Reporte diario |

- **Componentes compartidos**: `src/components/modals/NewPurchaseModal.tsx` (asistente de
  compra de 4 pasos, 1 657 líneas).

- **Rutas**: `/inventarios/productos`, `/inventarios/compras`, `/inventarios/movimientos`,
  `/inventarios/reporte-diario`. (Compatibilidad: `/inventario`.)

- **Endpoints principales**:
  `GET/POST/PUT/DELETE /api/products`, `PATCH /api/products/:sku/stock`,
  `GET /api/products/:sku/stock`, `GET /api/inventory/movements`,
  `POST /api/inventory/adjustments`, `GET/POST /api/purchases`, `GET/POST/PATCH/DELETE
  /api/branches`.

## Funcionalidades Clave

### Catálogo de productos (`Inventory.tsx`)

- KPIs: productos registrados, existencias en físico, valoración total a costo, valoración
  estimada a precio de venta.
- Filtro por sede y facetas por categoría y marca.
- Alta, edición y baja de productos; ajuste rápido de stock.
- Espacio de carga de imagen; importación y exportación XLSX.
- Asigna `branch_id` y normaliza los UUID no válidos antes de enviar.

### Compras internas (`InternalPurchases.tsx`)

- Listado con búsqueda y filtro de fecha (todo / mes / hoy).
- KPIs: total USD, total VES y total de unidades.
- Detalle de la compra y **voucher imprimible** (se abre en una ventana nueva).
- El alta se hace desde `NewPurchaseModal`, un asistente de 4 pasos:
  1. Proveedor y datos de la factura (con la opción de actualizar el costo del producto).
  2. Catálogo y cesta.
  3. Pago (`CONTADO` / `CREDITO`, cuenta bancaria, instrumento, referencia, días de crédito).
  4. Resumen y confirmación.

  Incluye submodales de **Nuevo Proveedor** y **Nuevo Producto**, que escriben en la base de
  datos.

### Kárdex de movimientos (`Movements.tsx`)

- **6 ejes de filtro**: búsqueda, almacén, tipo de movimiento
  (`ENTRADAS`/`SALIDAS`/`COMPRAS`/`VENTAS`/`AJUSTES`), periodo, producto.
- Columnas ordenables, paginación de 25 registros por página, detalle y exportación XLSX/impresión.
- Registro de ajustes de stock: `ENTRADA`, `SALIDA` o `CORRECCION`.

### Reporte diario (`DailyInventoryReport.tsx`)

- Periodo `HOY` / `SEMANA` / `MES` / `HISTORICO` o rango personalizado.
- Filtro por tipo de movimiento.
- KPIs: total de entradas, total de salidas/ventas, balance neto, número de transacciones.
- Vista previa imprimible y copia al portapapeles de las referencias.
- Exportación XLSX.

## Reglas de negocio

| Regla | Detalle |
|---|---|
| **Stock nunca negativo** | `POST /api/orders` rechaza con 400 un pedido que lo dejaría negativo. En los ajustes, `SALIDA` y `CORRECCION` tienen piso 0. |
| **Tipos de movimiento** | `COMPRA`, `VENTA`, `AJUSTE_ENTRADA`, `AJUSTE_SALIDA`, `AJUSTE_CORRECCION`, `DEVOLUCION` |
| **Ajustes** | Calculan `previous_stock`, `new_stock`, `total_usd`, `total_ves`, `unit_cost_usd`, `unit_price_usd` y `exchange_rate`. Documento automático `AJU-####`. |
| **Compra a crédito** | Genera **automáticamente** la cuenta por pagar, con saldo = total, estado `PENDIENTE` y vencimiento a +30 días. |
| **Compra en contado** | Genera un movimiento bancario `SALIDA`. |
| **Costo promedio ponderado** | `calculateWeightedAverageCost` (`src/lib/currency.ts:75-85`) actualiza el costo al recibir una compra. |
| **Bimonetario** | Cada movimiento guarda USD, VES y la tasa aplicada. |

## Guía de Reestructuración / Mantenimiento

- **Para añadir tipos de movimiento**, actualiza la tabla `inventory_movements`
  (`supabase/migrations/0017_inventory_movements.sql:14`) **y** la lógica en `Movements.tsx`.
  ⚠ La columna **no tiene CHECK**: el comentario en la migración es la única documentación de los
  valores válidos.
- **Mantén la integridad de los datos bimonetarios** usando la tasa BCV
  (`getActiveExchangeRate` de `src/lib/currency.ts`).
- **Los ajustes de stock se registran por el servidor** (`POST /api/inventory/adjustments`),
  que además actualiza `products.stock` y persiste en `data/inventory_adjustments.json`.
- **Al crear un producto**, valida el SKU: no hay restricción única en la base de datos, así que
  un SKU duplicado hace que el stock se actualice en la fila equivocada (`LIMIT 1`).
- **Al comprar**, recuerda que el RPC `record_internal_purchase` busca el producto **solo por
  `sku`, sin filtrar por organización** (`0013:230`) ⇒ riesgo de stock cruzado entre tenants.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `GET /api/inventory/movements` y `POST /api/inventory/adjustments` son **públicos** y caen en el tenant por defecto | `server.ts:1484,1651` | 🔴 |
| 2 | El guard de `/api/inventory-movements` (`server.ts:482`) está **muerto**: ese prefijo no existe | `server.ts:482` | 🟠 |
| 3 | `Movements.tsx` importa `supabase` directamente y lee del navegador | `Movements.tsx:54` | 🔴 |
| 4 | El kárdex fusiona 4 fuentes y deduplica solo por `doc_number-sku` ⇒ filas duplicadas | `server.ts:1530-1645` | 🟡 |
| 5 | El trigger de descuento automático de stock **nunca se aplicó** (está fuera de la carpeta de migraciones) y busca por `sku` sin organización | `workspace/0019` | 🟡 |
| 6 | El almacén por defecto es la sede de ejemplo `"Tienda Bella Vista (SP-01)"`, que `db.ts:2768-2769` filtra | `InternalPurchases.tsx:73`, `NewPurchaseModal.tsx:73` | 🟡 |
| 7 | `products.sku` sin restricción única | `0001:6` | 🟡 |
| 8 | `products.branch_id` con FK `NO ACTION` ⇒ no se puede eliminar una sede con productos | `0001:6` | 🟠 |
| 9 | Columnas que la app usa y no existen en las migraciones: `cost_usd`, `barcode`, `min_stock`, `unit`, `image_url`, `brand`, `description` | `products` | 🟠 |

## Referencias

- [API — catálogo e inventario](architecture/API.md#5-catálogo-productos-y-stock)
- [Reglas de negocio §6 (inventario)](architecture/BUSINESS_RULES.md#6-inventario)
- [Esquema de datos §2.4](architecture/DATABASE.md#24-catálogo-e-inventario)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
