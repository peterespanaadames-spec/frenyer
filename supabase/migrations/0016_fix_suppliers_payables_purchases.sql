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
