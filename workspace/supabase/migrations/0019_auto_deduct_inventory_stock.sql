-- ==============================================================================
-- 0019_auto_deduct_inventory_stock.sql
-- DESCUENTO AUTOMÁTICO DE STOCK Y TRAZABILIDAD EN TIEMPO REAL (POS & E-COMMERCE)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase para:
-- 1. Habilitar permisos RLS completos para que las ventas descuenten stock.
-- 2. Crear un trigger en PostgreSQL que reste automáticamente las unidades vendidas
--    del inventario en la tabla public.products cada vez que se registre una venta.
-- 3. Registrar el movimiento de salida en public.inventory_movements (Kárdex).
-- ==============================================================================

-- 1. Asegurar permisos RLS permisivos para operaciones de comercio y catálogo
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_manage_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_read_products" ON public.products;
CREATE POLICY "allow_all_products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sales" ON public.sales;
DROP POLICY IF EXISTS "authenticated_manage_sales" ON public.sales;
CREATE POLICY "allow_all_sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "authenticated_manage_sale_items" ON public.sale_items;
CREATE POLICY "allow_all_sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "org_member_inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "authenticated_all_inventory_movements" ON public.inventory_movements;
CREATE POLICY "allow_all_inventory_movements" ON public.inventory_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.products TO anon, authenticated;
GRANT ALL ON TABLE public.sales TO anon, authenticated;
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;
GRANT ALL ON TABLE public.inventory_movements TO anon, authenticated;

-- 2. Función Trigger: Descuento de stock en tiempo real al insertar en sale_items
CREATE OR REPLACE FUNCTION public.trg_fn_deduct_product_stock_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC;
    v_org_id UUID;
    v_doc_type TEXT;
    v_doc_number TEXT;
    v_rate NUMERIC;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_cost_usd NUMERIC;
    v_new_stock NUMERIC;
BEGIN
    -- Ignorar artículos libres sin inventario físico (ej. LIB-XXXX)
    IF NEW.sku IS NOT NULL AND NEW.sku NOT LIKE 'LIB-%' THEN
        -- Bloquear y obtener stock actual del producto
        SELECT id, name, stock, cost_usd INTO v_prod_id, v_prod_name, v_current_stock, v_cost_usd
        FROM public.products
        WHERE sku = NEW.sku
        FOR UPDATE;

        IF v_current_stock IS NOT NULL THEN
            -- Calcular nuevo stock (sin permitir stock negativo)
            v_new_stock := GREATEST(0, v_current_stock - COALESCE(NEW.quantity, 1));

            -- Actualizar existencia en catálogo
            UPDATE public.products
            SET stock = v_new_stock
            WHERE sku = NEW.sku;

            -- Obtener datos de la cabecera de la venta
            SELECT organization_id, doc_type, doc_number, exchange_rate
            INTO v_org_id, v_doc_type, v_doc_number, v_rate
            FROM public.sales
            WHERE id = NEW.sale_id;

            -- Registrar en el kárdex (inventory_movements)
            INSERT INTO public.inventory_movements (
                organization_id,
                product_id,
                sku,
                product_name,
                movement_type,
                doc_type,
                doc_number,
                entity_type,
                entity_name,
                quantity,
                unit_cost_usd,
                unit_price_usd,
                exchange_rate,
                total_usd,
                total_ves,
                previous_stock,
                new_stock,
                reason,
                created_at
            ) VALUES (
                COALESCE(v_org_id, '00000000-0000-0000-0000-000000000001'::uuid),
                v_prod_id,
                NEW.sku,
                COALESCE(NEW.name, v_prod_name, 'Producto'),
                'VENTA',
                COALESCE(v_doc_type, 'FACTURA'),
                COALESCE(v_doc_number, 'VTA-POS'),
                'CLIENTE',
                'Venta POS / Comercio',
                -COALESCE(NEW.quantity, 1),
                COALESCE(v_cost_usd, 0),
                COALESCE(NEW.unit_price_usd, 0),
                COALESCE(v_rate, 1),
                COALESCE(NEW.total_usd, 0),
                COALESCE(NEW.total_ves, 0),
                v_current_stock,
                v_new_stock,
                'Descuento automático de stock por venta en tiempo real',
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el Trigger en la tabla sale_items
DROP TRIGGER IF EXISTS trg_deduct_product_stock ON public.sale_items;
CREATE TRIGGER trg_deduct_product_stock
AFTER INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_deduct_product_stock_on_sale();
