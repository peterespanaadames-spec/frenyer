# MEMORY.md — FRENYER
Memoria breve de estado y decisiones. No guardar secretos ni datos personales.

## Estado
- ERP React 19/Vite + Express + Supabase. `.env` es local e ignorado.
- Productos e Inventario (`/inventario`):
  - Reparado error de sintaxis UUID en `branch_id` ("branch-1791557826073"). Validación estricta con `isValidUuid`, migración de sedes iniciales a UUIDs estándar, sanitización automática antes de interactuar con PostgreSQL y auto-recuperación sin fallas en guardado y actualización.
- Movimientos de Inventario (`/inventarios/movimientos`):
  - Pantalla kárdex funcional con trazabilidad en tiempo real sincronizada en Supabase (`inventory_movements`, `sales` y `purchases`).
  - Las ventas emitidas desde el POS descuentan inventario y registran inmediatamente su movimiento de salida asociado en el kárdex con correlativo, SKU, cliente y totales.
  - Cabecera limpia con título 'MOVIMIENTOS DE INVENTARIOS' (subtítulo operativo retirado).
  - Botón unificado 'Exportar Reporte' con menú desplegable para 'Exportar PDF' y 'Exportar XLS' (generación nativa con SheetJS XLSX).
  - 5 tarjetas de KPI: Stock actual, Total vendido, Total comprado, Margen & BCV, Operaciones.
  - Barra de búsqueda combinada, selector de productos, selector de tipos de movimiento, selector de períodos.
  - Tabla con Fecha/Hora, Comprobante/Ref, Cliente/Proveedor, Movimiento con signo, Precio/Costo y Monto total con redondeo bimonetario.
  - Modal funcional de 'AJUSTAR STOCK' (Entrada, Salida, Fijar Stock) con persistencia en Supabase y modal de detalle.
- Gastos Fijos y Variables (`/gastos`): bloqueado editar/borrar/repagar en gastos con estado 'PAGADO'.
- Ventas Flash, Cotizaciones, Compras Internas y Tesorería integradas con tasa oficial BCV y redondeo a 2 decimales.

## Errores a evitar
- Nunca enviar valores no-UUID (como códigos o slugs) a columnas `uuid` de PostgreSQL como `branch_id`.
- Nunca simular datos ficticios si la base de datos está vacía; mostrar estados vacíos nativos (`EmptyState`).
- Mantener signos explícitos en movimientos (+ entradas / compras, - salidas / ventas).
- No permitir edición ni eliminación en gastos cuyo estado sea 'PAGADO'.
- Respetar el Design System unificado sin introducir colores o clases huérfanas.
