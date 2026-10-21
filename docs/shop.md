# Tienda Online

## Descripción

Interfaz de cara al cliente para la visualización de productos y la realización de pedidos.
Es la **única superficie pública** del ERP: funciona sin cuenta de usuario y sin claves de
Supabase en el navegador.

## Estructura Actual

- **Ubicación**: `src/modules/shop/pages/ShopPage.tsx` (4 044 líneas) y
  `src/modules/shop/components/CustomerPortal.tsx` (portal de cliente).
- **Ruta**: `/` — pública, sin `ProtectedRoute` ni `DashboardLayout` (`router/index.tsx:36-39`).
- **Estilo**: CSS **propio** con espacio de nombres `cr-*` en un bloque `<style>` en línea
  (`:847-1830`). **No** usa las clases `.store-*` de `globals.css` (≈40 clases, hoy sin uso).
  El portal de cliente usa su propio espacio de nombres `cp-*` en un bloque `<style>` propio.

- **Endpoints principales**:
  `GET /api/public/products`, `GET /api/public/config`, `POST /api/orders` (público),
  `GET /api/orders`, `GET /api/auth/session`, `POST /api/auth/login`,
  `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/bcv/rates`,
  `GET /api/customer/portal`, `POST /api/customer/wishlist` (requieren sesión).

## Funcionalidades Clave

### Catálogo

- Cabecera con marca, **selector de divisa** (USD/VES) y botón de carrito.
- Hero con dos banners promocionales ("CompuFuturo", "Acelera Motor Partes").
- Chips de categoría.
- Cuadrícula de productos (`cr-product-grid` → `cr-product-card`) con buscador y filtros.
- Tarjeta de **entrega express**.
- Logotipo de marca en SVG inline (`CompuRepuestosLogo`, `:65-135`).
- **Divisiones**: `ALL` / `MATERIALES` / `MOTOS` (`:182`).

### Carrito y checkout

- Cajón de carrito (`cr-cart-drawer`).
- **Checkout de 4 pasos** (`checkoutStep`, `:206`).
- Modal de login/registro.
- Seguimiento de pedido (`isTrackerOpen`, `trackerQuery`).
- Menú de usuario con el rol (`cliente` / `asociado`).
- Contacto por WhatsApp (`:755`).

### Compra sin cuenta

| Paso del servidor | Detalle |
|---|---|
| Validación | `customer_name` y ≥1 ítem. Si el pedido dejaría el stock negativo ⇒ **400** |
| Numeración | `order_number = PED-000N` (N = pedidos locales + 1) |
| Totales | `calculateTransactionVES` con la tasa vigente |
| Persistencia | **Primero** `data/orders.json`, después el descuento de stock, el movimiento de inventario y, best effort, `orders` + `order_items` en Supabase |
| Respuesta | `{ success, data: { …, delivery_status: 'RECIBIDO', is_future_rate, activity_history[] } }` |

### Alta de cliente

`POST /api/auth/customer/register` crea el usuario en Supabase Auth e inserta en
`public.shop_customers`.

> ⚠ **No tiene rate limit**, a diferencia de los demás endpoints de autenticación.

### Portal de cliente

Al hacer clic en el avatar del usuario (rol `cliente`) se abre el **Portal Personal de
Cliente** (`CustomerPortal.tsx`), con cuatro pestañas:

| Pestaña | Contenido | Origen |
|---|---|---|
| **Mis Pedidos** | Pedidos web con estado de entrega, método, pago, ítems y total | `orders`/`order_items` + `data/orders.json`, filtrados por `customer_email` |
| **Mis Compras** | Facturas del ERP a nombre del cliente, con total y estado | `sales` + `sale_items`, vía `customers.email` |
| **Lista de Deseo** | Productos guardados, con opción de agregar al carrito | `data/customer_wishlist.json` |
| **Mi Perfil** | Nombre, correo, tipo de cuenta y conteos | `profiles` + `shop_customers` |

| Endpoint | Detalle |
|---|---|
| `GET /api/customer/portal` | Devuelve `{ customer, orders, purchases, wishlist }`. **401** sin sesión. |
| `POST /api/customer/wishlist` | Alterna un producto en la lista de deseo. Requiere sesión. |

> 🔒 **El identificador del cliente se toma siempre de la sesión httpOnly del servidor**
> (`res.locals.supabaseContext.userEmail`), nunca del cuerpo de la petición. Un cliente
> solo puede ver sus propios pedidos, compras y lista de deseo.

