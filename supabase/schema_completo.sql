-- ============================================================================
-- FRENYER — ESQUEMA COMPLETO DE BASE DE DATOS PARA SUPABASE
-- ============================================================================
-- Crea TODA la estructura del sistema desde cero, en un solo pegado.
--
-- CÓMO USARLO
--   1. Abre un proyecto NUEVO y vacío en Supabase.
--   2. Ve a "SQL Editor" -> "New query".
--   3. Pega TODO este archivo y pulsa "Run".
--   4. Al final del archivo hay consultas de verificación.
--
-- IMPORTANTE
--   * El backend (api/server.ts) debe usar SUPABASE_SERVICE_ROLE_KEY.
--     El bloque 0032 cierra el acceso de anon y authenticated: la aplicación
--     funciona solo a través de la API del servidor. El frontend no necesita
--     la clave anónima.
--   * El orden de los bloques es obligatorio: cada uno depende del anterior.
--   * Este archivo NO borra nada por sí solo. Si lo pegas en una base que ya
--     tiene datos, las tablas existentes se respetan (todo usa "if not exists").
--   * Si ya intentaste ejecutar una versión anterior a medias, ejecuta primero
--     las 3 líneas de reset de abajo para limpiar y volver a empezar.
--
-- SI NECESITAS REINICIAR UNA BASE QUE YA TIENE DATOS
--   Descomenta estas 3 líneas ANTES de ejecutar. Borran TODO el esquema public:
--
--   drop schema if exists public cascade;
--   create schema public;
--   grant usage on schema public to anon, authenticated, service_role;
--
-- NOTA SOBRE 0001_initial.sql
--   Se omite a propósito: crea versiones reducidas de las mismas tablas
--   (customers, products, ...) sin columnas como doc_number, y como el 0002
--   usa "create table if not exists", esas columnas nunca se agregarían. El
--   0002 es el esquema completo y cubre todo (tablas, is_org_member, extensiones
--   y políticas).
--
-- ============================================================================
-- CONTENIDO: 35 TABLAS
-- ============================================================================
--  NÚCLEO
--    organizations               empresas (multi-tenant)
--    organization_members        usuarios por organización y rol
--    profiles                    perfil del usuario (nombre, rol, sucursal)
--    branches                    sucursales
--    audit_logs                  bitácora de acciones
--    app_sessions                sesiones de la aplicación
--
--  CATÁLOGO E INVENTARIO
--    products                    productos con precio USD y stock
--    inventory_movements         kardex de entradas, salidas y ajustes
--
--  CLIENTES Y TIENDA
--    customers                   clientes del negocio
--    shop_customers              clientes de la tienda pública
--    customer_wishlist           lista de deseos
--    customer_orders             pedidos de la tienda
--
--  VENTAS
--    sales                       facturas, notas y cotizaciones (doc_type)
--    sale_items                  renglones de la venta
--    payments                    pagos de la venta
--    orders                      pedidos internos
--    order_items                 renglones del pedido
--    parked_invoices             facturas en espera del POS
--    print_settings              formato de impresión por organización
--
--  CUENTAS POR COBRAR
--    accounts_receivable         deudas de clientes
--    receivable_payments         abonos y cruces de anticipos
--    customer_advances           anticipos a favor del cliente
--    customer_advance_movements  bitácora de anticipos
--
--  COMPRAS Y PROVEEDORES
--    suppliers                   proveedores
--    purchases                   compras
--    purchase_items              renglones de la compra
--    accounts_payable            deudas con proveedores
--    payable_payments            pagos a proveedores
--
--  FINANZAS
--    bank_accounts               cuentas bancarias (USD o VES)
--    bank_movements              movimientos bancarios
--    payment_methods             métodos de pago
--    exchange_rates              tasas de cambio
--    expenses                    gastos
--    expense_categories          categorías de gasto
--    expense_payments            pagos de gastos
--
-- ============================================================================




-- ============================================================================
-- BLOQUE 0002_complete_schema.sql
-- ============================================================================

-- ==============================================================================
-- FRENYER ERP — ESQUEMA COMPLETO Y FUNCIONAL PARA SUPABASE (POSTGRESQL + RLS)
-- ==============================================================================
-- Incluye: Organizaciones, Clientes, Inventarios, Ventas Flash/POS, Facturación,
-- Cuentas Bancarias, Cuentas por Cobrar (CxC), Cajas y Tasas BCV Bimonetarias.
-- ==============================================================================

-- 1. EXTENSIONES
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 2. ESTRUCTURA MULTI-TENANT Y PERFILES
-- ==============================================================================

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    rif text,
    phone text,
    address text,
    currency text not null default 'USD',
    created_at timestamptz not null default now()
);

create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    code text,
    address text,
    created_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    email text,
    role text not null default 'cajero',
    created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member',
    created_at timestamptz not null default now(),
    unique(organization_id, user_id)
);

-- ==============================================================================
-- 3. MÓDULO DE CLIENTES (CRM)
-- ==============================================================================

create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    code text,
    name text not null,
    doc_type text not null default 'Natural (V / E)',
    doc_number text not null,
    phone text,
    email text,
    credit_limit numeric(18, 4) not null default 0,
    address text,
    status text not null default 'Activo',
    orders_count integer not null default 0,
    total_spent_usd numeric(18, 4) not null default 0,
    last_order_date timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_customers_org on public.customers(organization_id);
create index if not exists idx_customers_doc on public.customers(doc_number);

-- ==============================================================================
-- 4. MÓDULO DE INVENTARIO Y CATÁLOGO
-- ==============================================================================

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    sku text not null,
    barcode text,
    name text not null,
    category text not null default 'General',
    cost_usd numeric(18, 4) not null default 0,
    price_usd numeric(18, 4) not null default 0,
    stock numeric(18, 4) not null default 0,
    min_stock numeric(18, 4) not null default 0,
    unit text not null default 'UND',
    image_url text,
    status text not null default 'Activo',
    created_at timestamptz not null default now()
);

create index if not exists idx_products_org on public.products(organization_id);
create index if not exists idx_products_sku on public.products(sku);

-- ==============================================================================
-- 5. MÓDULO DE VENTAS FLASH, POS Y FACTURACIÓN
-- ==============================================================================

create table if not exists public.sales (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    customer_id uuid references public.customers(id) on delete set null,
    user_id uuid references auth.users(id) on delete set null,
    
    -- Documento: FACTURA, NOTA, ESPERA
    doc_type text not null default 'FACTURA',
    doc_number text not null,
    status text not null default 'COMPLETADA', -- COMPLETADA, EN_ESPERA, ANULADA
    
    -- Tipo de Pago: CONTADO, CREDITO
    payment_type text not null default 'CONTADO',
    
    -- Bimonetariedad & Tasa bloqueada
    exchange_rate numeric(18, 4) not null,
    
    -- Importes
    subtotal_usd numeric(18, 4) not null default 0,
    discount_usd numeric(18, 4) not null default 0,
    tax_usd numeric(18, 4) not null default 0,
    igtf_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_sales_org on public.sales(organization_id);
create index if not exists idx_sales_doc on public.sales(doc_number);
create index if not exists idx_sales_status on public.sales(status);

-- Detalle de productos por venta
create table if not exists public.sale_items (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references public.sales(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    sku text not null,
    name text not null,
    quantity numeric(18, 4) not null default 1,
    unit_price_usd numeric(18, 4) not null,
    total_usd numeric(18, 4) not null,
    total_ves numeric(18, 4) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);

-- ==============================================================================
-- 6. MÓDULO DE CAJA, CUENTAS BANCARIAS Y PAGOS
-- ==============================================================================

create table if not exists public.bank_accounts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    bank_name text not null,
    account_number text,
    account_type text not null default 'Corriente', -- Corriente, Ahorro, Custodia, Caja
    currency text not null default 'VES', -- VES, USD
    balance numeric(18, 4) not null default 0,
    status text not null default 'Activo',
    created_at timestamptz not null default now()
);

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid references public.sales(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    method text not null, -- Banco de Venezuela, Banesco, Efectivo USD, Pago Móvil, Zelle
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    reference_number text,
    created_at timestamptz not null default now()
);

-- ==============================================================================
-- 7. MÓDULO DE CUENTAS POR COBRAR (CxC)
-- ==============================================================================

create table if not exists public.accounts_receivable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id uuid not null references public.customers(id) on delete cascade,
    sale_id uuid references public.sales(id) on delete set null,
    doc_number text not null,
    total_usd numeric(18, 4) not null,
    balance_usd numeric(18, 4) not null,
    status text not null default 'PENDIENTE', -- PENDIENTE, PARCIAL, PAGADO
    due_date date,
    created_at timestamptz not null default now()
);

-- Abonos a cuentas por cobrar (liquidables en Bolívares a la tasa del día del abono)
create table if not exists public.receivable_payments (
    id uuid primary key default gen_random_uuid(),
    receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    payment_method text not null,
    reference text,
    payment_date timestamptz not null default now()
);

-- ==============================================================================
-- 8. GESTIÓN DE TASAS BCV E HISTORIAL
-- ==============================================================================

create table if not exists public.exchange_rates (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    base_currency text not null default 'USD',
    quote_currency text not null default 'VES',
    rate numeric(24, 10) not null,
    is_future_rate boolean not null default false,
    source text default 'BCV',
    observed_at timestamptz not null,
    created_at timestamptz not null default now()
);

-- ==============================================================================
-- 9. SEGURIDAD Y POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================================================

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.exchange_rates enable row level security;

-- Función de pertenencia a la organización
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.organization_members m
        where m.organization_id = org and m.user_id = auth.uid()
    );
$$;

-- Políticas de Acceso
create policy "org_member_organizations" on public.organizations for all using (public.is_org_member(id));
create policy "org_member_branches" on public.branches for all using (public.is_org_member(organization_id));
create policy "org_member_customers" on public.customers for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org_member_products" on public.products for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org_member_sales" on public.sales for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org_member_bank_accounts" on public.bank_accounts for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org_member_cxc" on public.accounts_receivable for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org_member_rates" on public.exchange_rates for all using (true);


-- ============================================================================
-- BLOQUE 0003_fix_rls_policies.sql
-- ============================================================================

-- ==============================================================================
-- FRENYER ERP — HABILITACIÓN DE PERMISOS RLS PARA OPERACIÓN EN LÍNEA
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola de Supabase:
-- https://knyqrwpaksawuxoqcayu.supabase.co
-- ==============================================================================

-- 1. Crear Organización por defecto si no existe
INSERT INTO public.organizations (id, name, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Frenyer Principal', 'USD')
ON CONFLICT (id) DO NOTHING;

-- 2. Hacer organization_id opcional (nullable) para facilitar inserciones
ALTER TABLE public.products ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.sales ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.accounts_receivable ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.exchange_rates ALTER COLUMN organization_id DROP NOT NULL;

-- 3. Asignar organización por defecto a columnas
ALTER TABLE public.products ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.customers ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.sales ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.bank_accounts ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.accounts_receivable ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- 4. Habilitar permisos completos de lectura/escritura (RLS permisivo para la app)
DROP POLICY IF EXISTS "members manage products" ON public.products;
DROP POLICY IF EXISTS "org_member_products" ON public.products;
DROP POLICY IF EXISTS "allow_all_products" ON public.products;
CREATE POLICY "allow_all_products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "members manage customers" ON public.customers;
DROP POLICY IF EXISTS "org_member_customers" ON public.customers;
DROP POLICY IF EXISTS "allow_all_customers" ON public.customers;
CREATE POLICY "allow_all_customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_sales" ON public.sales;
DROP POLICY IF EXISTS "allow_all_sales" ON public.sales;
CREATE POLICY "allow_all_sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "allow_all_sale_items" ON public.sale_items;
CREATE POLICY "allow_all_sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_payments" ON public.payments;
DROP POLICY IF EXISTS "allow_all_payments" ON public.payments;
CREATE POLICY "allow_all_payments" ON public.payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "allow_all_bank_accounts" ON public.bank_accounts;
CREATE POLICY "allow_all_bank_accounts" ON public.bank_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_cxc" ON public.accounts_receivable;
DROP POLICY IF EXISTS "allow_all_accounts_receivable" ON public.accounts_receivable;
CREATE POLICY "allow_all_accounts_receivable" ON public.accounts_receivable FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "allow_all_exchange_rates" ON public.exchange_rates;
CREATE POLICY "allow_all_exchange_rates" ON public.exchange_rates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "members can read organizations" ON public.organizations;
DROP POLICY IF EXISTS "org_member_organizations" ON public.organizations;
DROP POLICY IF EXISTS "allow_all_organizations" ON public.organizations;
CREATE POLICY "allow_all_organizations" ON public.organizations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- BLOQUE 0004_bank_movements.sql
-- ============================================================================

-- ==============================================================================
-- FRENYER ERP — MOVIMIENTOS BANCARIOS Y MÉTODOS DE PAGO
-- ==============================================================================

-- 1. Tabla de Movimientos de Cuenta
CREATE TABLE IF NOT EXISTS public.bank_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    bank_account_id uuid references public.bank_accounts(id) on delete cascade,
    type text not null, -- ENTRADA, SALIDA
    concept text not null,
    reference text,
    user_name text not null default 'Administrador',
    rate numeric(18, 4) not null,
    commission numeric(18, 4) not null default 0,
    commission_type text default 'Fija', -- Fija, Porcentual
    amount numeric(18, 4) not null, -- Monto en la moneda de la cuenta
    created_at timestamptz not null default now()
);

-- 2. Tabla de Métodos de Pago del Sistema
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    name text not null,
    currency text not null default 'VES', -- VES, USD, USDT, EUR, COP
    type text not null default 'Transferencia', -- Pago Móvil, Transferencia, Efectivo, Punto de Venta
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    code text,
    created_at timestamptz not null default now()
);

-- 3. Habilitar RLS
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- 4. Crear Políticas permisivas para el ERP
DROP POLICY IF EXISTS "allow_all_bank_movements" ON public.bank_movements;
CREATE POLICY "allow_all_bank_movements" ON public.bank_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_payment_methods" ON public.payment_methods;
CREATE POLICY "allow_all_payment_methods" ON public.payment_methods FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- BLOQUE 0005_accounts_payable.sql
-- ============================================================================

-- ==============================================================================
-- 10. MÓDULO DE CUENTAS POR PAGAR (CxP) Y PAGOS A PROVEEDORES
-- ==============================================================================
create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_name text not null,
    doc_number text not null,
    concept text,
    origin text not null default 'Manual', -- Manual, Gasto, Compra Interna
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE', -- PENDIENTE, PARCIAL, PAGADO
    due_date date,
    description text,
    created_at timestamptz not null default now()
);

create index if not exists idx_accounts_payable_org on public.accounts_payable(organization_id);
create index if not exists idx_accounts_payable_status on public.accounts_payable(status);

-- Abonos a cuentas por pagar
create table if not exists public.payable_payments (
    id uuid primary key default gen_random_uuid(),
    payable_id uuid references public.accounts_payable(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    payment_method text not null,
    reference text,
    payment_date timestamptz not null default now()
);

alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;

create policy "org_member_cxp" on public.accounts_payable for all using (true) with check (true);
create policy "org_member_payable_payments" on public.payable_payments for all using (true) with check (true);


-- ============================================================================
-- BLOQUE 0006_suppliers.sql
-- ============================================================================

-- ==============================================================================
-- FRENYER ERP — MÓDULO DE PROVEEDORES (SUPABASE POSTGRESQL + RLS)
-- ==============================================================================

create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
    code text,
    name text not null,
    doc_type text not null default 'RIF (J / G / V)',
    doc_number text not null,
    contact_person text,
    phone text,
    email text,
    address text,
    category text default 'General',
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'Activo',
    created_at timestamptz not null default now()
);

-- Asegurar columnas si la tabla ya existía previamente
alter table public.suppliers add column if not exists code text;
alter table public.suppliers add column if not exists contact_person text;
alter table public.suppliers add column if not exists phone text;
alter table public.suppliers add column if not exists email text;
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists category text default 'General';
alter table public.suppliers add column if not exists balance_usd numeric(18, 4) not null default 0;
alter table public.suppliers add column if not exists status text not null default 'Activo';

create index if not exists idx_suppliers_org on public.suppliers(organization_id);
create index if not exists idx_suppliers_doc on public.suppliers(doc_number);
create index if not exists idx_suppliers_name on public.suppliers(name);

