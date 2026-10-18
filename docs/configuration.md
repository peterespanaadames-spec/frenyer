# Configuración

## Descripción
Panel de administración para configurar parámetros del negocio, almacén, gestión de usuarios y auditoría.

## Estructura Actual
- Ubicación: `src/pages/Config.tsx` (o módulos específicos en `src/modules/`)
- Funciones: Configuración de parámetros, usuarios, auditoría del sistema.

## Funcionalidades Clave
- Ajustes generales del negocio.
- Gestión de roles de usuario (RBAC).
- Registro de auditoría para trazabilidad de acciones.

## Guía de Reestructuración / Mantenimiento
- Los cambios en configuración son sensibles; siempre incluir validación en servidor.
- La auditoría debe ser inmutable y registrarse en tiempo real.
