# MEMORY.md — FRENYER

## Estado actual
- **Tasas de Cambio / Bimonetariedad**: Actualizada la tasa de cambio predeterminada y los respaldos en servidor a **877.90** (`DEFAULT_EXCHANGE_RATE`, `lastCertifiedRate`, y fallbacks de pedidos) para asegurar coherencia en los cálculos bimonetarios.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Implementado bloqueo estricto anti-doble-clic y prevención de duplicación de operaciones (`isSubmittingSale`), junto con indicador visual de carga ("Procesando...") en el botón 'Finalizar e Imprimir' para garantizar rapidez y una experiencia de usuario fluida y segura.
- **Compras (`/inventarios/compras`)**: Corregido: La inserción directa ahora actualiza correctamente el stock de productos y los movimientos bancarios de salida.
- **Clientes (`/contactos/clientes`)**: Corregido: "Total Gastado" y "Ticket Promedio" ahora se calculan dinámicamente en tiempo real a partir del historial de órdenes.
- **Cuentas por cobrar (`/cuentas/cobrar`)**: Corregido historial de pagos: los abonos ahora se guardan mediante `POST /api/accounts-receivable/:id/payments`, reconcilian pagos previos con balance amortizado y registran automáticamente el movimiento bancario y aumento de saldo en la cuenta bancaria receptora.
- **Estado**: Compilación TypeScript y linting limpios. Eliminado el texto de "Tasa BCV" en la vista de Ganancias y Pérdidas a solicitud del usuario. Servidor activo en puerto 3000 (0.0.0.0).

## Decisiones importantes
- Endpoints robustos en `server.ts` para `/api/bank-movements`, `/api/bank-transfers`, y `/api/accounts-receivable/:id/payments` con persistencia dual (Supabase + respaldos JSON locales) y actualización automática de saldos bancarios.
- Sincronización automática en `Sales.tsx` y `Accounts.tsx` para enviar el `bank_account_id` correcto al registrar cobros y ventas al contado.
- Bloqueo de concurrencia y protección anti-doble clic (`isSubmittingSale`, `isSubmittingDeposit`, `isSubmittingWithdraw`, `isSubmittingTransfer`) en POS y operaciones de Cuentas Bancarias para evitar transacciones duplicadas por clics múltiples.

## Errores a evitar
- No dejar desconectados los cobros de CxC o POS de los movimientos y saldos de cuentas bancarias.
- Permitir doble clic en botones de emisión y pago en el POS.
- Seguir utilizando `authenticatedFetch` para todas las peticiones a tablas protegidas por RLS.

