# Reglas de negocio — Frenyer ERP

> Contrato funcional del sistema: bimonetariedad, tipos de cambio, redondeo, estados de
> documentos, correlativos, catálogo y autorización.
> Verificado contra `server.ts`, `src/lib/currency.ts`, `src/lib/supabase/db.ts` y
> `supabase/migrations/` en la revisión de octubre 2026.

---

## 1. Principio bimonetario

> Frenyer opera **simultáneamente en USD y VES**. Toda operación financiera, flujo de caja o
> cuenta bancaria debe calcular y registrar el tipo de cambio de referencia **vigente en el
> momento de la transacción**, para mantener un historial de auditoría consistente.

### 1.1 Moneda base y doble contabilización

- **Moneda base:** USD.
- **Toda transacción guarda las dos monedas.** No existe un importe en una sola moneda.
- Los campos siguen el patrón `*_usd` / `*_ves` y, cuando aplica, `exchange_rate`.

| Entidad | Campos bimonetarios |
|---|---|
| Venta (`sales`) | `subtotal_usd`, `discount_usd`, `tax_usd`, `igtf_usd`, `total_usd`, `total_ves`, `exchange_rate` |
| Ítem de venta (`sale_items`) | `unit_price_usd`, `total_usd`, `total_ves` |
| Cotización | Mismos campos que `sales` (comparte tabla, `doc_type='COTIZACION'`) |
| Pago (`payments`) | `amount_usd`, `amount_ves`, `exchange_rate` |
| CxC (`accounts_receivable`) | `total_usd`, `balance_usd` |
| Pago de CxC (`receivable_payments`) | `amount_usd`, `amount_ves`, `exchange_rate` |
| CxP (`accounts_payable`) | `total_usd`, `balance_usd`, `exchange_rate` |
| Pago de CxP (`payable_payments`) | `amount_usd`, `amount_ves`, `exchange_rate` |
| Compra (`purchases`) | `subtotal_usd`, `total_usd`, `total_ves`, `exchange_rate` |
| Ítem de compra (`purchase_items`) | `unit_cost_usd`, `total_usd`, `total_ves` |
| Movimiento bancario (`bank_movements`) | `amount` (en la moneda de la cuenta), `rate`, `commission` |
| Gasto (`expenses`) | `amount`, `currency` (`USD`/`VES`), `exchange_rate` |
| Pago de gasto (`expense_payments`) | `amount`, `currency`, `exchange_rate` |
| Movimiento de inventario (`inventory_movements`) | `unit_cost_usd`, `unit_price_usd`, `exchange_rate`, `total_usd`, `total_ves` |
| Pedido (`orders`) | `subtotal_usd`, `total_usd`, `total_ves`, `exchange_rate`, `is_future_rate` |

### 1.2 Instantánea de tasa

**Regla:** la tasa vigente se **copia** al registro en el momento de la transacción.
Cambiar la tasa después **no reescribe** la historia.

Dónde se congela:

| Transacción | Campo | Referencia |
|---|---|---|
| Pedido de la tienda | `exchange_rate` + `is_future_rate` | `server.ts:2011-2012` |
| Cotización | `exchange_rate` | `server.ts:2541` |
| Compra interna | `exchange_rate` | `server.ts:5895` |
| Pago de CxC | `exchange_rate` | `server.ts:5314` |
| Pago de CxP | `exchange_rate` | `server.ts:5725` |
| Movimiento bancario | `rate` | `server.ts:3343` |
| Ajuste de inventario | `exchange_rate` | `server.ts:1780` |
| Gasto | `exchange_rate` | `expenses.exchange_rate` |
| Venta POS | `exchange_rate` | `sales.exchange_rate` (`0002:122`) |

### 1.3 Conversión de moneda en cuentas bancarias

Cuando un importe en una moneda se aplica a una cuenta en otra:

| Dirección | Operación | Referencia |
|---|---|---|
| USD → VES | `importe × tasa` | `server.ts:4892-4896`, `5372` |
| VES → USD | `importe ÷ tasa` | `server.ts:4892-4896`, `5770` |

**Resolución de la cuenta destino** (movimientos y pagos):
1. Por `bank_account_id` explícito.
2. Si no, por **moneda**: una cuenta USD para un importe USD, una VES para un importe VES.
3. Si no, por `account_type === 'Efectivo'`.
4. Si no, la primera cuenta activa.

