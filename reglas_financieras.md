# REGLAS FINANCIERAS Y CONTABLES — FRENYER ERP

Este documento contiene el desglose técnico de las reglas financieras, cambiarias, contables y de inventario obligatorias que rigen la arquitectura y operación del sistema Frenyer ERP.

---

## 1. Gestión Integral de la Tasa BCV (Extracción y Aplicación)

La tasa oficial emitida por el Banco Central de Venezuela (BCV) es el eje central para todas las transacciones, balances y conversiones en bolívares (VES).

### 1.1 Extracción Resiliente y Fallback Automático
- **Endpoint Backend**: `/api/bcv/rates` (implementado en `server.ts`).
- **Fuente Primaria**: Consulta directa al portal web del Banco Central de Venezuela (BCV).
- **Tolerancia a Fallos (Fallback)**: Si el portal del BCV experimenta latencia, errores HTTP o modificaciones en su DOM/HTML, el sistema conmuta automáticamente hacia `ve.dolarapi.com` como fuente secundaria de contingencia garantizada.

### 1.2 Regla de la Tasa Futura (A partir de las 4:00 PM)
- **Horario Límite**: 16:00 (4:00 PM hora local de Caracas, UTC-4).
- **Comportamiento**:
  - Toda consulta efectuada después de las 16:00 evalúa si la tasa publicada por el BCV corresponde a la vigencia del siguiente día hábil.
  - El payload de respuesta marca el flag `isFutureRate: true` y fecha de vigencia del día posterior.
  - **Propósito**: Evita desajustes contables en arqueos de caja vespertinos/nocturnos y asegura que las ventas realizadas al cierre de jornada se sincronicen con el valor legal de apertura del día hábil siguiente.

### 1.3 Aplicación en Transacciones y Bimonetariedad
- **Moneda Base USD**: Todo producto, costo de adquisición, lista de precios y kárdex de inventario se registra estrictamente en dólares estadounidenses (USD - $).
- **Conversión a VES**:
  $$\text{Total\_VES} = \text{Total\_USD} \times \text{Tasa\_BCV\_Vigente}$$
- **Bloqueo Histórico de Tasa**: La tasa se bloquea e indexa al momento exacto de emitir la transacción (`invoices`, `orders`, `pos_sales`). **Nunca se recalcula con la tasa del momento del cierre de caja**, garantizando auditoría fiscal y contable inmutable.

---

## 2. Modalidades de Pago, Conciliación y Caja

El sistema administra la dualidad efectivo/banco a través de sesiones de caja por turnos, conciliaciones y trazabilidad por terminal.

### 2.1 Pagos Combinados y Mixtos
- Permite liquidar una venta dividiendo el importe en múltiples métodos y monedas simultáneamente (ejemplo: $20 USD efectivo + Bs. 500 Pago Móvil).
- **Fórmula de Amortización**:
  $$\text{Abono\_USD} = \frac{\text{Monto\_VES}}{\text{Tasa\_Transacción}}$$
- La suma de todas las fracciones en divisas y bolívares debe cubrir con exactitud el total liquidado de la orden.

### 2.2 Conciliación Bancaria y Sesiones de Caja
- **Operaciones de Caja (`cash_register_operations`)**: Cada movimiento de entrada o egreso está vinculado de forma obligatoria a una terminal activa (`BusinessTerminal`) y a un operador/usuario autenticado (`StoreUser`).
- **Cierre de Turno y Arqueo (`ClosureTicketModal.tsx`)**:
  - Al cerrar caja, se contrasta el $\text{Total\_Registrado\_Sistema}$ frente al $\text{Monto\_Contado\_Físico}$ reportado por el cajero.
  - **Gestión de Descuadres**: La presencia de una diferencia no interrumpe el cierre; el sistema genera automáticamente un asiento contable de **Sobrante** o **Faltante**, dejando registro en el historial para auditoría gerencial.

