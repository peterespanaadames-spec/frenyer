-- ==============================================================================
-- MIGRATION: 0034_add_active_organization_id.sql
-- DESCRIPCION: Añade active_organization_id a public.profiles para permitir
--              que un usuario con membresia en varias organizaciones elija
--              con cual opera activamente. Cambio aditivo: no rompe datos
--              existentes ni consultas actuales.
-- ==============================================================================

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'active_organization_id'
    ) then
        alter table public.profiles
        add column active_organization_id uuid references public.organizations(id) on delete set null;
    end if;
end $$;

-- Comentario para documentar la columna
comment on column public.profiles.active_organization_id is
    'Organizacion activa elegida por el usuario para operar. Si es null, se usa la primera membresia por fecha de creacion.';