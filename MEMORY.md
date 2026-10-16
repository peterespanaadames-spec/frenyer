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
- **Gestión de Usuarios y RBAC**: (Ver arriba).
- **Regla Bimonetaria de Transacciones**: Todo formulario de transacción verifica la tasa BCV oficial del momento, recalcula el total en VES sobre USD y registra ambos valores históricamente.
- **Proveedores - Modal de Detalle, Compromisos y Métricas**:
  - Al hacer clic en cualquier fila del directorio de proveedores (o botón de ver detalle):
    - **Compromisos pendientes y detalle**: Desglose exhaustivo de facturas activas en Cuentas por Pagar (N° documento, concepto, fecha emisión/vencimiento, alertas de morosidad, monto total, abonado y saldo deudor en USD y VES a tasa BCV, con historial desplegable de pagos).
    - **Ticket promedio de ventas**: Muestra el ticket promedio de ventas del comercio ($ USD y Bs) para evaluar la liquidez y rotación, junto con el ticket promedio por factura con dicho proveedor.
    - **Tiempo estimado de pago de deuda**: Proyección de amortización y días restantes según vencimiento contractual y capacidad de flujo diario, con semáforo de urgencia (Al día, En plazo comercial, Por vencer, Vencida).
- **RBAC & Autenticación Supabase / Next.js**:
  - Migración `0021_rbac_profiles_and_first_user_trigger.sql` con roles `'gerente'`, `'administrador'`, `'cajero'`, `'cliente'`.
  - Trigger automático `handle_new_user`: primer usuario registrado obtiene rol `'gerente'`, usuarios subsecuentes `'cliente'` por defecto o el asignado en metadata.
  - Arquitectura Next.js App Router con `@supabase/ssr`, `middleware.ts` para control de rutas administrativas y páginas `/login`, `/register` y `/forgot-password`.
- **Estado**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.

