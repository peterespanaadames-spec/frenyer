# Base de datos — Frenyer ERP (Supabase / PostgreSQL)

> Proyecto Supabase: `knyqrwpaksawuxoqcayu` · Esquema: `public` · Motor: PostgreSQL + PostgREST
> Referencia derivada de `supabase/migrations/` (22 archivos, `0001` → `0022`) más una migración
> huérfana en `workspace/`. Verificada en la revisión de octubre 2026.

---

## 0. Advertencia importante

> ⚠ **La carpeta `supabase/migrations/` es un espejo, no la fuente de verdad.**
> No hay `supabase/config.toml`, ni `seed.sql`, ni scripts de la CLI de Supabase en
> `package.json`. Las migraciones se aplican **a mano** desde el SQL Editor, y la base de datos
> viva fue parcheada a mano durante meses.
>
> Consecuencia: **muchas columnas que usa la aplicación no existen en ninguna migración**
> (ver §5), y **varias migraciones fallan si se aplican en orden** (ver §6).
> Antes de dar por bueno cualquier dato de este documento, verifícalo contra la base viva.

---

## 1. Registro de migraciones

| # | Archivo | Qué hace | ¿Superado? |
|---|---|---|---|
| 0001 | `0001_initial.sql` | 8 tablas núcleo (`organizations`, `profiles`, `organization_members`, `branches`, `products`, `customers`, `exchange_rates`, `audit_logs`), RLS, `is_org_member()`, primeras políticas | Tablas re-declaradas (no-op) por `0002`; políticas sustituidas por `0003` → `0009` |
| 0002 | `0002_complete_schema.sql` | `sales`, `sale_items`, `bank_accounts`, `payments`, `accounts_receivable`, `receivable_payments`; **re-declara 7 tablas existentes (no-op)**; redefine `is_org_member` | Tablas nuevas vigentes; re-declaraciones ignoradas |
| 0003 | `0003_fix_rls_policies.sql` | Inserta la organización por defecto; hace nullable `organization_id` en 6 tablas y le pone DEFAULT centinela; sustituye las políticas por `allow_all_*` para `anon` | Políticas → `0009`. Los ALTER siguen vigentes |
| 0004 | `0004_bank_movements.sql` | `bank_movements` + `payment_methods` | Políticas → `0009` |
| 0005 | `0005_accounts_payable.sql` | `accounts_payable` + `payable_payments` | Políticas → `0009` |
| 0006 | `0006_suppliers.sql` | `suppliers` + 3 índices | Política → `0016_fix` |
| 0007 | `0007_fix_accounts_payable_table.sql` | "Refresco forzado" del esquema de `accounts_payable` — pero es `create table if not exists` → **no-op puro** | Archivo muerto |
| 0008 | `0008_accounts_payable_supplier_link.sql` | `accounts_payable.supplier_id` + FK (`ON DELETE RESTRICT`), backfill por nombre, endurece políticas, RPCs `create_payable_with_initial_payment` y `record_payable_payment` | FK, backfill y RPCs vigentes |
| 0009 | `0009_lock_down_api_rls.sql` | **La base de seguridad.** Elimina 39 políticas permisivas, define `is_org_writer()`, instala el patrón `authenticated_read_*` / `authenticated_manage_*` en 18 tablas | Parcialmente revertido por `0012`, `0015`, `0016_fix`, `0017`, `0019` |
| 0010 | `0010_auth_signup_organization.sql` | Trigger `provision_new_auth_user_organization()` sobre `auth.users`: crea organización + membresía | Vigente |
| 0011 | `0011_quotes_module.sql` | `sales.quote_status/expires_at/converted_to_sale_id`; RPCs `create_quote`, `convert_quote_to_invoice`, `reject_quote` | Vigente, pero **rota** en un esquema solo-migraciones |
| 0012 | `0012_atomic_bank_movements.sql` | **Redefine `is_org_writer()`** a "cualquier miembro"; RPCs atómicos `record_bank_movement` y `record_bank_transfer` | Vigente; anula la lista de roles de `0009` |
| 0013 | `0013_purchases_module.sql` | `purchases` + `purchase_items`; RPC `record_internal_purchase` (correlativo `CMP-00001`, incrementa stock, crea CxP, movimiento `SALIDA`) | Tabla/RPC vigentes; políticas → `0016_fix` |
| 0014 | `0014_ensure_suppliers_columns.sql` | `ADD COLUMN IF NOT EXISTS` redundante + `NOTIFY pgrst` | No-op |
| 0015 | `0015_branches_warehouses.sql` | Columnas de `branches`, `products.branch_id`, índices; **reabre `branches` a `anon`** | Regresión de política vigente |
| 0016a | `0016_expenses_module.sql` | `expense_categories` + `expenses` (con CHECK) + `expense_payments`; políticas `allow_all_*` | Vigente (permisiva) |
| 0016b | `0016_fix_suppliers_payables_purchases.sql` | Reconcilia columnas; **reabre a `anon`** `suppliers`, `accounts_payable`, `accounts_receivable`, `purchases`, `purchase_items` | ⚠ Colisión de numeración |
| 0017 | `0017_inventory_movements.sql` | `inventory_movements` (kárdex) + 5 índices; política `org_member_*` con `USING (true)` | Vigente (permisiva) |
| 0018 | `0018_orders_module.sql` | `orders` + `order_items`; políticas `USING (true)` sin cláusula `TO` | Vigente |
| 0019 | `0019_fix_receivable_payments_rls.sql` | Re-declara `receivable_payments` (no-op) + `allow_all_receivable_payments` (anon) | Parcialmente vigente |
| 0020 | `0020_suppliers_dedup_and_unique_constraint.sql` | Deduplica `suppliers` por documento/nombre, renumera `code` a `PRV-000N`, añade 2 **índices únicos parciales** | Vigente |
| 0021 | `0021_rbac_profiles_and_first_user_trigger.sql` | `profiles` con CHECK de 4 roles, `get_my_role()`, trigger `handle_new_user()` (primer usuario = `gerente`) | Vigente |
| 0022 | `0022_shop_customer_tables.sql` | `shop_customers`, `customer_wishlist`, `customer_orders` | Vigente |
| — | `workspace/supabase/migrations/0019_auto_deduct_inventory_stock.sql` | Trigger de descuento automático de stock + escritura del kárdex. **Fuera de la carpeta de migraciones ⇒ nunca aplicado por herramienta** | Ver §6 |

### 1.1 Colisión de numeración `0016`

`0016_expenses_module.sql` y `0016_fix_suppliers_payables_purchases.sql` comparten prefijo de
versión. La CLI de Supabase deriva la versión del prefijo numérico → ambas mapean a la versión
`16`. El orden lexicográfico es determinista (`e` < `f`), así que el orden de aplicación es
estable, pero la **identidad de versión no lo es**: `supabase db push` saltará una de las dos
o exigirá `supabase migration repair`.

**Recomendación:** renumerar `0016b_fix_…` a `0017` (y renumerar en cascada) antes de
alimentar la carpeta a la CLI.

---

## 2. Referencia de esquema por tabla

Notación: **PK** clave primaria · **FK** clave foránea · **UQ** único · **NN** not null ·
**DF** valor por defecto.

> Cuando una migración posterior re-declara una tabla con `CREATE TABLE IF NOT EXISTS`,
> **gana la forma original**. Se marca como ⚠ *no-op*.

### 2.1 Tenant y sedes

