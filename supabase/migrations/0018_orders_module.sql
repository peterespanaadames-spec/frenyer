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
