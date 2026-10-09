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
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "authenticated_all_inventory_movements" on public.inventory_movements;
create policy "authenticated_all_inventory_movements"
    on public.inventory_movements
    for all to authenticated
    using (true)
    with check (true);

grant all on table public.inventory_movements to authenticated;
grant select on table public.inventory_movements to anon;
