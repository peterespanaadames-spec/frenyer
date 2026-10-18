# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS).
- **Reporte Diario de Inventario (`/inventarios/reporte-diario` -> `DailyInventoryReport.tsx`)**:
  - Solucionado el botón "Imprimir / Guardar PDF" (tanto en la vista previa modal como en el menú de exportación): ahora abre de forma fiable una ventana emergente de impresión con el reporte formateado.
  - Reemplazado "FRENYER ERP" en la cabecera del reporte por el nombre del negocio registrado (`business.businessName`).
- **Verificación**: Compilación TypeScript y linter ESLint limpios al 100%. Servidor activo en puerto 3000.

## Soluciones técnicas recientes
- Corregido el reporte de ventas en `SalesReport.tsx`: Se añadió un `setTimeout` de 500ms antes de ejecutar `window.print()` en la ventana emergente de impresión para asegurar que todo el contenido (membrete, datos) se haya renderizado antes de imprimir o guardar como PDF.

## Cambios de autenticación
- Se ha eliminado la autenticación del panel administrativo. El sistema ahora permite el acceso directo a todas las secciones sin requerir inicio de sesión.
- Se ha eliminado la pantalla de inicio de sesión (AuthScreen) y se ha forzado el estado de autenticación como siempre activo.
- Se han eliminado botones y funciones relacionados con la autenticación (sign-out, guards).
- Los usuarios y roles se mantienen en la base de datos (aislados) según lo solicitado anteriormente.

## Corrección de Cuentas Bancarias
- Se ha modificado `authenticatedFetch` en `src/lib/supabase/api.ts` para eliminar la inclusión automática del token de autenticación (JWT) de Supabase en todas las peticiones a la API del servidor. Dado que se ha eliminado la autenticación del sistema, las llamadas a la API ya no necesitan enviar credenciales. Esto soluciona problemas donde el servidor rechazaba peticiones por falta de una sesión válida de Supabase, permitiendo que los movimientos bancarios y otras consultas se carguen correctamente al acceder sin iniciar sesión.

## Cambio de flujo: Cuentas Bancarias
- Se ha convertido el módulo de "Cuentas Bancarias" en un dashboard de solo visualización.
- Se han eliminado los botones para crear, editar, transferir o registrar movimientos desde esta pantalla.
- Según la solicitud, estas acciones administrativas se centralizarán en el módulo de Configuración -> Auditoría (se ha restringido el acceso a la creación/modificación desde la vista principal de cuentas).
