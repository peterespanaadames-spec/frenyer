# Requisitos — Frenyer ERP

> La base funcional procede del documento de Frenyer y del Design System entregado.
> **Las reglas fiscales, contables, proveedor de tasas, facturación e integraciones requieren
> aprobación antes de producción.**

---

## 1. Alcance del producto

Frenyer es un **ERP/POS bimonetario (USD/VES)** para un comercio de repuestos, orientado a:

- Venta rápida en mostrador con emisión de comprobantes.
- Control de inventario con kárdex valorizado.
- Gestión de clientes y proveedores.
- Tesorería: cuentas bancarias, movimientos, transferencias.
- Cuentas por cobrar y por pagar.
- Gastos operativos y reportes financieros.
- Tienda online pública para clientes finales.
- Asistente corporativo (Alma) — *pendiente*.

---

## 2. Requisitos funcionales

### RF-01 · Catálogo de productos

| | |
|---|---|
| **Descripción** | Alta, edición, baja y consulta de productos con código (SKU), código de barras, nombre, categoría, marca, descripción, imagen, precio USD, costo USD, stock, stock mínimo, estado y sede. |
| **Ubicación** | `src/modules/inventory/pages/Inventory.tsx` |
| **Endpoints** | `GET/POST/PUT/DELETE /api/products`, `PATCH /api/products/:sku/stock` |
| **Criterios** | SKU obligatorio y único por organización. El stock nunca puede quedar negativo. Importación y exportación XLSX. Valoración total a costo y a precio de venta. |
| **Estado** | ✅ Implementado |

### RF-02 · Punto de venta (Venta Flash)

