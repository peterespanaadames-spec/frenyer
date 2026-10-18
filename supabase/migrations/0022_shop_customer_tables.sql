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