-- Habilitar RLS
alter table public.suppliers enable row level security;

-- Política de RLS
drop policy if exists "allow_all_suppliers" on public.suppliers;
create policy "allow_all_suppliers" on public.suppliers for all to anon, authenticated using (true) with check (true);


-- ============================================================================
-- BLOQUE 0007_fix_accounts_payable_table.sql
-- ============================================================================

-- Force schema refresh for accounts_payable
create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_name text not null,
    doc_number text not null,
    concept text,
    origin text not null default 'Manual',
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE',
    due_date date,
    description text,
    created_at timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 0008_accounts_payable_supplier_link.sql
-- ============================================================================

-- Vincula las cuentas por pagar con proveedores y garantiza operaciones atómicas.
alter table public.accounts_payable
    add column if not exists supplier_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_payable_supplier_id_fkey'
          and conrelid = 'public.accounts_payable'::regclass
    ) then
        alter table public.accounts_payable
            add constraint accounts_payable_supplier_id_fkey
            foreign key (supplier_id) references public.suppliers(id) on delete restrict;
    end if;
end;
$$;

create index if not exists idx_accounts_payable_supplier
    on public.accounts_payable(supplier_id);

-- Vincula nombres históricos solo cuando identifican un proveedor único en la organización.
with unique_matches as (
    select
        ap.id as payable_id,
        min(s.id::text)::uuid as supplier_id,
        min(s.organization_id::text)::uuid as organization_id
    from public.accounts_payable ap
    join public.suppliers s
      on lower(trim(s.name)) = lower(trim(ap.supplier_name))
     and (ap.organization_id is null or ap.organization_id = s.organization_id)
    group by ap.id
    having count(*) = 1
)
update public.accounts_payable ap
set supplier_id = matches.supplier_id,
    organization_id = coalesce(ap.organization_id, matches.organization_id)
from unique_matches matches
where ap.id = matches.payable_id
  and ap.supplier_id is null;

alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;
alter table public.suppliers enable row level security;

drop policy if exists "org_member_cxp" on public.accounts_payable;
create policy "org_member_cxp"
    on public.accounts_payable
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (
        public.is_org_member(organization_id)
        and (
            supplier_id is null
            or exists (
                select 1
                from public.suppliers s
                where s.id = public.accounts_payable.supplier_id
                  and s.organization_id = public.accounts_payable.organization_id
            )
        )
    );

drop policy if exists "org_member_payable_payments" on public.payable_payments;
create policy "org_member_payable_payments"
    on public.payable_payments
    for all to authenticated
    using (
        exists (
            select 1
            from public.accounts_payable ap
            where ap.id = public.payable_payments.payable_id
              and public.is_org_member(ap.organization_id)
        )
    )
    with check (
        exists (
            select 1
            from public.accounts_payable ap
            where ap.id = public.payable_payments.payable_id
              and public.is_org_member(ap.organization_id)
        )
    );

drop policy if exists "allow_all_suppliers" on public.suppliers;
drop policy if exists "org_member_suppliers" on public.suppliers;
create policy "org_member_suppliers"
    on public.suppliers
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

create or replace function public.create_payable_with_initial_payment(
    p_supplier_id uuid,
    p_doc_number text,
    p_concept text,
    p_origin text,
    p_total_usd numeric,
    p_initial_usd numeric,
    p_issue_date date,
    p_due_date date,
    p_description text,
    p_exchange_rate numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_supplier public.suppliers%rowtype;
    v_payable_id uuid;
    v_total_usd numeric(18, 2);
    v_initial_usd numeric(18, 2);
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para registrar cuentas por pagar.';
    end if;

    select * into v_supplier
    from public.suppliers
    where id = p_supplier_id;

    if not found or v_supplier.organization_id is null
       or not public.is_org_member(v_supplier.organization_id) then
        raise exception 'El proveedor no existe o no pertenece a una organización autorizada.';
    end if;

    v_total_usd := round(p_total_usd, 2);
    v_initial_usd := round(coalesce(p_initial_usd, 0), 2);

    if v_total_usd <= 0 or v_initial_usd < 0 or v_initial_usd > v_total_usd then
        raise exception 'El total o el abono inicial no son válidos.';
    end if;
    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;
    if nullif(trim(p_doc_number), '') is null then
        raise exception 'El número de documento es obligatorio.';
    end if;
    if p_origin not in ('Manual', 'Gasto', 'Compra Interna') then
        raise exception 'El origen de la cuenta por pagar no es válido.';
    end if;

    insert into public.accounts_payable (
        organization_id,
        supplier_id,
        supplier_name,
        doc_number,
        concept,
        origin,
        total_usd,
        balance_usd,
        status,
        created_at,
        due_date,
        description
    )
    values (
        v_supplier.organization_id,
        v_supplier.id,
        v_supplier.name,
        trim(p_doc_number),
        coalesce(nullif(trim(p_concept), ''), 'Obligación comercial'),
        p_origin,
        v_total_usd,
        v_total_usd - v_initial_usd,
        case when v_initial_usd = v_total_usd then 'PAGADA'
             when v_initial_usd > 0 then 'PARCIAL'
             else 'PENDIENTE' end,
        p_issue_date::timestamp at time zone 'America/Caracas',
        p_due_date,
        p_description
    )
    returning id into v_payable_id;

    if v_initial_usd > 0 then
        insert into public.payable_payments (
            payable_id,
            amount_usd,
            amount_ves,
            exchange_rate,
            payment_method,
            reference
        )
        values (
            v_payable_id,
            v_initial_usd,
            round(v_initial_usd * p_exchange_rate, 2),
            p_exchange_rate,
            'Caja / Inicial',
            'PAGO-INI'
        );
    end if;

    return v_payable_id;
end;
$$;

create or replace function public.record_payable_payment(
    p_payable_id uuid,
    p_bank_account_id uuid,
    p_amount_usd numeric,
    p_exchange_rate numeric,
    p_payment_method text,
    p_reference text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_payable public.accounts_payable%rowtype;
    v_bank public.bank_accounts%rowtype;
    v_amount_usd numeric(18, 2);
    v_amount_ves numeric(18, 2);
    v_bank_amount numeric(18, 2);
    v_new_balance numeric(18, 2);
    v_payment_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para registrar pagos.';
    end if;

    select * into v_payable
    from public.accounts_payable
    where id = p_payable_id
    for update;

    if not found or not public.is_org_member(v_payable.organization_id) then
        raise exception 'La cuenta por pagar no existe o no está autorizada.';
    end if;

    select * into v_bank
    from public.bank_accounts
    where id = p_bank_account_id
    for update;

    if not found or v_bank.organization_id <> v_payable.organization_id then
        raise exception 'La cuenta bancaria no existe o pertenece a otra organización.';
    end if;
    if upper(coalesce(v_bank.status, '')) <> 'ACTIVO' then
        raise exception 'La cuenta bancaria está inactiva.';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.';
    end if;
    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;

    v_amount_usd := round(p_amount_usd, 2);
    v_amount_ves := round(v_amount_usd * p_exchange_rate, 2);
    if v_amount_usd <= 0 or v_amount_usd > v_payable.balance_usd then
        raise exception 'El monto debe ser mayor a cero y no superar el saldo pendiente.';
    end if;

    v_bank_amount := case when v_bank.currency = 'VES'
                          then v_amount_ves
                          else v_amount_usd end;
    if v_bank.balance < v_bank_amount then
        raise exception 'La cuenta bancaria no tiene saldo suficiente.';
    end if;

    v_new_balance := round(v_payable.balance_usd - v_amount_usd, 2);

    update public.bank_accounts
    set balance = round(balance - v_bank_amount, 2)
    where id = v_bank.id;

    update public.accounts_payable
    set balance_usd = v_new_balance,
        status = case when v_new_balance = 0 then 'PAGADA' else 'PARCIAL' end
    where id = v_payable.id;

    insert into public.payable_payments (
        payable_id,
        bank_account_id,
        amount_usd,
        amount_ves,
        exchange_rate,
        payment_method,
        reference
    )
    values (
        v_payable.id,
        v_bank.id,
        v_amount_usd,
        v_amount_ves,
        p_exchange_rate,
        coalesce(nullif(trim(p_payment_method), ''), v_bank.bank_name),
        nullif(trim(p_reference), '')
    )
    returning id into v_payment_id;

    insert into public.bank_movements (
        organization_id,
        bank_account_id,
        type,
        concept,
        reference,
        user_name,
        rate,
        commission,
        amount
    )
    values (
        v_payable.organization_id,
        v_bank.id,
        'SALIDA',
        'Pago a Proveedor ' || v_payable.supplier_name || ' - Doc: ' || v_payable.doc_number,
        nullif(trim(p_reference), ''),
        auth.uid()::text,
        p_exchange_rate,
        0,
        v_bank_amount
    );

    return v_payment_id;
end;
$$;

revoke all on function public.create_payable_with_initial_payment(uuid, text, text, text, numeric, numeric, date, date, text, numeric) from public, anon;
revoke all on function public.record_payable_payment(uuid, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_payable_with_initial_payment(uuid, text, text, text, numeric, numeric, date, date, text, numeric) to authenticated;
grant execute on function public.record_payable_payment(uuid, uuid, numeric, numeric, text, text) to authenticated;


-- ============================================================================
-- BLOQUE 0009_lock_down_api_rls.sql
-- ============================================================================

-- Restringe los datos de cada inquilino a usuarios autenticados de su organización.
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_movements enable row level security;
alter table public.payment_methods enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.suppliers enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;

-- Elimina políticas heredadas, pues se combinan de forma permisiva con las nuevas.
drop policy if exists "allow_all_organizations" on public.organizations;
drop policy if exists "org_member_organizations" on public.organizations;
drop policy if exists "members can read organizations" on public.organizations;
drop policy if exists "allow_all_branches" on public.branches;
drop policy if exists "org_member_branches" on public.branches;
drop policy if exists "members read branches" on public.branches;
drop policy if exists "allow_all_organization_members" on public.organization_members;
drop policy if exists "members read memberships" on public.organization_members;
drop policy if exists "allow_all_profiles" on public.profiles;
drop policy if exists "allow_all_products" on public.products;
drop policy if exists "org_member_products" on public.products;
drop policy if exists "members manage products" on public.products;
drop policy if exists "allow_all_customers" on public.customers;
drop policy if exists "org_member_customers" on public.customers;
drop policy if exists "members manage customers" on public.customers;
drop policy if exists "allow_all_sales" on public.sales;
drop policy if exists "org_member_sales" on public.sales;
drop policy if exists "allow_all_sale_items" on public.sale_items;
drop policy if exists "org_member_sale_items" on public.sale_items;
drop policy if exists "allow_all_payments" on public.payments;
drop policy if exists "org_member_payments" on public.payments;
drop policy if exists "allow_all_bank_accounts" on public.bank_accounts;
drop policy if exists "org_member_bank_accounts" on public.bank_accounts;
drop policy if exists "allow_all_bank_movements" on public.bank_movements;
drop policy if exists "allow_all_payment_methods" on public.payment_methods;
drop policy if exists "allow_all_accounts_receivable" on public.accounts_receivable;
drop policy if exists "org_member_cxc" on public.accounts_receivable;
drop policy if exists "allow_all_receivable_payments" on public.receivable_payments;
drop policy if exists "allow_all_exchange_rates" on public.exchange_rates;
drop policy if exists "org_member_rates" on public.exchange_rates;
drop policy if exists "members read rates" on public.exchange_rates;
drop policy if exists "authenticated_read_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_insert_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_update_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_delete_exchange_rates" on public.exchange_rates;
drop policy if exists "allow_all_suppliers" on public.suppliers;
drop policy if exists "org_member_suppliers" on public.suppliers;
drop policy if exists "org_member_cxp" on public.accounts_payable;
drop policy if exists "org_member_payable_payments" on public.payable_payments;

create or replace function public.is_org_writer(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.organization_members membership
        where membership.organization_id = org
          and membership.user_id = auth.uid()
          and lower(coalesce(membership.role, '')) in (
              'admin', 'administrador', 'superadmin', 'gerente',
              'gerente general', 'owner', 'manager', 'member',
              'cajero', 'cashier', 'vendedor', 'seller', 'staff', 'operator'
          )
    );
$$;

create policy "authenticated_read_organizations"
    on public.organizations for select to authenticated
    using (public.is_org_member(id));

create policy "authenticated_read_branches"
    on public.branches for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_read_memberships"
    on public.organization_members for select to authenticated
    using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy "authenticated_read_own_profile"
    on public.profiles for select to authenticated
    using (id = auth.uid());

create policy "authenticated_manage_products"
    on public.products for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_products"
    on public.products for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_customers"
    on public.customers for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_customers"
    on public.customers for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_sales"
    on public.sales for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_sales"
    on public.sales for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_sale_items"
    on public.sale_items for all to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_writer(s.organization_id)
    ))
    with check (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_writer(s.organization_id)
    ));
create policy "authenticated_read_sale_items"
    on public.sale_items for select to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_member(s.organization_id)
    ));

create policy "authenticated_manage_payments"
    on public.payments for all to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_writer(s.organization_id)
    ))
    with check (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_writer(s.organization_id)
    ));
create policy "authenticated_read_payments"
    on public.payments for select to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_member(s.organization_id)
    ));

create policy "authenticated_manage_bank_accounts"
    on public.bank_accounts for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_bank_accounts"
    on public.bank_accounts for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_bank_movements"
    on public.bank_movements for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            bank_account_id is null
            or exists (
                select 1 from public.bank_accounts account
                where account.id = bank_movements.bank_account_id
                  and account.organization_id = bank_movements.organization_id
            )
        )
    );
create policy "authenticated_read_bank_movements"
    on public.bank_movements for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_payment_methods"
    on public.payment_methods for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            bank_account_id is null
            or exists (
                select 1 from public.bank_accounts account
                where account.id = payment_methods.bank_account_id
                  and account.organization_id = payment_methods.organization_id
            )
        )
    );
create policy "authenticated_read_payment_methods"
    on public.payment_methods for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_accounts_receivable"
    on public.accounts_receivable for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and exists (
            select 1 from public.customers customer
            where customer.id = accounts_receivable.customer_id
              and customer.organization_id = accounts_receivable.organization_id
        )
    );
create policy "authenticated_read_accounts_receivable"
    on public.accounts_receivable for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_receivable_payments"
    on public.receivable_payments for all to authenticated
    using (exists (
        select 1 from public.accounts_receivable receivable
        where receivable.id = receivable_payments.receivable_id
          and public.is_org_writer(receivable.organization_id)
    ))
    with check (
        exists (
            select 1 from public.accounts_receivable receivable
            where receivable.id = receivable_payments.receivable_id
              and public.is_org_writer(receivable.organization_id)
        )
        and (
            bank_account_id is null
            or exists (
                select 1
                from public.bank_accounts account
                join public.accounts_receivable receivable
                  on receivable.id = receivable_payments.receivable_id
                where account.id = receivable_payments.bank_account_id
                  and account.organization_id = receivable.organization_id
            )
        )
    );
create policy "authenticated_read_receivable_payments"
    on public.receivable_payments for select to authenticated
    using (exists (
        select 1 from public.accounts_receivable receivable
        where receivable.id = receivable_payments.receivable_id
          and public.is_org_member(receivable.organization_id)
    ));

create policy "authenticated_read_exchange_rates"
    on public.exchange_rates for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_insert_exchange_rates"
    on public.exchange_rates for insert to authenticated
    with check (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_update_exchange_rates"
    on public.exchange_rates for update to authenticated
    using (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ))
    with check (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_delete_exchange_rates"
    on public.exchange_rates for delete to authenticated
    using (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_manage_suppliers"
    on public.suppliers for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_suppliers"
    on public.suppliers for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_accounts_payable"
    on public.accounts_payable for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            supplier_id is null
            or exists (
                select 1 from public.suppliers supplier
                where supplier.id = accounts_payable.supplier_id
                  and supplier.organization_id = accounts_payable.organization_id
            )
        )
    );
create policy "authenticated_read_accounts_payable"
    on public.accounts_payable for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_payable_payments"
    on public.payable_payments for all to authenticated
    using (exists (
        select 1 from public.accounts_payable payable
        where payable.id = payable_payments.payable_id
          and public.is_org_writer(payable.organization_id)
    ))
    with check (
        exists (
            select 1 from public.accounts_payable payable
            where payable.id = payable_payments.payable_id
              and public.is_org_writer(payable.organization_id)
        )
        and (
            bank_account_id is null
            or exists (
                select 1
                from public.bank_accounts account
                join public.accounts_payable payable
                  on payable.id = payable_payments.payable_id
                where account.id = payable_payments.bank_account_id
                  and account.organization_id = payable.organization_id
            )
        )
    );
