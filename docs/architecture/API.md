# Referencia de API — Frenyer

> Todas las rutas cuelgan de `/api`. Base de desarrollo: `http://localhost:3000`.
> Fuente: `server.ts` (6 613 líneas, 87 registros de ruta / 88 rutas concretas).
> Verificado en la revisión de octubre 2026.

---

## Convenciones

**Autenticación.** Todas las rutas devuelven **401** si no hay sesión válida, salvo las
públicas que se listan explícitamente. La sesión se transporta en la cookie httpOnly
`frenyer_session` (Supabase JWT o token local firmado) y, opcionalmente, en
`Authorization: Bearer <token>`.

**Formato de respuesta.** JSON con envoltorio `{ success: boolean, data?: any, error?: string }`.
> ⚠ **Inconsistente:** varias rutas responden `{ success: false }` con **HTTP 200** en lugar de
> 4xx/5xx (productos, gastos, clientes, proveedores…). Otras usan códigos reales (auth, pedidos,
> tasas). El cliente debe mirar `success`, no solo el código HTTP.

**Contexto de sesión.** Tras validar la sesión, el servidor publica en
`res.locals.supabaseContext`:

```ts
{
  accessToken: string,    // JWT del usuario, o la anon key si la sesión es local
  organizationId: string, // organización activa
  role: string,           // de organization_members.role
  userEmail: string,
  isLocalSession: boolean
}
```

**Tenant.** Las peticiones autenticadas a tablas de `tenantScopedTables`
(`server.ts:377-395`) reciben `organization_id` forzado. Si el cuerpo traía otra organización,
la respuesta es **403** `"No puede modificar datos de otra organización."`.
Solo aplica a `POST` y `PATCH` — `PUT` y `DELETE` no se sella.

**Errores no capturados.** No hay manejador de errores JSON: una excepción en una ruta devuelve
la página HTML por defecto de Express.

---

## Resumen de superficie

| Grupo | Rutas | Auth |
|---|---|---|
| Autenticación y sesión | 9 | Pública (con rate limit) |
| Usuarios y administración | 6 | Mixta — ver detalle |
| Tasas de cambio (BCV) | 3 | GET pública; POST protegida por rol |
| Reportes | 1 | Protegida |
| Catálogo y stock | 9 | GET pública; escritura protegida |
| Inventario (kárdex) | 2 | **Pública** ⚠ |
| Tienda y pedidos | 6 | POST pública; resto protegida |
| Clientes | 4 | Protegida |
| Cotizaciones | 6 | Protegida |
| Tesorería | 12 | Protegida |
| Proveedores | 4 | Protegida |
| Sedes | 4 | Protegida |
| Gastos | 7 | Protegida |
| Ventas | 2 | Protegida |
| Cuentas por cobrar | 3 | Protegida |
| Cuentas por pagar | 3 | Protegida |
| Compras internas | 2 | Protegida |
| Administración Supabase | 2 | Pública |

---

## 1. Autenticación y sesión — `/api/auth/*`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/auth/mode` | Pública | Estado del sistema de acceso. **Nunca devuelve claves.**<br>`{ success, data: { supabaseConfigured, supabaseConnected, missingTables[], supabaseUrl, localAccessEnabled, credentialsSource } }` |
| `POST` | `/api/auth/login` | Pública, **5 intentos / 15 min / IP** | Correo + contraseña contra `token?grant_type=password`. Fija cookies `frenyer_session` y `frenyer_refresh`.<br>`{ success, data: { user: { email, id }, role, organizationId } }` · 401 credenciales malas · 503 Supabase no configurado · 429 limitado |
| `POST` | `/api/auth/register` | Pública, **5 intentos / 60 min / IP** | `auth.signUp` con `metadata { full_name, company_name, role: 'cliente' }`. Solo fija cookies si Supabase devuelve sesión (confirmación de correo desactivada).<br>`{ success, requiresEmailConfirmation, data: { email } }` · contraseña mínimo 8 caracteres |
| `GET` | `/api/auth/session` | Pública | Sesión actual. 401 si no hay.<br>`{ success, data: { mode: 'local'\|'supabase', user: { email, id, name? }, role, organizationId } }` |
| `POST` | `/api/auth/logout` | Pública | Borra ambas cookies y anexa al registro de auditoría `data/auth-audit.log` |
| `POST` | `/api/auth/local-login` | Pública, **5 intentos / 15 min / IP** | Acceso directo con `FRENYER_ACCESS_KEY`. 503 si la variable no está definida · 401 clave incorrecta. Fija cookie de sesión firmada |
| `GET` | `/api/auth/google` | Pública | Inicia OAuth con PKCE. Genera `code_verifier`, fija cookie `frenyer_pkce` (10 min) y redirige (302) a `{SUPABASE_URL}/auth/v1/authorize?provider=google&…&code_challenge_method=S256` |
| `GET` | `/api/auth/google/callback` | Pública | Canjea `code` + `code_verifier` por tokens, fija cookies, redirige (302) a `/dashboard`. En error → `/login?error=…` |
| `POST` | `/api/auth/customer/register` | Pública, **sin rate limit** ⚠ | Alta de cliente de la tienda. Intenta `auth.admin.createUser` (falla con anon key real) y cae a `auth.signUp`; luego inserta en `public.shop_customers` |

