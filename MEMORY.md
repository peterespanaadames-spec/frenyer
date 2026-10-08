# MEMORY.md — FRENYER
Memoria breve de estado y decisiones. No guardar secretos ni datos personales.

## Estado
- ERP React/Vite + Express + Supabase. `.env` es local e ignorado; no versionar credenciales.
- Aplicación importada de GitHub (Frenyer).
- **Conexión a Supabase corregida**:
  - Resuelto el problema de `TypeError: Failed to fetch` al desacoplar el fallback de `127.0.0.1:54321` cuando Supabase no está configurado.
  - Implementado sistema de conexión dinámica: endpoint `/api/supabase/config` (POST para conectar y validar credenciales), `/api/supabase/status` (GET estado en vivo) y `/api/supabase/migrations-bundle` (GET script SQL consolidado 0001-0012).
  - Creado modal `SupabaseConnectionModal` accesible desde la barra superior, `Config.tsx` y `AuthScreen.tsx` para conectar la BD y sincronizar datos.
  - Corregidos endpoints REST en `server.ts` para `/api/suppliers` (eliminado 401 hardcodeado), `/api/sales`, `/api/accounts-receivable` y `/api/accounts-payable`.
- `VITE_AUTH_REQUIRED=false` permite vista previa; las rutas API y RLS siguen exigiendo sesión y membresía para datos privados.
- Aplicar en Supabase las migraciones en orden (o usar el script unificado de `/api/supabase/migrations-bundle`).
- Módulo de Cotizaciones/Presupuestos (`/ventas-flash/cotizaciones`): rediseño visual completo según el design system (canvas frío, bordes 1px, radios 16px, acento violeta):
  - NO se crea tabla aparte: las cotizaciones se almacenan directamente en la tabla core `sales` con `doc_type = 'COTIZACION'` y sus artículos en `sale_items`.
  - Corregido el guardado de cotizaciones: eliminadas referencias a columnas inexistentes (`rate_source`, `is_future_rate`, `rate_value_date`, `updated_at`) que provocaban error de schema en Supabase.
  - El histórico carga en vivo desde `sales` y muestra la lista completa de cotizaciones con sus 6 acciones operativas: Ver detalle, Facturar, Imprimir/PDF, Compartir, Modificar y Eliminar.
  - Cabecera ejecutiva con botón "Actualizar" y "+ Nueva cotización" con selección predictiva de clientes.
  - Tarjetas KPI métricas superiores: Total Cotizaciones, Vigentes/Pendientes, Facturadas (Cerradas) y Vencidas/Expiradas con desglose bimonetario (USD / VES con tasa BCV activa).
  - Pestañas segmentadas de estado rápido con contadores en tiempo real (Todas, Pendientes, Facturadas, Vencidas, Rechazadas).
  - Conversión a factura con deducción transaccional de stock tanto vía RPC como vía directa en `sales` y `sale_items`.
- Conversión de cotización a factura (`/ventas-flash/cotizaciones`):
  - Detección y chequeo automático del siguiente correlativo de factura del sistema (`getNextInvoiceCorrelative`) consultando la secuencia en Supabase.
  - Modal integral de facturación con vinculación financiera bimonetaria (USD/VES) y selección de método de pago:
    - **Contado**: Vinculación directa con cuentas bancarias/cajas (`bank_accounts`), registro en tabla `payments`, generación de movimiento bancario (`/api/bank-movements`) y acreditación inmediata del saldo en Tesorería/Finanzas.
    - **Crédito**: Creación automática de la obligación en Cuentas por Cobrar (`accounts_receivable`) con plazo configurable (7, 15, 30, 45 días o fecha personalizada), estado PENDIENTE y saldo vinculado.
  - Validación de stock en inventario y actualización de la cotización a estado `Facturada` con su ID de factura asociado.
- CxP asocia proveedores mediante `supplier_id`; pagos, saldo e impacto bancario se registran con la RPC transaccional de la migración 0008.
- La tasa BCV consulta fuente oficial y servicio alternativo; sin datos válidos responde error y no inventa una tasa. La conversión puede conservar la última tasa del navegador.
- `npm run dev` sirve el preview en `http://localhost:3000`; el modo local se verificó respondiendo HTTP 200.

## Limpieza aplicada localmente
- Se quitaron catálogos/clientes/productos, ventas, actividad, campañas, compras, caja, finanzas y reportes de demostración.
- El Dashboard calcula ventas recientes, CxC y stock desde Supabase; las pantallas sin persistencia muestran un estado vacío honesto.
- CxC manual exige cliente real de la organización, número documental y saldo íntegro; ya no crea clientes, pagos ni organizaciones ficticias.
- CxP/CxC ya no sustituyen nombres, documentos, fechas ni movimientos faltantes por valores de muestra.
- Eliminado el fallback en memoria de movimientos bancarios y las tasas BCV constantes de contingencia; las fallas de persistencia se informan.
- La venta solo confirma éxito tras registrar la venta y advierte si no se guarda el movimiento bancario. Errores de artículos, pagos o inventario se devuelven explícitamente.
- El importador de productos valida nombre y resultado de persistencia; la plantilla Excel queda sin productos de ejemplo.
- Se retiró el usuario ficticio de Configuración y se deshabilitó la gestión local no conectada a Supabase.
- Se habilitó menú lateral móvil con botón de apertura, backdrop y cierre al navegar.

## Pendientes conocidos
- `server.ts` requiere type-check dedicado; `tsconfig.node.json` solo incluye `vite.config.ts`. Ejecutar `npx tsc --ignoreConfig --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck server.ts`.
- La migración `0012_atomic_bank_movements.sql` incorpora RPCs transaccionales para movimientos y transferencias bancarias; la interfaz de transferencias usa ahora una única petición y la RPC valida saldos y conversión de divisas. Aún debe aplicarse manualmente en Supabase.
- Revisar el wildcard de SPA de Express 5, validación de fechas BCV, TLS del agente BCV (`rejectUnauthorized: false`), CORS y la caché de tasa global.
- La compilación puede advertir que el bundle principal supera 500 kB; no bloquea build ni lint.
- No se detectaron archivos de pruebas Vitest al cerrar la limpieza.

## Reglas
- RLS y membresía de organización son obligatorias; nunca usar IDs globales de respaldo.
- Toda operación financiera conserva tasa de cambio transaccional y redondeo bimonetario a dos decimales.
- No permitir SQL arbitrario desde el cliente; las operaciones de Alma deben usar herramientas autorizadas del servidor.