create policy "authenticated_read_payable_payments"
    on public.payable_payments for select to authenticated
    using (exists (
        select 1 from public.accounts_payable payable
        where payable.id = payable_payments.payable_id
          and public.is_org_member(payable.organization_id)
    ));


-- ============================================================================
-- BLOQUE 0010_auth_signup_organization.sql
-- ============================================================================

-- Crea un espacio aislado para cada nuevo registro y asigna su primer usuario como administrador.
create or replace function public.provision_new_auth_user_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organization_id uuid;
    v_organization_name text;
begin
    v_organization_name := left(
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
            nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
            'Mi organización'
        ),
        80
    );

    insert into public.organizations (name)
    values (v_organization_name)
    returning id into v_organization_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_organization_id, new.id, 'admin');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_provision_organization on auth.users;
create trigger on_auth_user_created_provision_organization
    after insert on auth.users
    for each row
    execute function public.provision_new_auth_user_organization();


-- ============================================================================
-- BLOQUE 0011_quotes_module.sql
-- ============================================================================

-- ==============================================================================
-- MÓDULO DE COTIZACIONES / PRESUPUESTOS (Ventas Flash)
-- ==============================================================================
-- Las cotizaciones se almacenan en la tabla sales con doc_type = 'COTIZACION'.
-- Se añaden columnas de ciclo de vida de cotización y vínculo a la factura
-- generada al convertir.
-- ==============================================================================

alter table public.sales
    add column if not exists quote_status text,          -- Creada, Facturada, Rechazada
    add column if not exists expires_at timestamptz,     -- fecha límite de validez
    add column if not exists converted_to_sale_id uuid;  -- id de la FACTURA generada

-- Vínculo opcional hacia la factura resultante
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'sales_converted_to_sale_id_fkey'
          and conrelid = 'public.sales'::regclass
    ) then
        alter table public.sales
            add constraint sales_converted_to_sale_id_fkey
            foreign key (converted_to_sale_id) references public.sales(id) on delete set null;
    end if;
end;
$$;

create index if not exists idx_sales_quote_status on public.sales(quote_status);
create index if not exists idx_sales_expires_at on public.sales(expires_at);

-- RPC: crea una cotización (encabezado + ítems) de forma atómica.
create or replace function public.create_quote(
    p_customer_id uuid,
    p_validity_days integer,
    p_notes text,
    p_items jsonb,
    p_exchange_rate numeric,
    p_rate_source text default 'BCV',
    p_is_future_rate boolean default false,
    p_rate_value_date timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_org_id uuid;
    v_quote_id uuid;
    v_next int;
    v_doc_number text;
    v_expires_at timestamptz;
    v_item jsonb;
    v_qty numeric(18, 4);
    v_price numeric(18, 4);
    v_subtotal numeric(18, 2) := 0;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para crear cotizaciones.';
    end if;

    select organization_id into v_org_id
    from public.customers
    where id = p_customer_id;

    if v_org_id is null or not public.is_org_member(v_org_id) then
        raise exception 'El cliente no existe o no pertenece a tu organización.';
    end if;

    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;

    if p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'La cotización debe contener al menos un ítem.';
    end if;

    select coalesce(max(nullif(doc_number, '')::int), 0) + 1 into v_next
    from public.sales
    where organization_id = v_org_id
      and doc_type = 'COTIZACION';
    v_doc_number := lpad(v_next::text, 4, '0');

    v_expires_at := now() + make_interval(days => greatest(coalesce(p_validity_days, 7), 1));

    insert into public.sales (
        organization_id, customer_id, doc_type, doc_number, status,
        payment_type, exchange_rate, rate_source, is_future_rate, rate_value_date,
        subtotal_usd, discount_usd, tax_usd, igtf_usd, total_usd, total_ves,
        notes, quote_status, expires_at
    )
    values (
        v_org_id, p_customer_id, 'COTIZACION', v_doc_number, 'COMPLETADA',
        'CONTADO', round(p_exchange_rate, 4), coalesce(p_rate_source, 'BCV'),
        coalesce(p_is_future_rate, false), coalesce(p_rate_value_date, now()),
        0, 0, 0, 0, 0, 0,
        nullif(trim(p_notes), ''), 'Creada', v_expires_at
    )
    returning id into v_quote_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := greatest(coalesce((v_item->>'quantity')::numeric, 1), 1);
        v_price := coalesce(round((v_item->>'unit_price_usd')::numeric, 4), 0);

        insert into public.sale_items (
            sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves
        )
        values (
            v_quote_id,
            nullif(trim(v_item->>'sku'), ''),
            nullif(trim(v_item->>'name'), ''),
            v_qty,
            v_price,
            round(v_price * v_qty, 2),
            round(v_price * v_qty * p_exchange_rate, 2)
        );

        v_subtotal := v_subtotal + round(v_price * v_qty, 2);
    end loop;

    update public.sales
    set subtotal_usd = v_subtotal,
        total_usd = v_subtotal,
        total_ves = round(v_subtotal * p_exchange_rate, 2)
    where id = v_quote_id;

    return v_quote_id;
end;
$$;

-- RPC: convierte una cotización en FACTURA validando stock real.
-- Devuelve los ítems removidos por falta de existencia y el total facturado.
create or replace function public.convert_quote_to_invoice(
    p_quote_id uuid,
    p_payment_type text default 'CONTADO'
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_quote public.sales%rowtype;
    v_org_id uuid;
    v_new_sale_id uuid;
    v_next int;
    v_doc_number text;
    v_item record;
    v_stock numeric(18, 4);
    v_subtotal numeric(18, 2) := 0;
    v_rate numeric(18, 4);
    v_removed jsonb := '[]'::jsonb;
    v_kept_count int := 0;
    v_payment_type text;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para convertir cotizaciones.';
    end if;

    create temp table kept_quote_items (
        sku text,
        name text,
        quantity numeric(18, 4),
        unit_price_usd numeric(18, 4),
        total_usd numeric(18, 2),
        total_ves numeric(18, 2)
    ) on commit drop;

    select * into v_quote
    from public.sales
    where id = p_quote_id
    for update;

    if not found or v_quote.doc_type <> 'COTIZACION' then
        raise exception 'La cotización no existe o no es una cotización válida.';
    end if;

    if not public.is_org_member(v_quote.organization_id) then
        raise exception 'La cotización no pertenece a tu organización.';
    end if;

    if v_quote.quote_status = 'Facturada' then
        raise exception 'Esta cotización ya fue convertida en factura.';
    end if;

    if v_quote.quote_status = 'Rechazada' then
        raise exception 'No se puede convertir una cotización rechazada.';
    end if;

    v_org_id := v_quote.organization_id;
    v_rate := v_quote.exchange_rate;
    v_payment_type := coalesce(p_payment_type, v_quote.payment_type, 'CONTADO');

    select coalesce(max(nullif(doc_number, '')::int), 0) + 1 into v_next
    from public.sales
    where organization_id = v_org_id
      and doc_type = 'FACTURA';
    v_doc_number := lpad(v_next::text, 4, '0');

    -- Validación de inventario: sólo se facturan ítems con existencia real.
    -- Los ítems sin stock se remueven de la carga y se reportan al operador.
    for v_item in
        select si.*
        from public.sale_items si
        where si.sale_id = v_quote.id
        order by si.created_at
    loop
        select stock into v_stock
        from public.products
        where sku = v_item.sku
          and organization_id = v_org_id;

        if v_stock is null or v_stock <= 0 or v_item.quantity > v_stock then
            v_removed := v_removed || jsonb_build_object(
                'sku', v_item.sku,
                'name', v_item.name,
                'quantity', v_item.quantity,
                'available', coalesce(v_stock, 0),
                'reason', case
                    when v_stock is null then 'Producto no encontrado en inventario'
                    when v_stock <= 0 then 'Sin stock disponible'
                    else 'Stock insuficiente'
                end
            );
        else
            update public.products
            set stock = round(stock - v_item.quantity, 4)
            where sku = v_item.sku
              and organization_id = v_org_id;

            insert into kept_quote_items
            values (v_item.sku, v_item.name, v_item.quantity, v_item.unit_price_usd, v_item.total_usd, v_item.total_ves);

            v_subtotal := v_subtotal + v_item.total_usd;
            v_kept_count := v_kept_count + 1;
        end if;
    end loop;

    if v_subtotal <= 0 then
        drop table kept_quote_items;
        raise exception 'Ningún ítem de la cotización cuenta con stock disponible. No se puede generar la factura.';
    end if;

    insert into public.sales (
        organization_id, customer_id, doc_type, doc_number, status,
        payment_type, exchange_rate, rate_source, is_future_rate, rate_value_date,
        subtotal_usd, discount_usd, tax_usd, igtf_usd, total_usd, total_ves,
        notes
    )
    values (
        v_org_id, v_quote.customer_id, 'FACTURA', v_doc_number, 'COMPLETADA',
        v_payment_type, v_rate, coalesce(v_quote.rate_source, 'BCV'),
        coalesce(v_quote.is_future_rate, false), coalesce(v_quote.rate_value_date, now()),
        v_subtotal, 0, 0, 0, v_subtotal, round(v_subtotal * v_rate, 2),
        'Factura generada desde cotización ' || v_quote.doc_number
    )
    returning id into v_new_sale_id;

    insert into public.sale_items (sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves)
    select v_new_sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves
    from kept_quote_items;

    update public.sales
    set quote_status = 'Facturada',
        converted_to_sale_id = v_new_sale_id
    where id = v_quote.id;

    if v_payment_type = 'CREDITO' then
        insert into public.accounts_receivable (
            organization_id, customer_id, sale_id, doc_number, total_usd, balance_usd, status
        )
        values (v_org_id, v_quote.customer_id, v_new_sale_id, v_doc_number, v_subtotal, v_subtotal, 'PENDIENTE');
    end if;

    return jsonb_build_object(
        'success', true,
        'invoice_id', v_new_sale_id,
        'invoice_doc_number', v_doc_number,
        'total_usd', v_subtotal,
        'removed_items', v_removed,
        'kept_count', v_kept_count
    );
end;
$$;

-- RPC: cambia el estado de una cotización a Rechazada.
create or replace function public.reject_quote(
    p_quote_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_quote public.sales%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.';
    end if;

    select * into v_quote
    from public.sales
    where id = p_quote_id
    for update;

    if not found or v_quote.doc_type <> 'COTIZACION' then
        raise exception 'La cotización no existe.';
    end if;

    if not public.is_org_member(v_quote.organization_id) then
        raise exception 'La cotización no pertenece a tu organización.';
    end if;

    if v_quote.quote_status = 'Facturada' then
        raise exception 'No se puede rechazar una cotización ya facturada.';
    end if;

    update public.sales
    set quote_status = 'Rechazada'
    where id = v_quote.id;

    return true;
end;
$$;

-- Seguridad: solo miembros autenticados de la organización pueden ejecutar las RPCs.
revoke all on function public.create_quote(uuid, integer, text, jsonb, numeric, text, boolean, timestamptz) from public, anon;
revoke all on function public.convert_quote_to_invoice(uuid, text) from public, anon;
revoke all on function public.reject_quote(uuid) from public, anon;
grant execute on function public.create_quote(uuid, integer, text, jsonb, numeric, text, boolean, timestamptz) to authenticated;
grant execute on function public.convert_quote_to_invoice(uuid, text) to authenticated;
grant execute on function public.reject_quote(uuid) to authenticated;


-- ============================================================================
-- BLOQUE 0012_atomic_bank_movements.sql
-- ============================================================================

-- Función de permisos de escritura: miembros autenticados de la organización.
-- Se define aquí porque las políticas y RPCs previas sólo cuentan con is_org_member.
create or replace function public.is_org_writer(org uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.organization_members m
        where m.organization_id = org
          and m.user_id = auth.uid()
    );
$$;

create or replace function public.record_bank_movement(
    p_bank_account_id uuid,
    p_type text,
    p_amount numeric,
    p_rate numeric,
    p_concept text,
    p_reference text default null,
    p_commission numeric default 0,
    p_commission_type text default 'Fija'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_bank public.bank_accounts%rowtype;
    v_amount numeric(18, 2);
    v_commission numeric(18, 2);
    v_balance_delta numeric(18, 2);
    v_movement public.bank_movements%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
    end if;
    if p_type not in ('ENTRADA', 'SALIDA') then
        raise exception 'El tipo de movimiento no es válido.' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'El monto debe ser mayor a cero.' using errcode = '22023';
    end if;
    if p_rate is null or p_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;
    if coalesce(p_commission, 0) < 0 then
        raise exception 'La comisión no puede ser negativa.' using errcode = '22023';
    end if;
    if coalesce(p_commission_type, 'Fija') not in ('Fija', 'Porcentual') then
        raise exception 'El tipo de comisión no es válido.' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_concept, '')), '') is null then
        raise exception 'El concepto del movimiento es obligatorio.' using errcode = '22023';
    end if;

    select *
    into v_bank
    from public.bank_accounts
    where id = p_bank_account_id
    for update;

    if not found then
        raise exception 'Cuenta bancaria no encontrada o sin acceso.' using errcode = 'P0002';
    end if;
    if not public.is_org_writer(v_bank.organization_id) then
        raise exception 'No tiene permisos para modificar esta cuenta.' using errcode = '42501';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_amount := round(p_amount, 2);
    v_commission := case
        when coalesce(p_commission_type, 'Fija') = 'Porcentual'
            then round(v_amount * coalesce(p_commission, 0) / 100, 2)
        else round(coalesce(p_commission, 0), 2)
    end;
    v_balance_delta := case
        when p_type = 'ENTRADA' then v_amount
        else -(v_amount + v_commission)
    end;

    if p_type = 'SALIDA' and round(coalesce(v_bank.balance, 0), 2) < abs(v_balance_delta) then
        raise exception 'La cuenta bancaria no tiene saldo suficiente.' using errcode = '22023';
    end if;

    update public.bank_accounts
    set balance = round(balance + v_balance_delta, 2)
    where id = v_bank.id;

    insert into public.bank_movements (
        organization_id,
        bank_account_id,
        type,
        concept,
        reference,
        user_name,
        rate,
        commission,
        commission_type,
        amount
    )
    values (
        v_bank.organization_id,
        v_bank.id,
        p_type,
        trim(p_concept),
        nullif(trim(coalesce(p_reference, '')), ''),
        auth.uid()::text,
        p_rate,
        v_commission,
        coalesce(p_commission_type, 'Fija'),
        v_amount
    )
    returning * into v_movement;

    return to_jsonb(v_movement);
end;
$$;

create or replace function public.record_bank_transfer(
    p_source_account_id uuid,
    p_target_account_id uuid,
    p_source_amount numeric,
    p_target_amount numeric,
    p_rate numeric,
    p_concept text,
    p_reference text default null,
    p_commission numeric default 0,
    p_commission_type text default 'Fija'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_bank public.bank_accounts%rowtype;
    v_source public.bank_accounts%rowtype;
    v_target public.bank_accounts%rowtype;
    v_account_count integer := 0;
    v_source_amount numeric(18, 2);
    v_target_amount numeric(18, 2);
    v_commission numeric(18, 2);
    v_source_movement public.bank_movements%rowtype;
    v_target_movement public.bank_movements%rowtype;
    v_reference text;
    v_concept text;
    v_expected_target_amount numeric(18, 2);
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
    end if;
    if p_source_account_id is null or p_target_account_id is null
       or p_source_account_id = p_target_account_id then
        raise exception 'Selecciona cuentas de origen y destino diferentes.' using errcode = '22023';
    end if;
    if p_source_amount is null or p_source_amount <= 0
       or p_target_amount is null or p_target_amount <= 0 then
        raise exception 'Los montos de origen y destino deben ser mayores a cero.' using errcode = '22023';
    end if;
    if p_rate is null or p_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;
    if coalesce(p_commission, 0) < 0 then
        raise exception 'La comisión no puede ser negativa.' using errcode = '22023';
    end if;
    if coalesce(p_commission_type, 'Fija') not in ('Fija', 'Porcentual') then
        raise exception 'El tipo de comisión no es válido.' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_concept, '')), '') is null then
        raise exception 'El concepto de la transferencia es obligatorio.' using errcode = '22023';
    end if;

    for v_bank in
        select *
        from public.bank_accounts
        where id in (p_source_account_id, p_target_account_id)
        order by id
        for update
    loop
        v_account_count := v_account_count + 1;
        if not public.is_org_writer(v_bank.organization_id) then
            raise exception 'No tiene permisos para modificar una de las cuentas.' using errcode = '42501';
        end if;
        if v_bank.status <> 'Activo' then
            raise exception 'Las cuentas de la transferencia deben estar activas.' using errcode = '22023';
        end if;
        if v_bank.currency not in ('USD', 'VES') then
            raise exception 'Las cuentas deben estar denominadas en USD o VES.' using errcode = '22023';
        end if;
        if v_bank.id = p_source_account_id then
            v_source := v_bank;
        else
            v_target := v_bank;
        end if;
    end loop;

    if v_account_count <> 2 then
        raise exception 'Una o ambas cuentas no existen o no son accesibles.' using errcode = 'P0002';
    end if;
    if v_source.organization_id <> v_target.organization_id then
        raise exception 'No se permiten transferencias entre organizaciones.' using errcode = '42501';
    end if;

    v_source_amount := round(p_source_amount, 2);
    v_target_amount := round(p_target_amount, 2);
    v_expected_target_amount := case
        when v_source.currency = v_target.currency then v_source_amount
        when v_source.currency = 'VES' then round(v_source_amount / p_rate, 2)
        else round(v_source_amount * p_rate, 2)
    end;
    if v_target_amount <> v_expected_target_amount then
        raise exception 'El monto destino no coincide con la conversión de monedas a la tasa indicada.' using errcode = '22023';
    end if;
    v_commission := case
        when coalesce(p_commission_type, 'Fija') = 'Porcentual'
            then round(v_source_amount * coalesce(p_commission, 0) / 100, 2)
        else round(coalesce(p_commission, 0), 2)
    end;
    if round(coalesce(v_source.balance, 0), 2) < v_source_amount + v_commission then
        raise exception 'La cuenta de origen no tiene saldo suficiente.' using errcode = '22023';
    end if;

    update public.bank_accounts
    set balance = round(balance - v_source_amount - v_commission, 2)
    where id = v_source.id;

    update public.bank_accounts
    set balance = round(balance + v_target_amount, 2)
    where id = v_target.id;

    v_reference := nullif(trim(coalesce(p_reference, '')), '');
    v_concept := trim(p_concept);

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        v_source.organization_id, v_source.id, 'SALIDA',
        v_concept || ' - Transferencia enviada a ' || v_target.bank_name,
        v_reference, auth.uid()::text, p_rate, v_commission,
        coalesce(p_commission_type, 'Fija'), v_source_amount
    )
    returning * into v_source_movement;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        v_target.organization_id, v_target.id, 'ENTRADA',
        v_concept || ' - Transferencia recibida de ' || v_source.bank_name,
        v_reference, auth.uid()::text, p_rate, 0, 'Fija', v_target_amount
    )
    returning * into v_target_movement;

    return jsonb_build_object(
        'source_movement', to_jsonb(v_source_movement),
        'target_movement', to_jsonb(v_target_movement)
    );
