-- ==============================================================================
-- MIGRATION: 0036_rbac_organization_members_role.sql
-- DESCRIPCION: Mueve el rol efectivo de public.profiles.role a
--              public.organization_members.role para permitir RBAC real por
--              organización (un usuario puede ser gerente en una empresa y
--              cajero en otra). Cambio aditivo: no rompe datos existentes.
-- ==============================================================================

-- 1. Asegurar que organization_members.role exista y tenga los mismos valores
--    permitidos que profiles.role ('gerente', 'administrador', 'cajero', 'cliente')
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'organization_members' and column_name = 'role'
    ) then
        alter table public.organization_members add column role text default 'cliente';
    end if;
end $$;

-- 2. Check constraint para valores permitidos (aditivo: si ya existe no falla)
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'organization_members_role_check'
          and conrelid = 'public.organization_members'::regclass
    ) then
        alter table public.organization_members
        add constraint organization_members_role_check
        check (role in ('gerente', 'administrador', 'cajero', 'cliente'));
    end if;
end $$;

-- 3. Default value para nuevas filas
alter table public.organization_members
    alter column role set default 'cliente';

-- 4. Backfill: copiar profiles.role a organization_members.role donde sea null
--    y el usuario tenga perfil con rol definido
update public.organization_members om
set role = p.role
from public.profiles p
where p.id = om.user_id
  and om.role is null
  and p.role is not null;

-- 5. Para filas que ainda queden sin role, asignar 'cliente'
update public.organization_members
set role = 'cliente'
where role is null;

-- 6. Comentario documental
comment on column public.organization_members.role is
    'Rol del usuario dentro de esta organización específica (RBAC por org).';