---

## 2. Usuarios y administración — `/api/users`, `/api/admin/users`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/users` | **Protegida** | Combina `profiles` de Supabase con `data/users.json`. El archivo local manda en `role`, `title`, `active`, `permissions`. Si ambos están vacíos, siembra un admin por defecto (`usr-001`).<br>`{ success, data: [{ id, name, email, role, title, active, initials, permissions[], created_at }] }` |
| `POST` | `/api/users` | **Pública** 🔴 | Crea un usuario. Si trae `password` usa `auth.signUp` (el id real lo genera Supabase Auth); si no, `crypto.randomUUID()`. Escribe `data/users.json` y sincroniza `profiles` con `Prefer: resolution=merge-duplicates`. El rol se traduce con `toProfileRole()` |
| `PATCH` | `/api/users/:id` | **Protegida** | Actualiza un usuario resuelto en fuente local **o** Supabase. Local: `title`/`active`/`permissions`. Supabase: `full_name`/`email`/`role` |
| `POST` | `/api/users/:id/toggle-status` | **Pública** 🔴 | Alterna `active` |
| `DELETE` | `/api/users/:id` | **Protegida** | Elimina de `data/users.json` y borra en `profiles` (best effort) |
| `POST` | `/api/admin/users/add` | Protegida + rol | `auth.admin.createUser` (requiere service role). 403 si el rol es `customer`/`cliente` |
| `PATCH` | `/api/admin/users/:id` | Protegida + rol | `auth.admin.updateUserById` (nombre/rol/contraseña). 403 para `customer`/`cliente` |

> 🔴 El guard de `server.ts:481` protege `GET, PUT, PATCH, DELETE` de `/api/users` — **no**
> `POST`. Por eso el alta de usuarios y el cambio de estado son públicos.
> Además, `PUT /api/users/:id` **no tiene manejador** (404) y `PUT /api/users` está en la lista
> de métodos protegidos sin ruta.
>
> 🐛 `auth.admin.createUser` y `auth.admin.updateUserById` se invocan sobre el cliente **anon**
> (`getSupabaseAdminClient()` está definido en `server.ts:180-185` pero **nunca se llama**).
> Con una anon key real, estas rutas devuelven 400.

---

## 3. Tasas de cambio (BCV) — `/api/bcv`, `/api/exchange-rates`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/bcv/rates` | Pública | Scraping de `bcv.org.ve/glosario/cambio-oficial` (8 s) → fallback `ve.dolarapi.com` (5 s) → última tasa certificada en memoria → **503** si no hay ninguna.<br>`{ usdRate, currentRate, futureRate, appliedRate, eurRate, valueDate, isFutureRate, isFutureApplied, futureRateHigher, source, sourceDetails, checkedAt }`<br>`source` ∈ `BCV_DIRECT` \| `DOLAR_API_FALLBACK` \| `MANUAL`. `?refresh=true` se acepta pero **no tiene efecto** |
| `POST` | `/api/bcv/rates/manual` | **Protegida + rol** | Fija la tasa manual. Rol requerido ∈ {admin, superadmin, gerente, gerente general, manager, owner} (case-insensitive) → 403 en caso contrario.<br>Cuerpo: `{ rate, futureRate?, valueDate?, notes? }` → `{ success, certifiedRate, message }` |
| `GET` | `/api/exchange-rates/history` | **Protegida** | Últimas 30 filas de `exchange_rates` de la organización. `Cache-Control: no-store`. Si falla, devuelve `data/exchange_rate_history.json` con `source: 'local'` |

