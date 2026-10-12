# MEMORY.md — FRENYER

## Estado actual
- ERP bimonetario (USD/VES) React 19 + Vite + Express + Supabase.
- **Reporte de Pagos / Cuentas (`/cuentas/reporte`)**:
  - Incorporados filtros de fecha **«Desde»** y **«Hasta»** unificados en la misma línea (`flex items-center gap-2 flex-nowrap`) con anchos controlados (`width: 115px`, `font-size: 12px`), evitando saltos de línea y manteniendo alineación profesional.
- **Reporte de Ventas (`/ventas-flash/reporte`)**:
  - Cuadrícula de KPIs (`grid grid-4`): Total Órdenes, Total Ingresos Facturados, Utilidad Estimada y **Ticket Promedio** (calculado contablemente como `totalIncome / totalOrders`, bimonetario USD/VES).
  - Filtro de Periodo enriquecido con selectores de fecha nativos: **«Desde»** y **«Hasta»** para búsqueda personalizada por rango temporal, además de los accesos rápidos (Hoy, Esta Semana, Este Mes, Histórico).
  - Barra de búsqueda con ancho de 380px (Focus Mode) acompañada de:
    - Etiqueta de texto **«Filtra por:»** situada antes del campo desplegable interactivo de vistas (**«Detalle de Ventas»**, **«Productos + Vendidos»** y **«Metodos de Pagos»**).
    - Campo desplegable de comprobantes contiguo (Facturas, Notas de Entrega, Pedidos Web).
  - Selector de fechas del Periodo reorganizado bajo el estándar unificado ERP: **«Desde»** [input] **«Hasta»** [input] con `flex-nowrap`, asegurando alineación limpia e intuitiva.
  - Vistas especializadas:
    - *Productos + Vendidos*: Ranking posicional (#1, #2...), SKU, unidades vendidas, precio promedio USD, total USD/VES y barra visual de porcentaje de participación.
    - *Metodos de Pagos*: Desglose por método de pago/banco, número de operaciones, total recaudado USD/VES, ticket promedio y porcentaje de recaudación.
  - Exportación dinámica a Excel y CSV que adapta automáticamente las columnas y datos exportados a la vista seleccionada.
  - Encabezado con botón «Sincronizar» (`RefreshCw`) y botón «Exportar» con dropdown flotante anclado (`relative` en CSS, `zIndex: 9999`) con 3 opciones: Excel (.xlsx), CSV (.csv) e Imprimir/PDF.
  - Tabla de transacciones con columna «Acciones»: botón directo a la ficha completa `/ventas-flash/reporte/:id`.
- **SaleDetailModal & SaleDetailPage**: Desglose con bimonetariedad, métodos de pago reales, productos de la venta e impresión directa.
- **Cotizaciones (`/ventas-flash/cotizaciones`)**:
  - Subtítulo informativo eliminado del encabezado para mayor limpieza visual.
  - Campo desplegable interactivo de estados integrado dentro de la barra de filtros principal justo después de «Filtrar por producto o SKU...».
  - Anchos de control armonizados: selector de clientes (250px), filtro de producto/SKU (190px) y botón desplegable interactivo de estados (250px).
  - Estados incluidos: «Total las cotizaciones», «Pendientes / vigentes», «Facturadas», «Vencidas», «Rechazadas» con iconos semánticos y badges de conteo reactivos.
- **Inventario / Productos (`/inventario`)**:
  - Modal «Nuevo producto» y «Editar producto»: Se removió el recuadro informativo verde de precios grabados en USD para maximizar la limpieza y compactación visual del formulario de creación y edición.

## Decisiones importantes
- **Anclaje CSS relativo en Dropdowns**: En lugar de depender de clases utilitarias ausentes, los menús desplegables se anclan con `style={{ position: 'relative', display: 'inline-block' }}` y `zIndex: 9999` para garantizar que floten visiblemente sin desfasarse ni cortarse por contenedores padre.
- **Doble acceso en Acciones de Tabla**: El botón «Detalle» ejecuta exclusivamente `setSelectedMovementDetail(mov)` para no interrumpir el flujo visual con redirecciones abruptas, mientras que el botón de acceso externo abre la pantalla dedicada `/ventas-flash/reporte/:id`.
- **Bimonetariedad estricta**: Todos los cálculos de USD y VES se sincronizan con la tasa oficial BCV y redondeo a 2 decimales.

## Errores a evitar
- No asumir existencia de clases utilitarias de Tailwind como `.relative` sin verificar `globals.css`.
- No mezclar `navigate()` inmediato con `setSelectedMovementDetail(mov)` en un solo clic si se espera abrir un modal en la misma pantalla.
- No concatenar SQL arbitrario para el asistente Alma ni omitir RLS en Supabase.