`server.ts:3273-3292`.

---

## 2. Redondeo monetario

> **Regla:** aplica siempre redondeo a **dos decimales exactos** en importes, impuestos (IVA,
> IGTF) y márgenes, para evitar descuadres de centavos en balances consolidados.

### 2.1 Fórmulas

| Magnitud | Fórmula | Ubicación |
|---|---|---|
| Importe monetario (2 dp) | `Math.round(x * 100) / 100` | `server.ts:521`, `1745-1746`, `1971`, `2517`, `2663`, `3297`, `3445-3446`, `4897-4899`, `5305`, `5538`, `5717`, `5872`; `currency.ts:27-31`, `36-40` |
| Tipo de cambio (4 dp) | `Math.round(x * 10000) / 10000` | `server.ts:731-735`, `805-809` |

Cada total derivado se **vuelve a redondear explícitamente**. No se acumula punto flotante sin
redondear.

### 2.2 Formato en la interfaz

| Función | Formato | Referencia |
|---|---|---|
| `formatUSD(amount, prefix='USD ')` | `toLocaleString('en-US')`, 2 dp | `currency.ts:45-47` |
| `formatVES(amount, prefix='Bs. ')` | `toLocaleString('es-VE')`, 2 dp | `currency.ts:52-54` |
| `getDualPrice(amount, rate?)` | `{ usd, ves, rawUSD, rawVES, rate }` | `currency.ts:59-69` |

### 2.3 Costo promedio ponderado (CPP)

`calculateWeightedAverageCost(stock, cost, qty, purchaseCost)` (`currency.ts:75-85`):

```
CPP = ((stock × cost) + (qty × purchaseCost)) / (stock + qty)     → redondeo a 2 dp
```

Se usa al recibir compras para actualizar el costo del producto y el valor del inventario.

---

## 3. Tipos de cambio

### 3.1 Triple fuente

`GET /api/bcv/rates` (`server.ts:597-750`):

| Prioridad | Origen | Timeout | `source` |
|---|---|---|---|
| 1 | `https://www.bcv.org.ve/glosario/cambio-oficial` (scraping de `#dolar` / `#euro` + "Fecha Valor") | 8 s | `BCV_DIRECT` |
| 2 | `https://ve.dolarapi.com/v1/dolares/oficial` (+ `/euros/oficial`) | 5 s | `DOLAR_API_FALLBACK` |
| 3 | Última tasa certificada en memoria (`lastCertifiedRate`) | — | el de la tasa anterior |
| 4 | — | — | **503** `{ success: false, error }` |

El scraping usa un agente HTTPS con `rejectUnauthorized: false` y un User-Agent de navegador
(`server.ts:485-487`, `555-592`).

### 3.2 Tasa en memoria

`lastCertifiedRate` (`server.ts:490-517`) es un singleton:

| Campo | Valor inicial |
|---|---|
| `usdRate` | `877.90` |
| `source` | `'MANUAL'` |
| `eurRate` | `round(877.90 × 1.08, 4)` |

### 3.3 Regla de tasa futura

> Si la fecha valor es **futura** **o** son las **16:00 en `America/Caracas`** (UTC-4), la tasa
> pasa a ser "futura" y `appliedRate = futureRate`.

`getCaracasTimeInfo` (`server.ts:526-552`) implementa la zona horaria; `isFutureRateTime`
(`currency.ts:110-115`) la replica en el cliente.

`determineEffectiveRate(current, future)` (`currency.ts:91-108`) devuelve
`{ effectiveRate, isFutureApplied, futureRateHigher }`: la tasa futura gana si es `> 0`.

**Contrapartida en la interfaz:** `DashboardLayout` guarda la tasa en `localStorage`
(`frenyer_bcv_rate`, `frenyer_bcv_is_future`, `frenyer_bcv_rate_source`, `frenyer_bcv_rate_date`)
y emite el evento `frenyer:rate-changed`.

### 3.4 Tasa manual

`POST /api/bcv/rates/manual` (`server.ts:774-848`):

- **Rol requerido** ∈ {`admin`, `superadmin`, `gerente`, `gerente general`, `manager`, `owner`}
  (case-insensitive) → **403** en caso contrario.
- Cuerpo: `{ rate, futureRate?, valueDate?, notes? }`.
- Persiste en `exchange_rates` con `base_currency:'USD'`, `quote_currency:'VES'`,
  `source:'MANUAL'`, `is_future_rate`.
