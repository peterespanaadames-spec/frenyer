-- ==============================================================================
-- FRENYER ERP — MOVIMIENTOS BANCARIOS Y MÉTODOS DE PAGO
-- ==============================================================================

-- 1. Tabla de Movimientos de Cuenta
CREATE TABLE IF NOT EXISTS public.bank_movements (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    bank_account_id uuid references public.bank_accounts(id) on delete cascade,
    type text not null, -- ENTRADA, SALIDA
    concept text not null,
    reference text,
    user_name text not null default 'Administrador',
    rate numeric(18, 4) not null,
    commission numeric(18, 4) not null default 0,
    commission_type text default 'Fija', -- Fija, Porcentual
    amount numeric(18, 4) not null, -- Monto en la moneda de la cuenta
    created_at timestamptz not null default now()
);

-- 2. Tabla de Métodos de Pago del Sistema
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
    name text not null,
    currency text not null default 'VES', -- VES, USD, USDT, EUR, COP
    type text not null default 'Transferencia', -- Pago Móvil, Transferencia, Efectivo, Punto de Venta
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    code text,
    created_at timestamptz not null default now()
);

-- 3. Habilitar RLS
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- 4. Crear Políticas permisivas para el ERP
DROP POLICY IF EXISTS "allow_all_bank_movements" ON public.bank_movements;
CREATE POLICY "allow_all_bank_movements" ON public.bank_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_payment_methods" ON public.payment_methods;
CREATE POLICY "allow_all_payment_methods" ON public.payment_methods FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