> 🔴 La tasa manual **nunca se aplica a la tasa en memoria**: `server.ts:774-848` construye
> `certifiedRate` y la persiste en `exchange_rates`, pero **no asigna `lastCertifiedRate`**.
> `calculateTransactionVES` (`server.ts:519`) sigue usando la tasa anterior.
>
> 🔴 La lista de roles de la tasa manual **omite `administrador`**, que es el valor que produce
> `toProfileRole()`. Y el rol que se comprueba viene de `organization_members.role` (por defecto
> `'viewer'`), no de `profiles.role`. Los dos sistemas de roles no coinciden.

---

## 4. Reportes

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/reports/process-transactions` | **Protegida** | Cálculo puro: liga `bcv_rate\|exchange_rate` a cada transacción y calcula `normalized_usd_amount = round(amount_ves / rate, 2)`. No escribe nada.<br>`{ success, count, processed: [...] }` |

---

## 5. Catálogo, productos y stock

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/products` | Pública | Usa el token de sesión si existe; si no, la anon key. Fallback a `DEFAULT_CATALOG_PRODUCTS` (10 ítems, `server.ts:1037-1188`) |
| `GET` | `/api/public/products` | Pública | Igual, siempre con la anon key |
| `POST` | `/api/products` | **Protegida** | Crea o **actualiza por SKU** (SKU existente → PATCH). Sanitiza `branch_id` no-UUID. Reintenta hasta 6 veces descartando columnas ausentes |
| `PUT` | `/api/products/:sku` | **Protegida** | PATCH por SKU, mismo bucle de reintento. En error devuelve **200 con `{ success: false }`** |
| `DELETE` | `/api/products/:sku` | **Protegida** | DELETE por SKU. 🐛 La rama de error (`server.ts:1350`) referencia `orgId`, que no existe en ese ámbito → `ReferenceError` → devuelve la colección de **cotizaciones** en lugar de productos |
| `GET` | `/api/products/:sku` | Pública | Un producto. Fallback al catálogo por defecto, luego a un stub de precio cero |
| `GET` | `/api/products/:sku/stock` | Pública | `{ success, sku, stock }` |
| `GET` | `/api/stock/:sku` | Pública | Alias del anterior (mismo manejador, montaje por array) |
| `PATCH` | `/api/products/:sku/stock` | **Protegida** | Fija el stock. `{ success: true }` |

---

## 6. Inventario (kárdex y ajustes)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/inventory/movements` | **Pública** 🔴 | Fusiona 4 fuentes: `inventory_movements` + `data/inventory_adjustments.json` + filas sintéticas `VENTA` derivadas de `sales`/`sale_items` + filas sintéticas `COMPRA` de `purchases`/`purchase_items`. Deduplica por `doc_number-sku` y ordena `created_at` desc |
| `POST` | `/api/inventory/adjustments` | **Pública** 🔴 | Cuerpo: `{ sku, adjustment_type: 'ENTRADA'\|'SALIDA'\|'CORRECCION', quantity, reason, notes, doc_number?, unit_cost_usd?, unit_price_usd?, exchange_rate? }`. Calcula `nextStock` (SALIDA/CORRECCION con piso 0), `total_usd`, `total_ves`; actualiza `products.stock`; inserta en `inventory_movements` y en el archivo local. Documento automático `AJU-####`. Respuesta: `{ success, data, new_stock }` |

> 🔴 Estas dos rutas **no están en la lista de prefijos protegidos**. Resuelven el tenant desde
> la cabecera `Authorization` *si viene*, y si no caen en la organización por defecto
> `00000000-0000-0000-0000-000000000001`. Un llamante anónimo puede leer el kárdex y
> **escribir ajustes de stock** en el tenant por defecto.

---