#### `public.organizations` — ⚠ declarada en `0001:2`; la versión de `0002:16` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:2` |
| `name` | text | **NN** | `0001:2` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:2` |
| `rif`, `phone`, `address`, `currency` | text | ⚠ **faltan** — solo en el no-op `0002:19-22`. `0003:9` inserta `currency` ⇒ **falla** en un esquema solo-migraciones | `0002:19` |

**RLS:** habilitado. Política final: `authenticated_read_organizations` — SELECT, `TO authenticated`,
`USING (public.is_org_member(id))` (`0009:82-84`). Sin política de escritura: la organización se
crea solo vía el trigger `SECURITY DEFINER`.

#### `public.branches` — ⚠ declarada en `0001:5`; `0015:8` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:5` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0001:5`, `0015:40-41` |
| `name` | text | **NN** | `0001:5` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:5` |
| `code` | text | nullable (`0015:11` intención `NOT NULL DF 'SUC-01'`; el ALTER de `0015:23` no lo aplica) | `0015:23` |
| `phone` | text | nullable | `0015:24` |
| `status` | text | DF `'Habilitada'` | `0015:25` |
| `is_active` | boolean | DF `true` | `0015:26` |
| `cash_registers` | integer | DF `0` | `0015:27` |
| `updated_at` | timestamptz | DF `now()` | `0015:28` |
| `address` | text | ⚠ **falta** — solo en el no-op `0002:30`; la app lo escribe (`server.ts:4102`) | `0002:30` |

**Índices:** `idx_branches_org (organization_id)` (`0015:34`).
**RLS:** 🔴 `allow_all_branches` — `FOR ALL TO anon, authenticated`, `USING (true) WITH CHECK (true)`
(`0015:49-52`) + `GRANT ALL` a `anon` y `authenticated`. **Sin aislamiento de tenant.**

### 2.2 Identidad, perfiles y membresías

#### `public.profiles` — declarada en `0001:3`; ampliada por `0021:19-36`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, FK → `auth.users(id)` ON DELETE CASCADE | `0001:3` |
| `full_name` | text | nullable | `0001:3` |
| `email` | text | nullable | `0021:26` |
| `role` | text | **NN**, DF `'cliente'`, **CHECK `role in ('gerente','administrador','cajero','cliente')`** (constraint `profiles_role_check`) | `0021:14`, `0021:22`, `0021:39-40` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:3`, `0021:34` |

**Índices:** solo PK. ⚠ `email` **no es único** aquí.
**RLS:** habilitado. Políticas:
- `authenticated_read_own_profile` — SELECT, `TO authenticated`, `USING (id = auth.uid())` (`0009:94-96`).
- `"Los usuarios pueden leer su propio perfil"` — SELECT, `USING (auth.uid() = id OR get_my_role() IN ('gerente','administrador'))` (`0021:129-136`).
- `"Los usuarios pueden editar su propio nombre"` — UPDATE, `USING (auth.uid() = id)`, `WITH CHECK (auth.uid() = id AND (role = current role OR get_my_role() = 'gerente'))` (`0021:139-151`).
- `"Solo gerentes pueden modificar roles de perfiles"` — UPDATE, `USING/WITH CHECK (get_my_role() = 'gerente')` (`0021:154-159`).
- Sin política INSERT (solo el trigger escribe) ni DELETE (la política se eliminó en `0021:126` y no se recreó).

#### `public.organization_members` — declarada en `0001:4`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:4` |
| `organization_id` | uuid | **NN**, FK → `organizations(id)` ON DELETE CASCADE | `0001:4` |
| `user_id` | uuid | **NN**, FK → `auth.users(id)` ON DELETE CASCADE | `0001:4` |
| `role` | text | **NN**, DF `'viewer'` — **texto libre, sin CHECK** | `0001:4` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:4` |

**Restricciones:** `UNIQUE (organization_id, user_id)`.
**RLS:** `authenticated_read_memberships` — SELECT, `USING (user_id = auth.uid() OR is_org_member(organization_id))`
(`0009:90-92`). **Solo lectura**; las altas las hace el trigger de `auth.users` y el servidor.

> 🔴 Es la **única fuente de rol para la autorización del servidor** (`server.ts:424`).

#### `public.audit_logs` — declarada en `0001:11`

`id` (PK) · `organization_id` (nullable, FK) · `user_id` (nullable, FK) · `action` (**NN**) ·
`entity` · `entity_id` (uuid) · `metadata` (jsonb) · `created_at` (**NN**, DF `now()`).

**RLS:** política `"members read audit"` — SELECT, `USING (is_org_member(organization_id))` (`0001:20`).
**Tabla muerta:** nunca se escribe ni se consulta.

### 2.3 CRM

#### `public.customers` — ⚠ declarada en `0001:8`; `0002:56` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:8` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0001:8`, `0003:15,23` |
| `name` | text | **NN** | `0001:8` |
| `email` | text | nullable | `0001:8` |
| `phone` | text | nullable | `0001:8` |
| `balance` | numeric(18,4) | **NN**, DF `0` | `0001:8` |
| `status` | text | **NN**, DF `'Activo'` | `0001:8` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:8` |
| `code`, `doc_type`, `doc_number`, `credit_limit`, `address`, `orders_count`, `total_spent_usd`, `last_order_date` | — | ⚠ **faltan** — solo en el no-op `0002:60-70`; la app **los usa** (`DbCustomer`, `server.ts:5195-5197`) | `0002:60` |

**Índices:** `customers_org_idx` (`0001:9`), `idx_customers_org` (`0002:74`),
`idx_customers_doc (doc_number)` (`0002:75`) ⚠ **este índice falla** si `doc_number` no existe.
**RLS:** `authenticated_manage_customers` (ALL, `is_org_writer`) + `authenticated_read_customers`
(SELECT, `is_org_member`) (`0009:106-112`). **Aislamiento intacto.**

#### `public.suppliers` — declarada en `0006:5` (definición real)

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0006:6` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable, DF centinela | `0006:7` |
| `code` | text | nullable | `0006:8` |
| `name` | text | **NN** | `0006:9` |
| `doc_type` | text | **NN**, DF `'RIF (J / G / V)'` | `0006:10` |
| `doc_number` | text | **NN** (sin default) | `0006:11` |
| `contact_person`, `phone`, `email`, `address` | text | nullable | `0006:12-15` |
| `category` | text | DF `'General'` | `0006:16` |
| `balance_usd` | numeric(18,4) | **NN**, DF `0` | `0006:17` |
| `status` | text | **NN**, DF `'Activo'` | `0006:18` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0006:19` |
| `updated_at` | timestamptz | DF `now()` | `0016_fix:38` |

**Índices:** `idx_suppliers_org`, `idx_suppliers_doc`, `idx_suppliers_name` (`0006:32-34`), más
**índices únicos parciales** de `0020`:
- `idx_suppliers_org_doc_unique (organization_id, UPPER(TRIM(doc_number))) WHERE doc_number IS NOT NULL AND TRIM(doc_number) <> ''` (`0020:109-111`)
- `idx_suppliers_org_code_unique (organization_id, code) WHERE code IS NOT NULL AND TRIM(code) <> ''` (`0020:113-115`)

**RLS:** 🔴 `allow_all_suppliers` — `FOR ALL TO anon, authenticated`, `USING (true) WITH CHECK (true)`
(`0016_fix:45`) + `GRANT ALL`. **Sin aislamiento.**

