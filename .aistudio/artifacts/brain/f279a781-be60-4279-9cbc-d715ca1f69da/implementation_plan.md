# Plan de Implementación: Gestión de Usuarios y RBAC

Este plan detalla la incorporación del módulo de "Agregar Usuario" con Control de Acceso Basado en Roles (RBAC) en el panel administrativo de Frenyer ERP, siguiendo las guías de diseño y arquitectura del sistema.

## 1. Análisis y Preparación (Procesos)
- **Revisión del Proceso Actual:** Se validará cómo el sistema autentica actualmente a los usuarios y cómo se asocian con organizaciones/sucursales.
- **Estructura de RBAC:** Implementación de la jerarquía de roles (Admin, Manager, Cashier, Viewer) y mapeo de permisos a módulos (Ventas, Inventario, Finanzas, Informes, Gestión de Usuarios).

## 2. Base de Datos (Supabase)
- **Validación de Esquema:** Verificación de las tablas `profiles` y `organization_members`. Se añadirán columnas o tablas necesarias para almacenar el rol y los permisos granulares.
- **Seguridad (RLS):** Asegurar que las políticas RLS restrinjan el acceso a los datos basándose estrictamente en el rol del usuario autenticado.

## 3. Desarrollo de UI (Frontend)
- **Modal de "Agregar Usuario":** Creación de un componente reutilizable `UserAccessModal` siguiendo `DESIGN_SYSTEM.md` (fondo blanco, radio de borde `16px`, acento violeta).
- **Integración:** Actualización de `/src/modules/alma/pages/Config.tsx` para abrir este modal al hacer clic en "Agregar Usuario".
- **Formulario:** Campos para correo electrónico, selección de rol (dropdown) y selección de permisos (checkboxes/chips).

## 4. Revisión General del Sistema
- **Auditoría de Procesos:** Revisión exhaustiva de los flujos de trabajo del panel administrativo y la página web para garantizar consistencia, seguridad y que no existan procesos inventados o duplicados.
- **Acceso:** Implementación de la lógica para que, tras el inicio de sesión, el sistema restrinja las rutas y acciones visibles según los permisos definidos para el usuario.

## 5. Verificación
- **Pruebas:** Validación del flujo completo (creación de usuario, asignación de roles, verificación de acceso).
- **Lint/Compile:** Ejecución de `compile_applet` y `lint_applet` para asegurar integridad del código.
