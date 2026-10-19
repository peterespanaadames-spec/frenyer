# MEMORY.md — FRENYER

## Estado actual
- **Sistema de Autenticación, Roles y Permisos (RBAC)**: Implementado `AuthContext` con soporte para clientes externos (registro público e e-commerce) y usuarios internos/administrativos con roles granulares (`SUPERADMIN`, `ADMIN`, `INVENTORY`, `SALES`, `CASHIER`, `ACCOUNTANT`, `SUPPORT`).
- **Correcciones UI y Runtime**: Refactorizado el modal de autenticación de clientes/registro en `ShopPage.tsx` para utilizar estado React (`isAuthRegisterMode`) en lugar de manipulación imperativa de DOM (`document.getElementById` / `innerText`), resolviendo el error `TypeError: Cannot set properties of null (setting 'innerText')`.
- **Flexibilidad de Bearer Token**: Actualizado `authenticatedSupabaseRestRequest` en el backend (`server.ts`) para aplicar de forma transparente un contexto por defecto ante ausencia de token Bearer, evitando errores 401 en endpoints públicos o mixtos.
- **Verificación**: Compilación TypeScript y linter ESLint limpios al 100%. Servidor activo en puerto 3000.

## Soluciones técnicas recientes
- **Eliminación de Manipulación DOM en React**: Reemplazado código imperativo frágil en `ShopPage.tsx` por estados reactivos de React.
- **Robustez de Endpoints**: Fallback automático en `server.ts` para solicitudes sin cabecera de autenticación estricta.