end;
$$;

revoke all on function public.record_bank_movement(uuid, text, numeric, numeric, text, text, numeric, text) from public, anon;
revoke all on function public.record_bank_transfer(uuid, uuid, numeric, numeric, numeric, text, text, numeric, text) from public, anon;
grant execute on function public.record_bank_movement(uuid, text, numeric, numeric, text, text, numeric, text) to authenticated;
grant execute on function public.record_bank_transfer(uuid, uuid, numeric, numeric, numeric, text, text, numeric, text) to authenticated;


-- ============================================================================
-- BLOQUE 0013_purchases_module.sql
-- ============================================================================

-- ==============================================================================
-- 0013_purchases_module.sql: MÓDULO DE COMPRAS E INGRESO DE INVENTARIO
-- ==============================================================================
-- Proporciona las tablas purchases y purchase_items, políticas RLS, correlativos
-- automáticos e integración transaccional con productos, cuentas por pagar y bancos.
-- ==============================================================================

-- 1. TABLA PRINCIPAL DE COMPRAS
create table if not exists public.purchases (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_id uuid references public.suppliers(id) on delete set null,
    doc_number text not null, -- Correlativo interno (e.g. CMP-00001)
    invoice_number text not null, -- N° de Factura o Control del Proveedor
    purchase_date date not null default current_date,
    warehouse text default 'Tienda Bella Vista (SP-01)',
    payment_type text not null default 'CONTADO', -- CONTADO, CREDITO
    exchange_rate numeric(18, 4) not null default 1,
    subtotal_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    notes text,
    status text not null default 'COMPLETADA', -- COMPLETADA, ANULADA
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    payment_method text,
    payment_reference text,
    due_date date,
    payable_id uuid references public.accounts_payable(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_purchases_org on public.purchases(organization_id);
create index if not exists idx_purchases_supplier on public.purchases(supplier_id);
create index if not exists idx_purchases_doc on public.purchases(doc_number);
create index if not exists idx_purchases_date on public.purchases(purchase_date);

-- 2. TABLA DE ÍTEMS DE COMPRA
create table if not exists public.purchase_items (
    id uuid primary key default gen_random_uuid(),
    purchase_id uuid not null references public.purchases(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    sku text not null,
    name text not null,
    quantity numeric(18, 4) not null default 1,
    unit_cost_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

-- 3. HABILITACIÓN DE SEGURIDAD RLS
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "org_member_purchases" on public.purchases;
create policy "org_member_purchases"
    on public.purchases
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "org_member_purchase_items" on public.purchase_items;
create policy "org_member_purchase_items"
    on public.purchase_items
    for all to authenticated
    using (
        exists (
            select 1 from public.purchases p
            where p.id = public.purchase_items.purchase_id
              and public.is_org_member(p.organization_id)
        )
    )
    with check (
        exists (
            select 1 from public.purchases p
            where p.id = public.purchase_items.purchase_id
              and public.is_org_member(p.organization_id)
        )
    );

-- 4. FUNCIÓN TRANSACCIONAL: REGISTRAR COMPRA E INCREMENTAR STOCK
create or replace function public.record_internal_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_invoice_number text,
    p_purchase_date date,
    p_warehouse text,
    p_payment_type text,
    p_exchange_rate numeric,
    p_notes text,
    p_update_costs boolean,
    p_items jsonb,
    p_bank_account_id uuid default null,
    p_payment_method text default null,
    p_payment_reference text default null,
    p_due_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_supplier public.suppliers%rowtype;
    v_next_num integer;
    v_doc_number text;
    v_purchase_id uuid;
    v_payable_id uuid;
    v_total_usd numeric(18, 4) := 0;
    v_total_ves numeric(18, 4) := 0;
    v_item jsonb;
    v_prod_id uuid;
    v_sku text;
    v_name text;
    v_qty numeric(18, 4);
    v_cost numeric(18, 4);
    v_item_tot_usd numeric(18, 4);
    v_item_tot_ves numeric(18, 4);
    v_bank public.bank_accounts%rowtype;
    v_bank_deduct numeric(18, 4);
begin
    -- 1. Validar proveedor
    if p_supplier_id is not null then
        select * into v_supplier from public.suppliers where id = p_supplier_id;
    end if;

    -- 2. Calcular correlativo doc_number: CMP-00001
    select coalesce(max(nullif(regexp_replace(doc_number, '\D', '', 'g'), '')::integer), 0) + 1
    into v_next_num
    from public.purchases
    where organization_id = p_organization_id;

    v_doc_number := 'CMP-' || lpad(v_next_num::text, 5, '0');

    -- 3. Calcular totales sumando ítems
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := coalesce((v_item->>'quantity')::numeric, 1);
        v_cost := coalesce((v_item->>'unit_cost_usd')::numeric, 0);
        v_item_tot_usd := round(v_qty * v_cost, 2);
        v_total_usd := v_total_usd + v_item_tot_usd;
    end loop;

    v_total_ves := round(v_total_usd * coalesce(p_exchange_rate, 1), 2);

    -- 4. Si es Crédito, crear la cuenta por pagar vinculada
    if upper(coalesce(p_payment_type, 'CONTADO')) = 'CREDITO' and p_supplier_id is not null then
        insert into public.accounts_payable (
            organization_id,
            supplier_id,
            supplier_name,
            doc_number,
            concept,
            origin,
            total_usd,
            balance_usd,
            status,
            created_at,
            due_date,
            description
        ) values (
            p_organization_id,
            p_supplier_id,
            coalesce(v_supplier.name, 'Proveedor'),
            coalesce(nullif(trim(p_invoice_number), ''), v_doc_number),
            'Compra de inventario (' || v_doc_number || ')',
            'Compra Interna',
            v_total_usd,
            v_total_usd,
            'PENDIENTE',
            p_purchase_date::timestamp at time zone 'America/Caracas',
            coalesce(p_due_date, p_purchase_date + interval '30 days'),
            p_notes
        ) returning id into v_payable_id;
    end if;

    -- 5. Insertar cabecera de la compra
    insert into public.purchases (
        organization_id,
        supplier_id,
        doc_number,
        invoice_number,
        purchase_date,
        warehouse,
        payment_type,
        exchange_rate,
        subtotal_usd,
        total_usd,
        total_ves,
        notes,
        status,
        bank_account_id,
        payment_method,
        payment_reference,
        due_date,
        payable_id
    ) values (
        p_organization_id,
        p_supplier_id,
        v_doc_number,
        coalesce(nullif(trim(p_invoice_number), ''), v_doc_number),
        p_purchase_date,
        coalesce(nullif(trim(p_warehouse), ''), 'Tienda Bella Vista (SP-01)'),
        upper(coalesce(p_payment_type, 'CONTADO')),
        coalesce(p_exchange_rate, 1),
        v_total_usd,
        v_total_usd,
        v_total_ves,
        p_notes,
        'COMPLETADA',
        p_bank_account_id,
        p_payment_method,
        p_payment_reference,
        p_due_date,
        v_payable_id
    ) returning id into v_purchase_id;

    -- 6. Insertar ítems de compra e incrementar stock en catálogo
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_sku := trim(v_item->>'sku');
        v_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Producto');
        v_qty := coalesce((v_item->>'quantity')::numeric, 1);
        v_cost := coalesce((v_item->>'unit_cost_usd')::numeric, 0);
        v_item_tot_usd := round(v_qty * v_cost, 2);
        v_item_tot_ves := round(v_item_tot_usd * coalesce(p_exchange_rate, 1), 2);

        -- Localizar producto por SKU
        select id into v_prod_id from public.products where sku = v_sku limit 1;

        insert into public.purchase_items (
            purchase_id,
            product_id,
            sku,
            name,
            quantity,
            unit_cost_usd,
            total_usd,
            total_ves
        ) values (
            v_purchase_id,
            v_prod_id,
            v_sku,
            v_name,
            v_qty,
            v_cost,
            v_item_tot_usd,
            v_item_tot_ves
        );

        -- Incrementar stock y opcionalmente actualizar costo unitario
        if v_prod_id is not null then
            if p_update_costs and v_cost > 0 then
                update public.products
                set stock = stock + v_qty,
                    cost_usd = v_cost
                where id = v_prod_id;
            else
                update public.products
                set stock = stock + v_qty
                where id = v_prod_id;
            end if;
        end if;
    end loop;

    -- 7. Si es Contado y se vinculó una cuenta bancaria, registrar egreso
    if upper(coalesce(p_payment_type, 'CONTADO')) = 'CONTADO' and p_bank_account_id is not null then
        select * into v_bank from public.bank_accounts where id = p_bank_account_id;
        if found then
            v_bank_deduct := case when v_bank.currency = 'VES' then v_total_ves else v_total_usd end;
            update public.bank_accounts
            set balance = round(balance - v_bank_deduct, 2)
            where id = v_bank.id;

            insert into public.bank_movements (
                organization_id,
                bank_account_id,
                type,
                concept,
                reference,
                user_name,
                rate,
                commission,
                amount
            ) values (
                p_organization_id,
                v_bank.id,
                'SALIDA',
                'Compra de inventario - Factura: ' || coalesce(p_invoice_number, v_doc_number),
                nullif(trim(p_payment_reference), ''),
                'Sistema / Compras',
                coalesce(p_exchange_rate, 1),
                0,
                v_bank_deduct
            );
        end if;
    end if;

    return jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'doc_number', v_doc_number,
        'total_usd', v_total_usd,
        'total_ves', v_total_ves,
        'payable_id', v_payable_id
    );
end;
$$;

revoke all on function public.record_internal_purchase from public, anon;
grant execute on function public.record_internal_purchase to authenticated;


-- ============================================================================
-- BLOQUE 0014_ensure_suppliers_columns.sql
-- ============================================================================

-- ==============================================================================
-- 0014_ensure_suppliers_columns.sql: GARANTIZAR COLUMNAS EN PUBLIC.SUPPLIERS
-- ==============================================================================
-- Asegura que todas las columnas necesarias en suppliers existan incluso si
-- la tabla se creó previamente en versiones preliminares sin address u otros campos.
-- ==============================================================================

alter table if exists public.suppliers add column if not exists code text;
alter table if exists public.suppliers add column if not exists contact_person text;
alter table if exists public.suppliers add column if not exists phone text;
alter table if exists public.suppliers add column if not exists email text;
alter table if exists public.suppliers add column if not exists address text;
alter table if exists public.suppliers add column if not exists category text default 'General';
alter table if exists public.suppliers add column if not exists balance_usd numeric(18, 4) not null default 0;
alter table if exists public.suppliers add column if not exists status text not null default 'Activo';

-- Forzar recarga inmediata de la caché de esquemas de PostgREST
notify pgrst, 'reload schema';


-- ============================================================================
-- BLOQUE 0015_branches_warehouses.sql
-- ============================================================================

-- ==============================================================================
-- 0015_branches_warehouses.sql: GESTIÓN DE SEDES, ALMACENES Y CAJAS
-- ==============================================================================
-- Crea y asegura la estructura de sedes/sucursales físicas y almacenes (public.branches)
-- y asocia la llave foránea con el catálogo de productos (public.products).

-- 1. Asegurar tabla public.branches y sus columnas completas
create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    code text not null default 'SUC-01',
    name text not null,
    address text,
    phone text,
    status text not null default 'Habilitada',
    is_active boolean not null default true,
    cash_registers integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Asegurar columnas si la tabla ya existía previamente con esquema reducido
alter table public.branches add column if not exists code text;
alter table public.branches add column if not exists phone text;
alter table public.branches add column if not exists status text default 'Habilitada';
alter table public.branches add column if not exists is_active boolean default true;
alter table public.branches add column if not exists cash_registers integer default 0;
alter table public.branches add column if not exists updated_at timestamptz default now();

-- 2. Asegurar campo branch_id en public.products
alter table public.products add column if not exists branch_id uuid references public.branches(id) on delete set null;

-- Índices de consulta rápida
create index if not exists idx_branches_org on public.branches(organization_id);
create index if not exists idx_products_branch on public.products(branch_id);

-- 3. Habilitar y actualizar políticas de Row Level Security (RLS)
alter table public.branches enable row level security;

alter table public.branches alter column organization_id drop not null;
alter table public.branches alter column organization_id set default '00000000-0000-0000-0000-000000000001';

drop policy if exists "org_member_branches" on public.branches;
drop policy if exists "members read branches" on public.branches;
drop policy if exists "allow_all_branches" on public.branches;
drop policy if exists "authenticated_manage_branches" on public.branches;
drop policy if exists "authenticated_read_branches" on public.branches;

create policy "allow_all_branches"
    on public.branches for all to anon, authenticated
    using (true)
    with check (true);

-- Permisos
grant all on table public.branches to authenticated;
grant all on table public.branches to anon;


-- ============================================================================
-- BLOQUE 0016_expenses_module.sql
-- ============================================================================

-- ==============================================================================
-- 0016_expenses_module.sql: MÓDULO DE CONTROL FINANCIERO DE GASTOS FIJOS Y VARIABLES
-- ==============================================================================
-- Esquema para la administración de gastos operativos, categorías personalizadas,
-- reprogramación periódica y registro de pagos bimonetarios con impacto en tesorería.

-- 1. Tabla de Categorías de Gastos
create table if not exists public.expense_categories (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    is_default boolean not null default false,
    created_at timestamptz not null default now()
);

-- Asegurar unicidad por organización
create unique index if not exists idx_expense_categories_org_name 
    on public.expense_categories(organization_id, lower(trim(name)));

-- 2. Tabla Principal de Gastos (Fijos y Variables)
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    name text not null,
    description text not null,
    category text not null,
    type text not null default 'FIJO' check (type in ('FIJO', 'VARIABLE')),
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'USD' check (currency in ('USD', 'VES')),
    exchange_rate numeric(12,4) not null default 1.0000,
    due_date date not null default current_date,
    last_payment_date date,
    frequency text default 'MENSUAL' check (frequency is null or frequency in ('SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
    status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'PAGADO', 'VENCIDO')),
    notes text,
    payment_account_id uuid references public.bank_accounts(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Columnas añadidas por idoneidad en esquemas existentes
alter table public.expenses add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.expenses add column if not exists last_payment_date date;
alter table public.expenses add column if not exists notes text;
alter table public.expenses add column if not exists payment_account_id uuid references public.bank_accounts(id) on delete set null;

-- 3. Tabla de Pagos de Gastos (Historial y Auditoría de Tesorería)
create table if not exists public.expense_payments (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'USD' check (currency in ('USD', 'VES')),
    exchange_rate numeric(12,4) not null default 1.0000,
    paid_at timestamptz not null default now(),
    payment_method text not null default 'Transferencia bancaria',
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    reference text,
    notes text,
    created_at timestamptz not null default now()
);

-- Índices de consulta rápida
create index if not exists idx_expenses_org on public.expenses(organization_id);
create index if not exists idx_expenses_type on public.expenses(organization_id, type);
create index if not exists idx_expenses_due_date on public.expenses(organization_id, due_date);
create index if not exists idx_expenses_status on public.expenses(organization_id, status);
create index if not exists idx_expense_payments_expense on public.expense_payments(expense_id);
create index if not exists idx_expense_payments_org on public.expense_payments(organization_id);

-- 4. Habilitar Row Level Security (RLS)
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;

-- Limpiar políticas restrictivas o previas
drop policy if exists "authenticated_manage_expense_categories" on public.expense_categories;
drop policy if exists "allow_all_expense_categories" on public.expense_categories;
drop policy if exists "org_member_expense_categories" on public.expense_categories;
drop policy if exists "expense_categories_policy" on public.expense_categories;

drop policy if exists "authenticated_manage_expenses" on public.expenses;
drop policy if exists "allow_all_expenses" on public.expenses;
drop policy if exists "org_member_expenses" on public.expenses;
drop policy if exists "expenses_policy" on public.expenses;

drop policy if exists "authenticated_manage_expense_payments" on public.expense_payments;
drop policy if exists "allow_all_expense_payments" on public.expense_payments;
drop policy if exists "org_member_expense_payments" on public.expense_payments;
drop policy if exists "expense_payments_policy" on public.expense_payments;

-- Políticas universales seguras para anon y authenticated
create policy "allow_all_expense_categories"
    on public.expense_categories
    for all
    to anon, authenticated
    using (true)
    with check (true);

create policy "allow_all_expenses"
    on public.expenses
    for all
    to anon, authenticated
    using (true)
    with check (true);

create policy "allow_all_expense_payments"
    on public.expense_payments
    for all
    to anon, authenticated
    using (true)
    with check (true);

-- Permisos completos para anon y authenticated
grant all on table public.expense_categories to anon, authenticated;
grant all on table public.expenses to anon, authenticated;
grant all on table public.expense_payments to anon, authenticated;


-- ============================================================================
-- BLOQUE 0016_fix_suppliers_payables_purchases.sql
-- ============================================================================

-- ==============================================================================
-- 0016_fix_suppliers_payables_purchases.sql: CONCILIACIÓN DE PROVEEDORES,
-- CUENTAS POR PAGAR, CUENTAS POR COBRAR Y COMPRAS A CRÉDITO
-- ==============================================================================
-- 1. Asegura todas las columnas necesarias en public.suppliers y permisos RLS
-- 2. Asegura columnas en public.accounts_payable para registrar compras a crédito
-- 3. Asegura columnas en public.accounts_receivable
-- 4. Asegura columnas en public.purchases y public.purchase_items
-- ==============================================================================

-- 1. TABLA SUPPLIERS
create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    code text,
    name text not null,
    doc_type text not null default 'RIF (J / G / V)',
    doc_number text not null default '',
    contact_person text,
    phone text,
    email text,
    address text,
    category text default 'General',
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'Activo',
    created_at timestamptz not null default now(),
    updated_at timestamptz default now()
);

alter table if exists public.suppliers add column if not exists code text;
alter table if exists public.suppliers add column if not exists contact_person text;
alter table if exists public.suppliers add column if not exists phone text;
alter table if exists public.suppliers add column if not exists email text;
alter table if exists public.suppliers add column if not exists address text;
alter table if exists public.suppliers add column if not exists category text default 'General';
alter table if exists public.suppliers add column if not exists balance_usd numeric(18, 4) not null default 0;
alter table if exists public.suppliers add column if not exists status text not null default 'Activo';
alter table if exists public.suppliers add column if not exists updated_at timestamptz default now();

alter table if exists public.suppliers enable row level security;
drop policy if exists "allow_all_suppliers" on public.suppliers;
drop policy if exists "authenticated_manage_suppliers" on public.suppliers;
drop policy if exists "authenticated_read_suppliers" on public.suppliers;
drop policy if exists "org_member_suppliers" on public.suppliers;
create policy "allow_all_suppliers" on public.suppliers for all to anon, authenticated using (true) with check (true);
grant all on public.suppliers to anon, authenticated;

-- 2. TABLA ACCOUNTS_PAYABLE (CUENTAS POR PAGAR Y COMPROMISOS DE COMPRAS A CRÉDITO)
create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_id uuid references public.suppliers(id) on delete set null,
    supplier_name text not null default '',
    doc_number text not null,
    concept text not null default 'Compra o compromiso comercial',
    description text,
    origin text not null default 'Compra Interna',
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE',
    due_date date,
    exchange_rate numeric(18, 4) default 1,
    created_at timestamptz not null default now()
);

alter table if exists public.accounts_payable add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table if exists public.accounts_payable add column if not exists supplier_name text not null default '';
alter table if exists public.accounts_payable add column if not exists concept text not null default 'Compra o compromiso comercial';
alter table if exists public.accounts_payable add column if not exists description text;
alter table if exists public.accounts_payable add column if not exists origin text not null default 'Compra Interna';
alter table if exists public.accounts_payable add column if not exists total_usd numeric(18, 4) not null default 0;
alter table if exists public.accounts_payable add column if not exists balance_usd numeric(18, 4) not null default 0;
alter table if exists public.accounts_payable add column if not exists status text not null default 'PENDIENTE';
alter table if exists public.accounts_payable add column if not exists due_date date;
alter table if exists public.accounts_payable add column if not exists exchange_rate numeric(18, 4) default 1;

alter table if exists public.accounts_payable enable row level security;
drop policy if exists "allow_all_accounts_payable" on public.accounts_payable;
drop policy if exists "org_member_accounts_payable" on public.accounts_payable;
create policy "allow_all_accounts_payable" on public.accounts_payable for all to anon, authenticated using (true) with check (true);
grant all on public.accounts_payable to anon, authenticated;

-- 3. TABLA ACCOUNTS_RECEIVABLE (CUENTAS POR COBRAR)
create table if not exists public.accounts_receivable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    customer_id uuid references public.customers(id) on delete set null,
    customer_name text,
    sale_id uuid references public.sales(id) on delete set null,
    doc_number text not null,
    concept text default 'Venta a crédito o saldo pendiente',
    description text,
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE',
    due_date date,
    created_at timestamptz not null default now()
);

alter table if exists public.accounts_receivable add column if not exists customer_name text;
alter table if exists public.accounts_receivable add column if not exists concept text default 'Venta a crédito o saldo pendiente';
alter table if exists public.accounts_receivable add column if not exists description text;

alter table if exists public.accounts_receivable enable row level security;
drop policy if exists "allow_all_accounts_receivable" on public.accounts_receivable;
drop policy if exists "org_member_accounts_receivable" on public.accounts_receivable;
create policy "allow_all_accounts_receivable" on public.accounts_receivable for all to anon, authenticated using (true) with check (true);
grant all on public.accounts_receivable to anon, authenticated;

-- 4. TABLA PURCHASES Y PURCHASE_ITEMS
alter table if exists public.purchases add column if not exists warehouse text default 'Tienda Bella Vista (SP-01)';
alter table if exists public.purchases add column if not exists subtotal_usd numeric(18, 4) default 0;
alter table if exists public.purchases add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null;
alter table if exists public.purchases add column if not exists payment_method text;
alter table if exists public.purchases add column if not exists payment_reference text;
alter table if exists public.purchases add column if not exists due_date date;

alter table if exists public.purchases enable row level security;
drop policy if exists "allow_all_purchases" on public.purchases;
drop policy if exists "org_member_purchases" on public.purchases;
create policy "allow_all_purchases" on public.purchases for all to anon, authenticated using (true) with check (true);
grant all on public.purchases to anon, authenticated;

alter table if exists public.purchase_items add column if not exists total_ves numeric(18, 4) default 0;
alter table if exists public.purchase_items add column if not exists created_at timestamptz default now();

alter table if exists public.purchase_items enable row level security;
drop policy if exists "allow_all_purchase_items" on public.purchase_items;
drop policy if exists "org_member_purchase_items" on public.purchase_items;
create policy "allow_all_purchase_items" on public.purchase_items for all to anon, authenticated using (true) with check (true);
grant all on public.purchase_items to anon, authenticated;


-- ============================================================================
-- BLOQUE 0017_inventory_movements.sql
-- ============================================================================

-- ==============================================================================
-- 0017_inventory_movements.sql: KÁRDEX Y MOVIMIENTOS DE INVENTARIOS
-- ==============================================================================
-- Proporciona la tabla public.inventory_movements para registrar trazabilidad
-- de entradas, salidas, ventas, compras, correcciones físicas y ajustes de stock.

create table if not exists public.inventory_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    product_id uuid references public.products(id) on delete set null,
    sku text not null,
    product_name text not null,
    movement_type text not null, -- 'COMPRA', 'VENTA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'AJUSTE_CORRECCION', 'DEVOLUCION'
    doc_type text not null default 'AJUSTE', -- 'FACTURA', 'NOTA', 'COMPRA', 'AJUSTE'
    doc_number text not null, -- 'FAC-0001', 'CMP-00001', 'AJU-0001'
    entity_type text default 'INTERNO', -- 'CLIENTE', 'PROVEEDOR', 'INTERNO'
    entity_name text,
    quantity numeric(18, 4) not null, -- Positivo (entrada) o negativo (salida)
    unit_cost_usd numeric(18, 4) not null default 0,
    unit_price_usd numeric(18, 4) not null default 0,
    exchange_rate numeric(18, 4) not null default 1,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    previous_stock numeric(18, 4) default 0,
    new_stock numeric(18, 4) default 0,
    reason text,
    notes text,
    created_at timestamptz not null default now()
);

