# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase con respaldo local resiliente).
- **Tasas de Cambio / Bimonetariedad**: Tasa predeterminada en **877.90** (`DEFAULT_EXCHANGE_RATE`, servidor y respaldos) con soporte oficial BCV y tasa futura.
- **Punto de Venta (POS) / Emisión (`/ventas/pos`)**: Bloqueo estricto anti-doble-clic y prevención de duplicados con indicador de procesamiento.
- **Compras (`/inventarios/compras`)**: Inserción directa sincronizada con stock de productos y egresos bancarios.
- **Inventario - Reporte Diario (`/inventarios/reporte-diario`)**: Botón exportar unificado (Excel, CSV, Imprimir/PDF con vista previa e impresión segura).
- **Finanzas - Salud del Negocio y PyG**: Indicadores de capital, balance real bimonetario y exportación completa.
- **Gestión de Usuarios y RBAC (`/configuracion` -> Usuarios Asociados)**:
  - Implementado sistema completo de gestión de usuarios con persistencia dual (`server.ts` con `/api/users`, `/api/users/:id`, `/api/users/:id/toggle-status`, sincronizado con Supabase `profiles` y respaldo en `data/users.json`).
  - Modal de "Agregar / Editar Usuario" con roles definidos (`Admin`, `Manager`, `Cashier`, `Viewer`) y permisos granulares de módulos (Ventas/POS, Inventario, Finanzas/Bancos, Informes de Gestión, Gestión de Usuarios).
  - Tarjetas de usuarios asociadas con avatar de iniciales, insignia de rol por colores, interruptor de estatus activo/inactivo, etiquetas de módulos permitidos, botones de editar/eliminar y opción de activar perfil en sesión.
  - Menú lateral (`Sidebar.tsx`) con filtrado dinámico según los permisos del usuario activo.
- **Dashboard Operativo (`/dashboard`)**:
  - Utilidad Mensual sincronizada exactamente con las fórmulas de *Salud del Negocio* (`totalIngresos - totalCostosVentas - totalGastosOperativos`), deduciendo costos por venta y gastos de `expenses`.
  - Top 5 productos más vendidos recuperado e infalible mediante agrupación directa sobre `sale_items` y catálogo.
  - Cuentas por Cobrar y por Pagar a Vencer filtradas estrictamente para incluir documentos con saldo activo con vencimiento en los **próximos 21 días** o correspondientes al **mes calendario en curso**, mostrando conteo de documentos.
  - Tipografía y jerarquía visual del Design System aplicadas globalmente.
- **Estado**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.