### 2.4 Catálogo e inventario

#### `public.products` — ⚠ declarada en `0001:6`; `0002:81` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:6` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0001:6`, `0003:14,22` |
| `branch_id` | uuid | FK → `branches(id)` — ⚠ **sin `ON DELETE`** ⇒ NO ACTION (restricción) | `0001:6` |
| `sku` | text | **NN** | `0001:6` |
| `name` | text | **NN** | `0001:6` |
| `category` | text | nullable | `0001:6` |
| `price_usd` | numeric(18,4) | **NN**, DF `0` | `0001:6` |
| `stock` | numeric(18,4) | **NN**, DF `0` | `0001:6` |
| `status` | text | **NN**, DF `'Activo'` | `0001:6` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:6` |
| `barcode`, `cost_usd`, `min_stock`, `unit`, `image_url` | — | ⚠ **faltan** — solo en el no-op `0002:86-94`; `cost_usd` lo **exigen** `0013:257` y el trigger de stock | `0002:86` |
| `brand`, `description` | text | ⚠ **nunca declaradas**, pero se envían en `DEFAULT_CATALOG_PRODUCTS` (`server.ts:1044-1045`) y se tipan en `DbProduct` | — |

**Índices:** `products_org_idx` (`0001:7`), `idx_products_org` (`0002:99`),
`idx_products_sku` (`0002:100`), `idx_products_branch` (`0015:35`).
**RLS:** `authenticated_manage_products` + `authenticated_read_products` (`0009:98-104`).
**Aislamiento intacto.**

> ⚠ **No hay restricción única sobre `sku`**, pese a que `sku` es la clave de unión en
> `0011:212`, `0013:230`, `workspace/0019:59`, `server.ts:1425` y `db.ts:830,1042`.
> SKUs duplicados ⇒ se actualiza el stock equivocado (`LIMIT 1`).

#### `public.inventory_movements` — declarada en `0017:7`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0017:8` |
| `organization_id` | uuid | **NN**, FK → `organizations(id)` ON DELETE CASCADE | `0017:9` |
| `branch_id` | uuid | FK → `branches(id)` ON DELETE SET NULL | `0017:10` |
| `product_id` | uuid | FK → `products(id)` ON DELETE SET NULL | `0017:11` |
| `sku` | text | **NN** | `0017:12` |
| `product_name` | text | **NN** | `0017:13` |
| `movement_type` | text | **NN** — `COMPRA`/`VENTA`/`AJUSTE_ENTRADA`/`AJUSTE_SALIDA`/`AJUSTE_CORRECCION`/`DEVOLUCION` (solo comentario, sin CHECK) | `0017:14` |
| `doc_type` | text | **NN**, DF `'AJUSTE'` | `0017:15` |
| `doc_number` | text | **NN** | `0017:16` |
| `entity_type` | text | DF `'INTERNO'` | `0017:17` |
| `entity_name` | text | nullable | `0017:18` |
| `quantity` | numeric(18,4) | **NN** — con signo (+ entrada / − salida) | `0017:19` |
| `unit_cost_usd` | numeric(18,4) | **NN**, DF `0` | `0017:20` |
| `unit_price_usd` | numeric(18,4) | **NN**, DF `0` | `0017:21` |
| `exchange_rate` | numeric(18,4) | **NN**, DF `1` | `0017:22` |
| `total_usd` | numeric(18,4) | **NN**, DF `0` | `0017:23` |
| `total_ves` | numeric(18,4) | **NN**, DF `0` | `0017:24` |
| `previous_stock` | numeric(18,4) | DF `0` | `0017:25` |
| `new_stock` | numeric(18,4) | DF `0` | `0017:26` |
| `reason`, `notes` | text | nullable | `0017:27-28` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0017:29` |

**Índices:** `idx_inv_mov_org`, `idx_inv_mov_sku`, `idx_inv_mov_doc`, `idx_inv_mov_type`,
`idx_inv_mov_created (created_at DESC)` (`0017:33-37`).
**RLS:** 🔴 `org_member_inventory_movements` (`FOR ALL TO authenticated`) con
**`USING (true)` / `WITH CHECK (true)`** (`0017:43-47`) — *nombre engañoso* — más
`anon_inventory_movements` (`0017:50-54`) + `GRANT ALL`. **Sin aislamiento.**

### 2.5 Ventas, cotizaciones y pedidos

#### `public.sales` — declarada en `0002:106`

Encabezado de ventas POS, facturas **y** cotizaciones (`doc_type='COTIZACION'`).

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0002:107` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0002:108`, `0003:16,24` |
| `branch_id` | uuid | FK → `branches(id)` ON DELETE SET NULL | `0002:109` |
| `customer_id` | uuid | FK → `customers(id)` ON DELETE SET NULL | `0002:110` |
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE SET NULL | `0002:111` |
| `doc_type` | text | **NN**, DF `'FACTURA'` — `FACTURA`/`NOTA`/`ESPERA`/`COTIZACION` | `0002:114` |
| `doc_number` | text | **NN** | `0002:115` |
| `status` | text | **NN**, DF `'COMPLETADA'` — `COMPLETADA`/`EN_ESPERA`/`ANULADA` | `0002:116` |
| `payment_type` | text | **NN**, DF `'CONTADO'` — `CONTADO`/`CREDITO` | `0002:119` |
| `exchange_rate` | numeric(18,4) | **NN** — tasa congelada en la transacción | `0002:122` |
| `subtotal_usd`, `discount_usd`, `tax_usd`, `igtf_usd`, `total_usd`, `total_ves` | numeric(18,4) | **NN**, DF `0` | `0002:125-130` |
| `notes` | text | nullable | `0002:132` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0002:133` |
| `quote_status` | text | nullable — `Creada`/`Facturada`/`Rechazada` | `0011:10` |
| `expires_at` | timestamptz | nullable | `0011:11` |
| `converted_to_sale_id` | uuid | FK → `sales(id)` ON DELETE SET NULL | `0011:12,15-27` |
| `rate_source`, `rate_value_date`, `is_future_rate` | — | ⚠ **faltan** — las insertan los RPCs `0011:89` y `0011:248` | — |

**Índices:** `idx_sales_org`, `idx_sales_doc`, `idx_sales_status` (`0002:136-138`),
`idx_sales_quote_status`, `idx_sales_expires_at` (`0011:29-30`).
⚠ **Sin índice único en `(organization_id, doc_number)`** ⇒ los RPCs calculan
`max(int)+1` **sin bloqueo** (`0011:79-83`, `0011:196-200`) y pueden colisionar.
⚠ `doc_number` es un entero con ceros a la izquierda (`'0001'`) ⇒
`nullif(doc_number,'')::int` **lanza excepción** ante cualquier número no numérico.
**RLS:** `authenticated_manage_sales` + `authenticated_read_sales` (`0009:114-120`).
**Aislamiento intacto.**

#### `public.sale_items` — declarada en `0002:141`

`id` (PK) · `sale_id` (**NN**, FK → `sales(id)` ON DELETE CASCADE) · `product_id`
(FK → `products(id)` ON DELETE SET NULL) · `sku` (**NN**) · `name` (**NN**) ·
`quantity` (**NN**, DF `1`) · `unit_price_usd` (**NN**) · `total_usd` (**NN**) ·
`total_ves` (**NN**) · `created_at` (**NN**, DF `now()`).

