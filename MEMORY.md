# MEMORY.md — FRENYER

## Estado actual
- **Base del Sistema**: Frenyer ERP bimonetario (React 19, Vite, Express, TypeScript, Supabase PostgreSQL). Proyecto Supabase: `knyqrwpaksawuxoqcayu`.
- **Servidor Activo**: Express + Vite funcionando en `http://localhost:3000` (`0.0.0.0`).
- **Repositorio Git**: `https://github.com/peterespanaadames-spec/frenyer.git` (rama `main`, publica). El historial previo (43 commits) se conservó: el local se reconstruyó sobre `origin/main` en lugar de forzar un push. `data/` y `.aistudio/` quedaron sin versionar por contener PII.
- **Arquitectura de credenciales (Supabase solo en el servidor)**: el navegador **nunca** recibe una clave de Supabase. Todas las consultas pasan por `/api/*`; el servidor resuelve las credenciales, valida la sesión y aplica las RLS.
  - **Resolución en el servidor** (`server.ts`): `data/supabase-credentials.json` → variables de entorno (`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) → `.env.local` (mismos nombres, **sin** prefijo `VITE_`) → heredadas `VITE_*` (deprecadas). Estado en `/api/auth/mode` y `/api/supabase/status`, **sin claves**.
  - **Auth proxy**: `/api/auth/login`, `/register`, `/session`, `/logout`, `/google` (+ callback PKCE) y `/api/auth/local-login`. El login con Google lo resuelve el servidor (PKCE) y fija cookies httpOnly; el navegador nunca ve tokens.
  - **Cliente inerte** (`src/lib/supabase/client.ts`): `hasBrowserSupabaseClient = false`; `isSupabaseConfigured` pasa a ser el estado reportado por el servidor. `updateSupabaseClient` y el guardado de la clave en `localStorage` se eliminaron.
- **Autorización**: `authenticateSupabaseRequest` ya **no** concede `role: 'admin'` a peticiones anónimas: sin credencial válida responde **401**. Se eliminó el contexto de respaldo. `GET /api/orders` y los PATCH de estado quedaron protegidos; **`POST /api/orders` sigue público** (compra de la tienda). Rate limit propio en memoria: 5 intentos/15 min en los logins, 10 pedidos/hora en la compra.
- **Tienda pública**: cualquiera navega y compra sin cuenta ni claves (catálogo con fallback `DEFAULT_CATALOG_PRODUCTS`, `POST /api/orders` guarda en `data/orders.json` antes de Supabase).
- **Modo local**: `FRENYER_ACCESS_KEY` (servidor) habilita el ingreso directo con clave → cookie de sesión firmada con HMAC-SHA256 (12 h). Apagado si no se define. Auditoría en `data/auth-audit.log`.
- **Persistencia local**: helper genérico `createLocalCollection` en `server.ts` con respaldo en `data/` para clientes, ventas, cotizaciones, gastos, categorías de gasto e historial de tasas (los 6 módulos que antes solo vivían en Supabase).
- **Páginas de Login y Registro** (`LoginPage.tsx`): detectan el modo del servidor; muestran formulario de correo, botón de Google o clave de acceso. **Ya no solicitan claves**. `SupabaseConnectionModal` pasó a ser un panel de **solo lectura** del estado.

## Decisiones técnicas recientes
- **Estilos Vanilla / Design System**: `LoginPage.tsx` y `ProtectedRoute.tsx` migrados a clases semánticas `.auth-*` en `globals.css` alineadas con `tokens.css` (canvas gris frío, acento violeta `var(--brand-500)`, tarjetas redondeadas `var(--radius-lg)`), descartando utilidades Tailwind no configuradas.
- **Dependencias de empaquetado**: Resuelta la instalación de binarios nativos para Windows x64 (`esbuild`, `@rolldown/binding-win32-x64-msvc`, `lightningcss-win32-x64-msvc`).
- **Proxy para cotizaciones**: se añadieron `PATCH /api/quotes/:id`, `PATCH /api/quotes/:id/status` y `DELETE /api/quotes/:id` más `GET /api/sale-items`, porque esas cuatro funciones de `db.ts` usaban el cliente directo del navegador.
- **Realtime eliminado**: `CompanyHealth.tsx` no puede usar canales de Supabase sin clave en el navegador; se reemplazó por refresco cada 60 s contra el servidor.

## Errores a evitar
- No usar clases Tailwind sin verificar su presencia en la configuración global; el proyecto utiliza CSS vainilla estructurado.
- Siempre manejar el fallback de importes monetarios bimonetarios redondeados a dos decimales.
- **Nunca reintroducir `https://your-project.supabase.co`**: rompe el OAuth de Google (redirige a un host inexistente) y el status de `/api/supabase/status`. La URL real es `https://knyqrwpaksawuxoqcayu.supabase.co`.
- **Nunca usar el prefijo `VITE_` para credenciales**: Vite las inyecta en el bundle del navegador. `VITE_TURNSTILE_SITE_KEY` sí es pública por diseño.
- `tsx server.ts` no recarga en caliente: tras cambiar `.env.local` hay que reiniciar el proceso de dev.
- `lightningcss-win32-x64-msvc` se descargó truncado (589 KB) y rompía `npm run build` con error 193; se reinstaló con `npm install lightningcss-win32-x64-msvc@1.33.0 --no-save`.
- **Los datos personales ya estuvieron versionados**: `data/` (correos, teléfonos y direcciones de clientes) se versionó en commits anteriores. Se retiró del árbol en `2482998`, pero sigue en el historial del repo público; eliminarlo del historial exige reescribirlo y hacer force-push.
