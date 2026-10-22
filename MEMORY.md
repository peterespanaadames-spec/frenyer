# MEMORY.md — FRENYER

## Estado actual
- **Base del Sistema**: Frenyer ERP bimonetario (React 19, Vite, Express, TypeScript, Supabase PostgreSQL). Proyecto Supabase: `knyqrwpaksawuxoqcayu`.
- **Servidor Activo**: Express + Vite funcionando en `http://localhost:3000` (`0.0.0.0`).
- **Reciente**: 
  - Corregido el acceso al panel administrativo para usuarios internos.
  - Implementada barra de búsqueda con escritura predictiva y búsqueda inteligente en el encabezado de la tienda.
  - Ocultados/removidos los dos elementos seleccionados mediante el modo de enfoque (Focus Mode) en los selectores CSS indicados.
  - Verificada la compilación (`compile_applet`) y linter (`lint_applet`) con éxito al 100%.
- **Persistencia local**: Respaldo robusto en `data/` para usuarios, pedidos, ventas, inventario y finanzas.
  - **Resolución en el servidor** (`server.ts`): `data/supabase-credentials.json` → variables de entorno (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) → `.env.local` (mismos nombres, **sin** prefijo `VITE_`) → heredadas `VITE_*` (deprecadas). Estado en `/api/auth/mode` y `/api/supabase/status`, **sin claves**.
  - **Auth proxy**: `/api/auth/login`, `/register`, `/session`, `/logout`, `/google` (+ callback PKCE) y `/api/auth/local-login`. El login con Google lo resuelve el servidor (PKCE) y fija cookies httpOnly; el navegador nunca ve tokens.
  - **Cliente inerte** (`src/lib/supabase/client.ts`): `hasBrowserSupabaseClient = false`; `isSupabaseConfigured` pasa a ser el estado reportado por el servidor. `updateSupabaseClient` y el guardado de la clave en `localStorage` se eliminaron.
- **Autorización**: `authenticateSupabaseRequest` ya **no** concede `role: 'admin'` a peticiones anónimas: sin credencial válida responde **401**. Se eliminó el contexto de respaldo. `GET /api/orders` y los PATCH de estado quedaron protegidos; **`POST /api/orders` sigue público** (compra de la tienda). Rate limit propio en memoria: 5 intentos/15 min en los logins, 10 pedidos/hora en la compra.
- **Tienda pública**: cualquiera navega y compra sin cuenta ni claves (catálogo con fallback `DEFAULT_CATALOG_PRODUCTS`, `POST /api/orders` guarda en `data/orders.json` antes de Supabase).
- **Modo local**: `FRENYER_ACCESS_KEY` (servidor) habilita el ingreso directo con clave → cookie de sesión firmada con HMAC-SHA256 (12 h). Apagado si no se define. Auditoría en `data/auth-audit.log`.
- **Persistencia local**: helper genérico `createLocalCollection` en `server.ts` con respaldo en `data/` para clientes, ventas, cotizaciones, gastos, categorías de gasto e historial de tasas (los 6 módulos que antes solo vivían en Supabase).
- **Páginas de Login y Registro** (`LoginPage.tsx`): detectan el modo del servidor; muestran formulario de correo, botón de Google o clave de acceso. **Ya no solicitan claves**. `SupabaseConnectionModal` pasó a ser un panel de **solo lectura** del estado.
- **Usuarios asociados (Configuración)**: el listado combina perfiles de Supabase (`profiles`) y el archivo local. La edición, el cambio de estado y el alta resuelven el usuario en **ambas** fuentes. `profiles` solo tiene `id, full_name, email, role, created_at` y su `role` admite únicamente gerente|administrador|cajero|cliente; el cargo, el estado activo y los permisos viven en `data/users.json` y mandan sobre Supabase al leer. El alta usa el id real que genera Supabase Auth (la FK `profiles.id → auth.users.id` impide inventarlo) y el rol se traduce con `toProfileRole()`.