- `eurRate = appliedRate × 1.08`.

> 🔴 **Defecto:** la tasa manual **nunca se aplica a `lastCertifiedRate`**. El POST construye
> `certifiedRate` y la persiste, pero no asigna la variable en memoria, así que
> `calculateTransactionVES` sigue usando la tasa anterior.
>
> 🔴 La lista de roles **omite `administrador`**, que es el valor que produce `toProfileRole()`.
> Y el rol comprobado viene de `organization_members.role` (default `'viewer'`), no de
> `profiles.role`. Los dos sistemas de roles no coinciden.

### 3.5 Conversión de referencia

```ts
// server.ts:519-523
calculateTransactionVES(usdAmount, providedRate?) {
  const rate = providedRate > 0 ? providedRate : (lastCertifiedRate?.appliedRate || 877.90);
  return Math.round(usdAmount * rate * 100) / 100;
}
```

> ⚠ El euro es **sintético** (`appliedRate × 1.08`), nunca una cotización real del BCV o del ECB.

---

## 4. Documentos y correlativos

### 4.1 Tipos de documento

| `doc_type` | Significado | Registros en |
|---|---|---|
| `FACTURA` | Factura emitida | `sales` |
| `NOTA` | Nota de venta | `sales` |
| `ESPERA` | Factura en espera (aparcada en el POS) | `sales` |
| `COTIZACION` | Cotización / presupuesto | `sales` (misma tabla) |

### 4.2 Estados

| Entidad | Estados |
|---|---|
| `sales.status` | `COMPLETADA` · `EN_ESPERA` · `ANULADA` |
| `sales.payment_type` | `CONTADO` · `CREDITO` |
| `sales.quote_status` | `Creada` · `Facturada` · `Rechazada` |
| `accounts_receivable.status` | `PENDIENTE` · `PARCIAL` · `PAGADO`/`PAGADA` ⚠ |
| `accounts_payable.status` | `PENDIENTE` · `PARCIAL` · `PAGADO`/`PAGADA` ⚠ |
| `expenses.status` | `PENDIENTE` · `PAGADO` · `VENCIDO` (CHECK estricto) |
| `expenses.type` | `FIJO` · `VARIABLE` |
| `expenses.frequency` | `SEMANAL` · `QUINCENAL` · `MENSUAL` · `BIMESTRAL` · `TRIMESTRAL` · `SEMESTRAL` · `ANUAL` |
| `orders.delivery_status` | `RECIBIDO` · `PREPARADO` · `LISTO_PARA_ENTREGAR` · `EN_CAMINO` · `ENTREGADO` · `CANCELADO` |
| `orders.payment_status` | `PENDIENTE` · `PAGADO` · `REEMBOLSADO` |
| `orders.delivery_method` | `RETIRO` · `DOMICILIO` |
| `orders.payment_method` | `PAGO_MOVIL` · `TRANSFERENCIA` · `EFECTIVO_USD` · `PUNTO_VENTA` · `ZELLE` |
| `inventory_movements.movement_type` | `COMPRA` · `VENTA` · `AJUSTE_ENTRADA` · `AJUSTE_SALIDA` · `AJUSTE_CORRECCION` · `DEVOLUCION` |
| `bank_movements.type` | `ENTRADA` · `SALIDA` |
| `bank_movements.commission_type` | `Fija` · `Porcentual` |
| `bank_accounts.currency` | `VES` · `USD` |
| `bank_accounts.account_type` | `Corriente` · `Ahorro` · `Custodia` · `Caja` |
| `payment_methods.currency` | `VES` · `USD` · `USDT` · `EUR` · `COP` |

> ⚠ **Deriva de género en el estado de pago:** `PAGADA` (femenino) en los RPCs de CxP/CxC
> (`0008:275`, `0008:169-171`) frente a `PAGADO` (masculino) en servidor y UI. Los filtros
> `status = 'PAGADO'` de `Dashboard.tsx:172` y `CompanyHealth.tsx:175,182` **no encuentran** las
> filas escritas como `'PAGADA'`.

### 4.3 Correlativos

