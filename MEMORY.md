# MEMORY.md — FRENYER
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- ERP bimonetario Frenyer publicado en GitHub; `npm run build` y `npm run lint` pasan. Autenticación incluye ingreso, registro, recuperación y cambio de contraseña. Modo vista previa (`VITE_AUTH_REQUIRED=false`, predeterminado por ahora) permite navegar sin login; backend/RLS siguen exigiendo sesión para datos Supabase. Usa `true` para exigir login en la app.
- **Revisión de código 2026-10-08 (pendiente de corregir)**, por prioridad:
  1. `server.ts:953` usa `app.get('*')`, inválido en Express 5 → con `NODE_ENV=production` el servidor no arranca (usar `/{*splat}`); verificado con ejecución real.
  2. Multi-tenant: `lastCertifiedRate` (server.ts:135) y `memoryBankMovements` (server.ts:857) son globales → tasas y movimientos bancarios se mezclan entre organizaciones; saldo bancario actualizado con lectura-modificación-escritura (no atómico, server.ts:894).
  3. Integridad: `db.ts:548` `organization_id` con fallback hardcodeado `...0001`; `Accounts.tsx:152-186` datos demo como cartera real y cobro sin verificar respuestas; `Sales.tsx:849-935` no valida `saleResult.success`.
  4. `server.ts` queda fuera de `tsc -b` (solo `src/` y `vite.config.ts`); falta un `tsconfig.server.json`.
  5. También: fechas de tasa con formatos mezclados (`server.ts:307`, días 20-31 marcan "futura"), CORS abierto, TLS `rejectUnauthorized:false`, IDs de path sin `encodeURIComponent`, HTTP 200 con error disfrazado, redondeo faltante en `Sales/Accounts/BankAccounts`, XSS en HTML de impresión (`Accounts.tsx:462`, `Suppliers.tsx:252`), transferencias no atómicas y `Config.tsx:306` aplicando tasa local aunque falle el servidor.
- **Protocolo Estandarizado de Tasas BCV Operativo**:
  - Sincronización corregida entre clave `frenyer_bcv_rate` y `frenyer_active_exchange_rate` en `currency.ts`, `Sales.tsx` y `DashboardLayout.tsx`. La venta consulta la tasa oficial BCV viva de `/api/bcv/rates` garantizando facturación precisa en VES.
- Módulo de **Cuentas por Cobrar (`Accounts.tsx`)**:
  - KPIs, filtros avanzados, cobros con registro bancario y baja de CxC en tiempo real, exportación dual (PDF/XLS).
- Módulo de **Cuentas por Pagar (`AccountsPayable.tsx`)**:
  - Formulario "Registrar Cuenta por Pagar" ampliado horizontalmente (`maxWidth: 880px`) con distribución equilibrada multi-columna, resumen financiero en vivo (Total, Abono, Saldo y Estado en USD/VES) y conexión directa a proveedores de Supabase.
  - Pagos e historial de abonos sincronizados con Supabase (`payable_payments` y `accounts_payable`), cambiando el estado a "Pagada" o "Parcial" en tiempo real al saldar.
  - Corrección (2026-10-07): CxP selecciona proveedores por ID y registra `supplier_id`; una migración enlaza nombres históricos solo cuando la coincidencia es única, limita CxP/proveedores por membresía y registra el abono, saldo y egreso bancario en una transacción RPC. El módulo requiere sesión autenticada con membresía; aplicar la migración 0008 en Supabase antes de usarlo.
  - Revisión/refactor adicional: cargas paralelas tras resolver organización, lookup de proveedores O(n), escape HTML para impresión y celdas CSV protegidas contra inyección de fórmulas. El saldo agregado `suppliers.balance_usd` todavía no se recalcula desde CxP.
