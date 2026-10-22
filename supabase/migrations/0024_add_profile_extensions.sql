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
