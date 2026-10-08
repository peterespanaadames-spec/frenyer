-- Función de permisos de escritura: miembros autenticados de la organización.
-- Se define aquí porque las políticas y RPCs previas sólo cuentan con is_org_member.
create or replace function public.is_org_writer(org uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.organization_members m
        where m.organization_id = org
          and m.user_id = auth.uid()
    );
$$;

create or replace function public.record_bank_movement(
    p_bank_account_id uuid,
    p_type text,
    p_amount numeric,
    p_rate numeric,
    p_concept text,
    p_reference text default null,
    p_commission numeric default 0,
    p_commission_type text default 'Fija'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_bank public.bank_accounts%rowtype;
    v_amount numeric(18, 2);
    v_commission numeric(18, 2);
    v_balance_delta numeric(18, 2);
    v_movement public.bank_movements%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
    end if;
    if p_type not in ('ENTRADA', 'SALIDA') then
        raise exception 'El tipo de movimiento no es válido.' using errcode = '22023';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'El monto debe ser mayor a cero.' using errcode = '22023';
    end if;
    if p_rate is null or p_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;
    if coalesce(p_commission, 0) < 0 then
        raise exception 'La comisión no puede ser negativa.' using errcode = '22023';
    end if;
    if coalesce(p_commission_type, 'Fija') not in ('Fija', 'Porcentual') then
        raise exception 'El tipo de comisión no es válido.' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_concept, '')), '') is null then
        raise exception 'El concepto del movimiento es obligatorio.' using errcode = '22023';
    end if;

    select *
    into v_bank
    from public.bank_accounts
    where id = p_bank_account_id
    for update;

    if not found then
        raise exception 'Cuenta bancaria no encontrada o sin acceso.' using errcode = 'P0002';
    end if;
    if not public.is_org_writer(v_bank.organization_id) then
        raise exception 'No tiene permisos para modificar esta cuenta.' using errcode = '42501';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_amount := round(p_amount, 2);
    v_commission := case
        when coalesce(p_commission_type, 'Fija') = 'Porcentual'
            then round(v_amount * coalesce(p_commission, 0) / 100, 2)
        else round(coalesce(p_commission, 0), 2)
    end;
    v_balance_delta := case
        when p_type = 'ENTRADA' then v_amount
        else -(v_amount + v_commission)
    end;

    if p_type = 'SALIDA' and round(coalesce(v_bank.balance, 0), 2) < abs(v_balance_delta) then
        raise exception 'La cuenta bancaria no tiene saldo suficiente.' using errcode = '22023';
    end if;

    update public.bank_accounts
    set balance = round(balance + v_balance_delta, 2)
    where id = v_bank.id;

    insert into public.bank_movements (
        organization_id,
        bank_account_id,
        type,
        concept,
        reference,
        user_name,
        rate,
        commission,
        commission_type,
        amount
    )
    values (
        v_bank.organization_id,
        v_bank.id,
        p_type,
        trim(p_concept),
        nullif(trim(coalesce(p_reference, '')), ''),
        auth.uid()::text,
        p_rate,
        v_commission,
        coalesce(p_commission_type, 'Fija'),
        v_amount
    )
    returning * into v_movement;

    return to_jsonb(v_movement);
end;
$$;

