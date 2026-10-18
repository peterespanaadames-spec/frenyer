# Inventario

## Descripción
Gestión integral de productos, compras internas y movimientos de inventario (entradas/salidas).

## Estructura Actual
- Ubicación: `src/modules/inventory/`
- Componentes clave: `Inventory.tsx`, `InternalPurchases.tsx`, `Movements.tsx`.

## Funcionalidades Clave
- Catálogo de productos bimonetario.
- Registro de compras a proveedores.
- Kárdex de movimientos y reportes diarios.

## Guía de Reestructuración / Mantenimiento
- Para añadir tipos de movimientos, actualizar las tablas de base de datos y la lógica en `Movements.tsx`.
- Mantener la integridad de los datos bimonetarios usando la tasa BCV (`getActiveExchangeRate`).