-- Índices de alto rendimiento para filtros
create index if not exists idx_inv_mov_org on public.inventory_movements(organization_id);
create index if not exists idx_inv_mov_sku on public.inventory_movements(sku);
create index if not exists idx_inv_mov_doc on public.inventory_movements(doc_number);
create index if not exists idx_inv_mov_type on public.inventory_movements(movement_type);
create index if not exists idx_inv_mov_created on public.inventory_movements(created_at desc);

-- Políticas RLS
alter table public.inventory_movements enable row level security;

drop policy if exists "org_member_inventory_movements" on public.inventory_movements;
create policy "org_member_inventory_movements"
    on public.inventory_movements
    for all to authenticated
    using (true)
    with check (true);

drop policy if exists "anon_inventory_movements" on public.inventory_movements;
create policy "anon_inventory_movements"
    on public.inventory_movements
    for all to anon
    using (true)
    with check (true);

grant all on table public.inventory_movements to authenticated;
grant all on table public.inventory_movements to anon;


-- ============================================================================
-- BLOQUE 0018_orders_module.sql
-- ============================================================================

-- ==============================================================================
-- 0018_orders_module.sql: MÓDULO DE PEDIDOS COMERCIALES Y TIENDA ONLINE
-- ==============================================================================
-- Proporciona las tablas public.orders y public.order_items para el ciclo completo
-- de pedidos desde la tienda pública y gestión en el Control de Pedidos del ERP.

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete set null,
    branch_id uuid references public.branches(id) on delete set null,
    order_number text not null, -- 'PED-0001', 'PED-0002', etc.
    customer_name text not null,
    customer_phone text,
    customer_email text,
    customer_doc text,
    delivery_method text not null default 'RETIRO', -- 'RETIRO', 'DOMICILIO'
    delivery_address text,
    delivery_instructions text,
    delivery_status text not null default 'RECIBIDO', -- 'RECIBIDO', 'PREPARADO', 'LISTO_PARA_ENTREGAR', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'
    payment_method text not null default 'PAGO_MOVIL', -- 'PAGO_MOVIL', 'TRANSFERENCIA', 'EFECTIVO_USD', 'PUNTO_VENTA', 'ZELLE'
    payment_status text not null default 'PENDIENTE', -- 'PENDIENTE', 'PAGADO', 'REEMBOLSADO'
    payment_reference text,
    currency text not null default 'USD', -- 'USD', 'VES'
    exchange_rate numeric(18, 4) not null default 1,
    is_future_rate boolean default false,
    subtotal_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    notes text,
    activity_history jsonb not null default '[]'::jsonb,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Detalle de productos por pedido con instantánea histórica de precios
create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    sku text not null,
    name text not null,
    quantity numeric(18, 4) not null default 1,
    unit_price_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    created_at timestamptz not null default now()
);

-- Índices de alto rendimiento
create index if not exists idx_orders_org on public.orders(organization_id);
create index if not exists idx_orders_number on public.orders(order_number);
create index if not exists idx_orders_delivery_status on public.orders(delivery_status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_sku on public.order_items(sku);

-- Políticas RLS
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "orders_select_all" on public.orders;
create policy "orders_select_all" on public.orders for select using (true);

drop policy if exists "orders_insert_all" on public.orders;
create policy "orders_insert_all" on public.orders for insert with check (true);

drop policy if exists "orders_update_all" on public.orders;
create policy "orders_update_all" on public.orders for update using (true);

drop policy if exists "order_items_select_all" on public.order_items;
create policy "order_items_select_all" on public.order_items for select using (true);

drop policy if exists "order_items_insert_all" on public.order_items;
create policy "order_items_insert_all" on public.order_items for insert with check (true);

grant all on table public.orders to authenticated;
grant all on table public.orders to anon;
grant all on table public.order_items to authenticated;
grant all on table public.order_items to anon;


-- ============================================================================
-- BLOQUE 0019_fix_receivable_payments_rls.sql
-- ============================================================================

-- ==============================================================================
-- 0019_fix_receivable_payments_rls.sql
-- Habilitar acceso y políticas RLS para registro y consulta de abonos a CxC
-- ==============================================================================

create table if not exists public.receivable_payments (
    id uuid primary key default gen_random_uuid(),
    receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    payment_method text not null,
    reference text,
    payment_date timestamptz not null default now()
);

alter table if exists public.receivable_payments enable row level security;
drop policy if exists "allow_all_receivable_payments" on public.receivable_payments;
drop policy if exists "org_member_receivable_payments_insert" on public.receivable_payments;
drop policy if exists "org_member_receivable_payments_select" on public.receivable_payments;

create policy "allow_all_receivable_payments" on public.receivable_payments for all to anon, authenticated using (true) with check (true);
grant all on public.receivable_payments to anon, authenticated;


-- ============================================================================
-- BLOQUE 0020_suppliers_dedup_and_unique_constraint.sql
-- ============================================================================

-- ==============================================================================
-- 0020_suppliers_dedup_and_unique_constraint.sql
-- Saneamiento de duplicados y restricciones de unicidad para Proveedores (suppliers)
-- ==============================================================================

-- 1. Deduplicar registros en public.suppliers conservando el registro más antiguo
DO $$
DECLARE
    rec RECORD;
    keeper_id UUID;
BEGIN
    -- Deduplicar por doc_number normalizado (si no está vacío)
    FOR rec IN 
        SELECT organization_id, UPPER(TRIM(doc_number)) AS norm_doc
        FROM public.suppliers
        WHERE doc_number IS NOT NULL AND TRIM(doc_number) <> ''
        GROUP BY organization_id, UPPER(TRIM(doc_number))
        HAVING COUNT(*) > 1
    LOOP
        SELECT id INTO keeper_id 
        FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND UPPER(TRIM(doc_number)) = rec.norm_doc 
        ORDER BY created_at ASC 
        LIMIT 1;

        -- Reasignar cuentas por pagar
        UPDATE public.accounts_payable 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND UPPER(TRIM(doc_number)) = rec.norm_doc 
              AND id <> keeper_id
        );

        -- Reasignar compras
        UPDATE public.purchases 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND UPPER(TRIM(doc_number)) = rec.norm_doc 
              AND id <> keeper_id
        );

        -- Eliminar duplicados
        DELETE FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND UPPER(TRIM(doc_number)) = rec.norm_doc 
          AND id <> keeper_id;
    END LOOP;

    -- Deduplicar por nombre normalizado cuando doc_number esté vacío
    FOR rec IN 
        SELECT organization_id, LOWER(TRIM(name)) AS norm_name
        FROM public.suppliers
        WHERE (doc_number IS NULL OR TRIM(doc_number) = '')
        GROUP BY organization_id, LOWER(TRIM(name))
        HAVING COUNT(*) > 1
    LOOP
        SELECT id INTO keeper_id 
        FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND LOWER(TRIM(name)) = rec.norm_name 
        ORDER BY created_at ASC 
        LIMIT 1;

        UPDATE public.accounts_payable 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id
        );

        UPDATE public.purchases 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id
        );

        DELETE FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id;
    END LOOP;