| Documento | Formato | Origen |
|---|---|---|
| Factura / cotización | `NNNN` (4 dígitos, ceros a la izquierda) | `max(int(doc_number))+1` sobre `sales`, **sin bloqueo** (`0011:79-83`, `0011:196-200`) |
| Pedido de la tienda | `PED-000N` | `N = pedidos locales + 1` (`server.ts:1962-1964`) |
| Compra interna | `CMP-00001` | RPC `record_internal_purchase` (`0013:131-136`) |
| Proveedor | `PRV-000N` | `0020:102`; asignación en el servidor `server.ts:3580-3594` |
| Ajuste de inventario | `AJU-####` | `server.ts` (ajuste) |

> ⚠ El correlativo de factura se calcula con `max(int)+1` **sin bloqueo de fila** ⇒ bajo
> concurrencia dos documentos pueden obtener el mismo número. No hay índice único en
> `(organization_id, doc_number)` que lo impida.

---

## 5. Impuestos y descuentos

### 5.1 POS — Venta Flash

El POS (`src/modules/sales/pages/Sales.tsx`) ofrece:

| Concepto | Valor | Efecto |
|---|---|---|
| Tipo de pago | `CONTADO` / `CREDITO` | En crédito exige cliente real (no "Consumidor final") con nombre/RIF/teléfono/dirección (`Sales.tsx:803-825`) |
| Descuento | Porcentaje | `discount_usd` sobre el subtotal |
| IVA | Toggle, **16 %** | `tax_usd` |
| IGTF | Toggle, **3 %** | `igtf_usd` |
| Abonos múltiples | Lista de pagos | Varios pagos parciales en una misma venta |
| Capital inicial | En crédito | Anticipo que reduce el saldo de la CxC |
| Tipo de documento | `FACTURA` / `NOTA` / `ESPERA` | Determina el correlativo y el comportamiento |

**Orden de cálculo:** subtotal → descuento → IVA → IGTF → total. Cada paso se redondea a 2 dp.

### 5.2 Cotizaciones

Mismo motor de impuestos que el POS, más:

- **Días de validez** → `expires_at = now() + validityDays` (7 por defecto).
- **Conversión a factura:** valida el stock real por ítem; los ítems sin stock se eliminan y se
  reportan en `removed_items`; marca la cotización `Facturada` y guarda
  `converted_to_sale_id`; en `CREDITO` crea la entrada en `accounts_receivable`.
- **Rechazo:** marca `Rechazada`. Una cotización `Facturada` **no se puede rechazar**.

### 5.3 Compras internas

- `paymentType` `CONTADO` → movimiento bancario `SALIDA`.
- `paymentType` `CREDITO` → **crea automáticamente** una entrada en `accounts_payable`
  (saldo = total, `PENDIENTE`, vencimiento a **+30 días** por defecto) y la sincroniza a
  Supabase (`server.ts:5924-5956`).

### 5.4 Gastos

- Clasificación: `FIJO` (recurrente con `frequency`) o `VARIABLE`.
- `amount > 0` (CHECK de base de datos).
- Moneda `USD` o `VES` con su propia `exchange_rate`.
- Al pagar: `status = PAGADO`, o `PENDIENTE` con nuevo `due_date` si se reprograma.

---

## 6. Inventario

### 6.1 Kárdex

`GET /api/inventory/movements` fusiona **cuatro fuentes** y deduplica por `doc_number-sku`:

1. `inventory_movements` (Supabase).
2. `data/inventory_adjustments.json` (ajustes locales).
3. Filas sintéticas `VENTA` derivadas de `sales` + `sale_items`.
4. Filas sintéticas `COMPRA` derivadas de `purchases` + `purchase_items`.

Orden: `created_at` descendente.

> ⚠ La fusión de 4 fuentes puede producir **filas duplicadas en la UI del kárdex** cuando la
> misma operación está en más de una fuente.

### 6.2 Ajustes de stock

`POST /api/inventory/adjustments`:

| Tipo | Efecto sobre el stock |
|---|---|
| `ENTRADA` | `+quantity` |
| `SALIDA` | `−quantity`, con piso en `0` |
| `CORRECCION` | Fija el valor absoluto |

Calcula y persiste: `previous_stock`, `new_stock`, `total_usd`, `total_ves`, `unit_cost_usd`,
`unit_price_usd`, `exchange_rate`, `reason`, `notes`, y el documento `AJU-####`.

### 6.3 Reglas de stock

- **El stock nunca puede quedar negativo.** `POST /api/orders` rechaza con **400** un pedido
  que lo dejaría negativo (`server.ts:1943-1960`).
