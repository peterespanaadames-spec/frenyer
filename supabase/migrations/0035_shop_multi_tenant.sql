-- ==============================================================================
-- MIGRATION: 0035_shop_multi_tenant.sql
-- DESCRIPCION: Hace la tienda online multi-tenant.
--              - Añade organization_id a shop_customers, customer_wishlist, customer_orders
--              - Añade slug a organizations para identificar la tienda por URL
--              - Cambios aditivos: no rompen datos existentes
-- ==============================================================================

-- 1. Slug unico en organizations
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'organizations' and column_name = 'slug'
    ) then
        alter table public.organizations add column slug text unique;
    end if;
end $$;

-- 2. organization_id en shop_customers
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'shop_customers' and column_name = 'organization_id'
    ) then
        alter table public.shop_customers add column organization_id uuid references public.organizations(id) on delete cascade;
    end if;
end $$;

-- 3. organization_id en customer_wishlist
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'customer_wishlist' and column_name = 'organization_id'
    ) then
        alter table public.customer_wishlist add column organization_id uuid references public.organizations(id) on delete cascade;
    end if;
end $$;

-- 4. organization_id en customer_orders
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'customer_orders' and column_name = 'organization_id'
    ) then
        alter table public.customer_orders add column organization_id uuid references public.organizations(id) on delete cascade;
    end if;
end $$;

-- 5. Backfill: asignar la organizacion por defecto a filas existentes sin organization_id
--    (si la tabla organizations tiene al menos una fila)
do $$
declare
    v_default_org uuid;
begin
    select id into v_default_org from public.organizations order by created_at asc limit 1;

    if v_default_org is not null then
        update public.shop_customers set organization_id = v_default_org where organization_id is null;
        update public.customer_wishlist set organization_id = v_default_org where organization_id is null;
        update public.customer_orders set organization_id = v_default_org where organization_id is null;
    end if;
end $$;

-- 6. Índices para consultas por organización
create index if not exists idx_shop_customers_org on public.shop_customers(organization_id);
create index if not exists idx_customer_wishlist_org on public.customer_wishlist(organization_id);
create index if not exists idx_customer_orders_org on public.customer_orders(organization_id);
create index if not exists idx_organizations_slug on public.organizations(slug);