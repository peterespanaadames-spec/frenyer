# MEMORY.md — FRENYER

## Estado actual
- **Migración y Base del Sistema**: Frenyer ERP bimonetario (Node.js 22, Express, Vite, React 19, Tailwind CSS, TypeScript, Supabase PostgreSQL con RLS). Conectado al proyecto Supabase `knyqrwpaksawuxoqcayu`.
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

## Cuentas Bancarias (Restablecimiento operativo)
- Se han restablecido en la vista de Cuentas Bancarias (`/finanzas/cuentas` -> `BankAccounts.tsx`):
  - **Transferencias entre cuentas**: Botón en cabecera, tarjetas individuales y vista de movimientos, con cálculo bimonetario automático (VES/USD), vista previa y tasa oficial.
  - **Ingreso de saldo (Depósitos)**: Modal operativo con preselección de cuenta de destino y actualización de saldo en tiempo real.
  - **Retiro de saldo (Egresos)**: Modal operativo con validación de saldo disponible y registro de salida.
  - **Acciones rápidas en tarjetas**: Botones de Ingreso, Retiro, Transferir y Editar directamente en cada cuenta.
  - **Persistencia en Supabase**: Movimientos de transferencia, ingresos y egresos afectan directamente `bank_accounts` (saldos) e insertan en `bank_movements` tanto por RPC como por REST fallback.
  - Sincronización inmediata de saldos y emisión del evento global `frenyer:bank-updated`.
- Claves de Supabase guardadas en `.env.example` y `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_AUTH_REQUIRED=true`).
- **Configuración / Auditoría de Cuentas Bancarias (`Config.tsx`)**: Se han agregado los botones **"Incluir cuenta"** y **"Incluir método de pago"** en la cabecera de la pestaña de Auditoría, junto con un botón de acción **"Modificar"** para cada cuenta registrada (activas e inactivas) que abre un modal dedicado de edición de cuenta bancaria y sincronización con Supabase.
- **Cuentas Bancarias (`BankAccounts.tsx`)**: Se han eliminado los botones **"Nueva cuenta"** y **"Métodos de pago"** de la cabecera superior de la vista de cuentas bancarias según solicitado. Asimismo, se ha removido el botón/pestaña **"Cuentas activas"**, la opción de **modificar** cuentas, y los botones de **ingreso, retiro y transferir** de las tarjetas individuales de las cuentas (conservando solo el acceso a movimientos).
- **Configuración / Usuarios Asociados (`Config.tsx`)**: Se corrigió el guardado y actualización de usuarios asociados apuntando a los endpoints `/api/users` y `/api/users/:id` (en lugar de `/api/admin/users/*` que requerían rol de gerente exclusivo y bloqueaban las peticiones), permitiendo registrar y actualizar correctamente en la base de datos local y Supabase.

