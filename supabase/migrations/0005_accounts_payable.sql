-- ==============================================================================
-- 10. MÓDULO DE CUENTAS POR PAGAR (CxP) Y PAGOS A PROVEEDORES
-- ==============================================================================
create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_name text not null,
    doc_number text not null,
    concept text,
    origin text not null default 'Manual', -- Manual, Gasto, Compra Interna
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE', -- PENDIENTE, PARCIAL, PAGADO
    due_date date,
    description text,
    created_at timestamptz not null default now()
);

create index if not exists idx_accounts_payable_org on public.accounts_payable(organization_id);
create index if not exists idx_accounts_payable_status on public.accounts_payable(status);

-- Abonos a cuentas por pagar
create table if not exists public.payable_payments (
    id uuid primary key default gen_random_uuid(),
    payable_id uuid references public.accounts_payable(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    payment_method text not null,
    reference text,
    payment_date timestamptz not null default now()
);

alter table public.accounts_payable enable row level security;
alter table public.payable_payments enable row level security;

create policy "org_member_cxp" on public.accounts_payable for all using (true) with check (true);
create policy "org_member_payable_payments" on public.payable_payments for all using (true) with check (true);