END $$;

-- 2. Asegurar que los códigos no colisionen antes de crear el índice
DO $$
DECLARE
    r RECORD;
    counter INT := 1;
BEGIN
    FOR r IN SELECT id FROM public.suppliers ORDER BY created_at ASC LOOP
        UPDATE public.suppliers 
        SET code = 'PRV-' || LPAD(counter::TEXT, 4, '0') 
        WHERE id = r.id;
        counter := counter + 1;
    END LOOP;
END $$;

-- 3. Crear índices únicos parciales
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_doc_unique 
ON public.suppliers (organization_id, UPPER(TRIM(doc_number))) 
WHERE doc_number IS NOT NULL AND TRIM(doc_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_code_unique 
ON public.suppliers (organization_id, code) 
WHERE code IS NOT NULL AND TRIM(code) <> '';

-- Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- BLOQUE 0021_rbac_profiles_and_first_user_trigger.sql
-- ============================================================================

-- ==============================================================================
-- MIGRATION: 0021_rbac_profiles_and_first_user_trigger.sql
-- DESCRIPCIÓN: Implementación de tabla public.profiles con control RBAC estricto
--              ('gerente', 'administrador', 'cajero', 'cliente'), trigger en auth.users
--              con asignación automática del primer usuario registrado como 'gerente'
--              y políticas de seguridad RLS en Supabase.
-- ==============================================================================

-- 1. Crear o actualizar la tabla public.profiles
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    full_name text,
    role text not null check (role in ('gerente', 'administrador', 'cajero', 'cliente')) default 'cliente',
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Asegurar columnas si la tabla ya existía previamente
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
        alter table public.profiles add column role text not null default 'cliente';
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
        alter table public.profiles add column email text;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name') then
        alter table public.profiles add column full_name text;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
        alter table public.profiles add column created_at timestamptz not null default timezone('utc'::text, now());
    end if;
end $$;

-- Asegurar restricción check de roles permitidos
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('gerente', 'administrador', 'cajero', 'cliente'));

-- 2. Función helper para obtener el rol del usuario autenticado actual (SECURITY DEFINER)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
    select coalesce(
        (select role from public.profiles where id = auth.uid()),
        'anon'
    );
$$;

-- 3. Trigger Function: Asignación automática de perfil y primer usuario como 'gerente'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile_count integer;
    v_assigned_role text;
    v_meta_role text;
    v_full_name text;
begin
    -- Verificar si es el primer usuario en el sistema
    select count(*) into v_profile_count from public.profiles;

    if v_profile_count = 0 then
        -- Primer usuario del sistema recibe rol de 'gerente'
        v_assigned_role := 'gerente';
    else
        -- Verificar si viene un rol válido en el metadata de registro
        v_meta_role := lower(trim(coalesce(new.raw_user_meta_data ->> 'role', '')));
        if v_meta_role in ('gerente', 'administrador', 'cajero', 'cliente') then
            v_assigned_role := v_meta_role;
        else
            v_assigned_role := 'cliente';
        end if;
    end if;

    -- Obtener nombre completo desde metadata si existe
    v_full_name := coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(coalesce(new.email, ''), '@', 1)
    );

    -- Insertar o actualizar el perfil de usuario
    insert into public.profiles (id, email, full_name, role, created_at)
    values (
        new.id,
        new.email,
        v_full_name,
        v_assigned_role,
        timezone('utc'::text, now())
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);

    return new;
end;
$$;

-- 4. Asociar el trigger al evento de inserción de auth.users
drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- 5. Habilitar y configurar Row Level Security (RLS) en public.profiles
alter table public.profiles enable row level security;

-- Limpiar políticas anteriores para evitar colisiones
drop policy if exists "Los usuarios pueden leer su propio perfil" on public.profiles;
drop policy if exists "Los gerentes y administradores pueden leer todos los perfiles" on public.profiles;
drop policy if exists "Los usuarios pueden editar su propio nombre" on public.profiles;
drop policy if exists "Solo gerentes pueden modificar roles de perfiles" on public.profiles;
drop policy if exists "Solo gerentes pueden borrar perfiles" on public.profiles;

-- Política de lectura: El usuario puede ver su perfil o un admin/gerente puede ver todos
create policy "Los usuarios pueden leer su propio perfil"
    on public.profiles
    for select
    to authenticated
    using (
        auth.uid() = id
        or public.get_my_role() in ('gerente', 'administrador')
    );

-- Política de actualización: El usuario puede actualizar sus datos personales
create policy "Los usuarios pueden editar su propio nombre"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (
        auth.uid() = id
        -- No puede auto-ascenderse de rol si no es gerente
        and (
            role = (select role from public.profiles where id = auth.uid())
            or public.get_my_role() = 'gerente'
        )
    );

-- Política de actualización administrativa: Solo gerentes pueden modificar roles de otros usuarios
create policy "Solo gerentes pueden modificar roles de perfiles"
    on public.profiles
    for update
    to authenticated
    using (public.get_my_role() = 'gerente')
    with check (public.get_my_role() = 'gerente');


-- ============================================================================
-- BLOQUE 0022_shop_customer_tables.sql
-- ============================================================================

-- MIGRATION: 0022_shop_customer_tables.sql
-- Descripción: Tablas para clientes de la tienda online (tienda estilo Amazon)
--              Separación estricta de usuarios internos del ERP.

-- 1. Tabla de clientes de la tienda
create table if not exists public.shop_customers (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    full_name text,
    phone text,
    address text,
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- 2. Lista de deseos
create table if not exists public.customer_wishlist (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.shop_customers(id) on delete cascade,
    product_id uuid not null, -- references public.products(id) (Assuming products exist)
    created_at timestamptz not null default timezone('utc'::text, now()),
    unique(customer_id, product_id)
);

-- 3. Pedidos de clientes
create table if not exists public.customer_orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.shop_customers(id) on delete cascade,
    items jsonb not null, -- Array of items with product info, price, qty
    total_usd numeric(12,2) not null,
    total_ves numeric(12,2) not null,
    status text not null default 'pendiente', -- pendiente, procesando, enviado, completado, cancelado
    shipping_address text,
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Habilitar RLS
alter table public.shop_customers enable row level security;
alter table public.customer_wishlist enable row level security;
alter table public.customer_orders enable row level security;

-- Políticas (ejemplo: clientes solo acceden a sus propios datos)
create policy "Clientes pueden ver su perfil" on public.shop_customers for select to authenticated using (auth.uid() = id);
create policy "Clientes pueden ver su lista de deseos" on public.customer_wishlist for all to authenticated using (customer_id = auth.uid());
create policy "Clientes pueden ver sus pedidos" on public.customer_orders for select to authenticated using (customer_id = auth.uid());


-- ============================================================================
-- BLOQUE 0023_disable_rls_and_permissions.sql
-- ============================================================================

-- ==============================================================================
-- MIGRATION: 0023_disable_rls_and_permissions.sql
-- DESCRIPCIÓN: Desactivación global de RLS (Row Level Security) en todas las tablas
--              del esquema public y asignación de permisos completos a los roles
--              anon, authenticated y service_role para evitar bloqueos de acceso.
-- ==============================================================================

-- 1. Desactivar RLS en todas las tablas del esquema public
alter table if exists public.profiles disable row level security;
alter table if exists public.organizations disable row level security;
alter table if exists public.organization_members disable row level security;
alter table if exists public.branches disable row level security;
alter table if exists public.products disable row level security;
alter table if exists public.customers disable row level security;
alter table if exists public.sales disable row level security;
alter table if exists public.bank_accounts disable row level security;
alter table if exists public.accounts_receivable disable row level security;
alter table if exists public.exchange_rates disable row level security;
alter table if exists public.bank_movements disable row level security;
alter table if exists public.payment_methods disable row level security;
alter table if exists public.suppliers disable row level security;
alter table if exists public.accounts_payable disable row level security;
alter table if exists public.purchases disable row level security;
alter table if exists public.purchase_items disable row level security;
alter table if exists public.expenses disable row level security;
alter table if exists public.expense_categories disable row level security;
alter table if exists public.expense_payments disable row level security;
alter table if exists public.inventory_movements disable row level security;
alter table if exists public.shop_customers disable row level security;
alter table if exists public.customer_wishlist disable row level security;
alter table if exists public.customer_orders disable row level security;

-- 2. Otorgar permisos completos de lectura y escritura a los roles de Supabase (anon, authenticated, service_role)
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Asegurar permisos por defecto para futuras tablas creadas en public
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;

-- 3. Configuración de publicación para Realtime (supabase_realtime)
-- Asegurar que las tablas clave estén en la publicación supabase_realtime si se requiere sincronización en tiempo real
do $$
begin
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
        alter publication supabase_realtime add table public.products;
    end if;

    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
    ) then
        alter publication supabase_realtime add table public.sales;
    end if;

    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
        alter publication supabase_realtime add table public.profiles;
    end if;
end $$;


-- ============================================================================
-- BLOQUE 0024_add_profile_extensions.sql
-- ============================================================================

-- ==============================================================================
-- MIGRATION: 0024_add_profile_extensions.sql
-- DESCRIPCIÓN: Extensión de la tabla public.profiles para almacenar permisos granulares,
--              cargo (title) y estado activo/inactivo, además de desactivación global de RLS.
-- ==============================================================================

-- 1. Asegurar columnas en public.profiles para usuarios asociados / internos
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'permissions') then
        alter table public.profiles add column permissions text[] default array['ventas'];
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'title') then
        alter table public.profiles add column title text default 'Personal Asociado';
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'active') then
        alter table public.profiles add column active boolean default true;
    end if;
end $$;

-- 2. Desactivar RLS en todas las tablas del esquema public para acceso fluido sin bloqueos
alter table if exists public.profiles disable row level security;
alter table if exists public.organizations disable row level security;
alter table if exists public.organization_members disable row level security;
alter table if exists public.branches disable row level security;
alter table if exists public.products disable row level security;
alter table if exists public.customers disable row level security;
alter table if exists public.sales disable row level security;
alter table if exists public.bank_accounts disable row level security;
alter table if exists public.accounts_receivable disable row level security;
alter table if exists public.exchange_rates disable row level security;
alter table if exists public.bank_movements disable row level security;
alter table if exists public.payment_methods disable row level security;
alter table if exists public.suppliers disable row level security;
alter table if exists public.accounts_payable disable row level security;
alter table if exists public.purchases disable row level security;
alter table if exists public.purchase_items disable row level security;
alter table if exists public.expenses disable row level security;
alter table if exists public.expense_categories disable row level security;
alter table if exists public.expense_payments disable row level security;
alter table if exists public.inventory_movements disable row level security;
alter table if exists public.shop_customers disable row level security;
alter table if exists public.customer_wishlist disable row level security;
alter table if exists public.orders disable row level security;
alter table if exists public.order_items disable row level security;

-- 3. Otorgar permisos completos a los roles de Supabase (anon, authenticated, service_role)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;

-- 4. Publicar tablas clave en supabase_realtime
do $$
begin
    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
        alter publication supabase_realtime add table public.profiles;
    end if;

    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
        alter publication supabase_realtime add table public.products;
    end if;

    if not exists (
        select 1 from pg_publication_tables 
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
    ) then
        alter publication supabase_realtime add table public.sales;
    end if;
end $$;


-- ============================================================================
-- BLOQUE 0025_accounts_receivable_manual_accounts.sql
-- ============================================================================

-- ==============================================================================
-- MIGRACIÓN 0025 — Cuentas por cobrar con cliente no registrado
-- ==============================================================================
-- Objetivo:
--   Permitir registrar cuentas por cobrar manuales donde el cliente puede ser
--   un nombre libre (sin fila en public.customers), además de guardar el
--   concepto de la cuenta.
--
-- Contexto:
--   La tabla real `accounts_receivable` fue creada por 0002 con
--   `customer_id uuid NOT NULL`. En un esquema donde la tabla ya existe, la
--   migración 0016 no altera nada (usa `CREATE TABLE IF NOT EXISTS`), por lo
--   que en la base viva faltan las columnas `customer_name` y `concept` y el
--   `customer_id` sigue obligatorio. Esto rompía el guardado del formulario
--   "Agregar cuenta pendiente" desde el POS/CxC.
--
-- Esta migración es ADITIVA e IDEMPOTENTE: se puede ejecutar varias veces
-- sin producir errores ni duplicidad.
-- ==============================================================================

-- 1. Columna para el nombre libre del cliente (cuando no hay id registrado).
alter table if exists public.accounts_receivable
  add column if not exists customer_name text;

-- 2. Concepto/descripción breve de la cuenta (ya usada por la aplicación).
alter table if exists public.accounts_receivable
  add column if not exists concept text default 'Venta a crédito o saldo pendiente';

-- 3. Hacer opcional el vínculo a clientes registrados: las cuentas manuales
--    guardarán el nombre en `customer_name`; las ventas a crédito del POS
--    siguen vinculando siempre su `customer_id`.
alter table if exists public.accounts_receivable
  alter column customer_id drop not null;

-- 4. Permisos coherentes con el esquema actual (RLS deshabilitado desde 0023).
grant all on public.accounts_receivable to anon, authenticated;


-- ============================================================================
-- BLOQUE 0026_business_profile_extensions.sql
-- ============================================================================

-- ==============================================================================
-- MIGRACIÓN 0026 — Perfil de negocio completo en organizations
-- ==============================================================================
-- Objetivo:
--   Permitir que la pantalla Configuración -> Negocio guarde TODOS los datos
--   de identidad fiscal en la tabla `organizations` de Supabase, y no solo en
--   el almacenamiento local del navegador.
--
-- Contexto:
--   La tabla real `organizations` fue creada por 0002 con únicamente
--   (id, name, rif, phone, address, currency, created_at). El formulario de
--   Configuración guarda además email, whatsapp, eslogan, logo y favicon
--   (imagen como data URL), que no tienen columnas. Sin esta migración esos
--   campos no pueden persistir en la base.
--
-- Esta migración es ADITIVA e IDEMPOTENTE: se puede ejecutar varias veces
-- sin producir errores ni duplicidad.
-- ==============================================================================

-- 1. Correo de contacto del negocio.
alter table if exists public.organizations
  add column if not exists email text;

-- 2. Número de WhatsApp comercial.
alter table if exists public.organizations
  add column if not exists whatsapp text;

-- 3. Eslogan / frase comercial.
alter table if exists public.organizations
  add column if not exists slogan text;

-- 4. Logo corporativo (data URL).
alter table if exists public.organizations
  add column if not exists logo text;