## Correcciones y Módulos Recientes
- **E-Commerce & Portal de Cliente**: Alineado con imágenes de referencia. 4 pestañas: Facturación Electrónica (con facturas digitales y montos bimonetarios), Mi Perfil (datos fiscales RIF, teléfono, edición, libreta de direcciones y cambio de contraseña), Lista de Deseo (estado vacío fiel e interactivo), y Mis Pedidos (cards con ítems, totales y botón de tracking).
- **Rastreador de Pedidos (`OrderTrackerModal.tsx`)**: Tracker 100% fiel a referencia con stepper de 4 pasos (Recibido → En Preparación → Listo → Entregado), simulación de alertas push, resumen de compra, botón directo de WhatsApp y búsqueda pública (`/api/orders/track/:query`).
- **Sincronización con Panel ERP**: Integrado en `/ventas-flash/pedidos` (`Orders.tsx`) para inspección y avance de estado por operadores internos.
- **Control de Acceso RBAC Estricto**: `ProtectedRoute.tsx` bloquea a usuarios con rol `cliente`/`customer` fuera de las rutas de administración ERP (`/dashboard/*`), confinándolos exclusivamente a la tienda online (`/`) y al portal de clientes.
- **Stack y Estabilidad**: React 19, Express 5, Vite, TypeScript y Supabase adaptados; compilación y lint limpios al 100%. Servidor en puerto 3000 (`0.0.0.0`).

## Decisiones técnicas recientes
- **El portal de cliente no reusa `isTrackerOpen`**: ese estado abre el modal de autenticación. El portal tiene su propio estado `isCustomerPortalOpen` en `ShopPage.tsx`.
- **Estilos Vanilla / Design System**: `LoginPage.tsx` y `ProtectedRoute.tsx` migrados a clases semánticas `.auth-*` en `globals.css` alineadas con `tokens.css` (canvas gris frío, acento violeta `var(--brand-500)`, tarjetas redondeadas `var(--radius-lg)`), descartando utilidades Tailwind no configuradas.
- **Dependencias de empaquetado**: Resuelta la instalación de binarios nativos para Windows x64 (`esbuild`, `@rolldown/binding-win32-x64-msvc`, `lightningcss-win32-x64-msvc`).
- **Proxy para cotizaciones**: se añadieron `PATCH /api/quotes/:id`, `PATCH /api/quotes/:id/status` y `DELETE /api/quotes/:id` más `GET /api/sale-items`, porque esas cuatro funciones de `db.ts` usaban el cliente directo del navegador.
- **Realtime eliminado**: `CompanyHealth.tsx` no puede usar canales de Supabase sin clave en el navegador; se reemplazó por refresco cada 60 s contra el servidor.

## Errores a evitar
- No usar clases Tailwind sin verificar su presencia en la configuración global; el proyecto utiliza CSS vainilla estructurado.
- Siempre manejar el fallback de importes monetarios bimonetarios redondeados a dos decimales.
- **Nunca reintroducir `https://your-project.supabase.co`**: rompe el OAuth de Google (redirige a un host inexistente) y el status de `/api/supabase/status`. La URL real es `https://knyqrwpaksawuxoqcayu.supabase.co`.
- **`profiles.role` tiene un CHECK estricto** (gerente|administrador|cajero|cliente): enviar 'admin' o 'cashier' en minúsculas viola la restricción y la escritura se descarta en silencio. Traduce siempre con `toProfileRole()`.
- **No insertar en `profiles` con un id inventado**: la FK hacia `auth.users(id)` lo rechaza y el trigger de Auth crea la fila con su propio id, dejando al usuario duplicado en el listado.
- **Nunca usar el prefijo `VITE_` para credenciales**: Vite las inyecta en el bundle del navegador. `VITE_TURNSTILE_SITE_KEY` sí es pública por diseño.
- `tsx server.ts` no recarga en caliente: tras cambiar `.env.local` hay que reiniciar el proceso de dev.
- **El login local tiene rate limit de 5 intentos por 15 min e IP**: al probar rutas con `FRENYER_ACCESS_KEY` se agota rápido ⇒ reiniciar el servidor para limpiar el contador en memoria.
- **`resolveRequestSession` distingue dos modos**: en modo local el correo está en `session.local.email` y `session.remote` es **null**; en modo Supabase está en `session.remote.user.email`. Leer solo uno de los dos deja la sesión sin correo. El contexto normalizado (`supabaseContext.userEmail`) sí cubre ambos.
- **`/api/auth/local-login` es la vía para probar el portal sin Supabase**: acepta `{ accessKey, email }` y fija la cookie de sesión con ese correo, lo que permite verificar el aislamiento por cliente.
- `lightningcss-win32-x64-msvc` se descargó truncado (589 KB) y rompía `npm run build` con error 193; se reinstaló con `npm install lightningcss-win32-x64-msvc@1.33.0 --no-save`.
- **Los datos personales ya estuvieron versionados**: `data/` (correos, teléfonos y direcciones de clientes) se versionó en commits anteriores. Se retiró del árbol en `2482998`, pero sigue en el historial del repo público; eliminarlo del historial exige reescribirlo y hacer force-push.
