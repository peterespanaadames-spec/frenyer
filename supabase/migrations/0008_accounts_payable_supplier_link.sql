-- Vincula las cuentas por pagar con proveedores y garantiza operaciones atómicas.
alter table public.accounts_payable
    add column if not exists supplier_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_payable_supplier_id_fkey'
          and conrelid = 'public.accounts_payable'::regclass
    ) then
        alter table public.accounts_payable
            add constraint accounts_payable_supplier_id_fkey
            foreign key (supplier_id) references public.suppliers(id) on delete restrict;
    end if;
end;
$$;

create index if not exists idx_accounts_payable_supplier
    on public.accounts_payable(supplier_id);

-- Vincula nombres históricos solo cuando identifican un proveedor único en la organización.
with unique_matches as (
    select
        ap.id as payable_id,
        min(s.id::text)::uuid as supplier_id,
        min(s.organization_id::text)::uuid as organization_id
    from public.accounts_payable ap
    join public.suppliers s
      on lower(trim(s.name)) = lower(trim(ap.supplier_name))
     and (ap.organization_id is null or ap.organization_id = s.organization_id)
    group by ap.id
    having count(*) = 1
)
update public.accounts_payable ap
set supplier_id = matches.supplier_id,
    organization_id = coalesce(ap.organization_id, matches.organization_id)
from unique_matches matches
where ap.id = matches.payable_id
  and ap.supplier_id is null;

alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;
alter table public.suppliers enable row level security;

drop policy if exists "org_member_cxp" on public.accounts_payable;
create policy "org_member_cxp"
    on public.accounts_payable
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (
        public.is_org_member(organization_id)
        and (
            supplier_id is null
            or exists (
                select 1
                from public.suppliers s
                where s.id = public.accounts_payable.supplier_id
                  and s.organization_id = public.accounts_payable.organization_id
            )
        )
    );

drop policy if exists "org_member_payable_payments" on public.payable_payments;
create policy "org_member_payable_payments"
    on public.payable_payments
    for all to authenticated
    using (
        exists (
            select 1
            from public.accounts_payable ap
            where ap.id = public.payable_payments.payable_id
              and public.is_org_member(ap.organization_id)
        )
    )
    with check (
        exists (
            select 1
            from public.accounts_payable ap
            where ap.id = public.payable_payments.payable_id
              and public.is_org_member(ap.organization_id)
        )
    );

drop policy if exists "allow_all_suppliers" on public.suppliers;
drop policy if exists "org_member_suppliers" on public.suppliers;
create policy "org_member_suppliers"
    on public.suppliers
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

