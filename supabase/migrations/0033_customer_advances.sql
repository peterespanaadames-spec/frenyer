-- ============================================================================
-- 0033_customer_advances.sql
-- Módulo de ANTICIPOS DE CLIENTES (dinero a favor del cliente).
--
-- QUÉ CREA
--   1. public.customer_advances          -> cabecera del anticipo (saldo en USD)
--   2. public.customer_advance_movements -> bitácora: ANTICIPO / APLICACION /
--                                           DEVOLUCION / ANULACION
--   3. Funciones transaccionales (una sola transacción por operación):
--        customer_advance_create   (entra dinero al banco)
--        customer_advance_apply    (cruza contra una CxC, sin tocar el banco)
--        customer_advance_refund   (sale dinero del banco)
--        customer_advance_void     (anula un anticipo sin uso y devuelve el dinero)
--
-- MODELO MONETARIO (igual que el resto del ERP)
--   amount_usd / applied_usd / refunded_usd / balance_usd están SIEMPRE en USD
--   (moneda canónica de CxC). amount_original y currency guardan lo que el
--   cliente entregó realmente y exchange_rate la tasa de la operación.
--   El movimiento bancario se registra en la moneda de la cuenta destino.
--
-- SEGURIDAD
--   RLS habilitada sin políticas (mismo criterio que 0032): solo el backend con
--   service_role accede. Las funciones se revocan de anon/authenticated/PUBLIC
--   y se conceden únicamente a service_role, de modo que no quedan expuestas
--   por RPC ni antes ni después de aplicar 0032.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin errores.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Secuencia de folios (ANT-000001, ANT-000002, ...)
-- ----------------------------------------------------------------------------
create sequence if not exists public.customer_advances_number_seq;

-- ----------------------------------------------------------------------------
-- 1. Cabecera del anticipo
-- ----------------------------------------------------------------------------
create table if not exists public.customer_advances (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    customer_id     uuid not null references public.customers(id) on delete restrict,
    advance_number  text not null,
    received_at     date not null default current_date,
    currency        text not null default 'USD',
    amount_original numeric(18, 2) not null,
    exchange_rate   numeric(18, 4) not null default 1,
    amount_usd      numeric(18, 2) not null,
    applied_usd     numeric(18, 2) not null default 0,
    refunded_usd    numeric(18, 2) not null default 0,
    -- Saldo derivado: no puede desincronizarse ni volverse negativo.
    balance_usd     numeric(18, 2) generated always as
                    (round(amount_usd - applied_usd - refunded_usd, 2)) stored,
    bank_account_id uuid references public.bank_accounts(id) on delete restrict,
    payment_method  text,
    reference       text,
    notes           text,
    status          text not null default 'DISPONIBLE',
    created_by      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint customer_advances_currency_chk check (currency in ('USD', 'VES')),
    constraint customer_advances_status_chk check (status in ('DISPONIBLE', 'APLICADO', 'DEVUELTO', 'ANULADO')),
    constraint customer_advances_amount_chk check (amount_original > 0 and amount_usd > 0 and exchange_rate > 0),
    constraint customer_advances_usage_chk check (
        applied_usd >= 0
        and refunded_usd >= 0
        and applied_usd + refunded_usd <= amount_usd + 0.005
    ),
    constraint customer_advances_number_uk unique (organization_id, advance_number)
);

create index if not exists idx_customer_advances_org_customer
    on public.customer_advances (organization_id, customer_id);
create index if not exists idx_customer_advances_available
    on public.customer_advances (organization_id, customer_id)
    where status in ('DISPONIBLE', 'APLICADO');
create index if not exists idx_customer_advances_received
    on public.customer_advances (received_at desc);

-- ----------------------------------------------------------------------------
-- 2. Bitácora del anticipo (trazabilidad completa del cruce y de las salidas)
-- ----------------------------------------------------------------------------
create table if not exists public.customer_advance_movements (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    advance_id       uuid not null references public.customer_advances(id) on delete restrict,
    customer_id      uuid not null references public.customers(id) on delete restrict,
    type             text not null,
    receivable_id    uuid references public.accounts_receivable(id) on delete set null,
    bank_account_id  uuid references public.bank_accounts(id) on delete set null,
    bank_movement_id uuid references public.bank_movements(id) on delete set null,
    amount_usd       numeric(18, 2) not null,
    amount_original  numeric(18, 2),
    exchange_rate    numeric(18, 4) not null default 1,
    reference        text,
    notes            text,
    created_by       text,
    created_at       timestamptz not null default now(),
    constraint customer_advance_movements_type_chk check (type in ('ANTICIPO', 'APLICACION', 'DEVOLUCION', 'ANULACION')),
    constraint customer_advance_movements_amount_chk check (amount_usd > 0)
);

