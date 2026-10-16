-- ==============================================================================
-- 0020_suppliers_dedup_and_unique_constraint.sql
-- Saneamiento de duplicados y restricciones de unicidad para Proveedores (suppliers)
-- ==============================================================================

-- 1. Deduplicar registros en public.suppliers conservando el registro más antiguo
DO $$
DECLARE
    rec RECORD;
    keeper_id UUID;
BEGIN
    -- Deduplicar por doc_number normalizado (si no está vacío)
    FOR rec IN 
        SELECT organization_id, UPPER(TRIM(doc_number)) AS norm_doc
        FROM public.suppliers
        WHERE doc_number IS NOT NULL AND TRIM(doc_number) <> ''
        GROUP BY organization_id, UPPER(TRIM(doc_number))
        HAVING COUNT(*) > 1
    LOOP
        SELECT id INTO keeper_id 
        FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND UPPER(TRIM(doc_number)) = rec.norm_doc 
        ORDER BY created_at ASC 
        LIMIT 1;

        -- Reasignar cuentas por pagar
        UPDATE public.accounts_payable 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND UPPER(TRIM(doc_number)) = rec.norm_doc 
              AND id <> keeper_id
        );

        -- Reasignar compras
        UPDATE public.purchases 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND UPPER(TRIM(doc_number)) = rec.norm_doc 
              AND id <> keeper_id
        );

        -- Eliminar duplicados
        DELETE FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND UPPER(TRIM(doc_number)) = rec.norm_doc 
          AND id <> keeper_id;
    END LOOP;

    -- Deduplicar por nombre normalizado cuando doc_number esté vacío
    FOR rec IN 
        SELECT organization_id, LOWER(TRIM(name)) AS norm_name
        FROM public.suppliers
        WHERE (doc_number IS NULL OR TRIM(doc_number) = '')
        GROUP BY organization_id, LOWER(TRIM(name))
        HAVING COUNT(*) > 1
    LOOP
        SELECT id INTO keeper_id 
        FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
          AND LOWER(TRIM(name)) = rec.norm_name 
        ORDER BY created_at ASC 
        LIMIT 1;

        UPDATE public.accounts_payable 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id
        );

        UPDATE public.purchases 
        SET supplier_id = keeper_id 
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers 
            WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id
        );

        DELETE FROM public.suppliers 
        WHERE organization_id = rec.organization_id 
              AND LOWER(TRIM(name)) = rec.norm_name 
              AND id <> keeper_id;
    END LOOP;
END $$;

-- 2. Asegurar que los códigos no colisionen antes de crear el índice
DO $$
DECLARE
    r RECORD;
    counter INT := 1;
BEGIN
    FOR r IN SELECT id FROM public.suppliers ORDER BY created_at ASC LOOP
        UPDATE public.suppliers 
        SET code = 'PRV-' || LPAD(counter::TEXT, 4, '0') 
        WHERE id = r.id;
        counter := counter + 1;
    END LOOP;
END $$;

-- 3. Crear índices únicos parciales
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_doc_unique 
ON public.suppliers (organization_id, UPPER(TRIM(doc_number))) 
WHERE doc_number IS NOT NULL AND TRIM(doc_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_code_unique 
ON public.suppliers (organization_id, code) 
WHERE code IS NOT NULL AND TRIM(code) <> '';

-- Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