## 7. Tienda y pedidos — `/api/orders`, `/api/public/*`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/orders` | **Protegida** | Fusiona `orders` + `order_items` de Supabase con `data/orders.json` (dedup por `order_number`/`id`), orden descendente |
| `POST` | `/api/orders` | **Pública**, 10 pedidos / hora / IP | Checkout de la tienda. Valida `customer_name` y ≥1 ítem; **rechaza pedidos que dejarían el stock negativo** (400). `order_number = PED-000N`. Totales con `calculateTransactionVES`. **Guarda en `data/orders.json` antes de tocar Supabase**; luego descuenta stock, escribe `inventory_movements` y, best effort, inserta en `orders`/`order_items`.<br>`{ success, data: { …, delivery_status: 'RECIBIDO', is_future_rate, activity_history[] } }` |
| `PATCH` | `/api/orders/:id/delivery-status` | **Protegida** | Estado ∈ `RECIBIDO, PREPARADO, LISTO_PARA_ENTREGAR, EN_CAMINO, ENTREGADO, CANCELADO`. `CANCELADO` es irreversible; `ENTREGADO` no retrocede. Anexa a `activity_history`, fija `completed_at` en `ENTREGADO` |
| `PATCH` | `/api/orders/:id/payment-status` | **Protegida** | Estado ∈ `PENDIENTE, PAGADO, REEMBOLSADO`. Actualiza `payment_status`/`payment_reference` |
| `GET` | `/api/public/organization` | Pública | `{ success, data: { organizationId } }` |
| `GET` | `/api/public/config` | Pública | Perfil estático del negocio (nombre, RIF, teléfonos, dirección, 3 sedes de ejemplo) + `bcvRate`/`bcvRateDate` |

### Portal de cliente — `/api/customer/*`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/customer/portal` | **Protegida** | Portal personal del cliente: `{ customer, orders, purchases, wishlist }`. Pedidos desde `orders`/`order_items` + `data/orders.json` filtrados por `customer_email`; compras desde `sales`/`sale_items` unidos por `customers.email`; lista de deseo desde `data/customer_wishlist.json`. **401** sin sesión |
| `POST` | `/api/customer/wishlist` | **Protegida** | Cuerpo: `{ product_id, sku, name, price_usd, image_url }`. Alterna el producto en la lista de deseo y devuelve `{ saved, wishlist }` |

> 🔒 El cliente se identifica **siempre con la sesión httpOnly del servidor**
> (`supabaseContext.userEmail`), nunca con un parámetro de la petición: un cliente solo ve
> sus propios datos. Al comprar con sesión iniciada, `POST /api/orders` guarda ese correo
> en `customer_email` e ignora el que envía el navegador, de modo que el pedido aparece en
> "Mis Pedidos".

---

## 8. Clientes — `/api/customers`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/customers` | **Protegida** | `customers` de Supabase. Ante error → `data/customers.json` con `source: 'local'` |
| `POST` | `/api/customers` | **Protegida** | Inserta. Ante error → upsert local por `['id','code']` con `source: 'local'` |
| `PATCH` | `/api/customers/:id` | **Protegida** | Actualiza. Ante error → upsert local por `['id']` |
| `DELETE` | `/api/customers/:id` | **Protegida** | Elimina. Ante error → quita del archivo local |

---

