# Actualizaciones del Sistema - Reportes y Exportaciones

## Descripción de las Mejoras
Se ha estandarizado el formato de exportación (PDF y XLS) para todos los reportes del sistema.

## Cambios Realizados
- **Estándar de Estilo**: Se ha definido un formato consistente con encabezados en color gris oscuro (`#4b5563`) y texto en blanco, con filas de datos en fondo blanco y texto oscuro para garantizar legibilidad.
- **Membrete Empresarial**: Se creó una utilidad central (`src/lib/reportUtils.ts`) que recupera la información del negocio (Nombre, RIF, Teléfono) desde la configuración y la inserta automáticamente en todos los reportes generados.
- **Implementación**: Se aplicó este estándar inicialmente en el módulo de Cuentas por Pagar (`AccountsPayable.tsx`).

## Próximos Pasos
- Aplicar este estándar a los módulos restantes (Ventas, Inventario, Clientes, etc.) progresivamente.
