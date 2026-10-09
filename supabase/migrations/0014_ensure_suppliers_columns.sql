-- ==============================================================================
-- 0014_ensure_suppliers_columns.sql: GARANTIZAR COLUMNAS EN PUBLIC.SUPPLIERS
-- ==============================================================================
-- Asegura que todas las columnas necesarias en suppliers existan incluso si
-- la tabla se creó previamente en versiones preliminares sin address u otros campos.
-- ==============================================================================

alter table if exists public.suppliers add column if not exists code text;
alter table if exists public.suppliers add column if not exists contact_person text;
alter table if exists public.suppliers add column if not exists phone text;
alter table if exists public.suppliers add column if not exists email text;
alter table if exists public.suppliers add column if not exists address text;
alter table if exists public.suppliers add column if not exists category text default 'General';
alter table if exists public.suppliers add column if not exists balance_usd numeric(18, 4) not null default 0;
alter table if exists public.suppliers add column if not exists status text not null default 'Activo';

-- Forzar recarga inmediata de la caché de esquemas de PostgREST
notify pgrst, 'reload schema';