- `record_internal_purchase` incrementa el stock; `convert_quote_to_invoice` lo descuenta
  validando disponibilidad real.
- El trigger `trg_deduct_product_stock` (solo en `workspace/0019`) descuenta al insertar en
  `sale_items`, ignorando los SKUs que empiezan por `LIB-`.

> ⚠ **El trigger nunca se ha aplicado por herramienta** (está fuera de `supabase/migrations/`),
> y busca `products` por `sku` **sin** filtrar por organización ⇒ riesgo de stock cruzado entre
> tenants.

---

## 7. Tesorería

### 7.1 Movimiento bancario

```
delta      = ENTRADA ? +amount : −(amount + commission)
newBalance = round(balance + delta, 2)
```

Comisión: `Fija` (importe fijo) o `Porcentual` (`amount × pct / 100`).

**Orden de escritura (movimiento):** intenta el RPC atómico `record_bank_movement`; si el RPC no
existe, hace read-modify-write del saldo + INSERT del movimiento. Siempre escribe el archivo
local y el saldo local.

### 7.2 Transferencia

- Genera **dos** movimientos: `SALIDA` en el origen, `ENTRADA` en el destino.
- Actualiza ambos saldos.
- Si hay comisión > 0, **crea además una fila en `expenses`** (categoría "Gastos Bancarios",
  estado `PAGADO`).
- El RPC `record_bank_transfer` **recalcula el importe destino desde la tasa y lo rechaza si no
  coincide** (`0012:215-222`).

### 7.3 Ciclo de vida de una cuenta bancaria

| Operación | Efecto |
|---|---|
| `DELETE /api/bank-accounts/:id` (sin `?permanent=true`) | Borrado lógico: `status = 'Inactivo'` |
| `DELETE /api/bank-accounts/:id?permanent=true` | Borrado duro |
| La RPC `record_bank_movement` | Exige `status = 'Activo'` |

> ⚠ La comparación de estado es **sensible a mayúsculas** en `0012:72` (`= 'Activo'`) y
> **insensible** en `0008:244` (`upper(status) = 'ACTIVO'`).

---

## 8. Cuentas por cobrar y por pagar

### 8.1 Ciclo de vida

```
                    ┌────────────┐
  crear ──────────► │ PENDIENTE  │
                    └─────┬──────┘
              pago parcial │
                    ┌─────▼──────┐
                    │  PARCIAL   │◄─── nuevos abonos
                    └─────┬──────┘
              pago total  │
                    ┌─────▼──────┐
                    │  PAGADO    │
                    └────────────┘
```

**Cálculo del saldo:** `newRemaining = max(0, balance - amount)`.

| Operación | Efecto en la cuenta bancaria |
|---|---|
| Pago de CxC | **Depósito**: `ENTRADA` (la cuenta VES recibe `amount_ves`; la USD, `amount_usd`) |
| Pago de CxP | **Retiro**: `SALIDA` con concepto `Pago a proveedor - …` |

### 8.2 Reglas adicionales

- **CxP: protección de 30 s contra referencias duplicadas** (`server.ts:5761-5765`).
- **CxP: creación automática del proveedor** si `create_new_supplier`/`save_supplier` está activo
  y no hay coincidencia (por RIF normalizado o por nombre normalizado).
- **Síntesis de pagos:** cuando `total_usd − balance_usd` supera la suma de los pagos
  registrados, el servidor **sintetiza** un pago (`PAGO-COMPLETO` en CxC, `ABONO` en CxP) para
  cuadrar el saldo. Puede generar pagos que no existen en la base.
- **Alta de CxC desde una venta en crédito:** la crea el propio flujo de venta del POS.

### 8.3 Reconciliación de proveedores

`GET /api/suppliers` ejecuta `autoReconcileSuppliers(orgId)`, que **sintetiza proveedores** desde:

1. Las filas de `accounts_payable` sin proveedor asignado.
2. Los movimientos bancarios cuyo concepto coincide con
   `/Pago a proveedor\s*-\s*([^(]+)(?:\(([^)]+)\))?/i`.

La deduplicación usa, en este orden: `id` → RIF normalizado (mayúsculas, sin espacios/puntos/
guiones) → nombre normalizado (minúsculas, espacios colapsados) → código `PRV-`.

---

## 9. Tienda pública

### 9.1 Compra sin cuenta