## 9. Cotizaciones — `/api/quotes`
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/quotes` | **Protegida** | Lee `sales` con `doc_type='COTIZACION'`. Si faltan las columnas del ciclo de vida, reintenta sin `quote_status`/`expires_at`/`converted_to_sale_id` y las sintetiza, con `schemaNotice: 'quote_status_missing'`. **Sin fallback local**: devuelve `{ success: false, error, data: [] }` |
| `GET` | `/api/quotes/migration-sql` | **Protegida** | Sirve `supabase/migrations/0011_quotes_module.sql` como `text/plain` |
| `POST` | `/api/quotes` | **Protegida** | Cuerpo: `{ customerId, validityDays, notes, items[], exchangeRate, rateSource, isFutureRate, rateValueDate }`. `doc_number` correlativo de 4 dígitos; `expires_at` = ahora + `validityDays` (7 por defecto). Inserta en `sales` + `sale_items`. Ante fallo total cae a local (`data/quotes.json` + `data/sales.json`) y responde `{ quoteId, docNumber, source: 'local' }` |
| `PATCH` | `/api/quotes/:id` | **Protegida** | Actualiza la cabecera y **borra y reinserta todos los `sale_items`**. Upsert local ante error |
| `PATCH` | `/api/quotes/:id/status` | **Protegida** | Fija `quote_status`. Si la columna no existe, cae a `status` (`'Rechazada'` → `'CANCELADA'`) |
| `DELETE` | `/api/quotes/:id` | **Protegida** | Borra `sale_items` y la fila de `sales`; en error, quita de `data/quotes.json` y `data/sales.json` |

---

## 10. Tesorería — bancos, métodos de pago, movimientos, transferencias

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/bank-accounts` | **Protegida** | Fusión de `data/bank_accounts.json` (o 3 cuentas por defecto) con `bank_accounts` de Supabase, por `id`; gana Supabase |
| `POST` | `/api/bank-accounts` | **Protegida** | Genera `crypto.randomUUID()` si falta. Escribe local primero, luego Supabase |
| `PATCH` | `/api/bank-accounts/:id` | **Protegida** | Actualiza local + Supabase |
| `DELETE` | `/api/bank-accounts/:id` | **Protegida** | `?permanent=true` → borrado duro; sin él → **borrado lógico** (`status: 'Inactivo'`) |
| `GET` | `/api/payment-methods` | **Protegida** | Supabase primero; fallback `data/payment_methods.json` o 5 métodos por defecto |
| `POST` | `/api/payment-methods` | **Protegida** | Genera id/nombre/moneda/tipo/cuenta bancaria. Local primero, luego Supabase |
| `PATCH` | `/api/payment-methods/:id` | **Protegida** | Local + Supabase |
| `DELETE` | `/api/payment-methods/:id` | **Protegida** | Local + Supabase |
| `GET` | `/api/bank-movements` | **Protegida** | Filtro `?bank_account_id=`. Fusiona Supabase + `data/bank_movements.json` por `id`, orden descendente |
| `GET` | `/api/debug/bank-movements-check` | **Pública** 🔴 | Diagnóstico: vuelca **todos** los movimientos y cuentas bancarias, más los movimientos huérfanos |
| `GET` | `/api/debug/accounts-list` | **Pública** 🔴 | Diagnóstico: vuelca id + nombre de **todas** las cuentas bancarias. 🐛 La rama de error referencia `orgId` no definido → devuelve `localExpenses` (gastos) en su lugar |
| `POST` | `/api/bank-movements` | **Protegida** | Cuerpo: `{ bank_account_id?, type: 'ENTRADA'\|'SALIDA', amount, rate?, commission?, commission_type?, concept?, reference?, currency?, user_name? }`. Resuelve la cuenta destino (por id → por moneda → `account_type === 'Efectivo'` → primera activa). Intenta el RPC atómico `record_bank_movement`; si no existe, hace read-modify-write del saldo. Siempre escribe el archivo local y el saldo local.<br>`{ success, data, bank_account_id, new_balance }` |
| `POST` | `/api/bank-transfers` | **Protegida** | Cuerpo: `{ source_account_id, target_account_id, source_amount, target_amount, rate?, commission?, commission_type? }`. Intenta `record_bank_transfer`; si no, crea una `SALIDA` + una `ENTRADA` y actualiza ambos saldos. **Si hay comisión > 0 crea además una fila en `expenses`** (categoría "Gastos Bancarios", estado `PAGADO`) |

---

## 11. Proveedores — `/api/suppliers`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/suppliers` | **Protegida** | Ejecuta `autoReconcileSuppliers(orgId)`: sintetiza proveedores desde `accounts_payable` y desde movimientos bancarios cuyo concepto coincide con `/Pago a proveedor\s*-\s*([^(]+)(?:\(([^)]+)\))?/i`. Luego fusiona con `suppliers` de Supabase usando `findExistingSupplier` (id → RIF normalizado → nombre normalizado → código `PRV-`). Persiste la lista fusionada en `data/suppliers.json` |
| `POST` | `/api/suppliers` | **Protegida** | Deduplica contra la lista local, asigna `code = PRV-####` y UUID, normaliza el RIF a mayúsculas. Local primero, luego PATCH/POST a Supabase con hasta 6 reintentos descartando columnas |
| `PATCH` | `/api/suppliers/:id` | **Protegida** | Local primero, luego Supabase con el mismo bucle de reintento |
| `DELETE` | `/api/suppliers/:id` | **Protegida** | Quita del archivo local y borra en Supabase (best effort) |

---

## 12. Sedes — `/api/branches`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/branches` | **Protegida** | `branches` de Supabase. **Sobrescribe `data/branches.json`** con el resultado. Fallback al archivo local ante error |
| `POST` | `/api/branches` | **Protegida** | UUID + organización. Supabase primero (`source: 'supabase'`), fallback local |
| `PATCH` | `/api/branches/:id` | **Protegida** | Local primero, luego Supabase; fija `updated_at` |
| `DELETE` | `/api/branches/:id` | **Protegida** | Local + Supabase |

