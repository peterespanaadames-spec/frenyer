-- ==============================================================================
-- MÓDULO DE COTIZACIONES / PRESUPUESTOS (Ventas Flash)
-- ==============================================================================
-- Las cotizaciones se almacenan en la tabla sales con doc_type = 'COTIZACION'.
-- Se añaden columnas de ciclo de vida de cotización y vínculo a la factura
-- generada al convertir.
-- ==============================================================================

alter table public.sales
    add column if not exists quote_status text,          -- Creada, Facturada, Rechazada
    add column if not exists expires_at timestamptz,     -- fecha límite de validez
    add column if not exists converted_to_sale_id uuid;  -- id de la FACTURA generada

-- Vínculo opcional hacia la factura resultante
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'sales_converted_to_sale_id_fkey'
          and conrelid = 'public.sales'::regclass
    ) then
        alter table public.sales
            add constraint sales_converted_to_sale_id_fkey
            foreign key (converted_to_sale_id) references public.sales(id) on delete set null;
    end if;
end;
$$;

create index if not exists idx_sales_quote_status on public.sales(quote_status);
create index if not exists idx_sales_expires_at on public.sales(expires_at);

-- RPC: crea una cotización (encabezado + ítems) de forma atómica.
create or replace function public.create_quote(
    p_customer_id uuid,
    p_validity_days integer,
    p_notes text,
    p_items jsonb,
    p_exchange_rate numeric,
    p_rate_source text default 'BCV',
    p_is_future_rate boolean default false,
    p_rate_value_date timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_org_id uuid;
    v_quote_id uuid;
    v_next int;
    v_doc_number text;
    v_expires_at timestamptz;
    v_item jsonb;
    v_qty numeric(18, 4);
    v_price numeric(18, 4);
    v_subtotal numeric(18, 2) := 0;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para crear cotizaciones.';
    end if;

    select organization_id into v_org_id
    from public.customers
    where id = p_customer_id;

    if v_org_id is null or not public.is_org_member(v_org_id) then
        raise exception 'El cliente no existe o no pertenece a tu organización.';
    end if;

    if p_exchange_rate is null or p_exchange_rate <= 0 then
        raise exception 'La tasa de cambio debe ser mayor a cero.';
    end if;

    if p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'La cotización debe contener al menos un ítem.';
    end if;

    select coalesce(max(nullif(doc_number, '')::int), 0) + 1 into v_next
    from public.sales
    where organization_id = v_org_id
      and doc_type = 'COTIZACION';
    v_doc_number := lpad(v_next::text, 4, '0');

    v_expires_at := now() + make_interval(days => greatest(coalesce(p_validity_days, 7), 1));

    insert into public.sales (
        organization_id, customer_id, doc_type, doc_number, status,
        payment_type, exchange_rate, rate_source, is_future_rate, rate_value_date,
        subtotal_usd, discount_usd, tax_usd, igtf_usd, total_usd, total_ves,
        notes, quote_status, expires_at
    )
    values (
        v_org_id, p_customer_id, 'COTIZACION', v_doc_number, 'COMPLETADA',
        'CONTADO', round(p_exchange_rate, 4), coalesce(p_rate_source, 'BCV'),
        coalesce(p_is_future_rate, false), coalesce(p_rate_value_date, now()),
        0, 0, 0, 0, 0, 0,
        nullif(trim(p_notes), ''), 'Creada', v_expires_at
    )
    returning id into v_quote_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := greatest(coalesce((v_item->>'quantity')::numeric, 1), 1);
        v_price := coalesce(round((v_item->>'unit_price_usd')::numeric, 4), 0);

        insert into public.sale_items (
            sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves
        )
        values (
            v_quote_id,
            nullif(trim(v_item->>'sku'), ''),
            nullif(trim(v_item->>'name'), ''),
            v_qty,
            v_price,
            round(v_price * v_qty, 2),
            round(v_price * v_qty * p_exchange_rate, 2)
        );

        v_subtotal := v_subtotal + round(v_price * v_qty, 2);
    end loop;

    update public.sales
    set subtotal_usd = v_subtotal,
        total_usd = v_subtotal,
        total_ves = round(v_subtotal * p_exchange_rate, 2)
    where id = v_quote_id;

    return v_quote_id;
end;
$$;

-- RPC: convierte una cotización en FACTURA validando stock real.
-- Devuelve los ítems removidos por falta de existencia y el total facturado.
create or replace function public.convert_quote_to_invoice(
    p_quote_id uuid,
    p_payment_type text default 'CONTADO'
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_quote public.sales%rowtype;
    v_org_id uuid;
    v_new_sale_id uuid;
    v_next int;
    v_doc_number text;
    v_item record;
    v_stock numeric(18, 4);
    v_subtotal numeric(18, 2) := 0;
    v_rate numeric(18, 4);
    v_removed jsonb := '[]'::jsonb;
    v_kept_count int := 0;
    v_payment_type text;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada para convertir cotizaciones.';
    end if;

    create temp table kept_quote_items (
        sku text,
        name text,
        quantity numeric(18, 4),
        unit_price_usd numeric(18, 4),
        total_usd numeric(18, 2),
        total_ves numeric(18, 2)
    ) on commit drop;

    select * into v_quote
    from public.sales
    where id = p_quote_id
    for update;

    if not found or v_quote.doc_type <> 'COTIZACION' then
        raise exception 'La cotización no existe o no es una cotización válida.';
    end if;

    if not public.is_org_member(v_quote.organization_id) then
        raise exception 'La cotización no pertenece a tu organización.';
    end if;

    if v_quote.quote_status = 'Facturada' then
        raise exception 'Esta cotización ya fue convertida en factura.';
    end if;

    if v_quote.quote_status = 'Rechazada' then
        raise exception 'No se puede convertir una cotización rechazada.';
    end if;

    v_org_id := v_quote.organization_id;
    v_rate := v_quote.exchange_rate;
    v_payment_type := coalesce(p_payment_type, v_quote.payment_type, 'CONTADO');

    select coalesce(max(nullif(doc_number, '')::int), 0) + 1 into v_next
    from public.sales
    where organization_id = v_org_id
      and doc_type = 'FACTURA';
    v_doc_number := lpad(v_next::text, 4, '0');

    -- Validación de inventario: sólo se facturan ítems con existencia real.
    -- Los ítems sin stock se remueven de la carga y se reportan al operador.
    for v_item in
        select si.*
        from public.sale_items si
        where si.sale_id = v_quote.id
        order by si.created_at
    loop
        select stock into v_stock
        from public.products
        where sku = v_item.sku
          and organization_id = v_org_id;

        if v_stock is null or v_stock <= 0 or v_item.quantity > v_stock then
            v_removed := v_removed || jsonb_build_object(
                'sku', v_item.sku,
                'name', v_item.name,
                'quantity', v_item.quantity,
                'available', coalesce(v_stock, 0),
                'reason', case
                    when v_stock is null then 'Producto no encontrado en inventario'
                    when v_stock <= 0 then 'Sin stock disponible'
                    else 'Stock insuficiente'
                end
            );
        else
            update public.products
            set stock = round(stock - v_item.quantity, 4)
            where sku = v_item.sku
              and organization_id = v_org_id;

            insert into kept_quote_items
            values (v_item.sku, v_item.name, v_item.quantity, v_item.unit_price_usd, v_item.total_usd, v_item.total_ves);

            v_subtotal := v_subtotal + v_item.total_usd;
            v_kept_count := v_kept_count + 1;
        end if;
    end loop;

    if v_subtotal <= 0 then
        drop table kept_quote_items;
        raise exception 'Ningún ítem de la cotización cuenta con stock disponible. No se puede generar la factura.';
    end if;

    insert into public.sales (
        organization_id, customer_id, doc_type, doc_number, status,
        payment_type, exchange_rate, rate_source, is_future_rate, rate_value_date,
        subtotal_usd, discount_usd, tax_usd, igtf_usd, total_usd, total_ves,
        notes
    )
    values (
        v_org_id, v_quote.customer_id, 'FACTURA', v_doc_number, 'COMPLETADA',
        v_payment_type, v_rate, coalesce(v_quote.rate_source, 'BCV'),
        coalesce(v_quote.is_future_rate, false), coalesce(v_quote.rate_value_date, now()),
        v_subtotal, 0, 0, 0, v_subtotal, round(v_subtotal * v_rate, 2),
        'Factura generada desde cotización ' || v_quote.doc_number
    )
    returning id into v_new_sale_id;

    insert into public.sale_items (sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves)
    select v_new_sale_id, sku, name, quantity, unit_price_usd, total_usd, total_ves
    from kept_quote_items;

    update public.sales
    set quote_status = 'Facturada',
        converted_to_sale_id = v_new_sale_id
    where id = v_quote.id;

    if v_payment_type = 'CREDITO' then
        insert into public.accounts_receivable (
            organization_id, customer_id, sale_id, doc_number, total_usd, balance_usd, status
        )
        values (v_org_id, v_quote.customer_id, v_new_sale_id, v_doc_number, v_subtotal, v_subtotal, 'PENDIENTE');
    end if;

    return jsonb_build_object(
        'success', true,
        'invoice_id', v_new_sale_id,
        'invoice_doc_number', v_doc_number,
        'total_usd', v_subtotal,
        'removed_items', v_removed,
        'kept_count', v_kept_count
    );
end;
$$;

-- RPC: cambia el estado de una cotización a Rechazada.
create or replace function public.reject_quote(
    p_quote_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_quote public.sales%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Se requiere una sesión autenticada.';
    end if;

    select * into v_quote
    from public.sales
    where id = p_quote_id
    for update;

    if not found or v_quote.doc_type <> 'COTIZACION' then
        raise exception 'La cotización no existe.';
    end if;

    if not public.is_org_member(v_quote.organization_id) then
        raise exception 'La cotización no pertenece a tu organización.';
    end if;

    if v_quote.quote_status = 'Facturada' then
        raise exception 'No se puede rechazar una cotización ya facturada.';
    end if;

    update public.sales
    set quote_status = 'Rechazada'
    where id = v_quote.id;

    return true;
end;
$$;

-- Seguridad: solo miembros autenticados de la organización pueden ejecutar las RPCs.
revoke all on function public.create_quote(uuid, integer, text, jsonb, numeric, text, boolean, timestamptz) from public, anon;
revoke all on function public.convert_quote_to_invoice(uuid, text) from public, anon;
revoke all on function public.reject_quote(uuid) from public, anon;
grant execute on function public.create_quote(uuid, integer, text, jsonb, numeric, text, boolean, timestamptz) to authenticated;
grant execute on function public.convert_quote_to_invoice(uuid, text) to authenticated;
grant execute on function public.reject_quote(uuid) to authenticated;