- Catálogo público con fallback a `DEFAULT_CATALOG_PRODUCTS` (10 ítems).
- `POST /api/orders` es **público** y está limitado a **10 pedidos/hora/IP**.
- El pedido se guarda **primero** en `data/orders.json` y después se intenta Supabase.
- Se **descuenta stock** y se escribe el movimiento de inventario.
- `delivery_status` inicial = `RECIBIDO`; `activity_history` registra cada cambio de estado.

### 9.2 Reglas de los estados de entrega

| Transición | Permitida |
|---|---|
| → `CANCELADO` | Sí (irreversible) |
| `CANCELADO` → cualquier otro | **No** |
| → `ENTREGADO` | Sí, fija `completed_at` |
| `ENTREGADO` → cualquier otro | **No** |
| Entre los estados intermedios | Sí, en cualquier orden |

### 9.3 Registro de clientes de la tienda

`POST /api/auth/customer/register` crea un usuario en Supabase Auth e inserta en
`public.shop_customers`. **No tiene rate limit.**

---

## 10. Configuración del negocio

`src/modules/alma/pages/Config.tsx` (3 418 líneas), 4 pestañas:

| Pestaña | Contenido |
|---|---|
| **Negocio** | Razón social, RIF, eslogan, dirección, teléfonos, WhatsApp, logo, favicon, métodos de pago, historial de tasas, tasa BCV manual |
| **Almacén** | CRUD de sedes (código, nombre, dirección, teléfono, estado, número de cajas) |
| **Usuarios asociados** | Alta/edición/baja de usuarios, matriz de permisos, traducción de roles |
| **Auditoría** | Auditoría de cuentas |

### 10.1 Perfil del negocio

`src/lib/businessProfile.ts` — persistido en `localStorage.frenyer_business_profile`:

```ts
interface BusinessProfile {
  businessName: string; slogan: string; rif: string; email: string;
  address: string; phone: string; whatsapp: string;
  logo: string | null; favicon: string | null;
}
```

`saveBusinessProfile()` actualiza también el `<link rel="shortcut icon">` y emite
`frenyer:business-profile-updated`.

**Valores por defecto:** CompuRepuestos, C.A. · J-123456789 · Altamira de Caceres ·
+58 212 555 1212.

### 10.2 Matriz de permisos

Las claves son `ventas`, `inventario`, `finanzas`, `reportes`, `usuarios` (`Config.tsx:2646`).
El Sidebar filtra por estas claves; "Gestión de Contactos" no tiene clave, por lo que **siempre**
es visible.

### 10.3 Traducción de roles a la interfaz

`normalizeRoleForUi()` (`Config.tsx:63-69`):

| En la base de datos | En la interfaz |
|---|---|
| `gerente` | `Manager` |
| `administrador` | `Admin` |
| `cajero` | `Cashier` |
| `cliente` | `Viewer` |

---

## 11. Reglas de autorización

### 11.1 En el servidor

| Operación | Requisito |
|---|---|
| Lectura/escritura de datos del tenant | Sesión válida + pertenencia a la organización |
| Tasa BCV manual | Rol ∈ {admin, superadmin, gerente, gerente general, manager, owner} |
| Alta/edición de usuarios por `auth.admin` | Rol distinto de `customer`/`cliente` |
| Compra en la tienda | Sin sesión (con rate limit) |
| Alta de cliente de la tienda | Sin sesión (**sin** rate limit) |

### 11.2 En la base de datos

- `is_org_member(org)` — **lectura** permitida a los miembros.
- `is_org_writer(org)` — **escritura**; desde `0012` la admite **cualquier miembro**.
- `exchange_rates` — escritura restringida por lista de roles (única tabla que lo conserva).
- `profiles` — escritura por `get_my_role()`: un `gerente` puede cambiar roles; todos pueden
  editar su propio nombre.

### 11.3 En la interfaz

- El Sidebar oculta las secciones sin permiso.
- `DashboardLayout` redirige a `/` a los usuarios con rol `cliente`.
- `ManualBcvRateModal` bloquea a los roles no autorizados con un mensaje explicativo.
- `BankAccounts` diferencia la UI por rol (Gerente General vs. Cajero).

---

## 12. Alma — herramientas autorizadas

> **Regla:** el copiloto inteligente Alma interactúa con las bases de datos mediante
> **herramientas estrictas y funciones autorizadas expuestas en el servidor**. Nunca se debe
> permitir la ejecución o concatenación de SQL directo desde el cliente.

