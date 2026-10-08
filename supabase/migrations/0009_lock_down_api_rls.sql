-- Restringe los datos de cada inquilino a usuarios autenticados de su organización.
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_movements enable row level security;
alter table public.payment_methods enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.suppliers enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;

-- Elimina políticas heredadas, pues se combinan de forma permisiva con las nuevas.
drop policy if exists "allow_all_organizations" on public.organizations;
drop policy if exists "org_member_organizations" on public.organizations;
drop policy if exists "members can read organizations" on public.organizations;
drop policy if exists "allow_all_branches" on public.branches;
drop policy if exists "org_member_branches" on public.branches;
drop policy if exists "members read branches" on public.branches;
drop policy if exists "allow_all_organization_members" on public.organization_members;
drop policy if exists "members read memberships" on public.organization_members;
drop policy if exists "allow_all_profiles" on public.profiles;
drop policy if exists "allow_all_products" on public.products;
drop policy if exists "org_member_products" on public.products;
drop policy if exists "members manage products" on public.products;
drop policy if exists "allow_all_customers" on public.customers;
drop policy if exists "org_member_customers" on public.customers;
drop policy if exists "members manage customers" on public.customers;
drop policy if exists "allow_all_sales" on public.sales;
drop policy if exists "org_member_sales" on public.sales;
drop policy if exists "allow_all_sale_items" on public.sale_items;
drop policy if exists "org_member_sale_items" on public.sale_items;
drop policy if exists "allow_all_payments" on public.payments;
drop policy if exists "org_member_payments" on public.payments;
drop policy if exists "allow_all_bank_accounts" on public.bank_accounts;
drop policy if exists "org_member_bank_accounts" on public.bank_accounts;
drop policy if exists "allow_all_bank_movements" on public.bank_movements;
drop policy if exists "allow_all_payment_methods" on public.payment_methods;
drop policy if exists "allow_all_accounts_receivable" on public.accounts_receivable;
drop policy if exists "org_member_cxc" on public.accounts_receivable;
drop policy if exists "allow_all_receivable_payments" on public.receivable_payments;
drop policy if exists "allow_all_exchange_rates" on public.exchange_rates;
drop policy if exists "org_member_rates" on public.exchange_rates;
drop policy if exists "members read rates" on public.exchange_rates;
drop policy if exists "authenticated_read_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_insert_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_update_exchange_rates" on public.exchange_rates;
drop policy if exists "authenticated_delete_exchange_rates" on public.exchange_rates;
drop policy if exists "allow_all_suppliers" on public.suppliers;
drop policy if exists "org_member_suppliers" on public.suppliers;
drop policy if exists "org_member_cxp" on public.accounts_payable;
drop policy if exists "org_member_payable_payments" on public.payable_payments;

create or replace function public.is_org_writer(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.organization_members membership
        where membership.organization_id = org
          and membership.user_id = auth.uid()
          and lower(coalesce(membership.role, '')) in (
              'admin', 'administrador', 'superadmin', 'gerente',
              'gerente general', 'owner', 'manager', 'member',
              'cajero', 'cashier', 'vendedor', 'seller', 'staff', 'operator'
          )
    );
$$;

create policy "authenticated_read_organizations"
    on public.organizations for select to authenticated
    using (public.is_org_member(id));

create policy "authenticated_read_branches"
    on public.branches for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_read_memberships"
    on public.organization_members for select to authenticated
    using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy "authenticated_read_own_profile"
    on public.profiles for select to authenticated
    using (id = auth.uid());

create policy "authenticated_manage_products"
    on public.products for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_products"
    on public.products for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_customers"
    on public.customers for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_customers"
    on public.customers for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_sales"
    on public.sales for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_sales"
    on public.sales for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_sale_items"
    on public.sale_items for all to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_writer(s.organization_id)
    ))
    with check (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_writer(s.organization_id)
    ));
create policy "authenticated_read_sale_items"
    on public.sale_items for select to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = sale_items.sale_id
          and public.is_org_member(s.organization_id)
    ));

create policy "authenticated_manage_payments"
    on public.payments for all to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_writer(s.organization_id)
    ))
    with check (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_writer(s.organization_id)
    ));
create policy "authenticated_read_payments"
    on public.payments for select to authenticated
    using (exists (
        select 1 from public.sales s
        where s.id = payments.sale_id
          and public.is_org_member(s.organization_id)
    ));

