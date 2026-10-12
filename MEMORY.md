# MEMORY.md — FRENYER

## Estado actual
- ERP bimonetario (USD/VES) React 19 + Vite + Express + Supabase.
- **Configuración > Almacén (`/configuracion` tab 'almacen')**:
  - **Cero datos estáticos o predeterminados**: Se erradicaron los mocks fijos (`DEFAULT_INITIAL_BRANCHES = []`). Ya no se muestran sedes ficticias heredadas.
  - **Sincronización en tiempo real con Supabase**: `/api/branches` y `fetchBranchesFromSupabase` consultan directamente la tabla `branches` de Supabase en tiempo real.
  - **Persistencia en base de datos**: Altas, ediciones y bajas guardan en tiempo real en `public.branches` con UUIDs válidos y campos auditables.
  - **Herramientas de auditoría y RLS**: Botón «Sincronizar» reactivo y modal «Permisos SQL» para copiar y ejecutar en Supabase el script de políticas RLS de la tabla `branches`.
- **Ventas Flash (`/ventas-flash/ventas`), Cotizaciones (`/ventas-flash/cotizaciones`) & Pedidos**:
  - **Formulario de Productos en Ventas POS**: El modal de producto no catalogado / Venta Libre (`isFreeItemOpen`) ahora incluye campo de cantidad con botones steppers `-` / `+` e input numérico editable de forma manual (con auto-selección en foco).
  - **Carrito POS**: Campo de cantidad con edición manual inmediata, selección al clic y validación de stock máximo.
  - **Cotizaciones**: Tablero de productos cotizados (`draftItems`) con campo de cantidad numérico editable manualmente en lugar de span estático.
  - **Pedidos**: Selección de cantidad manual ágil con `select()` al foco.
- **Inventario / Productos (`/inventarios/productos`)**:
  - Descuentos de stock en tiempo real en ventas y e-commerce.
  - Corrección de prefijo `LIB-` para productos reales de categoría Librería y prefijo `VL-` para ventas libres.
- **Reportes de Ventas y Pagos**: Vistas especializadas, filtros de fecha unificados en una sola línea y exportación dinámica.

## Decisiones importantes
- **Cero sedes mock**: La pestaña de almacén refleja la verdad absoluta de la base de datos Supabase; si la tabla tiene 0 registros, muestra la vista vacía limpia para registrar sedes reales.
- **UUIDs válidos en PostgreSQL**: Todo ID de sede creado en cliente o servidor utiliza el estándar RFC 4122 para evitar errores de sintaxis UUID en Supabase.
- **Bimonetariedad estricta**: Cálculos con redondeo a 2 decimales y conversión con tasa BCV vigente.

## Errores a evitar
- No volver a inyectar arrays estáticos como `DEFAULT_INITIAL_BRANCHES` en `db.ts` o en endpoints.
- No omitir `onFocus={(e) => e.target.select()}` en inputs numéricos donde los usuarios requieran sobreescritura rápida.
- No asumir que `data.length === 0` en Supabase significa fallo; un array vacío es un estado válido de la base de datos.
