# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS).
- **Reporte Diario de Inventario (`/inventarios/reporte-diario` -> `DailyInventoryReport.tsx`)**:
  - Solucionado el botón "Imprimir / Guardar PDF" (tanto en la vista previa modal como en el menú de exportación): ahora abre de forma fiable una ventana emergente de impresión con el reporte formateado.
  - Reemplazado "FRENYER ERP" en la cabecera del reporte por el nombre del negocio registrado (`business.businessName`).
- **Verificación**: Compilación TypeScript y linter ESLint limpios al 100%. Servidor activo en puerto 3000.
