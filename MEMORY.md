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
- **Estado**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.

## Decisiones importantes
- **Regla de Oro de Interfaz ("Golden Template")**: Pantallas montadas dentro de `<div className="content">` con cabecera estándar `<div className="page-head">`, tarjetas `<Card>`, botones `<Button>` y tablas `.table-wrap`.
- **Persistencia Dual Resiliente**: Endpoints robustos en `server.ts` con sincronización en Supabase y respaldo en archivos locales JSON (`data/users.json`, `data/branches.json`, `data/bank_movements.json`) para garantizar que la app nunca falle por desconexión de base de datos.
- **Control de Acceso (RBAC)**: Permisos reactivos en cliente comunicados por eventos `frenyer:active-user-changed`, adaptando la visibilidad del menú al rol del operador.

## Errores a evitar
- No intentar crear usuarios administrativos directamente desde el navegador contra Supabase sin pasar por el backend seguro.
- No dejar campos de roles o permisos con valores quemados estáticos sin conexión al estado reactivo y al backend.
- Mantener siempre la bimonetariedad exacta y el redondeo a 2 decimales en transacciones.
