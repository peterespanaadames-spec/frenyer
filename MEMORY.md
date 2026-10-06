# MEMORY.md — FRENYER
Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- ERP bimonetario Frenyer 100% funcional, con compilación e ESLint limpios en puerto 3000 (0.0.0.0).
- **Protocolo Estandarizado de Tasas BCV Operativo**:
  - Capa 1: Scraping directo a `https://www.bcv.org.ve/glosario/cambio-oficial` (extrayendo tasa USD de `#dolar`, EUR de `#euro` y Fecha Valor de `.date-display-single`) y Capa 2 (Fallback automático a DolarAPI).
  - Regla de Tasa Futura del Sistema: Al buscar el valor de la tasa, si existe una tasa futura (publicada con fecha valor posterior o detectada a partir de las 16:00 Caracas) es la que se graba y aplica en las operaciones; de lo contrario se conserva la tasa actual.
  - Registro auditado e inmutable en la tabla `exchange_rates` de Supabase con origen (`BCV_DIRECT`, `DOLAR_API_FALLBACK`, `MANUAL`), fecha valor e indicador `is_future_rate`.
  - Banner informativo de propuesta de cambio de tasa oficial en el panel cuando difiere de tasas manuales vigentes (opciones "Mantener actual" o "Actualizar tasa").
  - Módulo de Configuración (`Config.tsx`): Botón "Consultar BCV Oficial", interruptor de verificación automática e historial en vivo conectado al endpoint `/api/exchange-rates/history`.
  - Transactional Binding: Tasa inmutable congelada al emitir ventas en Ventas Flash (`Sales.tsx`), conservando base fiscal en VES y equivalente en USD.
- Módulo de **Inventario (`Inventory.tsx`)**: Sincronización 100% en vivo con Supabase vía backend proxy y cliente directo, compresión automática de fotos con Canvas (~25 KB) y CRUD reactivo.
- Módulo de **Ventas Flash (`Sales.tsx`)**: Integrado botón "+ Nuevo Cliente" en el Paso 1 de cobranza, barra superior de POS y carrito de venta; abre el modal de registro y guarda en línea en Supabase (`customers`), auto-seleccionando al nuevo cliente. Se eliminó el botón duplicado "+ Crear Cliente" al lado de la barra de búsqueda para optimizar espacio y diseño.
- **Verificación de Base de Datos**: Confirmada la conexión en vivo con Supabase para clientes y productos sin simulación de datos. Se implementó sanitización estricta de objetos en `recordSaleInSupabase` para evitar que campos adicionales del frontend (ej: `is_future_rate`, `rate_source`) causen fallas de caché de esquema en tablas físicas.
- Módulo de **Cuentas Bancarias (`BankAccounts.tsx`)**:
  - Botones de **"Transferir entre cuentas"**, **"Ingresar saldo"** y **"Retirar saldo"** rediseñados con mayor tamaño, mejor jerarquía visual y estética profesional (altura 44px, sombras y tipografía destacada).
  - Eliminada la opción de inactivar cuentas desde la vista principal y detalles de cuentas bancarias (restringida exclusivamente a **Configuración > Auditoría**).
  - Movimientos de cuentas corregidos y sincronizados en tiempo real mediante caché en memoria y respaldo robusto en backend (`/api/bank-movements`).
- Módulo de **Configuración (`Config.tsx`)**: Creada la nueva pestaña **"Auditoría"** con control centralizado de cuentas bancarias (supervisión, reactivación de cuentas inactivas e inactivación/eliminación con confirmación).
- **Correlativos y Facturación Consecutiva (`Sales.tsx`)**: Numeración consecutiva dinámica que comienza en `0001` y se incrementa automáticamente tras cada venta (independiente para Facturas y Notas).
- **Integración POS-Bancos**: Pagos procesados a la cuenta seleccionada (ej: *Vzla Bolivares*) actualizan balance y movimientos en Supabase en tiempo real. Eliminadas las cuentas ficticias en USDT.
- **Validación Estricta de Créditos (CxC)**: Al elegir el método a crédito en Ventas Flash, el sistema valida rigurosamente que el cliente tenga datos reales (Nombre, Cédula/RIF, Teléfono y Dirección). Al confirmar, inserta de forma integrada el registro de cuenta por cobrar en la tabla `accounts_receivable`.
- **Credenciales y Proxy Supabase**: Sanitizado `client.ts` y `server.ts` para ignorar variables de entorno placeholder (`YOUR_PROJECT`, `YOUR_PUBLIC_ANON_KEY`) e inyectar las credenciales reales de Supabase (`knyqrwpaksawuxoqcayu.supabase.co`), resolviendo `TypeError: Failed to fetch`.

## Decisiones (y por qué)
- **Protocolo BCV de 3 Capas (`server.ts` + `/api/bcv/rates` + Transactional Binding)**:
  - Garantiza que cada transacción quede permanentemente anclada a la tasa exacta del momento sin alterar balances históricos ni márgenes.
- **CRM de Clientes en Alta Fidelidad**:
  - Implementados los campos de identificación fiscal venezolana (V/E, J, G, P), límites de crédito para habilitar ventas a crédito (CxC) y métricas reactivas.
- **Regla Bimonetaria Centralizada**:
  - Gasto acumulado y transacciones calculadas simultáneamente en USD y Bolívares a la tasa vigente del momento.

## Reglas permanentes del proyecto
- **Verificación de Base de Datos**: En cada modificación de pantallas, formularios o datos, verificar que la conexión a Supabase y los contratos de datos de las tablas se mantengan operativos e íntegros.
- **Redondeo y Bimonetariedad**: Siempre redondear importes en Bolívares a 2 decimales exactos (`Math.round((usd * rate) * 100) / 100`).
- **Manejo de Tones en Badge**: Usar exclusivamente los valores permitidos (`brand`, `danger`, `success`, `warning`).

## Próximos pasos
- Realizar consultas y mutaciones directas hacia las tablas de Supabase respetando las políticas de RLS.