- **Preparación de publicación y acceso Supabase (2026-10-07)**:
  - `.gitignore` excluye configuraciones locales, dependencias y artefactos; `.env.example` contiene placeholders, y se retiraron credenciales embebidas de cliente/servidor.
  - La API valida JWT y membresía de organización antes de rutas de datos y reenvía el JWT a PostgREST. El layout exige inicio de sesión y muestra membresía inválida; `authenticatedFetch` adjunta el token a rutas protegidas.
  - La migración `0009_lock_down_api_rls.sql` sustituye políticas abiertas por RLS de organización y rol: miembros autorizados escriben, `viewer` y roles desconocidos solo leen; las tasas manuales requieren rol administrativo. Aplicar migraciones en orden, incluida 0008 y luego 0009, antes de usar la aplicación.
  - Repositorio GitHub público conectado y publicado; `.env` no se versiona.
- **Autenticación visual y registro (2026-10-08)**:
  - Pantalla responsive inspirada en la referencia, con visibilidad de contraseña, login, alta de organización, recuperación y actualización de contraseña.
  - `0010_auth_signup_organization.sql` asigna organización propia y rol `admin` al nuevo usuario (no se confía en metadata de rol del navegador). Habilitar confirmación de email y permitir la URL de retorno en Supabase.
  - CAPTCHA real opcional con Cloudflare Turnstile; configurar la site key pública en `VITE_TURNSTILE_SITE_KEY` y la secret en Supabase Auth. No mostrar falsa verificación si no está configurada.
- **Vista previa local temporal (2026-10-08)**:
  - `.env.example` y la app publicada dejan `VITE_AUTH_REQUIRED=false` para vista previa; `true` restaura la pantalla de login. No cambia protección de API/RLS y no permite leer/escribir datos privados sin sesión.
- Módulo de **Proveedores (`Suppliers.tsx`)**:
  - Botón "Nuevo Proveedor" abre una **pantalla completa de formulario dedicado** con proceso de **3 FASES**: 1. Identificación, 2. Contacto, 3. Finanzas.
  - Al guardar, registra de manera persistente en Supabase (`public.suppliers`) evitando fallos de restricción de clave foránea de organización y retorna al directorio con recarga en tiempo real.
  - Eliminado botón 'Ver SQL Supabase'. Botón 'Exportar Reporte' transformado en un menú desplegable (dropdown popover) responsivo con opciones instantáneas para 'Exportar PDF' (documento imprimible) y 'Exportar XLS' (Excel), igual a la referencia visual.
  - Conectado con **Cuentas por Pagar (`AccountsPayable.tsx`)** y **Compras Internas (`InternalPurchases.tsx`)**.
- Módulo de **Ventas Flash (`Sales.tsx`)**:
  - Buscador de clientes con despliegue automático de clientes predeterminados al hacer clic/focus y filtrado en tiempo real al escribir. Cliente por defecto: *Consumidor final*.
  - Métodos de pago y botón "Siguiente >" optimizados: al seleccionar una cuenta en divisas (USD), la casilla IGTF (3%) aparece y se activa automáticamente por defecto con opción de desmarcarla por el usuario; al seleccionar una cuenta en Bolívares (VES), IGTF (3%) se desactiva y oculta ("No aplica en pagos Bs."). El monto a transferir se recalcula en tiempo real.
  - Control Estricto de Stock Real: Prohibido vender productos sin inventario (`stock <= 0`). Al intentar agregar, incrementar o facturar un producto sin unidades disponibles, se despliega una ventana de alerta `"Producto sin stock"` bloqueando la operación. El stock se deduce de forma atómica en Supabase tras cada venta.

## Decisiones (y por qué)
- **Analítica de Clientes en Tiempo Real**: Las consultas a `sales` e `items` en el panel lateral del cliente permiten auditar el historial de compras y productos favoritos al instante sin depender de datos estáticos.
- **Seguridad antes de publicar**: Todas las rutas de datos deben comprobar JWT y membresía, y la autorización final corresponde a RLS en Supabase; no confiar en roles enviados desde el navegador.

## Reglas permanentes del proyecto
- **Verificación de Base de Datos**: Conexión a Supabase y contratos de datos íntegros.
- **Redondeo y Bimonetariedad**: Importes en Bolívares y dólares redondeados a 2 decimales exactos.