**Índices:** `idx_sale_items_sale (sale_id)` (`0002:154`).
**RLS:** aislamiento **por fila padre** — `EXISTS (SELECT 1 FROM sales …)` (`0009:122-140`).
**Trigger:** `trg_deduct_product_stock` AFTER INSERT (solo en `workspace/0019`).

#### `public.payments` — declarada en `0002:172`

`id` (PK) · `sale_id` (nullable, FK → `sales(id)` ON DELETE CASCADE) · `bank_account_id`
(FK → `bank_accounts(id)` ON DELETE SET NULL) · `method` (**NN**) · `amount_usd` (**NN**) ·
`amount_ves` (**NN**) · `exchange_rate` (**NN**) · `reference_number` · `created_at` (**NN**).

**RLS:** aislamiento por fila padre (`0009:142-160`).
⚠ La política **no verifica** que `bank_account_id` pertenezca a la misma organización
(contra `receivable_payments`, que sí lo hace).

#### `public.orders` — declarada en `0018:7`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0018:8` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE SET NULL | `0018:9` |
| `branch_id` | uuid | FK → `branches(id)` ON DELETE SET NULL | `0018:10` |
| `order_number` | text | **NN** — `PED-0001`… | `0018:11` |
| `customer_name` | text | **NN** | `0018:12` |
| `customer_phone`, `customer_email`, `customer_doc` | text | nullable | `0018:13-15` |
| `delivery_method` | text | **NN**, DF `'RETIRO'` — `RETIRO`/`DOMICILIO` | `0018:16` |
| `delivery_address`, `delivery_instructions` | text | nullable | `0018:17-18` |
| `delivery_status` | text | **NN**, DF `'RECIBIDO'` — `RECIBIDO`/`PREPARADO`/`LISTO_PARA_ENTREGAR`/`EN_CAMINO`/`ENTREGADO`/`CANCELADO` | `0018:19` |
| `payment_method` | text | **NN**, DF `'PAGO_MOVIL'` — `PAGO_MOVIL`/`TRANSFERENCIA`/`EFECTIVO_USD`/`PUNTO_VENTA`/`ZELLE` | `0018:20` |
| `payment_status` | text | **NN**, DF `'PENDIENTE'` — `PENDIENTE`/`PAGADO`/`REEMBOLSADO` | `0018:21` |
| `payment_reference` | text | nullable | `0018:22` |
| `currency` | text | **NN**, DF `'USD'` | `0018:23` |
| `exchange_rate` | numeric(18,4) | **NN**, DF `1` | `0018:24` |
| `is_future_rate` | boolean | DF `false` | `0018:25` |
| `subtotal_usd`, `total_usd`, `total_ves` | numeric(18,4) | **NN**, DF `0` | `0018:26-28` |
| `notes` | text | nullable | `0018:29` |
| `activity_history` | jsonb | **NN**, DF `'[]'` | `0018:30` |
| `completed_at` | timestamptz | nullable | `0018:31` |
| `created_at`, `updated_at` | timestamptz | **NN**, DF `now()` | `0018:32-33` |

**Índices:** `idx_orders_org`, `idx_orders_number`, `idx_orders_delivery_status`,
`idx_orders_payment_status`, `idx_orders_created (created_at DESC)` (`0018:51-55`).
**RLS:** 🔴 `orders_select_all` / `orders_insert_all` / `orders_update_all` con `USING (true)`
**y sin cláusula `TO`** ⇒ aplican a `PUBLIC` (incluido `anon`) (`0018:64-71`). Sin política DELETE.

#### `public.order_items` — declarada en `0018:37`

`id` (PK) · `order_id` (**NN**, FK → `orders(id)` ON DELETE CASCADE) · `product_id`
(FK → `products(id)` ON DELETE SET NULL) · `sku` (**NN**) · `name` (**NN**) ·
`quantity` (**NN**, DF `1`) · `unit_price_usd`/`total_usd`/`total_ves` (**NN**, DF `0`) ·
`created_at` (**NN**).

**RLS:** 🔴 `order_items_select_all` / `order_items_insert_all` con `USING (true)`, PUBLIC
(`0018:73-76`). Sin UPDATE/DELETE.

### 2.6 Tesorería

#### `public.bank_accounts` — declarada en `0002:160`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0002:161` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0002:162`, `0003:17,25` |
| `bank_name` | text | **NN** | `0002:163` |
| `account_number` | text | nullable | `0002:164` |
| `account_type` | text | **NN**, DF `'Corriente'` — `Corriente`/`Ahorro`/`Custodia`/`Caja` | `0002:165` |
| `currency` | text | **NN**, DF `'VES'` — `VES`/`USD` (validado en los RPCs, no por CHECK) | `0002:166` |
| `balance` | numeric(18,4) | **NN**, DF `0` | `0002:167` |
| `status` | text | **NN**, DF `'Activo'` | `0002:168` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0002:169` |

**Índices:** ⚠ **ninguno** (ni siquiera sobre `organization_id`).
**RLS:** `authenticated_manage_bank_accounts` + `authenticated_read_bank_accounts`
(`0009:162-168`). **Aislamiento intacto.**

> ⚠ **Sensibilidad a mayúsculas:** `record_bank_movement` exige `status = 'Activo'` (`0012:72`)
> mientras `record_payable_payment` compara `upper(status) = 'ACTIVO'` (`0008:244`).

#### `public.bank_movements` — declarada en `0004:6`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0004:7` |
| `organization_id` | uuid | **NN**, FK → `organizations(id)` ON DELETE CASCADE | `0004:8` |
| `bank_account_id` | uuid | FK → `bank_accounts(id)` ON DELETE CASCADE | `0004:9` |
| `type` | text | **NN** — `ENTRADA`/`SALIDA` (CHECK solo en el RPC) | `0004:10` |
| `concept` | text | **NN** | `0004:11` |
| `reference` | text | nullable | `0004:12` |
| `user_name` | text | **NN**, DF `'Administrador'` — ⚠ los RPCs guardan `auth.uid()::text` | `0004:13`, `0012:116` |
| `rate` | numeric(18,4) | **NN** | `0004:14` |
| `commission` | numeric(18,4) | **NN**, DF `0` | `0004:15` |
| `commission_type` | text | DF `'Fija'` — `Fija`/`Porcentual` | `0004:16` |
| `amount` | numeric(18,4) | **NN** — en la moneda de la cuenta | `0004:17` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0004:18` |

**Índices:** ⚠ **ninguno**.
**RLS:** `authenticated_manage_bank_movements` (con `WITH CHECK` que verifica que
`bank_account_id` sea de la misma org) + `authenticated_read_bank_movements` (`0009:170-186`).
**Aislamiento intacto.**

#### `public.payment_methods` — declarada en `0004:22`

`id` (PK) · `organization_id` (**NN**) · `name` (**NN**) · `currency` (**NN**, DF `'VES'` —
`VES`/`USD`/`USDT`/`EUR`/`COP`) · `type` (**NN**, DF `'Transferencia'` —
`Pago Móvil`/`Transferencia`/`Efectivo`/`Punto de Venta`) · `bank_account_id`
(FK → `bank_accounts(id)` ON DELETE SET NULL) · `code` · `created_at` (**NN**).

**Índices:** ⚠ ninguno sobre `organization_id`.
**RLS:** `authenticated_manage_payment_methods` + `authenticated_read_payment_methods`
(`0009:188-204`). **Aislamiento intacto.**

#### `public.exchange_rates` — ⚠ declarada en `0001:10`; `0002:218` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0001:10` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; **nullable sin DEFAULT** | `0001:10`, `0003:19` |
| `base_currency` | text | **NN**, sin default | `0001:10` |
| `quote_currency` | text | **NN**, sin default | `0001:10` |
| `rate` | numeric(24,10) | **NN** | `0001:10` |
| `source` | text | nullable | `0001:10` |
| `observed_at` | timestamptz | **NN** | `0001:10` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0001:10` |
| `is_future_rate` | boolean | ⚠ **falta** — lo escribe la app (`server.ts:829`) | `0002:224` |

**RLS:** 4 políticas (`0009:254-289`): lectura con `is_org_member`; insert/update/delete con una
**lista de roles en línea** sobre `organization_members.role`:
`('admin','administrador','superadmin','gerente','gerente general','manager','owner')`.
**Aislamiento intacto + escritura restringida por rol.** Es la única tabla con esa protección.

### 2.7 Gastos

#### `public.expense_categories` — declarada en `0016_expenses:8`

`id` (PK) · `organization_id` (**NN**, FK) · `name` (**NN**) · `is_default` (**NN**, DF `false`) ·
`created_at` (**NN**).

**Índice único:** `idx_expense_categories_org_name (organization_id, lower(trim(name)))`
(`0016:17-18`) — unicidad por expresión.
**RLS:** 🔴 `allow_all_expense_categories` (`0016:94-99`) + `GRANT ALL`. **Sin aislamiento.**

#### `public.expenses` — declarada en `0016_expenses:21`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0016:22` |
| `organization_id` | uuid | **NN**, FK → `organizations(id)` ON DELETE CASCADE | `0016:23` |
| `branch_id` | uuid | FK → `branches(id)` ON DELETE SET NULL | `0016:24`, `0016:43` |
| `name` | text | **NN** | `0016:25` |
| `description` | text | **NN** | `0016:26` |
| `category` | text | **NN** | `0016:27` |
| `type` | text | **NN**, DF `'FIJO'`, **CHECK `type in ('FIJO','VARIABLE')`** | `0016:28` |
| `amount` | numeric(12,2) | **NN**, **CHECK `amount > 0`** | `0016:29` |
| `currency` | text | **NN**, DF `'USD'`, **CHECK `currency in ('USD','VES')`** | `0016:30` |
| `exchange_rate` | numeric(12,4) | **NN**, DF `1.0000` | `0016:31` |
| `due_date` | date | **NN**, DF `current_date` | `0016:32` |
| `last_payment_date` | date | nullable | `0016:33`, `0016:44` |
| `frequency` | text | DF `'MENSUAL'`, **CHECK NULL OR in ('SEMANAL','QUINCENAL','MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')** | `0016:34` |
| `status` | text | **NN**, DF `'PENDIENTE'`, **CHECK `status in ('PENDIENTE','PAGADO','VENCIDO')`** | `0016:35` |
| `notes` | text | nullable | `0016:36`, `0016:45` |
| `payment_account_id` | uuid | FK → `bank_accounts(id)` ON DELETE SET NULL | `0016:37`, `0016:46` |
| `created_at`, `updated_at` | timestamptz | **NN**, DF `now()` | `0016:38-39` |

