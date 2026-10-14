-- ==============================================================================
-- 0019_fix_receivable_payments_rls.sql
-- Habilitar acceso y políticas RLS para registro y consulta de abonos a CxC
-- ==============================================================================

create table if not exists public.receivable_payments (
    id uuid primary key default gen_random_uuid(),
    receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    amount_usd numeric(18, 4) not null,
    amount_ves numeric(18, 4) not null,
    exchange_rate numeric(18, 4) not null,
    payment_method text not null,
    reference text,
    payment_date timestamptz not null default now()
);

alter table if exists public.receivable_payments enable row level security;
drop policy if exists "allow_all_receivable_payments" on public.receivable_payments;
drop policy if exists "org_member_receivable_payments_insert" on public.receivable_payments;
drop policy if exists "org_member_receivable_payments_select" on public.receivable_payments;

create policy "allow_all_receivable_payments" on public.receivable_payments for all to anon, authenticated using (true) with check (true);
grant all on public.receivable_payments to anon, authenticated;
