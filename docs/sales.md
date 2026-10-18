# Ventas

## Descripción
Módulo encargado de la gestión de ventas del comercio, incluyendo ventas rápidas, pedidos, cotizaciones y reportes de ventas.

## Estructura Actual
- Ubicación: `src/modules/sales/`
- Componentes clave: `Sales.tsx` (POS), `Orders.tsx` (Gestión de pedidos), `Quotes.tsx` (Cotizaciones), `SalesReport.tsx`.

## Funcionalidades Clave
- Punto de Venta (POS) con soporte bimonetario.
- Emisión de documentos (facturas, comprobantes).
- Gestión de ventas a crédito con abonos de capital.

## Guía de Reestructuración / Mantenimiento
- Para modificar la lógica de emisión, actualizar `handleFinalizeSale` en `Sales.tsx`.
- Las consultas a la base de datos se manejan mediante `src/lib/supabase/db.ts`. Asegurar siempre el uso de RLS.