**Índices:** `idx_expenses_org`, `idx_expenses_type`, `idx_expenses_due_date`, `idx_expenses_status`
(`0016:65-68`).
**RLS:** 🔴 `allow_all_expenses` (`0016:101-106`) + `GRANT ALL`. **Sin aislamiento.**

#### `public.expense_payments` — declarada en `0016_expenses:49`

`id` (PK) · `expense_id` (**NN**, FK → `expenses(id)` ON DELETE CASCADE) · `organization_id`
(**NN**, FK) · `amount` (**NN**, **CHECK `amount > 0`**) · `currency` (**NN**, DF `'USD'`,
**CHECK in ('USD','VES')**) · `exchange_rate` (**NN**, DF `1.0000`) · `paid_at` (**NN**, DF `now()`) ·
`payment_method` (**NN**, DF `'Transferencia bancaria'`) · `bank_account_id`
(FK → `bank_accounts(id)` ON DELETE SET NULL) · `reference` · `notes` · `created_at` (**NN**).

**Índices:** `idx_expense_payments_expense`, `idx_expense_payments_org` (`0016:69-70`).
**RLS:** 🔴 `allow_all_expense_payments` (`0016:108-113`) + `GRANT ALL`. **Sin aislamiento.**

### 2.8 Cuentas por cobrar y por pagar

#### `public.accounts_receivable` — ⚠ definición real en `0002:188`; `0016_fix:84` es no-op

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0002:189` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE; nullable + DF centinela | `0002:190`, `0003:18,26` |
| `customer_id` | uuid | **NN**, FK → `customers(id)` ON DELETE CASCADE — ⚠ `0016_fix:87` intentaría relajarlo, pero es no-op | `0002:191` |
| `sale_id` | uuid | FK → `sales(id)` ON DELETE SET NULL | `0002:192` |
| `doc_number` | text | **NN** | `0002:193` |
| `total_usd`, `balance_usd` | numeric(18,4) | **NN**, DF `0` | `0002:194-195` |
| `status` | text | **NN**, DF `'PENDIENTE'` — ⚠ `PENDIENTE`/`PARCIAL`/`PAGADA` (db.ts) vs `PAGADO` (servidor/UI) | `0002:196` |
| `due_date` | date | nullable | `0002:197` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0002:198` |
| `customer_name` | text | nullable | `0016_fix:100` |
| `concept` | text | DF `'Venta a crédito o saldo pendiente'` | `0016_fix:101` |
| `description` | text | nullable | `0016_fix:102` |

**Índices:** ninguno.
**RLS:** 🔴 `allow_all_accounts_receivable` (`0016_fix:107`) + `GRANT ALL`. **Sin aislamiento.**

#### `public.receivable_payments` — declarada en `0002:202`

`id` (PK) · `receivable_id` (**NN**, FK → `accounts_receivable(id)` ON DELETE CASCADE) ·
`bank_account_id` (FK → `bank_accounts(id)` ON DELETE SET NULL) · `amount_usd` (**NN**) ·
`amount_ves` (**NN**) · `exchange_rate` (**NN**) · `payment_method` (**NN**) · `reference` ·
`payment_date` (**NN**, DF `now()`).

**RLS:** `authenticated_manage_receivable_payments` + `authenticated_read_receivable_payments`
(`0009:221-252`) — **más** 🔴 `allow_all_receivable_payments` (`0019:23`) + `GRANT ALL`.
Como las políticas permisivas se combinan con OR, **las org-scoped quedan inertes**.

> ⚠ `0019:19-21` elimina los nombres equivocados (`allow_all_receivable_payments`,
> `org_member_receivable_payments_insert/select`) y nunca elimina las `authenticated_*` de
> `0009`: ambos conjuntos quedan vivos.

