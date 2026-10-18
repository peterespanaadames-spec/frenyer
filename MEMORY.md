# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS y respaldo resiliente).
- **Interfaz (UI)**:
  - Se han ocultado las opciones "Caja" y "Marketing" del menú lateral (Sidebar).
- **Punto de Venta (POS) / Emisión (`/ventas/pos` -> `Sales.tsx`)**:
  - Opción interactiva para abonar capital inicial al comprar a crédito con cargo directo a cuentas bancarias existentes.
- **Cuentas por Cobrar (`/cuentas/cobrar` -> `Accounts.tsx`)**:
  - Resumen detallado agrupado por cliente contraído por defecto.
- **Cuentas por Pagar (`/cuentas/pagar` -> `AccountsPayable.tsx`)**:
  - Proveedores consolidados con acordeón de historial y transacciones.
  - **Exportes XLS y PDF**: Encabezado y membrete superior en color gris con letras blancas; el resto de la tabla e información con celdas blancas/transparentes y texto legible oscuro.
- **Verificación**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.
