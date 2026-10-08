# MEMORY.md — FRENYER
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- ERP bimonetario Frenyer publicado en GitHub; `npm run build` y `npm run lint` pasan. No hay registro público: crear el primer usuario en Supabase Auth y asignarle membresía de organización desde SQL Editor. No se ha confirmado que las migraciones estén aplicadas en el proyecto remoto.
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