create or replace function public.record_bank_transfer(
    p_source_account_id uuid,
    p_target_account_id uuid,
    p_source_amount numeric,
    p_target_amount numeric,
    p_rate numeric,
    p_concept text,
    p_reference text default null,
    p_commission numeric default 0,
    p_commission_type text default 'Fija'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_bank public.bank_accounts%rowtype;
    v_source public.bank_accounts%rowtype;
    v_target public.bank_accounts%rowtype;
    v_account_count integer := 0;
    v_source_amount numeric(18, 2);
    v_target_amount numeric(18, 2);
    v_commission numeric(18, 2);
    v_source_movement public.bank_movements%rowtype;
    v_target_movement public.bank_movements%rowtype;
    v_reference text;
    v_concept text;
    v_expected_target_amount numeric(18, 2);
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
    end if;
    if p_source_account_id is null or p_target_account_id is null
       or p_source_account_id = p_target_account_id then
        raise exception 'Selecciona cuentas de origen y destino diferentes.' using errcode = '22023';
    end if;
    if p_source_amount is null or p_source_amount <= 0
       or p_target_amount is null or p_target_amount <= 0 then
        raise exception 'Los montos de origen y destino deben ser mayores a cero.' using errcode = '22023';
    end if;
    if p_rate is null or p_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;
    if coalesce(p_commission, 0) < 0 then
        raise exception 'La comisión no puede ser negativa.' using errcode = '22023';
    end if;
    if coalesce(p_commission_type, 'Fija') not in ('Fija', 'Porcentual') then
        raise exception 'El tipo de comisión no es válido.' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(p_concept, '')), '') is null then
        raise exception 'El concepto de la transferencia es obligatorio.' using errcode = '22023';
    end if;

    for v_bank in
        select *
        from public.bank_accounts
        where id in (p_source_account_id, p_target_account_id)
        order by id
        for update
    loop
        v_account_count := v_account_count + 1;
        if not public.is_org_writer(v_bank.organization_id) then
            raise exception 'No tiene permisos para modificar una de las cuentas.' using errcode = '42501';
        end if;
        if v_bank.status <> 'Activo' then
            raise exception 'Las cuentas de la transferencia deben estar activas.' using errcode = '22023';
        end if;
        if v_bank.currency not in ('USD', 'VES') then
            raise exception 'Las cuentas deben estar denominadas en USD o VES.' using errcode = '22023';
        end if;
        if v_bank.id = p_source_account_id then
            v_source := v_bank;
        else
            v_target := v_bank;
        end if;
    end loop;

    if v_account_count <> 2 then
        raise exception 'Una o ambas cuentas no existen o no son accesibles.' using errcode = 'P0002';
    end if;
    if v_source.organization_id <> v_target.organization_id then
        raise exception 'No se permiten transferencias entre organizaciones.' using errcode = '42501';
    end if;

    v_source_amount := round(p_source_amount, 2);
    v_target_amount := round(p_target_amount, 2);
    v_expected_target_amount := case
        when v_source.currency = v_target.currency then v_source_amount
        when v_source.currency = 'VES' then round(v_source_amount / p_rate, 2)
        else round(v_source_amount * p_rate, 2)
    end;
    if v_target_amount <> v_expected_target_amount then
        raise exception 'El monto destino no coincide con la conversión de monedas a la tasa indicada.' using errcode = '22023';
    end if;
    v_commission := case
        when coalesce(p_commission_type, 'Fija') = 'Porcentual'
            then round(v_source_amount * coalesce(p_commission, 0) / 100, 2)
        else round(coalesce(p_commission, 0), 2)
    end;
    if round(coalesce(v_source.balance, 0), 2) < v_source_amount + v_commission then
        raise exception 'La cuenta de origen no tiene saldo suficiente.' using errcode = '22023';
    end if;

    update public.bank_accounts
    set balance = round(balance - v_source_amount - v_commission, 2)
    where id = v_source.id;

    update public.bank_accounts
    set balance = round(balance + v_target_amount, 2)
    where id = v_target.id;

    v_reference := nullif(trim(coalesce(p_reference, '')), '');
    v_concept := trim(p_concept);

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        v_source.organization_id, v_source.id, 'SALIDA',
        v_concept || ' - Transferencia enviada a ' || v_target.bank_name,
        v_reference, auth.uid()::text, p_rate, v_commission,
        coalesce(p_commission_type, 'Fija'), v_source_amount
    )
    returning * into v_source_movement;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        v_target.organization_id, v_target.id, 'ENTRADA',
        v_concept || ' - Transferencia recibida de ' || v_source.bank_name,
        v_reference, auth.uid()::text, p_rate, 0, 'Fija', v_target_amount
    )
    returning * into v_target_movement;

    return jsonb_build_object(
        'source_movement', to_jsonb(v_source_movement),
        'target_movement', to_jsonb(v_target_movement)
    );
end;
$$;

revoke all on function public.record_bank_movement(uuid, text, numeric, numeric, text, text, numeric, text) from public, anon;
revoke all on function public.record_bank_transfer(uuid, uuid, numeric, numeric, numeric, text, text, numeric, text) from public, anon;
grant execute on function public.record_bank_movement(uuid, text, numeric, numeric, text, text, numeric, text) to authenticated;
grant execute on function public.record_bank_transfer(uuid, uuid, numeric, numeric, numeric, text, text, numeric, text) to authenticated;
