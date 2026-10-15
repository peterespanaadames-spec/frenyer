# MEMORY.md — FRENYER

## Estado actual
- **Tasas de Cambio / Bimonetariedad**: Actualizada la tasa de cambio predeterminada y los respaldos en servidor a **877.90** (`DEFAULT_EXCHANGE_RATE`, `lastCertifiedRate`, y fallbacks de pedidos) para asegurar coherencia en los cálculos bimonetarios.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Implementado bloqueo estricto anti-doble-clic y prevención de duplicación de operaciones (`isSubmittingSale`), junto con indicador visual de carga ("Procesando...") en el botón 'Finalizar e Imprimir' para garantizar rapidez y una experiencia de usuario fluida y segura.
- **Compras (`/inventarios/compras`)**: Corregido: La inserción directa ahora actualiza correctamente el stock de productos y los movimientos bancarios de salida.
- **Inventario - Reporte Diario (`/inventarios/reporte-diario`)**: Módulo de **Reporte Diario** alineado 100% con el Design System de Frenyer: tarjetas con bordes suaves de 1px (`border border-slate-200/80 rounded-2xl`), insignias de estado con puntos indicadores, referencias en bloques estilizados, tipografía tabular (`tabular-nums`) y soporte bimonetario USD/VES con exportación en Excel y PDF/Impresión.
- **Clientes (`/contactos/clientes`)**: Corregido: "Total Gastado" y "Ticket Promedio" ahora se calculan dinámicamente en tiempo real a partir del historial de órdenes.
- **Cuentas por cobrar (`/cuentas/cobrar`)**: Corregido historial de pagos y abonos (tanto en USD como VES): persistencia dual robusta para cuentas bancarias (`bank_accounts.json` y respaldo Supabase), actualizando de forma inmediata y precisa el saldo de la cuenta bancaria y registrando el movimiento de entrada correspondiente.
- **Cuentas por pagar (`/cuentas/pagar`)**: Implementado módulo integral de CxP con 4 tarjetas de métricas bimonetarias, barra de control con filtros, botón renombrado a **'Registro Factura'**, tabla de reporte detallado y panel lateral reactivo con historial de amortizaciones del proveedor y contacto. Endpoint `POST /api/accounts-payable/:id/payments` para amortizaciones y egresos bancarios automáticos.
- **Vinculación con tabla de Proveedores (`suppliers`)**: Sincronización completa entre el catálogo de proveedores (`/contactos/proveedores`) y Cuentas por Pagar (`/cuentas/pagar`).
- **Estado**: Compilación TypeScript y linting limpios. Servidor activo en puerto 3000 (0.0.0.0).

## Decisiones importantes
- Endpoints robustos en `server.ts` para `/api/accounts-payable`, `/api/accounts-payable/:id/payments`, `/api/bank-accounts` y `/api/bank-movements` con persistencia dual (Supabase + local JSON) y sincronización con `payable_payments`, `receivable_payments` y `bank_movements`.
- Uso unificado de `fetchSuppliersFromSupabase()` y `createSupplierInSupabase()` tanto en gestión de contactos como en cuentas por pagar para evitar discrepancias de sesión o almacenamiento.
- Vinculación bidireccional y creación automática de proveedores en `/api/suppliers` al ingresar nuevos proveedores desde el formulario de facturas de cuentas por pagar.

## Errores a evitar
- No dejar desconectados los abonos a proveedores/clientes de los movimientos bancarios ni de la tabla de saldos de cuentas bancarias.
- No depender exclusivamente de tablas Supabase remotas sin respaldo en archivo local resiliente para cuentas y movimientos bancarios.
