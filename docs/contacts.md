# Contactos

## Descripción

Gestión de base de datos de clientes (CRM) y proveedores, con panel analítico por cliente y
ficha detallada por proveedor.

## Estructura Actual

- **Ubicación**: `src/modules/customers/`
- **Componentes clave**:

| Archivo | Líneas | Función |
|---|---|---|
| `pages/Customers.tsx` | 984 | CRM de clientes |
| `pages/Suppliers.tsx` | 831 | Directorio de proveedores |
| `components/SupplierDetailModal.tsx` | 1 149 | Ficha de proveedor |
| `pages/Marketing.tsx` | 18 | 🔴 **Stub** — "Marketing y Campañas" + `EmptyState` |

- **Rutas**: `/contactos/clientes`, `/contactos/proveedores`, `/contactos/proveedores/nuevo`,
  `/marketing` (stub). (Compatibilidad: `/clientes`.)

- **Endpoints principales**:
  `GET/POST/PATCH/DELETE /api/customers`, `GET/POST/PATCH/DELETE /api/suppliers`,
  `GET /api/accounts-receivable`, `GET /api/accounts-payable`.

## Funcionalidades Clave

### Clientes (`Customers.tsx`)

- Listado con búsqueda y filtro por estado (`Activo` / `Moroso`).
- Alta, edición, baja y cambio de estado.
- **Panel analítico por cliente** (cajón lateral): historial de pedidos, productos más
  comprados y saldo por cobrar.
- Exportación XLSX e impresión.

### Proveedores (`Suppliers.tsx`)

- KPIs: proveedores registrados, activos, con deuda y deuda acumulada.
- Estado unificado del modal: `{ isOpen, supplier, isNew, initialEditMode }` (`:46-56`).
- Alta, edición y cambio de estado; exportación XLSX e impresión.
- Apertura de la ficha detallada.

### Ficha de proveedor (`SupplierDetailModal.tsx`)

Dos pestañas:

| Pestaña | Contenido |
|---|---|
| **Movimientos** | Facturas, saldo pendiente, abonos y movimientos bancarios |
| **Ficha** | Formulario de edición |

Props: `isOpen`, `onClose`, `supplier`, `isNew?`, `initialEditMode?`, `onSupplierSaved?`
(`:32-39`). Desde aquí se puede crear o actualizar un proveedor y registrar un pago.

## Reglas de negocio

### Clientes

| Campo | Contenido |
|---|---|
| Identidad | `id`, `name`, `email`, `phone`, `address`, `code`, `doc_type`, `doc_number` |
| Financiero | `balance` (numeric 18,4, por defecto 0), `credit_limit` |
| Estado | `Activo` / `Moroso` |
| Analítico | `orders_count`, `total_spent_usd`, `last_order_date` |

> ⚠ Las columnas `code`, `doc_type`, `doc_number`, `credit_limit`, `address`, `orders_count`,
> `total_spent_usd` y `last_order_date` **no existen en ninguna migración** (solo en el no-op
> `0002:60-70`). La base viva las tiene por parche manual.

### Proveedores

| Campo | Contenido |
|---|---|
| Identidad | `id`, `code` (`PRV-000N`), `name`, `doc_type` (RIF J/G/V), `doc_number` |
| Contacto | `contact_person`, `phone`, `email`, `address` |
| Clasificación | `category` (por defecto "General") |
| Financiero | `balance_usd`, `status` (`Activo`), `created_at`, `updated_at` |

### Deduplicación de proveedores

El servidor aplica, **en este orden** (`server.ts:3570-3629`):

1. Coincidencia por `id`.
2. RIF normalizado (mayúsculas, sin espacios, puntos ni guiones).
3. Nombre normalizado (minúsculas, espacios colapsados).
4. Código `PRV-`.

### Reconciliación automática

`GET /api/suppliers` ejecuta `autoReconcileSuppliers(orgId)`, que **sintetiza proveedores** desde:

1. Las filas de `accounts_payable` sin proveedor asignado.
2. Los movimientos bancarios cuyo concepto coincide con
   `/Pago a proveedor\s*-\s*([^(]+)(?:\(([^)]+)\))?/i`.

Esto explica por qué aparecen proveedores que nadie dio de alta: son deducciones de la
actividad registrada.

## Guía de Reestructuración / Mantenimiento

- **Mantener la normalización de datos (RIF/cédula)** para evitar duplicados. El servidor ya
  normaliza; el cliente debe enviar el documento **sin espacios, puntos ni guiones** para que
  la comparación por RIF funcione.
- **Las vistas de detalle deben cargar información de manera asíncrona** para no bloquear la
  interfaz. La ficha de proveedor y el panel analítico de cliente deben seguir ese patrón.
- **El alta de cliente desde el POS y desde las cotizaciones** usa `createCustomerInSupabase`
  (`db.ts`), que va por `/api/customers` con respaldo local. Mantén ese camino.
- **Al borrar un proveedor**, recuerda que `accounts_payable.supplier_id` es `ON DELETE
  RESTRICT`: la base de datos **rechaza** el borrado si tiene deuda.
- **Al borrar un cliente**, `accounts_receivable.customer_id` es `NOT NULL ON DELETE CASCADE`:
  se eliminarán también sus cuentas por cobrar.
- **Normalización de nombres:** el backend compara nombres normalizados, así que un cambio
  de razón social puede crear un proveedor nuevo en lugar de renombrar el existente.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `suppliers` **no tiene aislamiento de tenant** (`allow_all_suppliers`) | `0016_fix:45` | 🔴 |
| 2 | `Customers.tsx` lee de Supabase desde el navegador (`:113`, `:164`) | `Customers.tsx` | 🔴 |
| 3 | `fetchSuppliersFromSupabase` fusiona tres fuentes con una clave canónica ⇒ duplicados posibles | `db.ts:294-391` | 🟡 |
| 4 | Columnas de `customers` ausentes en las migraciones | `0002:60-70` (no-op) | 🟠 |
| 5 | `accounts_payable.supplier_id` con `ON DELETE RESTRICT` | `0008:15` | 🟠 |
| 6 | `Marketing.tsx` es un stub sin enlace en el menú | `src/modules/customers/pages/Marketing.tsx` | ⚪ |
| 7 | `SupplierDetailModal` no tiene aislamiento de datos en la vista de movimientos | `SupplierDetailModal.tsx` | ⚪ |

## Referencias

- [API — clientes y proveedores](architecture/API.md#8-clientes--apicustomers)
- [API — proveedores](architecture/API.md#11-proveedores--apisuppliers)
- [Reglas de negocio §8.3 (reconciliación)](architecture/BUSINESS_RULES.md#83-reconciliación-de-proveedores)
- [Esquema de datos §2.3](architecture/DATABASE.md#23-crm)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