#### `public.accounts_payable` — ⚠ definición real en `0005:4`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | uuid | **PK**, DF `gen_random_uuid()` | `0005:5` |
| `organization_id` | uuid | FK → `organizations(id)` ON DELETE CASCADE (nullable) | `0005:6` |
| `supplier_id` | uuid | FK → `suppliers(id)` **ON DELETE RESTRICT** (`0008:13-16`) — ⚠ `0016_fix:66` intentaría `SET NULL`, no-op ⇒ **RESTRICT sobrevive** | `0008:2-18` |
| `supplier_name` | text | **NN** (sin default) | `0005:7` |
| `doc_number` | text | **NN** | `0005:8` |
| `concept` | text | nullable, sin default | `0005:9` |
| `origin` | text | **NN**, DF `'Manual'` — `Manual`/`Gasto`/`Compra Interna` | `0005:10` |
| `total_usd`, `balance_usd` | numeric(18,4) | **NN**, DF `0` | `0005:11-12` |
| `status` | text | **NN**, DF `'PENDIENTE'` — ⚠ `PENDIENTE`/`PARCIAL`/**`PAGADA`** (RPCs) vs **`PAGADO`** (servidor/UI) | `0005:13`, `0008:169-171,275` |
| `due_date` | date | nullable | `0005:14` |
| `description` | text | nullable | `0005:15` |
| `created_at` | timestamptz | **NN**, DF `now()` | `0005:16` |
| `exchange_rate` | numeric(18,4) | DF `1` | `0016_fix:75` |

**Índices:** `idx_accounts_payable_org`, `idx_accounts_payable_status` (`0005:19-20`),
`idx_accounts_payable_supplier` (`0008:20-21`).
**Backfill:** `0008:24-41` enlaza CxP con proveedores cuando el nombre coincide exactamente con
uno solo en la organización.
**RLS:** 🔴 `authenticated_manage/read_accounts_payable` (`0009:299-315`) **más**
`allow_all_accounts_payable` (`0016_fix:80`) + `GRANT ALL`. **Sin aislamiento efectiva.**

> ⚠ `ON DELETE RESTRICT` ⇒ **un proveedor con CxP no se puede eliminar**. La app lo esquiva
> descartando `supplier_id` del payload (`server.ts:5947`).

#### `public.payable_payments` — declarada en `0005:23`

`id` (PK) · `payable_id` (nullable, FK → `accounts_payable(id)` ON DELETE CASCADE) ·
`bank_account_id` (FK → `bank_accounts(id)` ON DELETE SET NULL) · `amount_usd` (**NN**) ·
`amount_ves` (**NN**) · `exchange_rate` (**NN**) · `payment_method` (**NN**) · `reference` ·
`payment_date` (**NN**, DF `now()`).

**RLS:** `authenticated_manage_payable_payments` + `authenticated_read_payable_payments`,
ambos vía `EXISTS(accounts_payable …)` + verificación de organización de la cuenta bancaria
(`0009:317-348`). **Aislamiento intacto** — ninguna migración posterior lo revierte.

### 2.9 Compras internas

#### `public.purchases` — declarada en `0013:9`

`id` (PK) · `organization_id` (FK → `organizations(id)` ON DELETE CASCADE, nullable) ·
`supplier_id` (FK → `suppliers(id)` ON DELETE SET NULL) · `doc_number` (**NN** — correlativo
`CMP-00001`) · `invoice_number` (**NN**) · `purchase_date` (date, **NN**, DF `current_date`) ·
`warehouse` (text, DF **`'Tienda Bella Vista (SP-01)'`** ⚠ nombre de negocio hardcodeado) ·
`payment_type` (**NN**, DF `'CONTADO'`) · `exchange_rate` (**NN**, DF `1`) · `subtotal_usd`,
`total_usd`, `total_ves` (**NN**, DF `0`) · `notes` · `status` (**NN**, DF `'COMPLETADA'`) ·
`bank_account_id` (FK → `bank_accounts(id)` ON DELETE SET NULL) · `payment_method` ·
`payment_reference` · `due_date` (date) · `payable_id` (FK → `accounts_payable(id)` ON DELETE SET NULL) ·
`created_at` (**NN**).

**Índices:** `idx_purchases_org`, `idx_purchases_supplier`, `idx_purchases_doc`, `idx_purchases_date`
(`0013:32-35`).
**RLS:** 🔴 `allow_all_purchases` (`0016_fix:121`) + `GRANT ALL`. **Sin aislamiento.**

#### `public.purchase_items` — declarada en `0013:38`

`id` (PK) · `purchase_id` (**NN**, FK → `purchases(id)` ON DELETE CASCADE) · `product_id`
(FK → `products(id)` ON DELETE SET NULL) · `sku` (**NN**) · `name` (**NN**) · `quantity`
(**NN**, DF `1`) · `unit_cost_usd` (**NN**, DF `0`) · `total_usd`/`total_ves` (**NN**, DF `0`) ·
`created_at` (**NN**).

**Índices:** `idx_purchase_items_purchase`, `idx_purchase_items_product` (`0013:51-52`).
**RLS:** 🔴 `allow_all_purchase_items` (`0016_fix:130`). **Sin aislamiento.**

### 2.10 Tienda

#### `public.shop_customers` — declarada en `0022:6`

`id` (PK, FK → `auth.users(id)` ON DELETE CASCADE) · `email` (**NN**, **UNIQUE**) · `full_name` ·
`phone` · `address` · `created_at` (**NN**, DF `timezone('utc', now())`).

**RLS:** `"Clientes pueden ver su perfil"` — SELECT, `TO authenticated`, `USING (auth.uid() = id)`
(`0022:42`). Sin política INSERT/UPDATE ⇒ solo escribe el servidor con service role
(`server.ts:6530-6532`).
⚠ **Sin `organization_id`** ⇒ la tienda es global, no multi-tenant.

#### `public.customer_wishlist` — declarada en `0022:16`

`id` (PK) · `customer_id` (**NN**, FK → `shop_customers(id)` ON DELETE CASCADE) · `product_id`
(**NN** — ⚠ **sin FK**) · `created_at` (**NN**) · **UNIQUE (customer_id, product_id)**.

**RLS:** `"Clientes pueden ver su lista de deseos"` — `FOR ALL TO authenticated`,
`USING (customer_id = auth.uid())` (`0022:43`). Sin política `anon`.

#### `public.customer_orders` — declarada en `0022:25`

`id` (PK) · `customer_id` (**NN**, FK → `shop_customers(id)` ON DELETE CASCADE) · `items` (jsonb,
**NN**) · `total_usd`/`total_ves` (**NN**) · `status` (**NN**, DF `'pendiente'` — ⚠ **minúsculas**:
`pendiente`/`procesando`/`enviado`/`completado`/`cancelado`) · `shipping_address` ·
`created_at` (**NN**).

**RLS:** `"Clientes pueden ver sus pedidos"` — SELECT, `TO authenticated`,
`USING (customer_id = auth.uid())` (`0022:44`). Sin política INSERT.
⚠ **Sin `organization_id`.**

---

## 3. Funciones y triggers

### 3.1 Funciones

| Función | Tipo | Seguridad | `search_path` | Definida en | Propósito |
|---|---|---|---|---|---|
| `is_org_member(org uuid) → boolean` | SQL, STABLE | **SECURITY DEFINER** | `public` | `0001:13`, redefinida `0002:249-255` | `EXISTS` en `organization_members` para `(organization_id = org, user_id = auth.uid())`. La base de toda política de tenant |
| `is_org_writer(org uuid) → boolean` | SQL, STABLE | **SECURITY DEFINER** | `public` | `0009:62-80` → **redefinida** `0012:3-14` | La versión de `0009` exigía un rol de una lista. **`0012` elimina el filtro de rol** ⇒ cualquier miembro puede escribir |
| `get_my_role() → text` | SQL, STABLE | **SECURITY DEFINER** | `public` | `0021:43-54` | Devuelve `profiles.role` del `auth.uid()` actual, o `'anon'`. La usan las políticas de `profiles` |
| `provision_new_auth_user_organization()` | trigger, PL/pgSQL | **SECURITY DEFINER** | `public` | `0010:2-30` | **Crea organización + membresía** en cada alta: nombre desde `company_name` → prefijo del correo → `'Mi organización'` (máx. 80 chars); inserta `organization_members` con `role='admin'` |
| `handle_new_user()` | trigger, PL/pgSQL | **SECURITY DEFINER** | `public` | `0021:57-109` | **Crea el perfil.** El primer usuario del sistema ⇒ `'gerente'`; si no, el rol de `raw_user_meta_data.role` si ∈ {gerente, administrador, cajero, cliente}, si no `'cliente'`. `full_name` desde `full_name`/`name` o el prefijo del correo. Upsert en `public.profiles` |
| `trg_fn_deduct_product_stock_on_sale()` | trigger, PL/pgSQL | **SECURITY DEFINER** | default | `workspace/0019:41-124` | **Descuenta stock automáticamente.** Ignora SKUs que empiezan por `LIB-`; bloquea el producto (`SELECT … FOR UPDATE`); `new_stock = GREATEST(0, stock − qty)`; actualiza `products.stock`; escribe una fila `'VENTA'` en `inventory_movements` con `previous_stock`/`new_stock`. ⚠ **busca `products` por `sku` solo, sin `organization_id`** ⇒ mutación de stock entre tenants |
| `create_quote(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0011:33-131` | **Genera el número de cotización**: `max(int(doc_number))+1` filtrado por `doc_type='COTIZACION'` y organización, con ceros a 4 (`0011:79-83`); `expires_at = now() + validity_days`; inserta `sales` + `sale_items`; recalcula `subtotal`/`total_usd`/`total_ves`. Requiere `auth.uid()` |
| `convert_quote_to_invoice(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0011:135-286` | **Genera el número de factura** igual que el anterior para `doc_type='FACTURA'` (`0011:196-200`); valida el estado (`Creada`); **valida y descuenta stock real por ítem** (`0011:210-231`, buscado por `sku` **y** `organization_id` — correcto); elimina los ítems sin stock y los reporta en `removed_items`; crea la factura y sus ítems; marca la cotización `Facturada` + `converted_to_sale_id`; crea un `accounts_receivable` si `payment_type='CREDITO'` |
| `reject_quote(p_quote_id uuid)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0011:289-327` | Pone `quote_status='Rechazada'`; se niega si ya estaba `Facturada` |
| `record_bank_movement(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0012:16-126` | **Movimiento bancario atómico.** Valida tipo/importe/tasa/comisión; bloquea la cuenta (`FOR UPDATE`); comprueba `is_org_writer`, `status='Activo'`, moneda ∈ {USD,VES} y saldo suficiente; calcula `balance_delta` (la comisión se suma a las SALIDAS); actualiza `bank_accounts.balance`; inserta la fila de `bank_movements`; la devuelve como jsonb |
| `record_bank_transfer(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0012:128-271` | **Transferencia atómica.** Bloquea ambas cuentas; exige la misma organización y ambas activas; **recalcula el importe destino desde la tasa y rechaza si no coincide** (`0012:215-222`); debita el origen (importe + comisión), acredita el destino; escribe dos `bank_movements` (SALIDA + ENTRADA) |
| `create_payable_with_initial_payment(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0008:94-199` | Crea un `accounts_payable` desde un proveedor (validando `is_org_member`), opcionalmente con un primer `payable_payments` (`'Caja / Inicial'`, ref `PAGO-INI`); estado `PENDIENTE`/`PARCIAL`/**`PAGADA`**; redondeo a 2 decimales |
| `record_payable_payment(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0008:201-323` | Bloquea la CxP y la cuenta bancaria; valida organización, `status='ACTIVO'` (case-insensitive), moneda, importe ≤ saldo y saldo bancario; descuenta `bank_accounts.balance`; actualiza saldo/estado de la CxP (`PAGADA`/`PARCIAL`); inserta `payable_payments` + un `bank_movements` `SALIDA` |
| `record_internal_purchase(...)` | RPC, PL/pgSQL | **SECURITY INVOKER** | `public` | `0013` | Compra interna: correlativo `CMP-00001`, incrementa stock, crea la CxP, movimiento bancario `SALIDA` |

**Permisos de los RPC** (todos con `REVOKE … FROM public, anon` + `GRANT EXECUTE … TO authenticated`):
`0008:325-328` (2 RPCs de CxP) · `0011:330-335` (3 RPCs de cotizaciones) ·
`0012:273-276` (2 RPCs bancarios) · `0013:311-312` (`record_internal_purchase`).

> Todos los RPC son **`SECURITY INVOKER`**: las RLS siguen aplicándose a su DML interno. Es una
> decisión correcta. Los únicos `SECURITY DEFINER` son las funciones de pertenencia/rol y las
> tres de trigger.

### 3.2 Triggers

| Trigger | Tabla | Momento | Evento | Función | Definido en | Qué hace |
|---|---|---|---|---|---|---|
| `on_auth_user_created_provision_organization` | `auth.users` | **AFTER** | INSERT | `provision_new_auth_user_organization()` | `0010:33-36` | Crea la organización + la fila de `organization_members` con rol `admin` |
| `on_auth_user_created_create_profile` | `auth.users` | **AFTER** | INSERT | `handle_new_user()` | `0021:113-116` | Crea/actualiza `public.profiles` con el rol RBAC (el primer usuario = `gerente`) |
| `trg_deduct_product_stock` | `public.sale_items` | **AFTER** | INSERT | `trg_fn_deduct_product_stock_on_sale()` | `workspace/0019:128-131` | Descuenta inventario y escribe el kárdex. ⚠ **fuera de `supabase/migrations/` ⇒ nunca aplicado por herramienta** |

**Orden de disparo:** ambos triggers de `auth.users` son AFTER INSERT, así que PostgreSQL los
dispara **en orden alfabético de nombre**: `on_auth_user_created_create_profile` (`c`) antes
que `on_auth_user_created_provision_organization` (`p`). La provisión de la organización ocurre
por tanto **después** del insert del perfil.

### 3.3 Vistas y buckets de Storage

- **Vistas:** ninguna. No hay `CREATE VIEW` ni `CREATE MATERIALIZED VIEW` en ninguna migración.
  Todo el reporting son *joins embebidos* de PostgREST en tiempo de ejecución
  (p. ej. `server.ts:5117` `'accounts_receivable?select=*,customers(*),receivable_payments(*),sales(*,sale_items(*))'`).
- **Buckets de Storage:** ninguno. No hay `storage.buckets`, ni políticas sobre `storage.objects`,
  ni `upload()`/`storage.from()` en el repositorio. Las imágenes de producto son URLs sueltas en
  `products.image_url`.

---

## 4. Mapa de aislamiento

### 4.1 Con aislamiento intacto

`organizations` · `organization_members` · `products` · `customers` · `sales` ·
`sale_items` (por padre) · `payments` (por padre) · `bank_accounts` · `bank_movements` ·
`payment_methods` · `exchange_rates` · `payable_payments` (por padre) · `audit_logs` ·
`profiles` (solo la propia fila).

### 4.2 Sin aislamiento (abiertas a `anon`)

`branches` · `suppliers` · `accounts_payable` · `accounts_receivable` · `receivable_payments` ·
`purchases` · `purchase_items` · `inventory_movements` · `expenses` · `expense_categories` ·
`expense_payments` · `orders` · `order_items`.

**13 de 30 tablas.** La columna `organization_id` sigue presente en la mayoría: **la intención
de aislamiento sobrevive, solo se perdió la política.** La corrección es un cambio de política
por tabla, sin migración de datos.

### 4.3 Aislamiento por trigger

| Caso | Riesgo |
|---|---|
| Trigger de stock busca por **solo `sku`** (`workspace/0019:59`) | Una venta del tenant B descuenta el stock del tenant A |
| `record_internal_purchase` busca por **solo `sku`, `LIMIT 1`** (`0013:230`) | Mismo riesgo al incrementar stock |
| `convert_quote_to_invoice` busca por `sku` **y** `organization_id` (`0011:212-213`) | ✅ correcto |

---

## 5. Deriva entre la base viva y las migraciones 🔴

**Columnas que usa la aplicación y que ninguna migración crea:**

| Tabla | Columnas ausentes en las migraciones |
|---|---|
| `products` | `cost_usd`, `barcode`, `min_stock`, `unit`, `image_url`, `brand`, `description` |
| `customers` | `code`, `doc_type`, `doc_number`, `credit_limit`, `address`, `orders_count`, `total_spent_usd`, `last_order_date` |
| `branches` | `address` |
| `organizations` | `rif`, `phone`, `address`, `currency` |
| `exchange_rates` | `is_future_rate` |
| `sales` | `rate_source`, `rate_value_date`, `is_future_rate` |

La base viva fue parcheada a mano en el SQL Editor. El código lleva reintentos defensivos
exactamente para esto (`db.ts:498-503`, `db.ts:553-557`, `server.ts:5947`): si PostgREST
responde *"Could not find the '<col>' column"*, se descarta la columna y se reintenta
(hasta 6 veces).

> 📌 **Acción recomendada:** volcar el esquema real de la base viva
> (`pg_dump --schema-only`) y convertirlo en una migración canónica que **sí** se aplique
> desde cero. Eso elimina la divergencia de raíz.

---

## 6. Problemas del cadena de migraciones

1. **Aplicar la cadena en orden falla.** `0001` crea `organizations` con solo
   `(id, name, created_at)`; `0002:16` la re-declara con `currency` pero es no-op; luego
   `0003:9` hace `INSERT INTO organizations (id, name, currency)` → **error: la columna
   "currency" no existe**. La misma trampa afecta a `idx_customers_doc` (`0002:75` sobre
   `doc_number` inexistente), a `create_quote`/`convert_quote_to_invoice` (`0011:89`, `0011:248`),
   a `record_internal_purchase` (`0013:257` sobre `products.cost_usd`) y al trigger de
   `workspace/0019` (`workspace/0019:58`).
2. **Dos archivos `0016_*`** ⇒ colisión de versión en la CLI (§1.1).
3. **`workspace/supabase/migrations/0019_auto_deduct_inventory_stock.sql`** está fuera de la
   carpeta ⇒ nunca se aplica por herramienta. El descuento automático de stock, la escritura del
   kárdex y la convención `LIB-%` están efectivamente **apagados**.
4. **`ADD COLUMN IF NOT EXISTS` nunca modifica una columna existente.** `0016_fix` "corrige"
   `accounts_payable.supplier_name/concept/origin` con defaults/NOT NULL nuevos, pero esas
   columnas ya existían desde `0005` ⇒ sobreviven las definiciones viejas.
5. **`0007_fix_accounts_payable_table.sql`** es un no-op puro.
6. **Ausencia de `config.toml` y `seed.sql`** ⇒ el flujo de migraciones nunca se ha automatizado.

---

## 7. CHECK constraints frente a los valores de la aplicación

| Restricción | Valores permitidos | Conflicto |
|---|---|---|
| `profiles_role_check` | `gerente`, `administrador`, `cajero`, `cliente` | Enviar `'admin'` o `'cashier'` se **rechaza en silencio**. `0010:26` sigue escribiendo `'admin'` en `organization_members.role` (texto libre) ⇒ las dos tablas no coinciden |
| `expenses.status` | `PENDIENTE`, `PAGADO`, `VENCIDO` (masculino) | `accounts_payable`/`accounts_receivable` usan **`PAGADA`** en los RPCs y `PAGADO` en servidor/UI ⇒ los filtros `status = 'PAGADO'` **no encuentran** las filas escritas como `'PAGADA'` (afecta a `Dashboard.tsx:172` y `CompanyHealth.tsx:175,182`) |
| `expenses.amount > 0` | forbidding 0 | Impide registrar un gasto totalmente pagado con residual 0, que es una operación de cierre normal |
| `expenses.currency in ('USD','VES')` | 2 valores | `payment_methods.currency` admite `USDT`/`EUR`/`COP` ⇒ un método en USDT no puede respaldar un gasto |
| `customer_orders.status` | minúsculas | Todos los demás estados del esquema son en mayúsculas |

---

## 8. Integridad referencial

| Restricción | Problema | Efecto |
|---|---|---|
| `products.branch_id` FK | **NO ACTION** (no `SET NULL`): `0001:6` la creó sin `ON DELETE`; `0015:31` la re-declara con `SET NULL` pero el no-op lo impide | **Eliminar una sede con productos falla** |
| `accounts_receivable.customer_id` | **NOT NULL + ON DELETE CASCADE**; `0016_fix:87` intentaría relajarlo (no-op) | No se puede desvincular una CxC de su cliente sin borrarla |
| `accounts_payable.supplier_id` | **ON DELETE RESTRICT** (`0008:15`) | **Un proveedor con CxP no se puede eliminar** |
| `branches.code` | nullable en la práctica | Códigos de sede duplicados o vacíos |
| `products.sku` | sin restricción única | SKUs duplicados ⇒ se actualiza el stock equivocado |
| `sales.doc_number` | sin unicidad por organización | Correlativos duplicados bajo concurrencia |
| `bank_movements.user_name` | `NOT NULL DEFAULT 'Administrador'`, pero los RPCs escriben `auth.uid()::text` | Un UUID en un campo de nombre |
| `payment_methods` / `bank_accounts` | sin índice sobre `organization_id`; `bank_movements` sin ningún índice | Las consultas por tenant hacen seq-scan |
| `uuid-ossp` | instalado en `0002:10` pero sin usar | Todos los UUIDs salen de `pgcrypto` |

---

## 9. Checklist de migración

Antes de cualquier cambio estructural en Supabase:

1. Consultar el esquema real de la base viva (no confiar en las migraciones).
2. Crear `supabase/migrations/00XX_descripcion.sql` **aditivo** (`ALTER TABLE ... ADD COLUMN`,
   nunca `CREATE TABLE IF NOT EXISTS` sobre tablas existentes).
3. Para cambios de RLS: `DROP POLICY IF EXISTS` + `CREATE POLICY` explícita por tabla.
4. **Nunca** reenviar el prefijo `0016`.
5. Aplicar a mano en el SQL Editor y **anotar el orden** en el encabezado del archivo.
6. Verificar con `SELECT * FROM pg_policies WHERE schemaname='public'` que la política final es la
   esperada, no la que "parece" la última del archivo.
7. ⚠ **Preguntar antes de alterar tablas estructurales core** (regla de `AGENTS.md`).
