# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS y respaldo resiliente).
- **Interfaz (UI)**:
  - Se han ocultado las opciones "Caja" y "Marketing" del menú lateral (Sidebar).
- **Reportes y Exportaciones**:
  - Estandarización de formato (XLS/PDF): Encabezado en gris oscuro (`#4b5563`) con texto blanco; datos en celdas blancas/transparentes con texto negro.
  - Integración de membrete dinámico (Nombre del negocio, RIF, Teléfono) desde la configuración en todos los reportes.
  - Implementado en: Cuentas por Pagar (`AccountsPayable.tsx`), Pedidos (`Orders.tsx`), Cuentas por Cobrar (`Accounts.tsx`).
- **Punto de Venta (POS) / Emisión (`/ventas/pos` -> `Sales.tsx`)**:
  - Opción interactiva para abonar capital inicial al comprar a crédito con cargo directo a cuentas bancarias existentes.
- **Cuentas por Cobrar (`/cuentas/cobrar` -> `Accounts.tsx`)**:
  - Resumen detallado agrupado por cliente contraído por defecto.
- **Cuentas por Pagar (`/cuentas/pagar` -> `AccountsPayable.tsx`)**:
  - Proveedores consolidados con acordeón de historial y transacciones.
- **Verificación**: Compilación TypeScript y linting limpios al 100%. Servidor activo en puerto 3000.
