-- ============================================================================
-- 0037_mark_default_org_as_demo.sql
-- Marca la organización por defecto como "demo/legacy" para distinguirla de
-- las organizaciones creadas por usuarios reales del SaaS.
-- Cambio aditivo e idempotente.
-- ============================================================================

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'organizations' and column_name = 'is_demo'
    ) then
        alter table public.organizations add column is_demo boolean not null default false;
    end if;
end $$;

-- Marcar la organización por defecto como demo (si existe)
update public.organizations
set is_demo = true
where id = '00000000-0000-0000-0000-000000000001';

comment on column public.organizations.is_demo is
    'Indica si la organizacion es la demo/legacy por defecto del sistema (no creada por un usuario real).';