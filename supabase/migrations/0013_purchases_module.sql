-- ==============================================================================
-- 0013_purchases_module.sql: MÓDULO DE COMPRAS E INGRESO DE INVENTARIO
-- ==============================================================================
-- Proporciona las tablas purchases y purchase_items, políticas RLS, correlativos
-- automáticos e integración transaccional con productos, cuentas por pagar y bancos.
-- ==============================================================================

-- 1. TABLA PRINCIPAL DE COMPRAS
create table if not exists public.purchases (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_id uuid references public.suppliers(id) on delete set null,
    doc_number text not null, -- Correlativo interno (e.g. CMP-00001)
    invoice_number text not null, -- N° de Factura o Control del Proveedor
    purchase_date date not null default current_date,
    warehouse text default 'Tienda Bella Vista (SP-01)',
    payment_type text not null default 'CONTADO', -- CONTADO, CREDITO
    exchange_rate numeric(18, 4) not null default 1,
    subtotal_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    notes text,
    status text not null default 'COMPLETADA', -- COMPLETADA, ANULADA
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    payment_method text,
    payment_reference text,
    due_date date,
    payable_id uuid references public.accounts_payable(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_purchases_org on public.purchases(organization_id);
create index if not exists idx_purchases_supplier on public.purchases(supplier_id);
create index if not exists idx_purchases_doc on public.purchases(doc_number);
create index if not exists idx_purchases_date on public.purchases(purchase_date);

-- 2. TABLA DE ÍTEMS DE COMPRA
create table if not exists public.purchase_items (
    id uuid primary key default gen_random_uuid(),
    purchase_id uuid not null references public.purchases(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    sku text not null,
    name text not null,
    quantity numeric(18, 4) not null default 1,
    unit_cost_usd numeric(18, 4) not null default 0,
    total_usd numeric(18, 4) not null default 0,
    total_ves numeric(18, 4) not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

-- 3. HABILITACIÓN DE SEGURIDAD RLS
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "org_member_purchases" on public.purchases;
create policy "org_member_purchases"
    on public.purchases
    for all to authenticated
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));

drop policy if exists "org_member_purchase_items" on public.purchase_items;
create policy "org_member_purchase_items"
    on public.purchase_items
    for all to authenticated
    using (
        exists (
            select 1 from public.purchases p
            where p.id = public.purchase_items.purchase_id
              and public.is_org_member(p.organization_id)
        )
    )
    with check (
        exists (
            select 1 from public.purchases p
            where p.id = public.purchase_items.purchase_id
              and public.is_org_member(p.organization_id)
        )
    );

-- 4. FUNCIÓN TRANSACCIONAL: REGISTRAR COMPRA E INCREMENTAR STOCK
create or replace function public.record_internal_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_invoice_number text,
    p_purchase_date date,
    p_warehouse text,
    p_payment_type text,
    p_exchange_rate numeric,
    p_notes text,
    p_update_costs boolean,
    p_items jsonb,
    p_bank_account_id uuid default null,
    p_payment_method text default null,
    p_payment_reference text default null,
    p_due_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_supplier public.suppliers%rowtype;
    v_next_num integer;
    v_doc_number text;
    v_purchase_id uuid;
    v_payable_id uuid;
    v_total_usd numeric(18, 4) := 0;
    v_total_ves numeric(18, 4) := 0;
    v_item jsonb;
    v_prod_id uuid;
    v_sku text;
    v_name text;
    v_qty numeric(18, 4);
    v_cost numeric(18, 4);
    v_item_tot_usd numeric(18, 4);
    v_item_tot_ves numeric(18, 4);
    v_bank public.bank_accounts%rowtype;
    v_bank_deduct numeric(18, 4);
begin
    -- 1. Validar proveedor
    if p_supplier_id is not null then
        select * into v_supplier from public.suppliers where id = p_supplier_id;
    end if;

    -- 2. Calcular correlativo doc_number: CMP-00001
    select coalesce(max(nullif(regexp_replace(doc_number, '\D', '', 'g'), '')::integer), 0) + 1
    into v_next_num
    from public.purchases
    where organization_id = p_organization_id;

    v_doc_number := 'CMP-' || lpad(v_next_num::text, 5, '0');

    -- 3. Calcular totales sumando ítems
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := coalesce((v_item->>'quantity')::numeric, 1);
        v_cost := coalesce((v_item->>'unit_cost_usd')::numeric, 0);
        v_item_tot_usd := round(v_qty * v_cost, 2);
        v_total_usd := v_total_usd + v_item_tot_usd;
    end loop;

    v_total_ves := round(v_total_usd * coalesce(p_exchange_rate, 1), 2);

    -- 4. Si es Crédito, crear la cuenta por pagar vinculada
    if upper(coalesce(p_payment_type, 'CONTADO')) = 'CREDITO' and p_supplier_id is not null then
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
        ) values (
            p_organization_id,
            p_supplier_id,
            coalesce(v_supplier.name, 'Proveedor'),
            coalesce(nullif(trim(p_invoice_number), ''), v_doc_number),
            'Compra de inventario (' || v_doc_number || ')',
            'Compra Interna',
            v_total_usd,
            v_total_usd,
            'PENDIENTE',
            p_purchase_date::timestamp at time zone 'America/Caracas',
            coalesce(p_due_date, p_purchase_date + interval '30 days'),
            p_notes
        ) returning id into v_payable_id;
    end if;

    -- 5. Insertar cabecera de la compra
    insert into public.purchases (
        organization_id,
        supplier_id,
        doc_number,
        invoice_number,
        purchase_date,
        warehouse,
        payment_type,
        exchange_rate,
        subtotal_usd,
        total_usd,
        total_ves,
        notes,
        status,
        bank_account_id,
        payment_method,
        payment_reference,
        due_date,
        payable_id
    ) values (
        p_organization_id,
        p_supplier_id,
        v_doc_number,
        coalesce(nullif(trim(p_invoice_number), ''), v_doc_number),
        p_purchase_date,
        coalesce(nullif(trim(p_warehouse), ''), 'Tienda Bella Vista (SP-01)'),
        upper(coalesce(p_payment_type, 'CONTADO')),
        coalesce(p_exchange_rate, 1),
        v_total_usd,
        v_total_usd,
        v_total_ves,
        p_notes,
        'COMPLETADA',
        p_bank_account_id,
        p_payment_method,
        p_payment_reference,
        p_due_date,
        v_payable_id
    ) returning id into v_purchase_id;

    -- 6. Insertar ítems de compra e incrementar stock en catálogo
    for v_item in select * from jsonb_array_elements(p_items) loop
        v_sku := trim(v_item->>'sku');
        v_name := coalesce(nullif(trim(v_item->>'name'), ''), 'Producto');
        v_qty := coalesce((v_item->>'quantity')::numeric, 1);
        v_cost := coalesce((v_item->>'unit_cost_usd')::numeric, 0);
        v_item_tot_usd := round(v_qty * v_cost, 2);
        v_item_tot_ves := round(v_item_tot_usd * coalesce(p_exchange_rate, 1), 2);

        -- Localizar producto por SKU
        select id into v_prod_id from public.products where sku = v_sku limit 1;

        insert into public.purchase_items (
            purchase_id,
            product_id,
            sku,
            name,
            quantity,
            unit_cost_usd,
            total_usd,
            total_ves
        ) values (
            v_purchase_id,
            v_prod_id,
            v_sku,
            v_name,
            v_qty,
            v_cost,
            v_item_tot_usd,
            v_item_tot_ves
        );

        -- Incrementar stock y opcionalmente actualizar costo unitario
        if v_prod_id is not null then
            if p_update_costs and v_cost > 0 then
                update public.products
                set stock = stock + v_qty,
                    cost_usd = v_cost
                where id = v_prod_id;
            else
                update public.products
                set stock = stock + v_qty
                where id = v_prod_id;
            end if;
        end if;
    end loop;

    -- 7. Si es Contado y se vinculó una cuenta bancaria, registrar egreso
    if upper(coalesce(p_payment_type, 'CONTADO')) = 'CONTADO' and p_bank_account_id is not null then
        select * into v_bank from public.bank_accounts where id = p_bank_account_id;
        if found then
            v_bank_deduct := case when v_bank.currency = 'VES' then v_total_ves else v_total_usd end;
            update public.bank_accounts
            set balance = round(balance - v_bank_deduct, 2)
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
                amount
            ) values (
                p_organization_id,
                v_bank.id,
                'SALIDA',
                'Compra de inventario - Factura: ' || coalesce(p_invoice_number, v_doc_number),
                nullif(trim(p_payment_reference), ''),
                'Sistema / Compras',
                coalesce(p_exchange_rate, 1),
                0,
                v_bank_deduct
            );
        end if;
    end if;

    return jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'doc_number', v_doc_number,
        'total_usd', v_total_usd,
        'total_ves', v_total_ves,
        'payable_id', v_payable_id
    );
end;
$$;

revoke all on function public.record_internal_purchase from public, anon;
grant execute on function public.record_internal_purchase to authenticated;
