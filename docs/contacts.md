# Contactos

## Descripción
Gestión de base de datos de clientes (CRM) y proveedores.

## Estructura Actual
- Ubicación: `src/modules/customers/`
- Componentes clave: `Customers.tsx`, `Suppliers.tsx`.

## Funcionalidades Clave
- Directorio unificado de contactos con detalles financieros.
- Trazabilidad de compras y ventas asociadas a contactos.

## Guía de Reestructuración / Mantenimiento
- Mantener la normalización de datos (RIF/Cédula) para evitar duplicados.
- Las vistas de detalle deben cargar información de manera asíncrona para no bloquear el UI.