**Estado actual:** Alma es un **stub de interfaz** (`src/modules/alma/pages/Alma.tsx`, 18
líneas). **No hay rutas de Alma en el servidor** (un grep de `alma` en `server.ts` solo
devuelve palabras españolas sin relación) y no hay chat, streaming ni llamadas a herramientas.

**Contrato previsto:** herramientas de dominio con entradas y salidas validadas, exposure por
el servidor, un conjunto cerrado de operaciones de lectura y escritura, y registro de auditoría
por invocación. El cliente nunca compone SQL.

**CSS ya preparado pero sin uso:** `.alma-chat`, `.alma-title`, `.bubble`, `.assistant`, `.hint`,
`.chat-input`, `.suggestion` (`globals.css`, familia Alma).

---

## 13. Reglas de la interfaz

### 13.1 Estándar de exportación de reportes

Los exportes (Excel y PDF) siguen un estándar único:

- **Encabezado** gris oscuro (`#4b5563`) con texto **blanco**.
- **Datos** en celdas blancas o transparentes con texto oscuro.
- **Membrete dinámico** con los datos del negocio (nombre, RIF, teléfono, dirección).

La lógica vive en `src/lib/reportUtils.ts`:

| Función | Uso |
|---|---|
| `getReportHeaderHtml(title?, subtitle?)` | Banner gris con los datos del negocio |
| `getReportFooterHtml(additionalText?)` | Pie fiscal que sustituye cualquier mención a "Frenyer ERP" |
| `buildExcelHeaderRows(reportTitle)` | 5 filas de encabezado (nombre / RIF+tel+dir / título / fecha de emisión / vacía) |
| `createWorksheetWithBusinessHeader(reportTitle, dataRows, { isAOA? })` | Hoja XLSX con el membrete (origen `A6` para filas JSON) |
| `buildXlsHtmlReport({ title, tableHtml })` | Documento HTML compatible con Excel para export `.xls` |

**Librerías de exportación:**

| Librería | Dónde se importa |
|---|---|
| `xlsx` | `reportUtils.ts` + `Inventory.tsx`, `Movements.tsx`, `DailyInventoryReport.tsx`, `Orders.tsx`, `SalesReport.tsx`, `AccountsReport.tsx`, `Customers.tsx`, `Suppliers.tsx` |
| `jspdf` + `html2canvas` | **Directamente** en `CompanyHealth.tsx` y `ProfitLoss.tsx` (patrón: `html2canvas(document.querySelector('.content'))` → `jsPDF('p','mm','a4')` → `addImage` → `save`) |

### 13.2 Reglas de UI

- **Responsive obligatorio.** Breakpoint del sidebar: `640px`.
- **Sin utilidades Tailwind.** Solo clases semánticas de `src/styles/globals.css`.
- **Tokens semánticos**, nunca valores hex sueltos.
- **Estados completos:** loading, empty, error y success para cada acción.
- **Aislamiento visual:** los datos de una organización no se mezclan con los de otra.

### 13.3 Clasificación de conceptos de gasto

`classifyExpenseConcept(concept)` (`currency.ts:144-165`) clasifica por heurística en:
Nómina · Servicios · Alquileres · Tributos · Fletes · Mantenimiento · Gastos Generales.

---

## 14. Resumen de invariantes

| # | Invariante | Verificación |
|---|---|---|
| 1 | Ningún importe monetario tiene más de 2 decimales | `Math.round(x*100)/100` en cada derivación |
| 2 | Toda transacción guarda USD, VES y la tasa aplicada | Columnas `*_usd`/`*_ves`/`exchange_rate` |
| 3 | Cambiar la tasa no altera transactions ya registradas | La tasa se copia, no se referencia |
| 4 | El stock nunca queda negativo | Validación en `POST /api/orders` y piso 0 en ajustes |
| 5 | Los pedidos de la tienda no requieren sesión | `POST /api/orders` público + rate limit |
| 6 | El navegador nunca recibe claves de Supabase | Cliente inerte + proxy `/api/*` |
| 7 | Los datos del tenant se consultan bajo el contexto de la organización | `organization_id` forzado + RLS |
| 8 | Alma no ejecuta SQL arbitrario | Herramientas cerradas en el servidor (pendiente de implementar) |
