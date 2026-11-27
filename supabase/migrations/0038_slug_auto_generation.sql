-- ============================================================================
-- 0038_slug_auto_generation.sql
-- Genera automáticamente el slug de la tienda al crear una organización.
-- Backfill de slugs para organizaciones existentes sin slug.
-- Cambio aditivo e idempotente.
-- ============================================================================

-- 1. Función para generar un slug a partir del nombre de la empresa.
create or replace function public.generate_org_slug(p_name text)
returns text
language plpgsql
immutable
as $$
declare
    v_base text;
    v_slug text;
    v_suffix integer := 0;
begin
    -- Normalizar: minúsculas, reemplazar espacios y caracteres no alfanuméricos por guion.
    v_base := lower(trim(coalesce(p_name, 'tienda')));
    v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
    v_base := regexp_replace(v_base, '^-+|-+$', '', 'g');
    if v_base = '' then
        v_base := 'tienda';
    end if;
    -- Limitar longitud
    v_base := left(v_base, 40);

    v_slug := v_base;
    -- Asegurar unicidad
    while exists (select 1 from public.organizations where slug = v_slug) loop
        v_suffix := v_suffix + 1;
        v_slug := v_base || '-' || v_suffix;
    end loop;

    return v_slug;
end;
$$;

-- 2. Actualizar el trigger de creación de organización para generar slug.
create or replace function public.provision_new_auth_user_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organization_id uuid;
    v_organization_name text;
    v_slug text;
begin
    v_organization_name := left(
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
            nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
            'Mi organización'
        ),
        80
    );

    v_slug := public.generate_org_slug(v_organization_name);

    insert into public.organizations (name, slug)
    values (v_organization_name, v_slug)
    returning id into v_organization_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_organization_id, new.id, 'admin');

    return new;
end;
$$;

-- 3. Backfill: asignar slug a organizaciones existentes sin slug.
do $$
declare
    r record;
    v_slug text;
begin
    for r in
        select id, name from public.organizations where slug is null or slug = ''
    loop
        v_slug := public.generate_org_slug(r.name);
        update public.organizations set slug = v_slug where id = r.id;
    end loop;
end $$;

-- 4. Garantizar que slug no sea null para nuevas organizaciones (default).
alter table public.organizations
    alter column slug set default public.generate_org_slug('tienda');

comment on column public.organizations.slug is
    'Identificador URL-safe de la tienda (generado automaticamente). Usado en /tienda/:slug.';