-- 5. Favicon corporativo (data URL).
alter table if exists public.organizations
  add column if not exists favicon text;

-- 6. Permisos coherentes con el esquema actual (RLS deshabilitado desde 0023).
grant all on public.organizations to anon, authenticated;


-- ============================================================================
-- BLOQUE 0027_complete_rls_unlock.sql
-- ============================================================================

-- ==============================================================================
-- MIGRACIÓN 0027 — Completar la desprotección RLS que la 0023 dejó pendiente
-- ==============================================================================
-- Objetivo:
--   Finalizar la desactivación de RLS en las tablas del esquema `operaciones`
--   que la migración 0023 omitió: sale_items, payments y receivable_payments.
--
-- Contexto:
--   La 0023 deshabilitó RLS en la mayoría de las tablas públicas, pero el
--   listado no incluyó `sale_items`, `payments` ni `receivable_payments`.
--   Estas permanecen con RLS activo y una política basada en
--   is_org_member(organization_id); como la tabla `organization_members`
--   está vacía, TODO abono registrado (por ejemplo, el abono inicial de una
--   venta a crédito, o el cobro parcial de una CxC) falla con
--   «violates row-level security policy» (403) y no se graba en la base.
--
--   El servidor aplica siempre su propio control de inquilino por
--   organización al registrar operaciones, por lo que queda garantizado el
--   aislamiento por organización también sin RLS.
--
-- Esta migración es ADITIVA e IDEMPOTENTE: se puede ejecutar varias veces
-- sin producir errores ni duplicidad.
-- ==============================================================================

-- 1. Detalle de productos vendidos (si el RLS activo bloquea su registro).
alter table if exists public.sale_items disable row level security;

-- 2. Pagos de ventas (tabla opcional: puede no existir aún en el esquema).
alter table if exists public.payments disable row level security;

-- 3. Abonos de cuentas por cobrar (la tabla bloqueada por la política vacía).
alter table if exists public.receivable_payments disable row level security;

-- 4. Permisos coherentes con el resto del esquema.
grant all on public.sale_items to anon, authenticated;
grant all on public.receivable_payments to anon, authenticated;
-- payments solo si existe (supabase lo omite, si aún no se crea la tabla).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'payments') then
    execute 'grant all on public.payments to anon, authenticated';
  end if;
end $$;


-- ============================================================================
-- BLOQUE 0028_bank_movements_payment_methods.sql
-- ============================================================================

-- ==============================================================================
-- FRENYER ERP — 0028: TABLAS FALTANTES bank_movements Y payment_methods
-- ==============================================================================
-- La 0004 nunca se aplicó en la nube: sin estas tablas, «Cuentas Bancarias»
-- no puede mostrar el historial de movimientos ni los métodos de pago.
-- Idempotente: se puede pegar en el SQL Editor tantas veces como haga falta.
-- ==============================================================================

-- 1. Tabla de Movimientos de Cuenta
CREATE TABLE IF NOT EXISTS public.bank_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    bank_account_id uuid references public.bank_accounts(id) on delete cascade,
    type text not null, -- ENTRADA, SALIDA
    concept text not null,
    reference text,
    user_name text not null default 'Administrador',
    rate numeric(18, 4) not null,
    commission numeric(18, 4) not null default 0,
    commission_type text default 'Fija', -- Fija, Porcentual
    amount numeric(18, 4) not null, -- Monto en la moneda de la cuenta
    created_at timestamptz not null default now()
);

-- 2. Tabla de Métodos de Pago del Sistema
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    name text not null,
    currency text not null default 'VES', -- VES, USD, USDT, EUR, COP
    type text not null default 'Transferencia', -- Pago Móvil, Transferencia, Efectivo, Punto de Venta
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    code text,
    created_at timestamptz not null default now()
);

-- 3. Índices para el historial (orden por fecha y filtro por cuenta)
CREATE INDEX IF NOT EXISTS idx_bank_movements_created_at ON public.bank_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_movements_account ON public.bank_movements (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_account ON public.payment_methods (bank_account_id);

-- 4. Habilitar RLS (obligatorio en este proyecto)
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- 5. Políticas permisivas para el ERP (mismo modelo que 0004)
DROP POLICY IF EXISTS "allow_all_bank_movements" ON public.bank_movements;
CREATE POLICY "allow_all_bank_movements" ON public.bank_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_payment_methods" ON public.payment_methods;
CREATE POLICY "allow_all_payment_methods" ON public.payment_methods FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- BLOQUE 0028_print_settings.sql
-- ============================================================================

-- =============================================================================
-- FRENYER ERP — CONFIGURACIÓN DE IMPRESIÓN / TICKETS / PERIFÉRICOS
-- =============================================================================

create table if not exists public.print_settings (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
    default_format text not null default 'ticket80',
    cash_drawer_trigger boolean not null default true,
    header_message text,
    footer_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz default now()
);

alter table if exists public.print_settings add column if not exists default_format text not null default 'ticket80';
alter table if exists public.print_settings add column if not exists cash_drawer_trigger boolean not null default true;
alter table if exists public.print_settings add column if not exists header_message text;
alter table if exists public.print_settings add column if not exists footer_message text;
alter table if exists public.print_settings add column if not exists updated_at timestamptz default now();

create index if not exists idx_print_settings_org on public.print_settings(organization_id);

alter table if exists public.print_settings enable row level security;
drop policy if exists "allow_all_print_settings" on public.print_settings;
create policy "allow_all_print_settings" on public.print_settings for all to anon, authenticated using (true) with check (true);
grant all on public.print_settings to anon, authenticated;


-- ============================================================================
-- BLOQUE 0029_app_sessions_tracking.sql
-- ============================================================================

-- ==============================================================================
-- MIGRACIÓN 0029 — Seguimiento de sesiones activas (app_sessions)
-- ==============================================================================
-- Objetivo:
--   Registrar las sesiones activas del sistema para habilitar:
--     1. Expiración por inactividad SUPERVISADA EN SERVIDOR (además del
--        bloqueo visual que ya existe en el panel): ciclos internos 30 min,
--        comprador web 2 h.
--     2. "Cerrar sesión en todos los dispositivos": el usuario puede revocar
--        de una vez todas sus sesiones activas.
--
-- Contexto:
--   El servidor (api/server.ts) mantiene por cada token una fila con el
--   HASH SHA-256 del token (NUNCA el token en claro). Esa fila es la fuente
--   de autorización adicional: si revoked_at tiene fecha, la petición con ese
--   token se rechaza (401) en todas las instancias que la consulten.
--
--   Aislamiento: la migración es ADITIVA e IDEMPOTENTE (se puede ejecutar
--   varias veces sin errores). El RLS queda deshabilitado para seguir el
--   mismo criterio del resto del esquema desde la 0024 (el servidor filtró
--   por organización/usuario);
--   esta tabla no contiene datos de negocio ni PII: solo hash, usuario,
--   etiqueta de dispositivo y marcas de tiempo.
--
--   Si esta migración NO se ha aplicado, el servidor degrada con un aviso:
--   las sesiones siguen funcionando como antes (sin seguimiento).
-- ==============================================================================

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token_hash text not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz
);

-- Índice de búsqueda por usuario (listado y revocación masiva).
create index if not exists app_sessions_user_idx on public.app_sessions (user_id);

-- Índice para la purga de filas antiguas (opcional a futuro).
create index if not exists app_sessions_last_seen_idx on public.app_sessions (last_seen);

-- Comentario de catálogo para documentar el propósito de la tabla.
comment on table public.app_sessions is
  'Sesiones activas del ERP/tienda: hash del token (nunca el token), usuario, dispositivo y marcas de actividad/revocación.';


-- ============================================================================
-- BLOQUE 0030_app_sessions_rls_policy.sql
-- ============================================================================

-- ==============================================================================
-- MIGRACIÓN 0030 — Políticas RLS explícitas para app_sessions
-- ==============================================================================
-- Contexto:
--   La 0029 creó app_sessions y, al quedar RLS activo sin políticas, el
--   servidor quedó sin forma de escribir la fila de seguimiento con el token
--   del propio usuario (403 "violates row-level security policy").
--
--   Esta migración hace el acceso explícito y CON ALCANCE: cada usuario
--   autenticado solo puede ver y actualizar SUS PROPIAS sesiones
--   (user_id = auth.uid()). El service role no pasa por RLS (comportamiento
--   estándar de Supabase para tareas administrativas). Aditiva e idempotente.
-- ==============================================================================

alter table if exists public.app_sessions enable row level security;

-- Política integral: un usuario solo toca sus propias filas de sesión.
drop policy if exists app_sessions_owner_access on public.app_sessions;
create policy app_sessions_owner_access
  on public.app_sessions
  for all
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Grants en línea con el resto del esquema (el RLS es la valla real).
grant all on public.app_sessions to authenticated, anon;


-- ============================================================================
-- BLOQUE 0031_parked_invoices.sql
-- ============================================================================

-- =============================================================================
-- MIGRACIÓN 0031 — FACTURAS / PEDIDOS EN ESPERA DEL POS (parked_invoices)
-- =============================================================================
-- Objetivo:
--   Persistir las ventas que el cajero coloca en espera (FACT. PEND.) para
--   que sobrevivan recargas de la página y cierres del navegador, y puedan
--   recuperarse desde cualquier dispositivo de la misma organización.
--
--   Cada fila guarda: número de control secuencial que lleva el POS
--   (ESP-001, ESP-002, ...), nombre y datos del cliente, los ítems del
--   carrito como JSONB y el total en USD. Se elimina al cobrar la venta
--   (restaurar carrito) o al descartarla manualmente.
--
--   Aislamiento: es ADITIVA e IDEMPOTENTE. RLS habilitado con política
--   permisiva siguiendo el mismo criterio del resto del esquema desde la
--   0024/0028 (el servidor y las funciones del cliente filtran por
--   organization_id activa; nunca se exponen datos entre organizaciones).
-- =============================================================================

create table if not exists public.parked_invoices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
    control_number text not null,
    client_name text not null default 'Cliente sin registrar',
    client_rif text,
    client_phone text,
    client_address text,
    items jsonb not null default '[]'::jsonb,
    total_usd numeric(12,2) not null default 0,
    created_by text,
    created_at timestamptz not null default now()
);

-- Un número de control no puede repetirse dentro de la misma organización.
create unique index if not exists parked_invoices_org_control_idx
    on public.parked_invoices (organization_id, control_number);

-- Listado del modal ordenado por control (más reciente primero).
create index if not exists idx_parked_invoices_org_created
    on public.parked_invoices (organization_id, created_at desc);

alter table if exists public.parked_invoices enable row level security;
drop policy if exists "allow_all_parked_invoices" on public.parked_invoices;
create policy "allow_all_parked_invoices" on public.parked_invoices
    for all to anon, authenticated using (true) with check (true);
grant all on public.parked_invoices to anon, authenticated;


-- ============================================================================
-- BLOQUE 0032_enable_rls_security.sql
-- ============================================================================

-- ============================================================================
-- 0032_enable_rls_security.sql
-- Cierra por completo el acceso publico a las tablas del esquema `public`.
--
-- PRERREQUISITO OBLIGATORIO:
--   El backend (api/server.ts) ya debe estar desplegado usando
--   SUPABASE_SERVICE_ROLE_KEY. Si esta migracion se ejecuta antes de ese
--   despliegue, la API deja de funcionar (permission denied for table ...).
--
-- QUE HACE:
--   1. Habilita RLS en TODAS las tablas de public (incluidas las creadas
--      fuera de las migraciones).
--   2. Elimina todas las politicas existentes: sin politicas, RLS deniega
--      todo salvo para service_role, que tiene BYPASSRLS.
--   3. Revoca el acceso directo de anon y authenticated a tablas, secuencias
--      y funciones.
--   4. Revoca los privilegios por defecto para objetos futuros.
--   5. Conserva el acceso total de service_role.
--   6. Fuerza security_invoker en las vistas de public.
--
-- ES IDEMPOTENTE: se puede ejecutar varias veces sin errores.
--
-- ANTES DE EJECUTAR:
--   - Guarda un respaldo: pg_dump del esquema y
--     select * from pg_policies where schemaname = 'public';
--   - Confirma que SUPABASE_SERVICE_ROLE_KEY existe en Vercel (frenyer y
--     compuflores) y en el entorno local.
-- ============================================================================

begin;

-- 1) Habilitar RLS en todas las tablas y tablas particionadas de public.
do $$
declare r record;
begin
  for r in
    select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', r.tabla);
  end loop;
end $$;

-- 2) Eliminar todas las politicas de public.
--    Las politicas permisivas USING (true) dejarian RLS abierto aunque este
--    habilitado, por eso se eliminan todas. Con cero politicas, cualquier rol
--    sin BYPASSRLS queda denegado.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Revocar acceso directo de los roles publicos de Supabase.
revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Las funciones se conceden a PUBLIC por defecto en PostgreSQL. Sin esto,
-- una funcion SECURITY DEFINER seguiria siendo invocable via RPC.
revoke all privileges on all functions in schema public from PUBLIC;

-- 4) Revocar tambien los privilegios por defecto de objetos futuros.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke execute on functions from PUBLIC;

-- 5) Garantizar que service_role conserva acceso total.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 6) Vistas: que respeten la RLS de quien consulta.
--    Las vistas materializadas no admiten security_invoker; sus permisos ya
--    quedaron revocados en el paso 3.
do $$
declare r record;
begin
  for r in
    select c.relname as vista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  loop
    begin
      execute format('alter view public.%I set (security_invoker = true)', r.vista);
    exception when others then
      null;
    end;
  end loop;
end $$;

commit;

-- ============================================================================
-- VERIFICACION (ejecutar despues, fuera de la transaccion)
-- ============================================================================
-- a) Ninguna tabla debe quedar con rls = false:
--    select c.relname as tabla, c.relrowsecurity as rls
--    from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind in ('r', 'p')
--    order by c.relrowsecurity, c.relname;
--
-- b) No deben quedar politicas:
--    select tablename, policyname from pg_policies where schemaname = 'public';
--
-- c) Prueba externa con la clave anonima (debe responder permission denied):
--    curl "$SUPABASE_URL/rest/v1/sales?select=id&limit=1" \
--         -H "apikey: $SUPABASE_ANON_KEY"
--
-- ROLLBACK:
--    No hay rollback automatico. Para revertir, restaura el respaldo de
--    pg_policies y vuelve a otorgar los permisos que necesites. No desactives
--    RLS: eso reabre la alerta.
-- ============================================================================


-- ============================================================================
-- BLOQUE 0033_customer_advances.sql
-- ============================================================================

-- ============================================================================
-- 0033_customer_advances.sql
-- Módulo de ANTICIPOS DE CLIENTES (dinero a favor del cliente).
--
-- QUÉ CREA
--   1. public.customer_advances          -> cabecera del anticipo (saldo en USD)
--   2. public.customer_advance_movements -> bitácora: ANTICIPO / APLICACION /
--                                           DEVOLUCION / ANULACION
--   3. Funciones transaccionales (una sola transacción por operación):
--        customer_advance_create   (entra dinero al banco)
--        customer_advance_apply    (cruza contra una CxC, sin tocar el banco)
--        customer_advance_refund   (sale dinero del banco)
--        customer_advance_void     (anula un anticipo sin uso y devuelve el dinero)
--
-- MODELO MONETARIO (igual que el resto del ERP)
--   amount_usd / applied_usd / refunded_usd / balance_usd están SIEMPRE en USD
--   (moneda canónica de CxC). amount_original y currency guardan lo que el
--   cliente entregó realmente y exchange_rate la tasa de la operación.
--   El movimiento bancario se registra en la moneda de la cuenta destino.
--
-- SEGURIDAD
--   RLS habilitada sin políticas (mismo criterio que 0032): solo el backend con
--   service_role accede. Las funciones se revocan de anon/authenticated/PUBLIC
--   y se conceden únicamente a service_role, de modo que no quedan expuestas
--   por RPC ni antes ni después de aplicar 0032.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin errores.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Secuencia de folios (ANT-000001, ANT-000002, ...)
-- ----------------------------------------------------------------------------
create sequence if not exists public.customer_advances_number_seq;

