-- ==============================================================================
-- MIGRATION: 0021_rbac_profiles_and_first_user_trigger.sql
-- DESCRIPCIÓN: Implementación de tabla public.profiles con control RBAC estricto
--              ('gerente', 'administrador', 'cajero', 'cliente'), trigger en auth.users
--              con asignación automática del primer usuario registrado como 'gerente'
--              y políticas de seguridad RLS en Supabase.
-- ==============================================================================

-- 1. Crear o actualizar la tabla public.profiles
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    full_name text,
    role text not null check (role in ('gerente', 'administrador', 'cajero', 'cliente')) default 'cliente',
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Asegurar columnas si la tabla ya existía previamente
do $$
begin
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') then
        alter table public.profiles add column role text not null default 'cliente';
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
        alter table public.profiles add column email text;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name') then
        alter table public.profiles add column full_name text;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
        alter table public.profiles add column created_at timestamptz not null default timezone('utc'::text, now());
    end if;
end $$;

-- Asegurar restricción check de roles permitidos
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('gerente', 'administrador', 'cajero', 'cliente'));

-- 2. Función helper para obtener el rol del usuario autenticado actual (SECURITY DEFINER)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
    select coalesce(
        (select role from public.profiles where id = auth.uid()),
        'anon'
    );
$$;

-- 3. Trigger Function: Asignación automática de perfil y primer usuario como 'gerente'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile_count integer;
    v_assigned_role text;
    v_meta_role text;
    v_full_name text;
begin
    -- Verificar si es el primer usuario en el sistema
    select count(*) into v_profile_count from public.profiles;

    if v_profile_count = 0 then
        -- Primer usuario del sistema recibe rol de 'gerente'
        v_assigned_role := 'gerente';
    else
        -- Verificar si viene un rol válido en el metadata de registro
        v_meta_role := lower(trim(coalesce(new.raw_user_meta_data ->> 'role', '')));
        if v_meta_role in ('gerente', 'administrador', 'cajero', 'cliente') then
            v_assigned_role := v_meta_role;
        else
            v_assigned_role := 'cliente';
        end if;
    end if;

    -- Obtener nombre completo desde metadata si existe
    v_full_name := coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(coalesce(new.email, ''), '@', 1)
    );

    -- Insertar o actualizar el perfil de usuario
    insert into public.profiles (id, email, full_name, role, created_at)
    values (
        new.id,
        new.email,
        v_full_name,
        v_assigned_role,
        timezone('utc'::text, now())
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);

    return new;
end;
$$;

-- 4. Asociar el trigger al evento de inserción de auth.users
drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- 5. Habilitar y configurar Row Level Security (RLS) en public.profiles
alter table public.profiles enable row level security;

-- Limpiar políticas anteriores para evitar colisiones
drop policy if exists "Los usuarios pueden leer su propio perfil" on public.profiles;
drop policy if exists "Los gerentes y administradores pueden leer todos los perfiles" on public.profiles;
drop policy if exists "Los usuarios pueden editar su propio nombre" on public.profiles;
drop policy if exists "Solo gerentes pueden modificar roles de perfiles" on public.profiles;
drop policy if exists "Solo gerentes pueden borrar perfiles" on public.profiles;

-- Política de lectura: El usuario puede ver su perfil o un admin/gerente puede ver todos
create policy "Los usuarios pueden leer su propio perfil"
    on public.profiles
    for select
    to authenticated
    using (
        auth.uid() = id
        or public.get_my_role() in ('gerente', 'administrador')
    );

-- Política de actualización: El usuario puede actualizar sus datos personales
create policy "Los usuarios pueden editar su propio nombre"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (
        auth.uid() = id
        -- No puede auto-ascenderse de rol si no es gerente
        and (
            role = (select role from public.profiles where id = auth.uid())
            or public.get_my_role() = 'gerente'
        )
    );

-- Política de actualización administrativa: Solo gerentes pueden modificar roles de otros usuarios
create policy "Solo gerentes pueden modificar roles de perfiles"
    on public.profiles
    for update
    to authenticated
    using (public.get_my_role() = 'gerente')
    with check (public.get_my_role() = 'gerente');