> 🔗 **Vínculo de los pedidos con la cuenta**: cuando hay sesión iniciada, `POST /api/orders`
> guarda el correo **de la sesión** en `customer_email` e ignora el que envía el navegador, de
> modo que el pedido aparece en "Mis Pedidos". Sin sesión, se conserva el correo del formulario
> (campo opcional "Correo electrónico" del checkout, prellenado y de solo lectura para el
> rol `cliente`).

## Reglas de negocio

| Regla | Detalle |
|---|---|
| **Acceso sin cuenta** | La tienda se navega y se compra sin registrarse. El catálogo cae a `DEFAULT_CATALOG_PRODUCTS` (10 ítems) si no hay productos en la base de datos. |
| **Stock nunca negativo** | El servidor rechaza con 400 un pedido que lo dejaría negativo. |
| **Estados de entrega** | `RECIBIDO` → `PREPARADO` → `LISTO_PARA_ENTREGAR` → `EN_CAMINO` → `ENTREGADO`. `CANCELADO` es irreversible. |
| **Estados de pago** | `PENDIENTE` → `PAGADO`, o `REEMBOLSADO`. |
| **Formas de entrega** | `RETIRO` / `DOMICILIO` (este último con dirección e instrucciones). |
| **Métodos de pago** | `PAGO_MOVIL`, `TRANSFERENCIA`, `EFECTIVO_USD`, `PUNTO_VENTA`, `ZELLE`. |
| **Tasa de cambio** | Se muestra la del BCV y se congela en el pedido (`exchange_rate` + `is_future_rate`). |
| **Límite de pedidos** | 10 pedidos por hora y por IP. |

## Guía de Reestructuración / Mantenimiento

- **El flujo de compra en la tienda debe integrarse con el módulo de Ventas** para registrar
  los pedidos de manera coherente. Hoy los pedidos viven en `orders`/`order_items` y **no**
  generan entradas en `sales`; la conciliación entre ambos modelos es manual.
- **El diseño debe ser responsive y amigable.** La tienda usa su propio CSS `cr-*`; el
  breakpoint móvil del ERP (640 px) **no aplica aquí**: revisa las reglas `cr-*` del bloque
  `<style>` antes de añadir elementos.
- **No introduzcas clases `.store-*`**: son residuo de una versión anterior y no las usa nadie.
- **Al añadir un paso al checkout**, actualiza el `checkoutStep` (1 → 4) y el paso
  correspondiente de la tienda. El contador de pasos vive en la constante del componente.
- **El nombre de la tienda y sus datos públicos** salen de `GET /api/public/config`, que
  devuelve un perfil **estático** en el servidor (con 3 sedes de ejemplo). Si deben ser
  dinámicos, ese endpoint debe leer el perfil del negocio.

## Deuda técnica del módulo

| # | Problema | Ubicación | Prioridad |
|---|---|---|---|
| 1 | `POST /api/auth/customer/register` **sin rate limit** | `server.ts:6493` | 🟠 |
| 2 | `orders` y `order_items` **no tienen aislamiento de tenant** (políticas sin cláusula `TO` ⇒ aplican a `PUBLIC`) | `0018:64-76` | 🔴 |
| 3 | `shop_customers`, `customer_wishlist` y `customer_orders` **no tienen `organization_id`** ⇒ la tienda es global | `0022` | 🟡 |
| 4 | `GET /api/public/config` devuelve **datos estáticos de ejemplo** (3 sedes, teléfonos fijos) | `server.ts:2278` | 🟡 |
| 5 | La clase `cr-*` vive en un bloque `<style>` en línea de 4 000 líneas ⇒ no se puede componer ni sobrescribir | `ShopPage.tsx:847-1830` | 🟡 |
| 6 | `customer_orders.status` usa **minúsculas** mientras el resto del esquema usa mayúsculas | `0022:31` | 🟡 |
| 7 | `customer_wishlist.product_id` **no tiene FK** | `0022:19` | ⚪ |
| 8 | Los pedidos no se convierten en `sales` ⇒ el reporte de ventas no incluye las compras online | — | 🟠 |
| 9 | `GET /api/public/organization` devuelve la primera fila de `organizations` o el UUID por defecto | `server.ts:2265` | ⚪ |
| 10 | La lista de deseos del portal se guarda en `data/customer_wishlist.json` mientras la tabla `customer_wishlist` no esté aplicada en la base de datos | `server.ts` (portal de cliente) | 🟡 |

## Referencias

- [API — tienda y pedidos](architecture/API.md#7-tienda-y-pedidos--apiorders-apipublic)
- [Reglas de negocio §9 (tienda pública)](architecture/BUSINESS_RULES.md#9-tienda-pública)
- [Esquema de datos §2.5, §2.10](architecture/DATABASE.md)
- [Problemas conocidos](operations/KNOWN_ISSUES.md)
