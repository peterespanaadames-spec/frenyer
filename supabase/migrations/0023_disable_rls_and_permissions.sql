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
