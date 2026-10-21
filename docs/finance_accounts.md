# Cuentas Financieras

## Descripción

Gestión de cuentas bancarias, cuentas por cobrar (CxC) y cuentas por pagar (CxP). Es el
núcleo de tesorería del ERP: aquí el dinero entra, sale y se concilia con la actividad
comercial.

## Estructura Actual

- **Ubicación**: `src/modules/accounts-receivable/`, `src/modules/finance/pages/`
- **Componentes clave**:

| Archivo | Líneas | Función |
|---|---|---|
| `src/modules/accounts-receivable/pages/Accounts.tsx` | 2 089 | Cuentas por cobrar |
| `src/modules/finance/pages/AccountsPayable.tsx` | 2 732 | Cuentas por pagar |
| `src/modules/finance/pages/BankAccounts.tsx` | 2 212 | Cuentas bancarias, métodos de pago, movimientos, transferencias |
| `src/modules/finance/pages/AccountsReport.tsx` | 354 | Reporte de cuentas y pagos |

- **Rutas**: `/cuentas/bancos`, `/cuentas/cobrar`, `/cuentas/pagar`, `/cuentas/reporte`,
  `/cuentas/caja` (stub). (Compatibilidad: `/cuentas`, `/cuentas-por-pagar`,
  `/finanzas/cuentas-por-pagar`.)

- **Endpoints principales**:
  `GET/POST/PATCH/DELETE /api/bank-accounts`, `GET/POST/PATCH/DELETE /api/payment-methods`,
  `GET/POST /api/bank-movements`, `POST /api/bank-transfers`,
  `GET/POST /api/accounts-receivable`, `POST /api/accounts-receivable/:id/payments`,
  `GET/POST /api/accounts-payable`, `POST /api/accounts-payable/:id/payments`,
  `GET/POST/PATCH/DELETE /api/suppliers`.

## Funcionalidades Clave

### Cuentas bancarias (`BankAccounts.tsx`)

- Dos carpetas: **Cuentas activas** y **Cuentas inactivas**.
- Cuentas con `bank_name`, número de cuenta, tipo (`Corriente`/`Ahorro`/`Custodia`/`Caja`),
  moneda (`USD`/`VES`) y saldo.
- CRUD de **métodos de pago** asociados a una cuenta.
- Registro de **movimientos**: entrada, salida, transferencia, depósito y retiro.
- Bloqueo anti-doble-envío (`:93-95`).
- **UI diferenciada por rol**: Gerente General vs. Cajero (`:68`).
- Borrado lógico (`status: 'Inactivo'`) o permanente (`?permanent=true`).

### Cuentas por cobrar (`Accounts.tsx`)

- Registros con `concept`, `total_amount`, `paid_amount`, `remaining_amount`, `due_date` y estado.
- **Vista agrupada ⇄ plana** por cliente (`viewMode`, `:93`; `expandedClients`, `:94`).
- Panel analítico por cliente con historial de pedidos, productos top y saldo.
- Alta manual de cuenta, registro de pago (que además genera el movimiento bancario) y
  exportación con membrete fiscal.

### Cuentas por pagar (`AccountsPayable.tsx`)

- Registro de facturas de proveedores, historial de abonos y estados
  `Pendiente` / `Parcial` / `Pagada` / `Vencida`.
- Selector de proveedor con alta de proveedor en línea.
- Exportación con el estándar de membrete (encabezado gris oscuro, texto blanco).

### Reporte de cuentas (`AccountsReport.tsx`)

- KPIs: total recaudado (USD), total liquidado (VES), transacciones liquidadas, canales
  bancarios activos.
- Filtro por banco, rango de fechas y búsqueda.
- Exportación XLSX, impresión y navegación al detalle.

## Reglas de negocio

### Ciclo de vida de una cuenta

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

**Saldo:** `newRemaining = max(0, balance - amount)`.

### Movimiento bancario

```
delta      = ENTRADA ? +amount : −(amount + commission)
newBalance = round(balance + delta, 2)
```