create policy "authenticated_manage_bank_accounts"
    on public.bank_accounts for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_bank_accounts"
    on public.bank_accounts for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_bank_movements"
    on public.bank_movements for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            bank_account_id is null
            or exists (
                select 1 from public.bank_accounts account
                where account.id = bank_movements.bank_account_id
                  and account.organization_id = bank_movements.organization_id
            )
        )
    );
create policy "authenticated_read_bank_movements"
    on public.bank_movements for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_payment_methods"
    on public.payment_methods for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            bank_account_id is null
            or exists (
                select 1 from public.bank_accounts account
                where account.id = payment_methods.bank_account_id
                  and account.organization_id = payment_methods.organization_id
            )
        )
    );
create policy "authenticated_read_payment_methods"
    on public.payment_methods for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_accounts_receivable"
    on public.accounts_receivable for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and exists (
            select 1 from public.customers customer
            where customer.id = accounts_receivable.customer_id
              and customer.organization_id = accounts_receivable.organization_id
        )
    );
create policy "authenticated_read_accounts_receivable"
    on public.accounts_receivable for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_receivable_payments"
    on public.receivable_payments for all to authenticated
    using (exists (
        select 1 from public.accounts_receivable receivable
        where receivable.id = receivable_payments.receivable_id
          and public.is_org_writer(receivable.organization_id)
    ))
    with check (
        exists (
            select 1 from public.accounts_receivable receivable
            where receivable.id = receivable_payments.receivable_id
              and public.is_org_writer(receivable.organization_id)
        )
        and (
            bank_account_id is null
            or exists (
                select 1
                from public.bank_accounts account
                join public.accounts_receivable receivable
                  on receivable.id = receivable_payments.receivable_id
                where account.id = receivable_payments.bank_account_id
                  and account.organization_id = receivable.organization_id
            )
        )
    );
create policy "authenticated_read_receivable_payments"
    on public.receivable_payments for select to authenticated
    using (exists (
        select 1 from public.accounts_receivable receivable
        where receivable.id = receivable_payments.receivable_id
          and public.is_org_member(receivable.organization_id)
    ));

create policy "authenticated_read_exchange_rates"
    on public.exchange_rates for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_insert_exchange_rates"
    on public.exchange_rates for insert to authenticated
    with check (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_update_exchange_rates"
    on public.exchange_rates for update to authenticated
    using (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ))
    with check (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_delete_exchange_rates"
    on public.exchange_rates for delete to authenticated
    using (exists (
        select 1 from public.organization_members membership
        where membership.organization_id = exchange_rates.organization_id
          and membership.user_id = auth.uid()
          and lower(membership.role) in ('admin', 'administrador', 'superadmin', 'gerente', 'gerente general', 'manager', 'owner')
    ));

create policy "authenticated_manage_suppliers"
    on public.suppliers for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (public.is_org_writer(organization_id));
create policy "authenticated_read_suppliers"
    on public.suppliers for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_accounts_payable"
    on public.accounts_payable for all to authenticated
    using (public.is_org_writer(organization_id))
    with check (
        public.is_org_writer(organization_id)
        and (
            supplier_id is null
            or exists (
                select 1 from public.suppliers supplier
                where supplier.id = accounts_payable.supplier_id
                  and supplier.organization_id = accounts_payable.organization_id
            )
        )
    );
create policy "authenticated_read_accounts_payable"
    on public.accounts_payable for select to authenticated
    using (public.is_org_member(organization_id));

create policy "authenticated_manage_payable_payments"
    on public.payable_payments for all to authenticated
    using (exists (
        select 1 from public.accounts_payable payable
        where payable.id = payable_payments.payable_id
          and public.is_org_writer(payable.organization_id)
    ))
    with check (
        exists (
            select 1 from public.accounts_payable payable
            where payable.id = payable_payments.payable_id
              and public.is_org_writer(payable.organization_id)
        )
        and (
            bank_account_id is null
            or exists (
                select 1
                from public.bank_accounts account
                join public.accounts_payable payable
                  on payable.id = payable_payments.payable_id
                where account.id = payable_payments.bank_account_id
                  and account.organization_id = payable.organization_id
            )
        )
    );
create policy "authenticated_read_payable_payments"
    on public.payable_payments for select to authenticated
    using (exists (
        select 1 from public.accounts_payable payable
        where payable.id = payable_payments.payable_id
          and public.is_org_member(payable.organization_id)
    ));