-- ----------------------------------------------------------------------------
-- 1. Cabecera del anticipo
-- ----------------------------------------------------------------------------
create table if not exists public.customer_advances (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id     uuid not null references public.customers(id) on delete restrict,
    advance_number  text not null,
    received_at     date not null default current_date,
    currency        text not null default 'USD',
    amount_original numeric(18, 2) not null,
    exchange_rate   numeric(18, 4) not null default 1,
    amount_usd      numeric(18, 2) not null,
    applied_usd     numeric(18, 2) not null default 0,
    refunded_usd    numeric(18, 2) not null default 0,
    -- Saldo derivado: no puede desincronizarse ni volverse negativo.
    balance_usd     numeric(18, 2) generated always as
                    (round(amount_usd - applied_usd - refunded_usd, 2)) stored,
    bank_account_id uuid references public.bank_accounts(id) on delete restrict,
    payment_method  text,
    reference       text,
    notes           text,
    status          text not null default 'DISPONIBLE',
    created_by      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint customer_advances_currency_chk check (currency in ('USD', 'VES')),
    constraint customer_advances_status_chk check (status in ('DISPONIBLE', 'APLICADO', 'DEVUELTO', 'ANULADO')),
    constraint customer_advances_amount_chk check (amount_original > 0 and amount_usd > 0 and exchange_rate > 0),
    constraint customer_advances_usage_chk check (
        applied_usd >= 0
        and refunded_usd >= 0
        and applied_usd + refunded_usd <= amount_usd + 0.005
    ),
    constraint customer_advances_number_uk unique (organization_id, advance_number)
);

create index if not exists idx_customer_advances_org_customer
    on public.customer_advances (organization_id, customer_id);
create index if not exists idx_customer_advances_available
    on public.customer_advances (organization_id, customer_id)
    where status in ('DISPONIBLE', 'APLICADO');
create index if not exists idx_customer_advances_received
    on public.customer_advances (received_at desc);

-- ----------------------------------------------------------------------------
-- 2. Bitácora del anticipo (trazabilidad completa del cruce y de las salidas)
-- ----------------------------------------------------------------------------
create table if not exists public.customer_advance_movements (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    advance_id       uuid not null references public.customer_advances(id) on delete restrict,
    customer_id      uuid not null references public.customers(id) on delete restrict,
    type             text not null,
    receivable_id    uuid references public.accounts_receivable(id) on delete set null,
    bank_account_id  uuid references public.bank_accounts(id) on delete set null,
    bank_movement_id uuid references public.bank_movements(id) on delete set null,
    amount_usd       numeric(18, 2) not null,
    amount_original  numeric(18, 2),
    exchange_rate    numeric(18, 4) not null default 1,
    reference        text,
    notes            text,
    created_by       text,
    created_at       timestamptz not null default now(),
    constraint customer_advance_movements_type_chk check (type in ('ANTICIPO', 'APLICACION', 'DEVOLUCION', 'ANULACION')),
    constraint customer_advance_movements_amount_chk check (amount_usd > 0)
);

create index if not exists idx_customer_advance_movements_advance
    on public.customer_advance_movements (advance_id, created_at desc);
create index if not exists idx_customer_advance_movements_receivable
    on public.customer_advance_movements (receivable_id);

-- ----------------------------------------------------------------------------
-- 3. RLS y permisos (acceso exclusivo del backend con service_role)
-- ----------------------------------------------------------------------------
alter table public.customer_advances enable row level security;
alter table public.customer_advance_movements enable row level security;

revoke all privileges on table public.customer_advances from public, anon, authenticated;
revoke all privileges on table public.customer_advance_movements from public, anon, authenticated;
grant all privileges on table public.customer_advances to service_role;
grant all privileges on table public.customer_advance_movements to service_role;
grant usage, select on sequence public.customer_advances_number_seq to service_role;

-- ----------------------------------------------------------------------------
-- 4. Registro de un anticipo (entrada de dinero)
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_create(
    p_organization_id uuid,
    p_customer_id     uuid,
    p_bank_account_id uuid,
    p_amount_original numeric,
    p_currency        text,
    p_exchange_rate   numeric,
    p_received_at     date,
    p_payment_method  text,
    p_reference       text,
    p_notes           text,
    p_created_by      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_customer       public.customers%rowtype;
    v_bank           public.bank_accounts%rowtype;
    v_currency       text := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
    v_amount_original numeric(18, 2);
    v_rate           numeric(18, 4);
    v_amount_usd     numeric(18, 2);
    v_bank_amount    numeric(18, 2);
    v_number         text;
    v_advance        public.customer_advances%rowtype;
    v_bank_movement  public.bank_movements%rowtype;
begin
    if p_organization_id is null then
        raise exception 'La organización es obligatoria.' using errcode = '22023';
    end if;
    if v_currency not in ('USD', 'VES') then
        raise exception 'La moneda del anticipo debe ser USD o VES.' using errcode = '22023';
    end if;

    v_amount_original := round(coalesce(p_amount_original, 0), 2);
    if v_amount_original <= 0 then
        raise exception 'El monto del anticipo debe ser mayor a cero.' using errcode = '22023';
    end if;
    v_rate := round(coalesce(nullif(p_exchange_rate, 0), 1), 4);
    if v_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_customer
      from public.customers
     where id = p_customer_id
       and organization_id = p_organization_id;
    if not found then
        raise exception 'El cliente no existe en esta organización.' using errcode = 'P0002';
    end if;

    select * into v_bank
      from public.bank_accounts
     where id = p_bank_account_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta bancaria no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_amount_usd := case
        when v_currency = 'USD' then v_amount_original
        else round(v_amount_original / v_rate, 2)
    end;
    if v_amount_usd <= 0 then
        raise exception 'El monto en dólares del anticipo es inválido.' using errcode = '22023';
    end if;

    -- Lo que realmente entra a la cuenta, en la moneda de esa cuenta.
    v_bank_amount := case
        when v_bank.currency = v_currency then v_amount_original
        when v_bank.currency = 'VES' then round(v_amount_usd * v_rate, 2)
        else v_amount_usd
    end;
    if v_bank_amount <= 0 then
        raise exception 'El monto acreditado en la cuenta bancaria es inválido.' using errcode = '22023';
    end if;

    v_number := 'ANT-' || lpad(nextval('public.customer_advances_number_seq')::text, 6, '0');

    insert into public.customer_advances (
        organization_id, customer_id, advance_number, received_at, currency,
        amount_original, exchange_rate, amount_usd, bank_account_id,
        payment_method, reference, notes, status, created_by
    )
    values (
        p_organization_id, v_customer.id, v_number,
        coalesce(p_received_at, current_date), v_currency,
        v_amount_original, v_rate, v_amount_usd, v_bank.id,
        nullif(trim(coalesce(p_payment_method, '')), ''),
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        'DISPONIBLE',
        nullif(trim(coalesce(p_created_by, '')), '')
    )
    returning * into v_advance;

    update public.bank_accounts
       set balance = round(balance + v_bank_amount, 2)
     where id = v_bank.id;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        p_organization_id, v_bank.id, 'ENTRADA',
        'Anticipo de cliente - ' || v_customer.name || ' (' || v_number || ')',
        nullif(trim(coalesce(p_reference, '')), ''),
        coalesce(nullif(trim(coalesce(p_created_by, '')), ''), 'Sistema'),
        v_rate, 0, 'Fija', v_bank_amount
    )
    returning * into v_bank_movement;

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, bank_account_id,
        bank_movement_id, amount_usd, amount_original, exchange_rate,
        reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_customer.id, 'ANTICIPO', v_bank.id,
        v_bank_movement.id, v_amount_usd, v_amount_original, v_rate,
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'bank_movement', to_jsonb(v_bank_movement)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Aplicación del anticipo a una cuenta por cobrar (sin tocar el banco)
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_apply(
    p_organization_id uuid,
    p_advance_id      uuid,
    p_receivable_id   uuid,
    p_amount_usd      numeric,
    p_reference       text,
    p_notes           text,
    p_created_by      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_advance     public.customer_advances%rowtype;
    v_receivable  public.accounts_receivable%rowtype;
    v_amount      numeric(18, 2);
    v_new_balance numeric(18, 2);
    v_new_status  text;
    v_adv_status  text;
    v_rate        numeric(18, 4);
    v_reference   text;
begin
    v_amount := round(coalesce(p_amount_usd, 0), 2);
    if v_amount <= 0 then
        raise exception 'El monto a aplicar debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_advance
      from public.customer_advances
     where id = p_advance_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'El anticipo no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_advance.status = 'ANULADO' then
        raise exception 'El anticipo está anulado.' using errcode = '22023';
    end if;
    if round(v_advance.balance_usd, 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo disponible del anticipo (disponible: % USD).', round(v_advance.balance_usd, 2)
            using errcode = '22023';
    end if;

    select * into v_receivable
      from public.accounts_receivable
     where id = p_receivable_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta por cobrar no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_receivable.customer_id is null or v_receivable.customer_id <> v_advance.customer_id then
        raise exception 'La cuenta por cobrar no pertenece al cliente del anticipo.' using errcode = '22023';
    end if;
    if round(coalesce(v_receivable.balance_usd, 0), 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo pendiente de la cuenta por cobrar (pendiente: % USD).', round(coalesce(v_receivable.balance_usd, 0), 2)
            using errcode = '22023';
    end if;

    v_rate := coalesce(nullif(v_advance.exchange_rate, 0), 1);
    v_new_balance := greatest(0, round(coalesce(v_receivable.balance_usd, 0) - v_amount, 2));
    v_new_status := case when v_new_balance <= 0.005 then 'PAGADO' else 'PARCIAL' end;
    v_adv_status := case when round(v_advance.balance_usd - v_amount, 2) <= 0.005 then 'APLICADO' else 'DISPONIBLE' end;
    v_reference := coalesce(nullif(trim(coalesce(p_reference, '')), ''), v_advance.advance_number);

    update public.customer_advances
       set applied_usd = round(applied_usd + v_amount, 2),
           status = v_adv_status,
           updated_at = now()
     where id = v_advance.id
     returning * into v_advance;

    update public.accounts_receivable
       set balance_usd = v_new_balance,
           status = v_new_status
     where id = v_receivable.id;

    -- Historial del abono en la CxC: sin cuenta bancaria, porque el dinero
    -- entró cuando se recibió el anticipo (no se duplica el ingreso).
    insert into public.receivable_payments (
        receivable_id, bank_account_id, amount_usd, amount_ves,
        exchange_rate, payment_method, reference, payment_date
    )
    values (
        v_receivable.id, null, v_amount, round(v_amount * v_rate, 2),
        v_rate, 'Anticipo de cliente', v_reference, now()
    );

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, receivable_id,
        amount_usd, exchange_rate, reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_advance.customer_id, 'APLICACION', v_receivable.id,
        v_amount, v_rate, v_reference,
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'receivable', jsonb_build_object(
            'id', v_receivable.id,
            'balance_usd', v_new_balance,
            'status', v_new_status
        )
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Devolución (salida de dinero) y anulación de un anticipo sin uso
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_refund(
    p_organization_id uuid,
    p_advance_id      uuid,
    p_bank_account_id uuid,
    p_amount_usd      numeric,
    p_exchange_rate   numeric,
    p_reference       text,
    p_notes           text,
    p_created_by      text,
    p_void            boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_advance       public.customer_advances%rowtype;
    v_bank          public.bank_accounts%rowtype;
    v_amount        numeric(18, 2);
    v_rate          numeric(18, 4);
    v_bank_amount   numeric(18, 2);
    v_new_status    text;
    v_movement_type text;
    v_concept       text;
    v_bank_movement public.bank_movements%rowtype;
begin
    v_amount := round(coalesce(p_amount_usd, 0), 2);
    if v_amount <= 0 then
        raise exception 'El monto a devolver debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_advance
      from public.customer_advances
     where id = p_advance_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'El anticipo no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_advance.status = 'ANULADO' then
        raise exception 'El anticipo ya está anulado.' using errcode = '22023';
    end if;
    if coalesce(p_void, false) and round(v_advance.applied_usd, 2) > 0.005 then
        raise exception 'El anticipo tiene aplicaciones registradas. Debe reversarlas antes de anularlo.' using errcode = '22023';
    end if;
    if round(v_advance.balance_usd, 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo disponible del anticipo (disponible: % USD).', round(v_advance.balance_usd, 2)
            using errcode = '22023';
    end if;

    select * into v_bank
      from public.bank_accounts
     where id = coalesce(p_bank_account_id, v_advance.bank_account_id)
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta bancaria de la devolución no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria de la devolución está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_rate := round(coalesce(nullif(p_exchange_rate, 0), nullif(v_advance.exchange_rate, 0), 1), 4);
    v_bank_amount := case
        when v_bank.currency = 'VES' then round(v_amount * v_rate, 2)
        else v_amount
    end;
    if round(coalesce(v_bank.balance, 0), 2) < v_bank_amount then
        raise exception 'La cuenta bancaria no tiene saldo suficiente para la devolución.' using errcode = '22023';
    end if;

    if coalesce(p_void, false) then
        v_new_status := 'ANULADO';
        v_movement_type := 'ANULACION';
        v_concept := 'Anulación de anticipo - ' || v_advance.advance_number;
    else
        v_new_status := case when round(v_advance.balance_usd - v_amount, 2) <= 0.005 then 'DEVUELTO' else 'DISPONIBLE' end;
        v_movement_type := 'DEVOLUCION';
        v_concept := 'Devolución de anticipo - ' || v_advance.advance_number;
    end if;

    update public.customer_advances
       set refunded_usd = round(refunded_usd + v_amount, 2),
           status = v_new_status,
           updated_at = now()
     where id = v_advance.id
     returning * into v_advance;

    update public.bank_accounts
       set balance = round(balance - v_bank_amount, 2)
     where id = v_bank.id;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        p_organization_id, v_bank.id, 'SALIDA', v_concept,
        nullif(trim(coalesce(p_reference, '')), ''),
        coalesce(nullif(trim(coalesce(p_created_by, '')), ''), 'Sistema'),
        v_rate, 0, 'Fija', v_bank_amount
    )
    returning * into v_bank_movement;

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, bank_account_id,
        bank_movement_id, amount_usd, amount_original, exchange_rate,
        reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_advance.customer_id, v_movement_type, v_bank.id,
        v_bank_movement.id, v_amount, v_bank_amount, v_rate,
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'bank_movement', to_jsonb(v_bank_movement)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permisos de las funciones: solo service_role (backend)
-- ----------------------------------------------------------------------------
revoke all on function public.customer_advance_create(uuid, uuid, uuid, numeric, text, numeric, date, text, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_advance_apply(uuid, uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_advance_refund(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.customer_advance_create(uuid, uuid, uuid, numeric, text, numeric, date, text, text, text, text) to service_role;
grant execute on function public.customer_advance_apply(uuid, uuid, uuid, numeric, text, text, text) to service_role;
grant execute on function public.customer_advance_refund(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean) to service_role;

commit;

-- ============================================================================
-- VERIFICACIÓN (ejecutar aparte, fuera de la transacción)
-- ============================================================================
-- a) Tablas creadas y con RLS:
--    select relname, relrowsecurity from pg_class
--     where relname in ('customer_advances', 'customer_advance_movements');
-- b) Invariante de saldo (debe devolver 0 filas):
--    select id, advance_number from public.customer_advances
--     where balance_usd <> round(amount_usd - applied_usd - refunded_usd, 2)
--        or balance_usd < 0;
-- c) Funciones sin acceso público:
--    select routine_name, grantee, privilege_type
--      from information_schema.routine_privileges
--     where routine_name like 'customer_advance%';
-- ============================================================================



-- ============================================================================
-- VERIFICACIÓN FINAL (opcional, ejecutar después de crear todo)
-- ============================================================================
-- a) Deben aparecer las 35 tablas del sistema:
--    select tablename from pg_tables where schemaname = 'public' order by tablename;
--
-- b) Todas las tablas deben tener RLS activa (rls = true en todas):
--    select c.relname as tabla, c.relrowsecurity as rls
--    from pg_class c
--    join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind in ('r', 'p')
--    order by c.relrowsecurity, c.relname;
--
-- c) No deben quedar políticas abiertas (debe devolver 0 filas):
--    select tablename, policyname from pg_policies where schemaname = 'public';
--
-- d) Las funciones de anticipos deben existir (3 filas):
--    select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname like 'customer_advance%'
--    order by proname;
--
-- e) Prueba externa con la clave anónima (debe responder permission denied):
--    curl "$SUPABASE_URL/rest/v1/sales?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY"
-- ============================================================================
