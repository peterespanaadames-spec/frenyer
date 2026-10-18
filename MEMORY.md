# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS y respaldo resiliente).
- **Tienda Online (`/` -> `ShopPage.tsx`)**:
  - Identidad corporativa: Logo CR + `Compu` (azul marino) `Repuestos` (rojo carmesí) · `Flores` (azul marino) `Inversiones` (rojo carmesí).
  - Banners duales: **Flores Inversiones CompuFuturo** y **Acelera Motor Partes**.
  - Catálogo de productos: Bimonetariedad (**USD y VES** a tasa BCV 877.90).
- **Tasas de Cambio / Bimonetariedad**: Tasa predeterminada en **877.90** (`DEFAULT_EXCHANGE_RATE`) con soporte oficial BCV y tasa futura.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Bloqueo anti-doble-clic y sincronización de inventario.
- **Compras (`/inventarios/compras`)**: Inserción sincronizada con stock y egresos bancarios.
- **Inventario - Reporte Diario (`/inventarios/reporte-diario`)**: Botón exportar unificado (Excel, CSV, Imprimir/PDF con vista previa).
- **Finanzas - Salud del Negocio y PyG**: Indicadores de capital, balance real bimonetario y exportación completa.
- **Proveedores (`/contactos/proveedores`)**: Modal centrado con dos tags (Facturación y Movimientos / Ficha de Proveedor) con altura fija de 800px.
- **Cuentas por Cobrar (`/cuentas/cobrar` -> `Accounts.tsx`)**:
  - **100% Datos Reales de Supabase**: Cero simulación. Conexión directa a `accounts_receivable`, `customers`, `sales`, `sale_items`, `payments` y `receivable_payments`.
  - **Resumen agrupado por cliente**: Juan Valdez y Perez Perez (Pedro Pérez) aparecen agrupados con sus métricas consolidadas exactas.
  - **Despliegue interactivo de órdenes reales**: Juan Valdez despliega Orden 18 ($37.75) y Orden 21 ($3.45); Perez Perez despliega Orden 19 ($6.43), Orden 03 ($35.00) y Orden 02 ($35.00).
  - **Artículos e Historial de cancelación**: Al tocar cualquier orden se muestran los artículos facturados (`sale_items`: amortiguador, arneses, borrador nata, tablas planilleras, colores) y el historial exacto de cancelación (Efectivo USD $35 el 2026-10-06, liquidación completa en fecha o abonos registrados).
- **Verificación**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.