---

## 13. Gastos — `/api/expenses`, `/api/expense-categories`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/expense-categories` | **Protegida** | `expense_categories` de la organización. Sin contexto de sesión devuelve `[]`. **Sin fallback local** |
| `POST` | `/api/expense-categories` | **Protegida** | Inserta. Upsert local por `['name']` ante error |
| `GET` | `/api/expenses` | **Protegida** | `expenses` ordenados por `due_date, created_at desc`. **Sin fallback local** |
| `POST` | `/api/expenses` | **Protegida** | Inserta (sanitiza `branch_id`/`payment_account_id` no-UUID, 6 reintentos). Upsert local ante fallo |
| `PATCH` | `/api/expenses/:id` | **Protegida** | Igual que POST, con sanitizado y reintentos |
| `PUT` | `/api/expenses/:id` | **Protegida** | Igual que PATCH, **sin** el bucle de reintentos |
| `DELETE` | `/api/expenses/:id` | **Protegida** | Elimina; quita del archivo local ante error |
| `POST` | `/api/expenses/:id/pay` | **Protegida** | Cuerpo: `{ amount, currency, exchangeRate, paidAt?, paymentMethod?, bankAccountId?, reference?, notes?, nextDueDate? }`. Escribe `expense_payments`; si viene `bankAccountId` convierte el importe a la moneda de la cuenta (USD→VES × tasa, VES→USD ÷ tasa), descuenta el saldo y crea un movimiento `SALIDA`. Actualiza el gasto: `status: 'PAGADO'` o, con `nextDueDate`, `status: 'PENDIENTE'` + nuevo `due_date` |

---

## 14. Ventas — `/api/sales`, `/api/sale-items`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/sales` | **Protegida** | Últimas 100 ventas (id, doc_number, created_at, total_usd, total_ves, status, payment_type, doc_type). Fallback a `data/sales.json` con `source: 'local'` |
| `GET` | `/api/sale-items` | **Protegida** | `sale_items` (`sale_id, sku, quantity, unit_price_usd, total_usd`), filtro `?sale_id=`, límite 2 000 |

> 🔴 **No existe `POST /api/sales`.** El registro de ventas vive en el cliente
> (`src/lib/supabase/db.ts:1022 recordSaleInSupabase`), que escribe por el cliente Supabase
> **inerte**; solo llega al servidor para `PATCH /api/products/:sku/stock`. Las ventas del POS
> no se pueden persistir por la API.

---

## 15. Cuentas por cobrar — `/api/accounts-receivable`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/accounts-receivable` | **Protegida** | Une `customers`, `receivable_payments`, `sales(+sale_items)`; si falla, select más simple; además toma `payments` por `sale_id in (...)`. Deduplica pagos y **sintetiza un pago "PAGO-COMPLETO"** cuando `total_usd - balance_usd` supera la suma de los pagos registrados. **Sobrescribe `data/accounts_receivable.json`** (caché) |
| `POST` | `/api/accounts-receivable` | **Protegida** | Cuerpo: `{ id?, doc_number, concept, total_usd, balance_usd?, status?, due_date?, … }`. Local primero, luego Supabase con 6 reintentos |
| `POST` | `/api/accounts-receivable/:id/payments` | **Protegida** | Cuerpo: `{ amount_usd, amount_ves?, exchange_rate?, bank_account_id?, payment_method?, reference? }`. `newRemaining = max(0, balance - amount)`, estado `PAGADO`/`PARCIAL`. Inserta en `receivable_payments`, actualiza el saldo, **deposita en la cuenta bancaria resuelta** (VES recibe `amount_ves`, USD recibe `amount_usd`) y escribe un movimiento `ENTRADA`.<br>`{ success, data, payment, remaining_amount }` |

---

