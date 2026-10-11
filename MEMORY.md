# MEMORY.md — FRENYER
Memoria breve de estado y decisiones. No guardar secretos ni datos personales.

## Estado
- ERP React 19/Vite + Express + Supabase. `.env` es local e ignorado.
- Productos e Inventario (`/inventario`):
  - Reparado error de sintaxis UUID en `branch_id` ("branch-1791557826073"). Validación estricta con `isValidUuid`, migración de sedes iniciales a UUIDs estándar, sanitización automática antes de interactuar con PostgreSQL y auto-recuperación sin fallas en guardado y actualización.
- Movimientos de Inventario (`/inventarios/movimientos`):
  - Reparado fallo en filtros de búsqueda y lectura de datos: resuelto problema donde los 'Ajustes de Stock' quedaban en 0 al registrarse debido a la falta de persistencia en backend cuando la tabla `inventory_movements` no existe en Supabase. Se implementó persistencia resiliente en `/data/inventory_adjustments.json` sincronizada en tiempo real con la mutación de `products.stock`.
  - Normalizado el filtro `movementTypeFilter`: ahora reconoce variantes `AJUSTE_ENTRADA`, `AJUSTE_SALIDA`, `AJUSTE_CORRECCION`, `doc_type === 'AJUSTE'` y correlativos `AJU-*`. Se agregaron contadores numéricos en vivo dentro de las opciones del selector de tipo (`🟡 Ajustes de Stock (5)`, etc.).
  - Búsqueda en vivo predictiva y automática: botón interactivo con indicador en tiempo real, catálogo flotante de sugerencias al escribir/enfocar con datos de stock y precio, y chip informativo activo.
  - Tabla profesional de kárdex con columnas esenciales: Fecha/Hora, Referencia, Producto (SKU), Badge de Tipo (`🟡 Ajuste`, `🟢 Entrada`, `🔴 Salida`), Cantidad, Stock resultante recalculado y Valoración bimonetaria.
- Gastos Fijos y Variables (`/gastos`): bloqueado editar/borrar/repagar en gastos con estado 'PAGADO'.
- Ventas Flash, Cotizaciones, Compras Internas y Tesorería integradas con tasa oficial BCV y redondeo a 2 decimales.
- Limpieza de UI: eliminado banner superior de vista previa sin inicio de sesión en `DashboardLayout`; eliminada píldora de '$ Tasa Activa' en cabecera de inventario y texto de compatibilidad con 'a2 Software' en modal de importación/exportación.
- Ventas / Métodos de pago (`/ventas` - Paso 2 de cobranza): ampliado el contenedor de configuración de métodos de pago a `width: 600px` con contenedor responsivo (`maxWidth: 960px`).
- Cotizaciones (`/cotizaciones`): el formulario de 'Nueva cotización' ahora se abre completamente limpio sin preseleccionar el primer cliente de la base de datos (`customers[0]`). Al presionar '+ Nuevo Cliente' se despliega el formulario idéntico al módulo de Clientes (cabecera degradada violeta, nombre, tipo doc, cédula/RIF, teléfono, límite de crédito, email y dirección), persiste en Supabase en la tabla `customers` y traslada automáticamente el cliente recién creado al selector activo de la cotización.
- Configuración (`/configuracion/almacen`): eliminado texto descriptivo largo; renombrado botón a 'Agregar Sede' y actualizado su color a morado (`brand-500`); actualizado placeholder de teléfono; botón de 'Guardar Sede' ahora usa color morado (`brand-500`); eliminada píldora de '$ Tasa USD' en cabecera de configuración.
- Compras Internas (`/inventarios/compras`): título de la pantalla actualizado a 'COMPRAS DE DE PRODUCTOS'; eliminado texto descriptivo/subtítulo secundario; botón de registro 'Agregar Compras'; modal `NewPurchaseModal` con encabezado morado, botón continuar morado (`var(--brand-500)`), acentos violeta y contenedor con `height: 600px`.
- Proveedores (`suppliers`): resuelto error de violación de políticas RLS al registrar proveedores desde compras internas, cuentas por pagar y módulo de proveedores. Se implementó una capa de persistencia resiliente bidireccional (`frenyer_local_suppliers` y Supabase), captura segura de excepciones de RLS y sincronización inmediata con los formularios.
- Migración e importación GitHub validada: repositorio normalizado para npm y Node.js 22 (eliminado bun.lock residual, metadata.json sincronizado con capabilities requeridas, dev server en puerto 3000 con 0.0.0.0 verificado y linter limpio).

## Errores a evitar
- Nunca enviar valores no-UUID (como códigos o slugs) a columnas `uuid` de PostgreSQL como `branch_id`.
- Nunca simular datos ficticios si la base de datos está vacía; mostrar estados vacíos nativos (`EmptyState`).
- Mantener signos explícitos en movimientos (+ entradas / compras, - salidas / ventas).
- No permitir edición ni eliminación en gastos cuyo estado sea 'PAGADO'.
- Respetar el Design System unificado sin introducir colores o clases huérfanas.
