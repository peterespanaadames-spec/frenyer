-- Force schema refresh for accounts_payable
create table if not exists public.accounts_payable (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete cascade,
    supplier_name text not null,
    doc_number text not null,
    concept text,
    origin text not null default 'Manual',
    total_usd numeric(18, 4) not null default 0,
    balance_usd numeric(18, 4) not null default 0,
    status text not null default 'PENDIENTE',
    due_date date,
    description text,
    created_at timestamptz not null default now()
);
