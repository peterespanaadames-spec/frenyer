# MEMORY.md — FRENYER

## Estado actual
- **Migración desde GitHub (`peterespanaadames-spec/frenyer`)**: Importación completada y verificada exitosamente bajo los estándares de Frenyer ERP (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase con respaldo local).
- **Tasas de Cambio / Bimonetariedad**: Actualizada la tasa de cambio predeterminada y los respaldos en servidor a **877.90** (`DEFAULT_EXCHANGE_RATE`, `lastCertifiedRate`, y fallbacks de pedidos) para asegurar coherencia en los cálculos bimonetarios.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Implementado bloqueo estricto anti-doble-clic y prevención de duplicación de operaciones (`isSubmittingSale`), junto con indicador visual de carga ("Procesando...") en el botón 'Finalizar e Imprimir' para garantizar rapidez y una experiencia de usuario fluida y segura.
- **Compras (`/inventarios/compras`)**: Corregido: La inserción directa ahora actualiza correctamente el stock de productos y los movimientos bancarios de salida.
- **Inventario - Reporte Diario (`/inventarios/reporte-diario`)**: Refactorizado y armonizado al 100% con el Design System nativo de Frenyer (AppShell, `.content`, `<Card>`, `<Button>`, `<Badge>`). Implementado botón desplegable unificado **'Exportar'** (Excel `.xlsx`, CSV `.csv`, Imprimir / PDF). Para la opción 'Imprimir / PDF' se incorporó un modal de vista previa del documento oficial con impresión nativa por iframe oculto (sin bloqueos de iframe/sandbox) y descarga directa de archivo HTML imprimible.
- **Finanzas - Salud del Negocio (`/finanzas/salud`)**: Sección de **CAPITAL y VALOR DE ACTIVOS** reubicada estrictamente **por encima del gráfico** de Evolución Mensual. Datos 100% reales conectados a Supabase (`products`, `bank_accounts`, `accounts_receivable`, `accounts_payable`, `sales`, `expenses`, `sale_items`) con suscripción `postgres_changes` en tiempo real y sin datos simulados. Se removieron todos los mensajes o textos de "tiempo real / conexión supabase". Tarjeta de evaluación optimizada con diseño verde vibrante, gran corazón, flecha de crecimiento ascendente a la derecha y puntuación destacada.
- **Estado**: Compilación TypeScript y linting limpios. Servidor activo en puerto 3000 (0.0.0.0).

## Decisiones importantes
- **Regla de Oro de Interfaz ("Golden Template")**: Toda pantalla nueva de Frenyer DEBE montarse dentro de `<div className="content">` con cabecera estándar `<div className="page-head">`, tarjetas `<Card>`, botones `<Button>` y tablas `.table-wrap`. Nunca inyectar contenedores `min-h-screen`, `bg-slate-50` ni clases Tailwind que dupliquen o anulen el AppShell (`DashboardLayout.tsx`).
- Endpoints robustos en `server.ts` para `/api/accounts-payable`, `/api/accounts-payable/:id/payments`, `/api/bank-accounts` and `/api/bank-movements` con persistencia dual (Supabase + local JSON) y sincronización con `payable_payments`, `receivable_payments` y `bank_movements`.
- Uso unificado de `fetchSuppliersFromSupabase()` y `createSupplierInSupabase()` tanto en gestión de contactos como en cuentas por pagar para evitar discrepancias de sesión o almacenamiento.

## Errores a evitar
- **Bypass del Design System**: No construir pantallas con clases de Tailwind genéricas desconectadas de `tokens.css` y `src/components/ui/`.
- No dejar desconectados los abonos a proveedores/clientes de los movimientos bancarios ni de la tabla de saldos de cuentas bancarias.
- No depender exclusivamente de tablas Supabase remotas sin respaldo en archivo local resiliente para cuentas y movimientos bancarios.