| | |
|---|---|
| **Descripción** | Catálogo en cuadrícula con búsqueda y filtros; carrito pegajoso; checkout de 3 pasos (datos del cliente, forma de pago, tipo de documento). |
| **Ubicación** | `src/modules/sales/pages/Sales.tsx` |
| **Criterios** | Pago `CONTADO` o `CREDITO`. Abonos múltiples. Descuento porcentual. IVA 16 % con toggle. IGTF 3 % con toggle. Tipo de documento `FACTURA`, `NOTA` o `ESPERA`. Facturas en espera con restauración. Venta libre (ítem abierto). Impresión del comprobante. |
| **Restricción** | En crédito se exige cliente real (no "Consumidor final") con nombre, RIF, teléfono y dirección. |
| **Estado** | ⚠ Implementado, pero **la venta no se persiste** (ver [P-02](../operations/KNOWN_ISSUES.md#p-02)) |

### RF-03 · Control de pedidos

| | |
|---|---|
| **Descripción** | Listado de pedidos de la tienda con KPIs, filtros, vista en tabla y vista kanban, detalle, alta manual, avance de estados y exportación. |
| **Ubicación** | `src/modules/sales/pages/Orders.tsx` |
| **Endpoints** | `GET/POST /api/orders`, `PATCH /api/orders/:id/delivery-status`, `PATCH /api/orders/:id/payment-status` |
| **Criterios** | Estados de entrega y de pago según [BUSINESS_RULES §4.2](../architecture/BUSINESS_RULES.md#42-estados). `CANCELADO` y `ENTREGADO` son irreversibles. Notificación sonora de pedido nuevo (conmutable). |
| **Estado** | ✅ Implementado |

### RF-04 · Cotizaciones

| | |
|---|---|
| **Descripción** | Creación y edición de cotizaciones a pantalla completa, con selección de catálogo, días de validez, descuento, IVA/IGTF, conversión a factura, rechazo, borrado e impresión. |
| **Ubicación** | `src/modules/sales/pages/Quotes.tsx`, `src/modules/sales/utils/quoteDocument.ts` |
| **Endpoints** | `GET/POST/PATCH/DELETE /api/quotes`, `PATCH /api/quotes/:id/status` |
| **Criterios** | Numeración correlativa de 4 dígitos. Vencimiento por `validityDays` (7 por defecto). La conversión valida el stock real y retira los ítems sin existencias. Una cotización facturada no se puede rechazar ni volver a convertir. |
| **Estado** | ✅ Implementado |

### RF-05 · Reporte de ventas

| | |
|---|---|
| **Descripción** | Reporte por periodo (hoy / semana / mes / todo / personalizado) con tres vistas: ventas, productos y métodos de pago. |
| **Ubicación** | `src/modules/sales/pages/SalesReport.tsx` |
| **Criterios** | KPIs: total de órdenes, ingresos facturados, utilidad estimada, ticket promedio. Exportación XLSX e impresión con membrete fiscal. |
| **Estado** | ⚠ Implementado, pero **lee de Supabase desde el navegador** (ver [P-02](../operations/KNOWN_ISSUES.md#p-02)) |

### RF-06 · Kárdex de inventario

| | |
|---|---|
| **Descripción** | Registro de todos los movimientos de stock con filtros por almacén, tipo de movimiento, periodo y producto; columnas ordenables, paginación de 25 y exportación. |
| **Ubicación** | `src/modules/inventory/pages/Movements.tsx` |
| **Endpoints** | `GET /api/inventory/movements`, `POST /api/inventory/adjustments` |
| **Criterios** | Tipos: `ENTRADA`, `SALIDA`, `CORRECCION`. El stock nunca queda negativo. Cada movimiento registra stock anterior, stock nuevo, costo unitario, precio unitario, tasa de cambio y totales en ambas monedas. |
| **Estado** | ⚠ Implementado; el endpoint es **público** (ver [P-03](../operations/KNOWN_ISSUES.md#p-03)) |

### RF-07 · Compras internas

| | |
|---|---|
| **Descripción** | Registro de compras a proveedores mediante un asistente de 4 pasos, con voucher imprimible. |
| **Ubicación** | `src/modules/inventory/pages/InternalPurchases.tsx`, `src/components/modals/NewPurchaseModal.tsx` |
| **Endpoints** | `GET/POST /api/purchases` |
| **Criterios** | Numeración `CMP-00001`. Pago `CONTADO` genera un movimiento bancario; pago `CREDITO` **crea automáticamente la cuenta por pagar** con vencimiento a +30 días. Se puede crear proveedor y producto desde el propio asistente. |
| **Estado** | ✅ Implementado |

### RF-08 · Reporte diario de inventario

| | |
|---|---|
| **Descripción** | Resumen por periodo (hoy / semana / mes / histórico / rango) con totales de entradas, salidas, balance neto y número de transacciones; preview imprimible y exportación XLSX. |
| **Ubicación** | `src/modules/inventory/pages/DailyInventoryReport.tsx` |
| **Estado** | ✅ Implementado |

### RF-09 · Cuentas bancarias y tesorería

| | |
|---|---|
| **Descripción** | Gestión de cuentas (activas e inactivas), métodos de pago, movimientos de entrada y salida, transferencias entre cuentas, depósitos y retiros. |
| **Ubicación** | `src/modules/finance/pages/BankAccounts.tsx` |
| **Endpoints** | `GET/POST/PATCH/DELETE /api/bank-accounts`, `GET/POST/PATCH/DELETE /api/payment-methods`, `GET/POST /api/bank-movements`, `POST /api/bank-transfers` |
| **Criterios** | El saldo se actualiza con `round(balance + delta, 2)`. La comisión se suma a las salidas. La comisión de una transferencia genera un gasto. El borrado de una cuenta es lógico salvo que se pida `?permanent=true`. La UI se adapta al rol (Gerente General / Cajero). Bloqueo anti-doble-envío. |
| **Estado** | ✅ Implementado |

### RF-10 · Cuentas por cobrar

| | |
|---|---|
| **Descripción** | Registro de obligaciones con clientes, con vista agrupada por cliente o plana, y registro de pagos con efecto en tesorería. |
| **Ubicación** | `src/modules/accounts-receivable/pages/Accounts.tsx` |
| **Endpoints** | `GET/POST /api/accounts-receivable`, `POST /api/accounts-receivable/:id/payments` |
| **Criterios** | Estados `PENDIENTE` / `PARCIAL` / `PAGADO`. El pago deposita en la cuenta bancaria resuelta (VES o USD según la moneda) y genera un movimiento `ENTRADA`. Exportación con membrete fiscal. |
| **Estado** | ✅ Implementado |

### RF-11 · Cuentas por pagar

| | |
|---|---|
| **Descripción** | Registro de facturas de proveedores, historial de abonos, selector de proveedor, alta de proveedor en línea y exportación. |
| **Ubicación** | `src/modules/finance/pages/AccountsPayable.tsx` |
| **Endpoints** | `GET/POST /api/accounts-payable`, `POST /api/accounts-payable/:id/payments` |
| **Criterios** | Estados `PENDIENTE` / `PARCIAL` / `PAGADO`. El pago retira de la cuenta bancaria y genera un movimiento `SALIDA` con concepto `Pago a proveedor - …`. Protección de 30 s contra referencias duplicadas. Alta automática del proveedor. |
| **Estado** | ✅ Implementado, con `MOCK_PAYABLES` de ejemplo que hay que retirar |

### RF-12 · Gastos operativos

| | |
|---|---|
| **Descripción** | Registro de gastos fijos y variables, con categoría, frecuencia, estado, moneda, vencimiento y programmatic de pagos. |
| **Ubicación** | `src/modules/finance/pages/Expenses.tsx` |
| **Endpoints** | `GET/POST/PATCH/PUT/DELETE /api/expenses`, `POST /api/expenses/:id/pay`, `GET/POST /api/expense-categories` |
| **Criterios** | `type` ∈ {`FIJO`, `VARIABLE`}; `status` ∈ {`PENDIENTE`, `PAGADO`, `VENCIDO`}; `currency` ∈ {`USD`, `VES`}. Frecuencias: semanal a anual. El pago puede reprogramar la siguiente fecha de vencimiento. Gestión de categorías. |
| **Estado** | ✅ Implementado |

### RF-13 · CRM de clientes

| | |
|---|---|
| **Descripción** | Directorio de clientes con búsqueda, filtro por estado, alta, edición, baja, exportación e impresión. Panel analítico por cliente con historial de pedidos, productos top y saldo por cobrar. |
| **Ubicación** | `src/modules/customers/pages/Customers.tsx` |
| **Endpoints** | `GET/POST/PATCH/DELETE /api/customers`, `GET /api/accounts-receivable` |
| **Criterios** | Normalización del documento (RIF/cédula) para evitar duplicados. El panel analítico carga de forma asíncrona. |
| **Estado** | ✅ Implementado |

### RF-14 · Proveedores

| | |
|---|---|
| **Descripción** | Directorio de proveedores con KPIs (registrados, activos, con deuda, deuda acumulada), ficha detallada con pestañas de movimientos y edición, y exportación. |
| **Ubicación** | `src/modules/customers/pages/Suppliers.tsx`, `src/modules/customers/components/SupplierDetailModal.tsx` |
| **Endpoints** | `GET/POST/PATCH/DELETE /api/suppliers`, `GET /api/accounts-payable` |
| **Criterios** | Código correlativo `PRV-000N`. Deduplicación por id → RIF normalizado → nombre normalizado. Reconciliación automática desde cuentas por pagar y movimientos bancarios. |
| **Estado** | ✅ Implementado |

### RF-15 · Configuración del negocio

| | |
|---|---|
| **Descripción** | Identidad fiscal, logo y favicon, métodos de pago, historial de tasas, tasa BCV manual, sedes, usuarios asociados y auditoría. |
| **Ubicación** | `src/modules/alma/pages/Config.tsx` |
| **Criterios** | El perfil del negocio se propaga a los membretes de todas las exportaciones. La tasa manual exige rol autorizado. La gestión de usuarios combina Supabase y el archivo local. |
| **Estado** | ✅ Implementado |

### RF-16 · Tienda online

| | |
|---|---|
| **Descripción** | Catálogo público con categorías, buscador, carrito, checkout de 4 pasos, selector de divisa, seguimiento de pedido y registro de clientes. |
| **Ubicación** | `src/modules/shop/pages/ShopPage.tsx` |
| **Criterios** | Funciona **sin cuenta**. El checkout ofrece `RETIRO` y `DOMICILIO`, con método de pago y referencia. El servidor valida que el pedido no deje el stock negativo. |
| **Estado** | ✅ Implementado |

### RF-17 · Panel de indicadores

| | |
|---|---|
| **Descripción** | KPIs consolidados, top-5 de productos vendidos, productos bajo stock y cuentas por cobrar y pagar a vencer. |
| **Ubicación** | `src/pages/Dashboard.tsx` |
| **Criterios** | Ventana de vencimiento: los próximos 21 días o el mes en curso. |
| **Estado** | ⚠ Implementado; la etiqueta "Ventas (7 días)" **no aplica filtro de fecha** (ver [P-22](../operations/KNOWN_ISSUES.md#p-22)) |

### RF-18 · Salud del negocio y ganancias y pérdidas

| | |
|---|---|
| **Descripción** | Valor del inventario, cuentas bancarias, CxC, CxP, ingresos, costos de ventas, gastos, utilidad bruta y neta; evolución de 12 meses con gráficos. Estado de resultados por mes, trimestre, año o todo. |
| **Ubicación** | `src/modules/finance/pages/CompanyHealth.tsx`, `ProfitLoss.tsx` |
| **Criterios** | Exportación PDF con `html2canvas` + `jsPDF`. Actualización cada 60 s (no hay realtime, porque el navegador no tiene claves). |
| **Estado** | ⚠ Implementado, con **costo de ventas hardcodeado** (45 % y 55 %) |

### RF-19 · Asistente Alma

| | |
|---|---|
| **Descripción** | Chat corporativo con herramientas autorizadas del servidor. |
| **Criterios** | Herramientas estrictas y cerradas, exposure por el servidor, **nunca SQL directo desde el cliente**. Registro de auditoría por invocación. |
| **Estado** | 🔴 **No implementado.** La página es un stub. No hay rutas de Alma en el servidor. El CSS del chat está preparado. |

---

## 3. Requisitos no funcionales

### RNF-01 · Bimonetario estricto

> Toda operación financiera, flujo de caja o cuenta bancaria debe calcular y registrar el tipo de
> cambio de referencia vigente en el momento de la transacción, para mantener un historial de
> auditoría consistente.

### RNF-02 · Redondeo monetario

> Redondeo a dos decimales exactos en importes, impuestos (IVA, IGTF) y márgenes, para evitar
> descuadres de centavos en balances consolidados.

### RNF-03 · Seguridad RLS

> Las consultas a la base de datos deben realizarse siempre filtrando bajo el contexto del
> inquilino (organización y sucursal activa). Nunca exponer datos globales sin validación de
> membresía previa.

### RNF-04 · Sin SQL arbitrario para Alma

> El copiloto inteligente Alma interactúa con las bases de datos mediante herramientas estrictas
> y funciones autorizadas expuestas en el servidor. Nunca permitir la ejecución o concatenación
> de SQL directo desde el cliente.

### RNF-05 · Responsive

> La aplicación debe ser 100 % responsiva: móviles, tablets y pantallas de escritorio.

### RNF-06 · Credenciales solo en el servidor

> El navegador nunca recibe una clave de Supabase. Todas las consultas pasan por `/api/*`.

### RNF-07 · Consistencia de la API

> Todas las respuestas JSON llevan `{ success, data?, error? }`. Los errores usan códigos 4xx/5xx
> adecuados. *(Hoy es inconsistente — ver [P-25](../operations/KNOWN_ISSUES.md#p-25).)*

### RNF-08 · Idioma

> El código, las variables, los nombres de funciones y las rutas están en **inglés** (camelCase).
> Los textos de la interfaz, las etiquetas, los mensajes de error y los comentarios están en
> **español**.

### RNF-09 · Design System

> Ninguna pantalla introduce estilos propios: usa las clases semánticas de `globals.css` y los
> tokens de `tokens.css`.

### RNF-10 · Trazabilidad

> Toda operación financiera queda registrada con su tasa, su importe en ambas monedas y su
> referencia documental.

---

## 4. Reglas de negocio transversales

| Regla | Origen |
|---|---|
| La tasa se congela en el documento | [BUSINESS_RULES §1.2](../architecture/BUSINESS_RULES.md#12-instantánea-de-tasa) |
| Tasa futura: fecha futura o después de las 16:00 en Caracas | [BUSINESS_RULES §3.3](../architecture/BUSINESS_RULES.md#33-regla-de-tasa-futura) |
| El stock nunca queda negativo | [BUSINESS_RULES §6.3](../architecture/BUSINESS_RULES.md#63-reglas-de-stock) |
| Una compra a crédito genera automáticamente la CxP | [BUSINESS_RULES §5.3](../architecture/BUSINESS_RULES.md#53-compras-internas) |
| Una venta a crédito genera automáticamente la CxC | [BUSINESS_RULES §8.2](../architecture/BUSINESS_RULES.md#82-reglas-adicionales) |
| Un pago a proveedor genera un movimiento `SALIDA` | [BUSINESS_RULES §8.1](../architecture/BUSINESS_RULES.md#81-ciclo-de-vida) |
| La conversión de cotización valida el stock real | [BUSINESS_RULES §5.2](../architecture/BUSINESS_RULES.md#52-cotizaciones) |
| El perfil del negocio se propaga a todos los membretes | [BUSINESS_RULES §10.1](../architecture/BUSINESS_RULES.md#101-perfil-del-negocio) |

---

## 5. Requisitos pendientes de aprobación

> ⚠ **Los puntos siguientes no están cubiertos por la implementación actual y requieren
> decisión del negocio antes de producción.**

| # | Área | Decisión pendiente |
|---|---|---|
| 1 | **Fiscal** | Régimen fiscal, numeración oficial de comprobantes, requisitos del SENIAT, tratamiento de retenciones |
| 2 | **Contable** | Plan de cuentas, asientos, cierre, tratamiento del IGTF por producto, tratamiento del IVA mixto |
| 3 | **Tasas** | Proveedor oficial de la tasa (¿BCV directo o API de terceros?), frecuencia de actualización, treatment de días sin tasa oficial |
| 4 | **Facturación** | ¿Facturación electrónica? ¿Integración con el SENIAT? |
| 5 | **Integraciones** | ¿Bancos? ¿Pasarelas de pago? ¿Punto de venta físico? ¿Contabilidad? |
| 6 | **Multiempresa** | ¿Un solo negocio o varios en la misma instalación? Hoy el modelo es multi-tenant pero la tienda es global |
| 7 | **Alma** | ¿Qué herramientas se le conceden? ¿Qué datos puede leer y escribir? ¿Con qué se auditan las invocaciones? |
| 8 | **Impresiones** | ¿Impresora térmica? ¿Tamaño de ticket? ¿Formato de la factura? |
| 9 | **Respaldo** | ¿Frecuencia de backup de la base? ¿Retención? ¿Cifrado de `data/`? |
| 10 | **Cumplimiento** | Tratamiento de la PII de clientes conforme a la Ley de Protección de Datos (Venezuela)? |

---

## 6. Estado de los requisitos

| Estado | Significado | Módulos |
|---|---|---|
| ✅ Implementado | Funciona y persiste en el backend | Ventas (parcial), Inventario, Compras, Tesorería, CxC, CxP, Gastos, CRM, Configuración, Tienda |
| ⚠ Parcial | Funciona, pero con defectos conocidos | Ventas (persistencia), Reporte de ventas, Kárdex, Panel, Salud del negocio |
| 🔴 No implementado | Stub o ausente | Alma, Marketing, Caja |
| ⬜ Pendiente | Fuera del alcance actual | Facturación electrónica, integraciones, PWA |

Detalle de los defectos por módulo en
[KNOWN_ISSUES.md](../operations/KNOWN_ISSUES.md).
