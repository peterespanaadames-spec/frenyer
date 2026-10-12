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
