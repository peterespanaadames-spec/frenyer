-- ==============================================================================
-- FRENYER ERP — HABILITACIÓN DE PERMISOS RLS PARA OPERACIÓN EN LÍNEA
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola de Supabase:
-- https://knyqrwpaksawuxoqcayu.supabase.co
-- ==============================================================================

-- 1. Crear Organización por defecto si no existe
INSERT INTO public.organizations (id, name, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Frenyer Principal', 'USD')
ON CONFLICT (id) DO NOTHING;

-- 2. Hacer organization_id opcional (nullable) para facilitar inserciones
ALTER TABLE public.products ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.sales ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.accounts_receivable ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.exchange_rates ALTER COLUMN organization_id DROP NOT NULL;

-- 3. Asignar organización por defecto a columnas
ALTER TABLE public.products ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.customers ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.sales ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.bank_accounts ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.accounts_receivable ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- 4. Habilitar permisos completos de lectura/escritura (RLS permisivo para la app)
DROP POLICY IF EXISTS "members manage products" ON public.products;
DROP POLICY IF EXISTS "org_member_products" ON public.products;
DROP POLICY IF EXISTS "allow_all_products" ON public.products;
CREATE POLICY "allow_all_products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "members manage customers" ON public.customers;
DROP POLICY IF EXISTS "org_member_customers" ON public.customers;
DROP POLICY IF EXISTS "allow_all_customers" ON public.customers;
CREATE POLICY "allow_all_customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_sales" ON public.sales;
DROP POLICY IF EXISTS "allow_all_sales" ON public.sales;
CREATE POLICY "allow_all_sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "allow_all_sale_items" ON public.sale_items;
CREATE POLICY "allow_all_sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_payments" ON public.payments;
DROP POLICY IF EXISTS "allow_all_payments" ON public.payments;
CREATE POLICY "allow_all_payments" ON public.payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "allow_all_bank_accounts" ON public.bank_accounts;
CREATE POLICY "allow_all_bank_accounts" ON public.bank_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_cxc" ON public.accounts_receivable;
DROP POLICY IF EXISTS "allow_all_accounts_receivable" ON public.accounts_receivable;
CREATE POLICY "allow_all_accounts_receivable" ON public.accounts_receivable FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "org_member_rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "allow_all_exchange_rates" ON public.exchange_rates;
CREATE POLICY "allow_all_exchange_rates" ON public.exchange_rates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "members can read organizations" ON public.organizations;
DROP POLICY IF EXISTS "org_member_organizations" ON public.organizations;
DROP POLICY IF EXISTS "allow_all_organizations" ON public.organizations;
CREATE POLICY "allow_all_organizations" ON public.organizations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
