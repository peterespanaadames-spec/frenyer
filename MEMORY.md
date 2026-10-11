# MEMORY.md — FRENYER
Memoria breve de estado y decisiones. No guardar secretos ni datos personales.

## Correcciones Recientes
- [x] Ajuste de stock en Inventario: Se mejoró la persistencia y la capacidad de respuesta de la interfaz al actualizar el stock de productos, forzando la actualización local inmediata.
- [x] Shoppage: Se reemplazó el valor estático por dinámico y se verificaron los cambios manuales del usuario (slogan, sucursales).

## Estado
- ERP React 19/Vite + Express + Supabase. `.env` es local e ignorado.
- Tienda Virtual Pública (`/`):
  - Encabezado comercial con identidad configurable ("Frenyer, C.A.", lema, sucursal activa).
  - Buscador global reactivo (nombre, código de barras, SKU, categoría, marca, descripción).
  - Sub-barra horizontal de navegación dinámica por categorías.
  - Tasa BCV oficial visible con fecha valor y selector bimonetario (USD / VES).
  - Carrito de compras flotante (drawer) con validación de inventario y cantidades.
  - Flujo de checkout integrado en pasos (invitado/registrado, despacho en sucursal/domicilio, métodos de pago venezolanos: Pago Móvil, Transferencia, Efectivo USD, Zelle).
  - Modal de consulta y seguimiento "Mis Pedidos" para clientes en vivo.
  - Atajo global `Ctrl + A + S` en secuencia no simultánea que redirige al panel administrativo sin interrupciones ni textos expuestos; enlace táctil accesible en el pie de página.
- Panel Administrativo: Control de Pedidos (`/ventas-flash/pedidos`):
  - Encabezado: "CONTROL DE PEDIDOS" con accesos a POS, pedidos facturados, actualizar en tiempo real, exportar Excel (XLSX) y crear nuevo pedido.
  - 4 tarjetas KPI en tiempo real: Total pedidos, Pendientes, Completados y Facturación activa bimonetaria.
  - Barra de filtros coordinada: estado de entrega, estado de pago, método de entrega, filtro por fecha/rango, toggle de sonido para alertas y conmutador Tabla / Kanban.
  - Vista de tabla con columnas canónicas y selectores interactivos de transiciones de entrega y pago auditadas.
  - Vista Kanban con 6 columnas logísticas (Recibido, Preparado, Listo para entregar, En camino, Entregado, Cancelado) y avance rápido de estado.
  - Modal de detalle del pedido con historial de auditoría cronológico, desglose bimonetario histórico y comprobante.
  - Sincronización en tiempo real y persistencia resiliente bidireccional (`/data/orders.json` y Supabase `orders`/`order_items` con migración `0018_orders_module.sql`).
- Productos e Inventario (`/inventario` y `/api/products`):
  - `GET /api/products` abierto para consulta pública en catálogo sin requerir sesión administrativa; mutaciones (POST, PUT, DELETE, stock) protegidas con autenticación estricta.
  - **Gestión de Marca y Unidades**: Se incorporó el campo **Marca** (con selector y modal inline para registrar nuevas marcas) ubicado justo debajo de Categoría, y el selector de **Unidades** con las 15 opciones estándar y modal para unidades personalizadas.
  - **Ajuste de Existencia**: Se corrigió el endpoint PATCH `/api/products/:sku/stock` añadiendo autenticación. Se mejoró la persistencia y la capacidad de respuesta de la interfaz al actualizar el stock, forzando la actualización local inmediata.
  - **Venta Libre (Ítems Abiertos)**: Al crear o registrar un producto de "Venta Libre", el stock asignado predeterminado es **5**.
  - **Deduplicación y Upsert por SKU**: Se implementó lógica robusta de prevención de duplicados (tanto en servidor como en cliente) para que al registrar ventas libres o productos, si el SKU ya existe se actualice en lugar de insertar registros repetidos, y las consultas limpien cualquier duplicado histórico.
- **Configuración de Negocio (Identidad y Datos Fiscales)**:
  - Se añadió el botón **Guardar** en la sección de identidad y datos fiscales (`/configuracion`), aplicando los cambios de forma reactiva e instantánea en todo el sistema (facturas, notas, e-commerce, tienda y cabeceras).
  - **E-commerce / Tienda Virtual (`ShopPage`)**: Se actualizó el encabezado, subtítulos y datos de pago (Pago Móvil y Transferencia) para que utilicen estrictamente el valor ingresado en el campo **"Nombre del Negocio"** y **"RIF"** de Configuración / Negocio en lugar de valores genéricos o fijos como "Frenyer".
  - Se eliminó la tarjeta de conexión a Supabase y el botón "Gestionar Conexión / SQL".
  - Se implementó la subida real de imágenes para **Logo** y **Favicon** mediante selectores de archivos, persistidas localmente y aplicadas automáticamente al iniciar o recargar la aplicación.
- **Validación de Compilación**: Todos los errores de tipos TypeScript y ESLint han sido resueltos satisfactoriamente (`compile_applet` y `lint_applet` limpios).

## Decisiones importantes
- **Persistencia Híbrida**: Al igual que con ajustes de stock y proveedores, los pedidos se respaldan en `/data/orders.json` y en PostgreSQL para tolerar entornos donde Supabase aún no ejecute la migración `0018_orders_module.sql`.
- **Bimonetariedad & Redondeo**: Todos los precios y conversiones se calculan con `convertUSDtoVES` y redondeo a 2 decimales exactos.

## Errores a evitar
- Nunca enviar valores no-UUID a columnas `uuid` de PostgreSQL como `branch_id`.
- Nunca bloquear el catálogo de la tienda pública con requerimiento de Bearer token.
- No permitir reactivación directa de pedidos cancelados o retrocesos desde pedidos entregados.
- Respetar el Design System unificado sin introducir colores o clases huérfanas.