### 2.3 Depósitos y Transferencias Internas
- Los traslados de fondos desde la caja física hacia cuentas bancarias se registran como **Transferencias Internas** (`transferencias_internas`).
- **Impacto**: No altera el total de ingresos por ventas, pero actualiza el saldo disponible en la tabla de cuentas bancarias (`bank_accounts`).

---

## 3. Gestión de Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP)

Mecanismos diseñados para preservar el valor real del capital de trabajo frente a variaciones cambiarias.

### 3.1 Cuentas por Cobrar (CxC)
- **Moneda de la Deuda**: Se formaliza en USD para proteger el valor de la acreencia contra la devaluación.
- **Protección de Valor en Abonos**: Si una deuda pactada en USD se abona en bolívares (VES), se liquida a la **Tasa BCV del día en que se efectúa el abono**, no a la tasa en que se contrajo la obligación original.
- **Abonos Parciales**:
  $$\text{Saldo\_Pendiente\_USD} = \text{Total\_Original\_USD} - \sum \text{Abonos\_USD}$$

### 3.2 Cuentas por Pagar a Proveedores (CxP)
- Vinculadas a compras registradas (`purchases`) y su cronograma de cuotas (`purchase_installments`).
- Soporta amortizaciones totales o parciales por cuota, recalculando el pasivo circulante con el proveedor.

---

## 4. Reglas de Negocio Funcionales y Operativas ("Motor Silencioso")

Lógica interna que opera de forma transversal en el procesamiento de datos del ERP.

### 4.1 Costo Promedio Ponderado (CPP - Regla de Inventario)
Al registrar una nueva compra de reposición (`PurchaseModule`), el sistema no sobreescribe ciegamente el costo unitario del producto, sino que calcula el **Costo Promedio Ponderado (CPP)**:

$$\text{CPP}_{\text{nuevo}} = \frac{(\text{Stock}_{\text{actual}} \times \text{Costo}_{\text{anterior}}) + (\text{Cantidad}_{\text{comprada}} \times \text{Costo}_{\text{compra}})}{\text{Stock}_{\text{actual}} + \text{Cantidad}_{\text{comprada}}}$$

Esta regla asegura que los reportes de margen de utilidad bruta (`IndicadoresDashboard.tsx`) reflejen el rendimiento real de las existencias.

### 4.2 Normalización y Deduplicación en Reportes (`/api/reports/process-transactions`)
- Centraliza la consolidación de comprobantes (`invoices`, `orders`, `cashOps`).
- **Deduplicación Automática**: Si un cobro de caja ya cuenta con una Factura o Nota de Entrega emitida, el sistema la clasifica bajo una sola categoría de ingreso para evitar duplicar las ventas en los reportes de utilidad neta y ganancias/pérdidas.

### 4.3 Clasificación Heurística de Gastos
- Motor heurístico en `server.ts` que categoriza egresos de forma automática analizando palabras clave en el concepto:
  - `"nomina"`, `"sueldo"`, `"salario"`, `"quincena"` $\rightarrow$ **Nómina y Sueldos**.
  - `"luz"`, `"agua"`, `"cantv"`, `"internet"`, `"aseo"` $\rightarrow$ **Servicios Públicos**.
  - `"alquiler"`, `"arrendamiento"` $\rightarrow$ **Alquileres**.
  - `"seniat"`, `"impuesto"`, `"patente"` $\rightarrow$ **Tributos e Impuestos**.
  - `"flete"`, `"transporte"`, `"acarreo"` $\rightarrow$ **Fletes y Envíos**.

### 4.4 Facturación: Nota de Entrega (`NE-`) vs. Factura Fiscal (`FAC-`)
- **Nota de Entrega (`NE-`)**: Documento comercial que compromete y rebaja inventario de forma inmediata.
- **Factura Fiscal (`FAC-`)**: Documento fiscal definitivo con desglose de IVA (16%, 8%, Exento) e IGTF si aplica.
- **Consolidación**: Ambos documentos registran cuentas por cobrar y suman al balance consolidado de ingresos pendientes de liquidación hasta que se emita el recibo de pago correspondiente.
