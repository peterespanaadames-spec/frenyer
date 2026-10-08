-- Crea un espacio aislado para cada nuevo registro y asigna su primer usuario como administrador.
create or replace function public.provision_new_auth_user_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organization_id uuid;
    v_organization_name text;
begin
    v_organization_name := left(
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
            nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
            'Mi organización'
        ),
        80
    );

    insert into public.organizations (name)
    values (v_organization_name)
    returning id into v_organization_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_organization_id, new.id, 'admin');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_provision_organization on auth.users;
create trigger on_auth_user_created_provision_organization
    after insert on auth.users
    for each row
    execute function public.provision_new_auth_user_organization();
