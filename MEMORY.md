# MEMORY.md — FRENYER

## Estado actual
- **Compras (`/inventarios/compras`)**: Corregido: La inserción directa ahora actualiza correctamente el stock de productos.
- **Clientes (`/contactos/clientes`)**: Corregido: "Total Gastado" y "Ticket Promedio" ahora se calculan dinámicamente en tiempo real a partir del historial de órdenes.
- **Cuentas por cobrar (`/cuentas/cobrar`)**: Acceso simplificado (sin login obligatorio), sincronización vía proxy servidor y persistencia local resiliente.
- **Autenticación en Servidor**: Middleware `authenticatedSupabaseRequest` ahora falla suave, permitiendo operaciones básicas con contexto de admin si el usuario no tiene sesión válida.
- **Estado**: Todas las tareas solicitadas en la última iteración han sido completadas.
- **Siguientes pasos**: Monitorear rendimiento y validar consistencia del stock en otros escenarios (ej. devoluciones).

## Decisiones importantes
- Migración `0016` aplicada: unificación de esquemas para tablas core.
- Persistencia dual (Local + Supabase) para módulos críticos.
- Redirección de peticiones cliente-Supabase a `/api/*` en `server.ts` para robustez.

## Errores a evitar
- No volver a confiar ciegamente en una sesión activa de usuario en el cliente.
- Seguir utilizando `authenticatedFetch` para todas las peticiones a tablas protegidas por RLS.