## 16. Cuentas por pagar — `/api/accounts-payable`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/accounts-payable` | **Protegida** | Select de 3 niveles (con `payable_payments+suppliers` → con `payable_payments` → simple) + consulta directa de `payable_payments`. Fusiona local + Supabase por `id`, une los pagos por `id` y **sintetiza un pago "ABONO"** por la diferencia `total_usd - balance_usd` |
| `POST` | `/api/accounts-payable` | **Protegida** | Cuerpo: `{ total_usd\|totalUSD, initial_usd\|initialPaymentUsd?, supplier_id?, supplier_name?, supplier_doc?, create_new_supplier?, … }`. `balance = total - initial`; estado derivado `PAGADO`/`PARCIAL`/`PENDIENTE`. **Crea el proveedor automáticamente** (local + Supabase) si `create_new_supplier`/`save_supplier` está activo y no hay coincidencia. `supplier_id` se descarta del payload Supabase si no es UUID |
| `POST` | `/api/accounts-payable/:id/payments` | **Protegida** | Misma forma que el de CxC. `newRemaining = max(0, balance - amount)`, estado `PAGADO`/`PARCIAL`. Escribe `payable_payments`, actualiza el saldo y, si viene `bank_account_id`, **retira** de la cuenta y escribe un movimiento `SALIDA` con concepto `Pago a proveedor - …`. Tiene una **protección de 30 s contra referencias duplicadas** (`server.ts:5761-5765`) |

---

## 17. Compras internas — `/api/purchases`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/purchases` | **Protegida** | `purchases` (+`suppliers`, `purchase_items`) con fallback simplificado. Fusiona con `data/purchases.json` por `id`; gana Supabase |
| `POST` | `/api/purchases` | **Protegida** | Acepta camelCase y alias con prefijo `p_` (`items`\|`p_items`, `exchangeRate`\|`p_exchange_rate`, `docNumber`, `invoiceNumber`, `supplierName`, `paymentType`, `dueDate`, `purchaseDate`, `notes`, `supplierId`). `total_ves` con `calculateTransactionVES`; `status: 'COMPLETADA'`. Local primero; **si `paymentType === 'CREDITO'` crea además una entrada en `accounts_payable`** (saldo = total, `PENDIENTE`, vencimiento +30 días por defecto) y la sincroniza a Supabase; luego inserta `purchases` + `purchase_items`.<br>`{ success, message, purchaseId, docNumber, data }` |

---

## 18. Administración de Supabase

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/supabase/status` | Pública | `{ configured, connected, url, status, missingTables[], error }`. Prueba `organizations?select=id&limit=1` |
| `GET` | `/api/supabase/migrations-bundle` | Pública | Concatena **todos** los `supabase/migrations/*.sql` (ordenados) en un solo `text/plain` |

---

## 19. Diagnóstico — `/api/debug/*` ⚠

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/debug/bank-movements-check` | **Pública** | Vuelca movimientos y cuentas bancarias completos |
| `GET` | `/api/debug/accounts-list` | **Pública** | Vuelca id + nombre de todas las cuentas bancarias |

> Ambas son de diagnóstico y **deberían estar protegidas o eliminadas** antes de producción.

---

## 20. Alma

**No hay rutas de Alma en el servidor.** Un grep insensible a mayúsculas de `alma` en
`server.ts` solo devuelve palabras españolas sin relación ("almacén").
El asistente es hoy un **stub de interfaz** (`src/modules/alma/pages/Alma.tsx`, 18 líneas):
no hay chat, ni streaming, ni herramientas, ni llamadas a la API.

Las herramientas autorizadas que la arquitectura reserva para Alma están descritas en
[BUSINESS_RULES.md](BUSINESS_RULES.md#alma--herramientas-autorizadas) pero **no existen todavía**.

---

## 21. Rutas de la aplicación (no API)

| Ruta | Contenido |
|---|---|
| `/` | Tienda pública (`src/modules/shop/pages/ShopPage.tsx`) |
| `/login`, `/registro` | Autenticación (`src/pages/auth/LoginPage.tsx`) |
| `/auth/callback` | Retorno de autenticación (`src/pages/auth/AuthCallback.tsx`) |
| `/dashboard` | Panel de KPIs (`src/pages/Dashboard.tsx`) |
| `/ventas-flash/*` | Ventas, pedidos, cotizaciones, reportes |
| `/inventarios/*` | Productos, compras, movimientos, reporte diario |
| `/cuentas/*` | Bancos, cobrar, pagar, reporte |
| `/gastos` | Gastos operativos |
| `/contactos/*` | Clientes y proveedores |
| `/finanzas/*` | Salud del negocio, ganancias y pérdidas |
| `/configuracion` | Configuración, almacén, usuarios, auditoría |
| `/alma` | Asistente (stub) |

Detalle en [OVERVIEW.md §5.1](OVERVIEW.md#51-árbol-de-rutas).
