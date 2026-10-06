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