create or replace function public.create_payable_with_initial_payment(
    p_supplier_id uuid,
    p_doc_number text,
    p_concept text,
    p_origin text,
    p_total_usd numeric,
    p_initial_usd numeric,
    p_issue_date date,
    p_due_date date,
    p_description text,
    p_exchange_rate numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_supplier public.suppliers%rowtype;
    v_payable_id uuid;
    v_total_usd numeric(18, 2);
    v_initial_usd numeric(18, 2);
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para registrar cuentas por pagar.';
    end if;

    select * into v_supplier
    from public.suppliers
    where id = p_supplier_id;

    if not found or v_supplier.organization_id is null
       or not public.is_org_member(v_supplier.organization_id) then
        raise exception 'El proveedor no existe o no pertenece a una organización autorizada.';
    end if;

    v_total_usd := round(p_total_usd, 2);
    v_initial_usd := round(coalesce(p_initial_usd, 0), 2);

    if v_total_usd <= 0 or v_initial_usd < 0 or v_initial_usd > v_total_usd then
        raise exception 'El total o el abono inicial no son válidos.';
    end if;
    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;
    if nullif(trim(p_doc_number), '') is null then
        raise exception 'El número de documento es obligatorio.';
    end if;
    if p_origin not in ('Manual', 'Gasto', 'Compra Interna') then
        raise exception 'El origen de la cuenta por pagar no es válido.';
    end if;

    insert into public.accounts_payable (
        organization_id,
        supplier_id,
        supplier_name,
        doc_number,
        concept,
        origin,
        total_usd,
        balance_usd,
        status,
        created_at,
        due_date,
        description
    )
    values (
        v_supplier.organization_id,
        v_supplier.id,
        v_supplier.name,
        trim(p_doc_number),
        coalesce(nullif(trim(p_concept), ''), 'Obligación comercial'),
        p_origin,
        v_total_usd,
        v_total_usd - v_initial_usd,
        case when v_initial_usd = v_total_usd then 'PAGADA'
             when v_initial_usd > 0 then 'PARCIAL'
             else 'PENDIENTE' end,
        p_issue_date::timestamp at time zone 'America/Caracas',
        p_due_date,
        p_description
    )
    returning id into v_payable_id;

    if v_initial_usd > 0 then
        insert into public.payable_payments (
            payable_id,
            amount_usd,
            amount_ves,
            exchange_rate,
            payment_method,
            reference
        )
        values (
            v_payable_id,
            v_initial_usd,
            round(v_initial_usd * p_exchange_rate, 2),
            p_exchange_rate,
            'Caja / Inicial',
            'PAGO-INI'
        );
    end if;

    return v_payable_id;
end;
$$;

create or replace function public.record_payable_payment(
    p_payable_id uuid,
    p_bank_account_id uuid,
    p_amount_usd numeric,
    p_exchange_rate numeric,
    p_payment_method text,
    p_reference text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_payable public.accounts_payable%rowtype;
    v_bank public.bank_accounts%rowtype;
    v_amount_usd numeric(18, 2);
    v_amount_ves numeric(18, 2);
    v_bank_amount numeric(18, 2);
    v_new_balance numeric(18, 2);
    v_payment_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para registrar pagos.';
    end if;

    select * into v_payable
    from public.accounts_payable
    where id = p_payable_id
    for update;

    if not found or not public.is_org_member(v_payable.organization_id) then
        raise exception 'La cuenta por pagar no existe o no está autorizada.';
    end if;

    select * into v_bank
    from public.bank_accounts
    where id = p_bank_account_id
    for update;

    if not found or v_bank.organization_id <> v_payable.organization_id then
        raise exception 'La cuenta bancaria no existe o pertenece a otra organización.';
    end if;
    if upper(coalesce(v_bank.status, '')) <> 'ACTIVO' then
        raise exception 'La cuenta bancaria está inactiva.';
    end if;
    if v_bank.currency not in ('USD', 'VES') then
        raise exception 'La cuenta bancaria debe estar denominada en USD o VES.';
    end if;
    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;

    v_amount_usd := round(p_amount_usd, 2);
    v_amount_ves := round(v_amount_usd * p_exchange_rate, 2);
    if v_amount_usd <= 0 or v_amount_usd > v_payable.balance_usd then
        raise exception 'El monto debe ser mayor a cero y no superar el saldo pendiente.';
    end if;

    v_bank_amount := case when v_bank.currency = 'VES'
                          then v_amount_ves
                          else v_amount_usd end;
    if v_bank.balance < v_bank_amount then
        raise exception 'La cuenta bancaria no tiene saldo suficiente.';
    end if;

    v_new_balance := round(v_payable.balance_usd - v_amount_usd, 2);

    update public.bank_accounts
    set balance = round(balance - v_bank_amount, 2)
    where id = v_bank.id;

    update public.accounts_payable
    set balance_usd = v_new_balance,
        status = case when v_new_balance = 0 then 'PAGADA' else 'PARCIAL' end
    where id = v_payable.id;

    insert into public.payable_payments (
        payable_id,
        bank_account_id,
        amount_usd,
        amount_ves,
        exchange_rate,
        payment_method,
        reference
    )
    values (
        v_payable.id,
        v_bank.id,
        v_amount_usd,
        v_amount_ves,
        p_exchange_rate,
        coalesce(nullif(trim(p_payment_method), ''), v_bank.bank_name),
        nullif(trim(p_reference), '')
    )
    returning id into v_payment_id;

    insert into public.bank_movements (
        organization_id,
        bank_account_id,
        type,
        concept,
        reference,
        user_name,
        rate,
        commission,
        amount
    )
    values (
        v_payable.organization_id,
        v_bank.id,
        'SALIDA',
        'Pago a Proveedor ' || v_payable.supplier_name || ' - Doc: ' || v_payable.doc_number,
        nullif(trim(p_reference), ''),
        auth.uid()::text,
        p_exchange_rate,
        0,
        v_bank_amount
    );

    return v_payment_id;
end;
$$;

revoke all on function public.create_payable_with_initial_payment(uuid, text, text, text, numeric, numeric, date, date, text, numeric) from public, anon;
revoke all on function public.record_payable_payment(uuid, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_payable_with_initial_payment(uuid, text, text, text, numeric, numeric, date, date, text, numeric) to authenticated;
grant execute on function public.record_payable_payment(uuid, uuid, numeric, numeric, text, text) to authenticated;
