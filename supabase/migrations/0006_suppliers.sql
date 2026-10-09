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