- Comisión `Fija` (importe fijo) o `Porcentual` (`amount × pct / 100`).
- La comisión de una **transferencia** genera además una fila en `expenses` (categoría "Gastos
  Bancarios", estado `PAGADO`).
- El servidor intenta el RPC atómico `record_bank_movement`; si no existe, hace
  read-modify-write del saldo.

### Efecto de los pagos en la tesorería

| Operación | Efecto | Movimiento |
|---|---|---|
| Pago de CxC | **Depósito** en la cuenta resuelta (VES recibe `amount_ves`, USD recibe `amount_usd`) | `ENTRADA` |
| Pago de CxP | **Retiro** de la cuenta resuelta, concepto `Pago a proveedor - …` | `SALIDA` |

**Conversión de moneda al aplicar el importe:** USD→VES multiplica por la tasa, VES→USD divide
por ella.

### Reglas adicionales

- **CxP: protección de 30 s contra referencias duplicadas** (`server.ts:5761-5765`).
- **CxP: alta automática del proveedor** si no hay coincidencia (por RIF o nombre normalizado).
- **Síntesis de pagos:** si `total_usd − balance_usd` supera la suma de los pagos registrados,
  el servidor **sintetiza** un pago (`PAGO-COMPLETO` en CxC, `ABONO` en CxP) para cuadrar el
  saldo.

## Guía de Reestructuración / Mantenimiento

- **Las operaciones de pago deben ser transaccionales** para asegurar la integridad con
  `bank_movements`. Hoy el servidor ofrece los RPC atómicos
  (`record_bank_movement`, `record_bank_transfer`, `record_payable_payment`) pero **cae a
  read-modify-write cuando el RPC no existe** ⇒ es condicional, no una garantía.
- **Para personalizar exportaciones**, modifica `handleExportPDF` y `handleExportXLS` en los
  archivos correspondientes. La lógica compartida está en `src/lib/reportUtils.ts`.
- **Reportes**: los exportes (Excel/PDF) siguen el estándar: encabezados gris oscuro con
  letras blancas, datos en celdas blancas/transparentes con texto oscuro, membrete dinámico con
  los datos del negocio.
- **Al añadir un tipo de movimiento o cuenta**, recuerda actualizar los CHECK de la base de
  datos y el `tenantScopedTables` del servidor (`server.ts:377-395`).
- **El saldo de una cuenta nunca se edita a mano.** Todo cambio pasa por un movimiento, para que
  el kárdex bancario cuadre con el saldo.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `GET /api/debug/bank-movements-check` y `GET /api/debug/accounts-list` son **públicos** y vuelcan la tesorería | `server.ts:3196,3222` | 🔴 |
| 2 | `bank_accounts`, `payment_methods` y `bank_movements` **no tienen índice** por `organization_id` (y `bank_movements` no tiene ninguno) | migraciones `0002`/`0004` | 🟠 |
| 3 | Los estados de pago se escriben como `PAGADA` (RPCs) y se leen como `PAGADO` (servidor/UI) | `0008:275` vs `Dashboard.tsx:172` | 🟠 |
| 4 | `accounts_payable.supplier_id` es `ON DELETE RESTRICT` ⇒ un proveedor con deuda no se puede eliminar | `0008:15` | 🟠 |
| 5 | `GET /api/debug/accounts-list` referencia `orgId` no definido ⇒ devuelve gastos en lugar de cuentas | `server.ts:3226` | 🟡 |
| 6 | `bank_movements.user_name` guarda un **UUID** (`auth.uid()::text`) en un campo de nombre | `0012:116` | 🟡 |
| 7 | `bank_accounts.status` se compara con mayúsculas en un RPC y sin ellas en otro | `0012:72` vs `0008:244` | 🟡 |
| 8 | `AccountsPayable.tsx` incluye `MOCK_PAYABLES` con datos de ejemplo | `AccountsPayable.tsx:99` | 🟡 |
| 9 | `AccountsReport.tsx` lee de Supabase desde el navegador | `AccountsReport.tsx:52-73` | 🔴 |
| 10 | El CRUD de `bank_accounts` en `db.ts` llama al cliente inerte del navegador | `db.ts` | 🔴 |
| 11 | La eliminación de una cuenta es lógica, pero no filtra el saldo pendiente | `server.ts:2949` | ⚪ |

## Referencias

- [API — tesorería](architecture/API.md#10-tesorería--bancos-métodos-de-pago-movimientos-transferencias)
- [API — cuentas por cobrar y por pagar](architecture/API.md#15-cuentas-por-cobrar--apiaccounts-receivable)
- [Reglas de negocio §7 (tesorería), §8 (CxC/CxP)](architecture/BUSINESS_RULES.md)
- [Esquema de datos §2.6, §2.8](architecture/DATABASE.md)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