create index if not exists idx_customer_advance_movements_advance
    on public.customer_advance_movements (advance_id, created_at desc);
create index if not exists idx_customer_advance_movements_receivable
    on public.customer_advance_movements (receivable_id);

-- ----------------------------------------------------------------------------
-- 3. RLS y permisos (acceso exclusivo del backend con service_role)
-- ----------------------------------------------------------------------------
alter table public.customer_advances enable row level security;
alter table public.customer_advance_movements enable row level security;

revoke all privileges on table public.customer_advances from public, anon, authenticated;
revoke all privileges on table public.customer_advance_movements from public, anon, authenticated;
grant all privileges on table public.customer_advances to service_role;
grant all privileges on table public.customer_advance_movements to service_role;
grant usage, select on sequence public.customer_advances_number_seq to service_role;

-- ----------------------------------------------------------------------------
-- 4. Registro de un anticipo (entrada de dinero)
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_create(
    p_organization_id uuid,
    p_customer_id     uuid,
    p_bank_account_id uuid,
    p_amount_original numeric,
    p_currency        text,
    p_exchange_rate   numeric,
    p_received_at     date,
    p_payment_method  text,
    p_reference       text,
    p_notes           text,
    p_created_by      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_customer       public.customers%rowtype;
    v_bank           public.bank_accounts%rowtype;
    v_currency       text := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
    v_amount_original numeric(18, 2);
    v_rate           numeric(18, 4);
    v_amount_usd     numeric(18, 2);
    v_bank_amount    numeric(18, 2);
    v_number         text;
    v_advance        public.customer_advances%rowtype;
    v_bank_movement  public.bank_movements%rowtype;
begin
    if p_organization_id is null then
        raise exception 'La organización es obligatoria.' using errcode = '22023';
    end if;
    if v_currency not in ('USD', 'VES') then
        raise exception 'La moneda del anticipo debe ser USD o VES.' using errcode = '22023';
    end if;

    v_amount_original := round(coalesce(p_amount_original, 0), 2);
    if v_amount_original <= 0 then
        raise exception 'El monto del anticipo debe ser mayor a cero.' using errcode = '22023';
    end if;
    v_rate := round(coalesce(nullif(p_exchange_rate, 0), 1), 4);
    if v_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_customer
      from public.customers
     where id = p_customer_id
       and organization_id = p_organization_id;
    if not found then
        raise exception 'El cliente no existe en esta organización.' using errcode = 'P0002';
    end if;

    select * into v_bank
      from public.bank_accounts
     where id = p_bank_account_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta bancaria no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_amount_usd := case
        when v_currency = 'USD' then v_amount_original
        else round(v_amount_original / v_rate, 2)
    end;
    if v_amount_usd <= 0 then
        raise exception 'El monto en dólares del anticipo es inválido.' using errcode = '22023';
    end if;

    -- Lo que realmente entra a la cuenta, en la moneda de esa cuenta.
    v_bank_amount := case
        when v_bank.currency = v_currency then v_amount_original
        when v_bank.currency = 'VES' then round(v_amount_usd * v_rate, 2)
        else v_amount_usd
    end;
    if v_bank_amount <= 0 then
        raise exception 'El monto acreditado en la cuenta bancaria es inválido.' using errcode = '22023';
    end if;

    v_number := 'ANT-' || lpad(nextval('public.customer_advances_number_seq')::text, 6, '0');

    insert into public.customer_advances (
        organization_id, customer_id, advance_number, received_at, currency,
        amount_original, exchange_rate, amount_usd, bank_account_id,
        payment_method, reference, notes, status, created_by
    )
    values (
        p_organization_id, v_customer.id, v_number,
        coalesce(p_received_at, current_date), v_currency,
        v_amount_original, v_rate, v_amount_usd, v_bank.id,
        nullif(trim(coalesce(p_payment_method, '')), ''),
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        'DISPONIBLE',
        nullif(trim(coalesce(p_created_by, '')), '')
    )
    returning * into v_advance;

    update public.bank_accounts
       set balance = round(balance + v_bank_amount, 2)
     where id = v_bank.id;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        p_organization_id, v_bank.id, 'ENTRADA',
        'Anticipo de cliente - ' || v_customer.name || ' (' || v_number || ')',
        nullif(trim(coalesce(p_reference, '')), ''),
        coalesce(nullif(trim(coalesce(p_created_by, '')), ''), 'Sistema'),
        v_rate, 0, 'Fija', v_bank_amount
    )
    returning * into v_bank_movement;

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, bank_account_id,
        bank_movement_id, amount_usd, amount_original, exchange_rate,
        reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_customer.id, 'ANTICIPO', v_bank.id,
        v_bank_movement.id, v_amount_usd, v_amount_original, v_rate,
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'bank_movement', to_jsonb(v_bank_movement)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Aplicación del anticipo a una cuenta por cobrar (sin tocar el banco)
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_apply(
    p_organization_id uuid,
    p_advance_id      uuid,
    p_receivable_id   uuid,
    p_amount_usd      numeric,
    p_reference       text,
    p_notes           text,
    p_created_by      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_advance     public.customer_advances%rowtype;
    v_receivable  public.accounts_receivable%rowtype;
    v_amount      numeric(18, 2);
    v_new_balance numeric(18, 2);
    v_new_status  text;
    v_adv_status  text;
    v_rate        numeric(18, 4);
    v_reference   text;
begin
    v_amount := round(coalesce(p_amount_usd, 0), 2);
    if v_amount <= 0 then
        raise exception 'El monto a aplicar debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_advance
      from public.customer_advances
     where id = p_advance_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'El anticipo no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_advance.status = 'ANULADO' then
        raise exception 'El anticipo está anulado.' using errcode = '22023';
    end if;
    if round(v_advance.balance_usd, 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo disponible del anticipo (disponible: % USD).', round(v_advance.balance_usd, 2)
            using errcode = '22023';
    end if;

    select * into v_receivable
      from public.accounts_receivable
     where id = p_receivable_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta por cobrar no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_receivable.customer_id is null or v_receivable.customer_id <> v_advance.customer_id then
        raise exception 'La cuenta por cobrar no pertenece al cliente del anticipo.' using errcode = '22023';
    end if;
    if round(coalesce(v_receivable.balance_usd, 0), 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo pendiente de la cuenta por cobrar (pendiente: % USD).', round(coalesce(v_receivable.balance_usd, 0), 2)
            using errcode = '22023';
    end if;

    v_rate := coalesce(nullif(v_advance.exchange_rate, 0), 1);
    v_new_balance := greatest(0, round(coalesce(v_receivable.balance_usd, 0) - v_amount, 2));
    v_new_status := case when v_new_balance <= 0.005 then 'PAGADO' else 'PARCIAL' end;
    v_adv_status := case when round(v_advance.balance_usd - v_amount, 2) <= 0.005 then 'APLICADO' else 'DISPONIBLE' end;
    v_reference := coalesce(nullif(trim(coalesce(p_reference, '')), ''), v_advance.advance_number);

    update public.customer_advances
       set applied_usd = round(applied_usd + v_amount, 2),
           status = v_adv_status,
           updated_at = now()
     where id = v_advance.id
     returning * into v_advance;

    update public.accounts_receivable
       set balance_usd = v_new_balance,
           status = v_new_status
     where id = v_receivable.id;

    -- Historial del abono en la CxC: sin cuenta bancaria, porque el dinero
    -- entró cuando se recibió el anticipo (no se duplica el ingreso).
    insert into public.receivable_payments (
        receivable_id, bank_account_id, amount_usd, amount_ves,
        exchange_rate, payment_method, reference, payment_date
    )
    values (
        v_receivable.id, null, v_amount, round(v_amount * v_rate, 2),
        v_rate, 'Anticipo de cliente', v_reference, now()
    );

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, receivable_id,
        amount_usd, exchange_rate, reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_advance.customer_id, 'APLICACION', v_receivable.id,
        v_amount, v_rate, v_reference,
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'receivable', jsonb_build_object(
            'id', v_receivable.id,
            'balance_usd', v_new_balance,
            'status', v_new_status
        )
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Devolución (salida de dinero) y anulación de un anticipo sin uso
-- ----------------------------------------------------------------------------
create or replace function public.customer_advance_refund(
    p_organization_id uuid,
    p_advance_id      uuid,
    p_bank_account_id uuid,
    p_amount_usd      numeric,
    p_exchange_rate   numeric,
    p_reference       text,
    p_notes           text,
    p_created_by      text,
    p_void            boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_advance       public.customer_advances%rowtype;
    v_bank          public.bank_accounts%rowtype;
    v_amount        numeric(18, 2);
    v_rate          numeric(18, 4);
    v_bank_amount   numeric(18, 2);
    v_new_status    text;
    v_movement_type text;
    v_concept       text;
    v_bank_movement public.bank_movements%rowtype;
begin
    v_amount := round(coalesce(p_amount_usd, 0), 2);
    if v_amount <= 0 then
        raise exception 'El monto a devolver debe ser mayor a cero.' using errcode = '22023';
    end if;

    select * into v_advance
      from public.customer_advances
     where id = p_advance_id
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'El anticipo no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_advance.status = 'ANULADO' then
        raise exception 'El anticipo ya está anulado.' using errcode = '22023';
    end if;
    if coalesce(p_void, false) and round(v_advance.applied_usd, 2) > 0.005 then
        raise exception 'El anticipo tiene aplicaciones registradas. Debe reversarlas antes de anularlo.' using errcode = '22023';
    end if;
    if round(v_advance.balance_usd, 2) < v_amount - 0.005 then
        raise exception 'El monto supera el saldo disponible del anticipo (disponible: % USD).', round(v_advance.balance_usd, 2)
            using errcode = '22023';
    end if;

    select * into v_bank
      from public.bank_accounts
     where id = coalesce(p_bank_account_id, v_advance.bank_account_id)
       and organization_id = p_organization_id
       for update;
    if not found then
        raise exception 'La cuenta bancaria de la devolución no existe en esta organización.' using errcode = 'P0002';
    end if;
    if v_bank.status <> 'Activo' then
        raise exception 'La cuenta bancaria de la devolución está inactiva.' using errcode = '22023';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.' using errcode = '22023';
    end if;

    v_rate := round(coalesce(nullif(p_exchange_rate, 0), nullif(v_advance.exchange_rate, 0), 1), 4);
    v_bank_amount := case
        when v_bank.currency = 'VES' then round(v_amount * v_rate, 2)
        else v_amount
    end;
    if round(coalesce(v_bank.balance, 0), 2) < v_bank_amount then
        raise exception 'La cuenta bancaria no tiene saldo suficiente para la devolución.' using errcode = '22023';
    end if;

    if coalesce(p_void, false) then
        v_new_status := 'ANULADO';
        v_movement_type := 'ANULACION';
        v_concept := 'Anulación de anticipo - ' || v_advance.advance_number;
    else
        v_new_status := case when round(v_advance.balance_usd - v_amount, 2) <= 0.005 then 'DEVUELTO' else 'DISPONIBLE' end;
        v_movement_type := 'DEVOLUCION';
        v_concept := 'Devolución de anticipo - ' || v_advance.advance_number;
    end if;

    update public.customer_advances
       set refunded_usd = round(refunded_usd + v_amount, 2),
           status = v_new_status,
           updated_at = now()
     where id = v_advance.id
     returning * into v_advance;

    update public.bank_accounts
       set balance = round(balance - v_bank_amount, 2)
     where id = v_bank.id;

    insert into public.bank_movements (
        organization_id, bank_account_id, type, concept, reference,
        user_name, rate, commission, commission_type, amount
    )
    values (
        p_organization_id, v_bank.id, 'SALIDA', v_concept,
        nullif(trim(coalesce(p_reference, '')), ''),
        coalesce(nullif(trim(coalesce(p_created_by, '')), ''), 'Sistema'),
        v_rate, 0, 'Fija', v_bank_amount
    )
    returning * into v_bank_movement;

    insert into public.customer_advance_movements (
        organization_id, advance_id, customer_id, type, bank_account_id,
        bank_movement_id, amount_usd, amount_original, exchange_rate,
        reference, notes, created_by
    )
    values (
        p_organization_id, v_advance.id, v_advance.customer_id, v_movement_type, v_bank.id,
        v_bank_movement.id, v_amount, v_bank_amount, v_rate,
        nullif(trim(coalesce(p_reference, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_created_by, '')), '')
    );

    return jsonb_build_object(
        'advance', to_jsonb(v_advance),
        'bank_movement', to_jsonb(v_bank_movement)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permisos de las funciones: solo service_role (backend)
-- ----------------------------------------------------------------------------
revoke all on function public.customer_advance_create(uuid, uuid, uuid, numeric, text, numeric, date, text, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_advance_apply(uuid, uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_advance_refund(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.customer_advance_create(uuid, uuid, uuid, numeric, text, numeric, date, text, text, text, text) to service_role;
grant execute on function public.customer_advance_apply(uuid, uuid, uuid, numeric, text, text, text) to service_role;
grant execute on function public.customer_advance_refund(uuid, uuid, uuid, numeric, numeric, text, text, text, boolean) to service_role;

commit;

-- ============================================================================
-- VERIFICACIÓN (ejecutar aparte, fuera de la transacción)
-- ============================================================================
-- a) Tablas creadas y con RLS:
--    select relname, relrowsecurity from pg_class
--     where relname in ('customer_advances', 'customer_advance_movements');
-- b) Invariante de saldo (debe devolver 0 filas):
--    select id, advance_number from public.customer_advances
--     where balance_usd <> round(amount_usd - applied_usd - refunded_usd, 2)
--        or balance_usd < 0;
-- c) Funciones sin acceso público:
--    select routine_name, grantee, privilege_type
--      from information_schema.routine_privileges
--     where routine_name like 'customer_advance%';
-- ============================================================================
