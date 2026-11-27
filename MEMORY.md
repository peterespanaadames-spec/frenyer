# MEMORY.md — FRENYER

## Despliegue y flujo
- `frenyer` / `frenyer.vercel.app` (pruebas); `origin` / `compuflores.vercel.app` (comercial, solo sincronizar con orden explícita).
- Trabajar sobre la rama abierta; no publicar ni sincronizar sin autorización explícita.

## Arquitectura, dominio y seguridad
- ERP/POS bimonetario USD/VES, multi-tenant; respetar organización, sucursal activa, tasa histórica y redondeo a 2 decimales (`src/lib/inventory/units.ts` para decimales en KG/L/MTS).
- `api/server.ts` usa `SERVICE_ROLE` en consultas y proxy; frontend nunca ejecuta SQL directo. Alma oculto.
- Sesiones por cookie httpOnly, logout con revocación y cédula por proxy. Migraciones `0033`–`0037` aplicadas; pendiente en Supabase tras despliegue: `0031` (`parked_invoices`) y `0032` (RLS estricta).
- Auditoría cross-tenant verificada con `npm run audit:tenant` y `npm run test:tenant-isolation`.

## Diseño y adaptación móvil
- Sistema antracita/amarillo en panel; componentes compartidos en `src/components/mobile/` y `Button` (Primary/Secondary/Danger/Ghost, radio 10px). Sin Tailwind: usar clases semánticas en `src/styles/globals.css`.
- Todo código nuevo debe validarse para 320–430px, 768px y escritorio (`m-root`, sin desbordes horizontales ni targets <28px). No usar PowerShell `Set-Content` en `.tsx`.

## Cambios recientes (2026-11-27)
- **Identidad del negocio y tienda multi-tenant configurables**:
  - `api/server.ts`: `POST /api/business-profile/upload` sube logo (máx. 2 MB) y favicon (máx. 512 KB) por tenant a Supabase Storage (`tenant-assets/${orgId}/...`, con fallback local seguro y `GET /api/public/tenant-assets/:orgId/:fileName`); `PUT /api/business-profile` valida RIF, correo, teléfono, WhatsApp, dirección y URLs; `GET /api/public/config/:slug` y `/api/public/products/:slug` filtran estrictamente por `organization_id` y usan sucursales reales de la org. `POST /api/orders` resuelve `organization_id` desde sesión o `store_slug`.
  - `src/lib/businessProfile.ts`: defaults (`Shop Frenyer`, `J-00000000-1`, `frenyer@correo.com`, `Barinas`, `+584120000000`, `+58412000000`), caché en `localStorage` aislado por `organizationId` (`frenyer_business_profile_<orgId>`), `uploadBusinessAsset`, y `applyBrandingToDocument` (actualiza `<title>` y `<link rel="icon">`).
  - `src/modules/alma/pages/Config.tsx`: formulario «Identidad y datos fiscales» con carga por tenant activo, validación inline, feedback de estado y subida/reemplazo/eliminación de logo y favicon; sincroniza `Sidebar`, `DashboardLayout`, `MobileHeader`, comprobantes y tienda pública al instante.
  - `src/modules/shop/pages/ShopPage.tsx`: tienda limpia 100% configurable desde el perfil del negocio (logo dinámico con fallback a iniciales, hero, metadatos, WhatsApp y footer sin textos fijos de demo), carrito aislado por slug (`frenyer_shop_cart_<slug>`), `AppExitGuard` compatible con carritos por tenant y `OrderTrackerModal` con contacto de la tienda activa.
- **Login y rutas**: inicio en `/login` compactado en `100vh` para PC y centrado responsive; ruta `/tienda/:slug` resuelta dinámicamente desde `businessName`.

## Comandos y verificación
- `npm run build` / `compile_applet`, `npm run lint` / `lint_applet`, `npm run test -- --run` (`13 tests` en `src/lib/accounts/advances.test.ts`).
