import { supabase, isSupabaseConfigured } from './client';
import { authenticatedFetch } from './api';

export interface DbCustomer {
  id: string;
  organization_id?: string;
  code?: string;
  name: string;
  doc_type: string;
  doc_number: string;
  phone?: string;
  email?: string;
  credit_limit: number;
  address?: string;
  status: 'Activo' | 'Inactivo';
  orders_count: number;
  total_spent_usd: number;
  last_order_date?: string;
  created_at?: string;
}

export interface DbSupplier {
  id: string;
  organization_id?: string;
  code?: string;
  name: string;
  doc_type: string;
  doc_number: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  balance_usd: number;
  status: 'Activo' | 'Inactivo';
  created_at?: string;
}

export interface DbProduct {
  id?: string;
  organization_id?: string;
  branch_id?: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  cost_usd: number;
  price_usd: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url?: string;
  status: string;
  created_at?: string;
}

export interface DbSale {
  id?: string;
  organization_id?: string;
  branch_id?: string;
  customer_id?: string;
  user_id?: string;
  doc_type: 'FACTURA' | 'NOTA' | 'ESPERA' | 'COTIZACION';
  doc_number: string;
  status: 'COMPLETADA' | 'EN_ESPERA' | 'ANULADA';
  payment_type: 'CONTADO' | 'CREDITO';
  exchange_rate: number;
  is_future_rate?: boolean;
  rate_source?: string;
  rate_value_date?: string;
  subtotal_usd: number;
  discount_usd: number;
  tax_usd: number;
  igtf_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  quote_status?: 'Creada' | 'Facturada' | 'Rechazada';
  expires_at?: string;
  converted_to_sale_id?: string;
  created_at?: string;
}

export interface DbQuoteItem {
  id?: string;
  sale_id: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  total_ves: number;
}

export interface DbQuote {
  id: string;
  organization_id?: string;
  customer_id?: string;
  user_id?: string;
  doc_number: string;
  status: string;
  payment_type: string;
  exchange_rate: number;
  subtotal_usd: number;
  total_usd: number;
  total_ves: number;
  notes?: string;
  quote_status?: 'Creada' | 'Facturada' | 'Rechazada';
  expires_at?: string;
  converted_to_sale_id?: string;
  created_at?: string;
  customer?: { id?: string; name?: string; phone?: string; doc_type?: string; doc_number?: string; email?: string };
  customers?: { id?: string; name?: string; phone?: string; doc_type?: string; doc_number?: string; email?: string };
  items?: DbQuoteItem[];
  sale_items?: DbQuoteItem[];
  vendor_name?: string;
}

export interface DbSaleItem {
  id?: string;
  sale_id: string;
  product_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
  total_ves: number;
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function fetchCustomersFromSupabase(): Promise<DbCustomer[]> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/customers');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  // 2. Direct Supabase client
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error querying Supabase customers:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching customers from Supabase:', err);
    return [];
  }
}

export async function createCustomerInSupabase(customer: Omit<DbCustomer, 'id' | 'created_at'>): Promise<DbCustomer | null> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customer)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const orgId = await getActiveOrgId();
    const payload: any = { ...customer };
    if (orgId && !payload.organization_id) {
      payload.organization_id = orgId;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating customer in Supabase:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Network error creating customer in Supabase:', err);
    return null;
  }
}

export async function updateCustomerInSupabase(id: string, updates: Partial<DbCustomer>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating customer in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error updating customer in Supabase:', err);
    return false;
  }
}

export async function deleteCustomerFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting customer from Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error deleting customer from Supabase:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SUPPLIERS
// ---------------------------------------------------------------------------

export async function fetchSuppliersFromSupabase(organizationId?: string): Promise<DbSupplier[]> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/suppliers');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const scopedOrganizationId = organizationId || await getActiveOrgId();
    if (!scopedOrganizationId) {
      return [];
    }

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', scopedOrganizationId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching suppliers from Supabase:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching suppliers from Supabase:', err);
    return [];
  }
}

export async function createSupplierInSupabase(
  supplier: Omit<DbSupplier, 'id' | 'created_at'> & { id?: string }
): Promise<DbSupplier | null> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
    }
  } catch {
    // Fall back
  }

  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const orgId = await getActiveOrgId();
    if (!orgId) {
      console.error('Cannot create supplier without an authenticated organization membership.');
      return null;
    }

    const payload: any = {
      organization_id: orgId,
      code: supplier.code || `PRV-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      name: supplier.name,
      doc_type: supplier.doc_type || 'RIF (J / G / V)',
      doc_number: supplier.doc_number || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      category: supplier.category || 'General',
      balance_usd: Number(supplier.balance_usd) || 0,
      status: supplier.status || 'Activo'
    };

    if (supplier.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplier.id)) {
      payload.id = supplier.id;
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      return data;
    }

    if (error) {
      console.error('Error creating supplier in Supabase:', error.message);
    }
  } catch (err) {
    console.error('Network error creating supplier in Supabase:', err);
  }

  return null;
}

export async function updateSupplierInSupabase(id: string, updates: Partial<DbSupplier>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating supplier in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error updating supplier in Supabase:', err);
    return false;
  }
}

export async function deleteSupplierFromSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting supplier from Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error deleting supplier from Supabase:', err);
    return false;
  }
}

export async function getActiveOrgId(): Promise<string | null> {
  // 1. Intentar sesión activa de Supabase Auth
  try {
    const { data: authData } = await supabase.auth.getSession();
    if (authData?.session?.user?.id) {
      const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', authData.session.user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (data && data.length > 0 && data[0].organization_id) {
        return data[0].organization_id;
      }
    }
  } catch (err) {
    console.warn('Error resolviendo membresía activa:', err);
  }

  // 2. Intentar leer organización almacenada en localStorage
  if (typeof window !== 'undefined') {
    const storedOrg = localStorage.getItem('frenyer_org_id');
    if (storedOrg) return storedOrg;
  }

  // 3. Fallback: consultar la primera organización registrada en Supabase
  if (isSupabaseConfigured) {
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);
      if (orgs && orgs.length > 0 && orgs[0].id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('frenyer_org_id', orgs[0].id);
        }
        return orgs[0].id;
      }
    } catch {
      // ignore
    }
  }

  // 4. UUID por defecto para entornos demo/locales
  return '00000000-0000-0000-0000-000000000001';
}

// ---------------------------------------------------------------------------
// PRODUCTS / INVENTORY
// ---------------------------------------------------------------------------

export async function fetchProductsFromSupabase(): Promise<DbProduct[]> {
  // 1. Try local server proxy (immune to iframe CORS and ad-blockers)
  try {
    const res = await authenticatedFetch('/api/products');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch {
    // Fall back to direct client
  }

  if (!isSupabaseConfigured) {
    return [];
  }

  // 2. Direct Supabase client fallback
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error querying Supabase products:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching products from Supabase:', err);
    return [];
  }
}

export async function createProductInSupabase(product: DbProduct): Promise<{ success: boolean; data?: DbProduct; error?: string }> {
  // 1. Try local server proxy first
  try {
    const res = await authenticatedFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true, data: json.data };
      } else if (json.error) {
        return { success: false, error: json.error };
      }
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client fallback
  try {
    const orgId = await getActiveOrgId();
    const payload: any = { ...product };
    if (orgId && !payload.organization_id) {
      payload.organization_id = orgId;
    }

    const { data, error } = await supabase
      .from('products')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error inserting product in Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('Network error creating product in Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function updateProductInSupabase(sku: string, updates: Partial<DbProduct>): Promise<{ success: boolean; error?: string }> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return { success: true };
      if (json.error) return { success: false, error: json.error };
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('sku', sku);

    if (error) {
      console.error('Error updating product in Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Network error updating product in Supabase:', err);
    return { success: false, error: err?.message || 'Error de red' };
  }
}

export async function deleteProductFromSupabase(sku: string): Promise<{ success: boolean; error?: string }> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return { success: true };
      if (json.error) return { success: false, error: json.error };
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('sku', sku);

    if (error) {
      console.error('Error deleting product from Supabase:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Network error deleting product from Supabase:', err);
    return { success: false, error: err?.message || 'Error de red' };
  }
}

export async function updateProductStockInSupabase(sku: string, newStock: number): Promise<boolean> {
  // 1. Try server proxy
  try {
    const res = await authenticatedFetch(`/api/products/${encodeURIComponent(sku)}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: newStock })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) return true;
    }
  } catch {
    // Fall back to direct client
  }

  // 2. Direct Supabase client
  try {
    const { error } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('sku', sku);

    if (error) {
      console.error('Error updating product stock in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Network error updating stock in Supabase:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SALES & POS EMISSION
// ---------------------------------------------------------------------------

export async function recordSaleInSupabase(
  sale: DbSale,
  items: DbSaleItem[],
  payments: Array<{ method: string; amount_usd: number; amount_ves: number; exchange_rate: number }>
): Promise<{ success: boolean; saleId?: string; error?: string }> {
  try {
    const organizationId = sale.organization_id || await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para registrar la venta.' };
    }

    // Sanitize sale object to strictly match sales table schema in database
    const cleanSale = {
      organization_id: organizationId,
      branch_id: sale.branch_id || null,
      customer_id: sale.customer_id || null,
      user_id: sale.user_id || null,
      doc_type: sale.doc_type || 'FACTURA',
      doc_number: sale.doc_number,
      status: sale.status || 'COMPLETADA',
      payment_type: sale.payment_type || 'CONTADO',
      exchange_rate: sale.exchange_rate,
      subtotal_usd: sale.subtotal_usd || 0,
      discount_usd: sale.discount_usd || 0,
      tax_usd: sale.tax_usd || 0,
      igtf_usd: sale.igtf_usd || 0,
      total_usd: sale.total_usd || 0,
      total_ves: sale.total_ves || 0,
      notes: sale.notes || null,
      created_at: sale.created_at || new Date().toISOString()
    };

    // 1. Insert Sale record
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([cleanSale])
      .select()
      .single();

    if (saleError || !saleData) {
      console.error('Error inserting sale into Supabase:', saleError?.message);
      return { success: false, error: saleError?.message || 'Supabase no devolvió la venta registrada.' };
    }

    const saleId = saleData.id;

    // 2. Insert Sale Items (strictly match sale_items table columns)
    if (items.length > 0) {
      const itemsToInsert = items.map(it => ({
        sale_id: saleId,
        product_id: it.product_id || null,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity || 1,
        unit_price_usd: it.unit_price_usd,
        total_usd: it.total_usd,
        total_ves: it.total_ves
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting sale items:', itemsError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se guardaron sus productos: ${itemsError.message}` };
      }
    }

    // 3. Insert Payments
    if (payments.length > 0) {
      const paymentsToInsert = payments.map(p => ({
        sale_id: saleId,
        method: p.method,
        amount_usd: p.amount_usd,
        amount_ves: p.amount_ves,
        exchange_rate: p.exchange_rate
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) {
        console.error('Error inserting sale payments:', paymentsError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se guardaron sus pagos: ${paymentsError.message}` };
      }
    }

    // 4. Deduct Stocks
    for (const item of items) {
      const { data: currentProd, error: productError } = await supabase
        .from('products')
        .select('stock')
        .eq('sku', item.sku)
        .single();

      if (productError) {
        console.error(`Error loading stock for ${item.sku}:`, productError.message);
        return { success: false, saleId, error: `La venta se creó, pero no se pudo actualizar el inventario de ${item.sku}.` };
      }
      if (currentProd) {
        const nextStock = Math.max(0, (Number(currentProd.stock) || 0) - item.quantity);
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: nextStock })
          .eq('sku', item.sku);
        if (stockError) {
          console.error(`Error updating stock for ${item.sku}:`, stockError.message);
          return { success: false, saleId, error: `La venta se creó, pero no se pudo actualizar el inventario de ${item.sku}.` };
        }
      }
    }

    // 5. If Crédito, insert into accounts_receivable
    if (sale.payment_type === 'CREDITO' && sale.customer_id) {
      await supabase
        .from('accounts_receivable')
        .insert([{
          customer_id: sale.customer_id,
          sale_id: saleId,
          doc_number: sale.doc_number,
          total_usd: sale.total_usd,
          balance_usd: sale.total_usd,
          status: 'PENDIENTE'
        }]);
    }

    return { success: true, saleId };
  } catch (err: any) {
    console.error('Network error executing sale in Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

// ---------------------------------------------------------------------------
// COTIZACIONES / PRESUPUESTOS (Almacenadas en la tabla sales con doc_type = 'COTIZACION')
// ---------------------------------------------------------------------------

export async function fetchQuotesFromSupabase(): Promise<DbQuote[]> {
  const localQuotes: DbQuote[] = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]')
    : [];

  // 1. Intentar proxy del servidor primero si está disponible
  try {
    const res = await authenticatedFetch('/api/quotes');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch {
    // Si falla el proxy, intentar cliente directo
  }

  if (!isSupabaseConfigured) {
    return localQuotes;
  }

  // 2. Cliente directo de Supabase: consulta sobre la tabla core 'sales'
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        organization_id,
        customer_id,
        doc_number,
        status,
        payment_type,
        exchange_rate,
        subtotal_usd,
        total_usd,
        total_ves,
        notes,
        quote_status,
        expires_at,
        converted_to_sale_id,
        created_at,
        customers (id, name, phone, doc_type, doc_number, email),
        sale_items (
          id,
          sku,
          name,
          quantity,
          unit_price_usd,
          total_usd,
          total_ves
        )
      `)
      .eq('doc_type', 'COTIZACION')
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback sin columnas extendidas si no existen
      const fallback = await supabase
        .from('sales')
        .select(`
          id,
          organization_id,
          customer_id,
          doc_number,
          status,
          payment_type,
          exchange_rate,
          subtotal_usd,
          total_usd,
          total_ves,
          notes,
          created_at,
          customers (id, name, phone, doc_type, doc_number, email),
          sale_items (
            id,
            sku,
            name,
            quantity,
            unit_price_usd,
            total_usd,
            total_ves
          )
        `)
        .eq('doc_type', 'COTIZACION')
        .order('created_at', { ascending: false });

      if (!fallback.error && fallback.data) {
        const enriched = (fallback.data as any[]).map(q => ({
          ...q,
          quote_status: q.status === 'CANCELADA' ? 'Rechazada' : 'Creada',
          expires_at: null,
          converted_to_sale_id: null,
          items: q.sale_items || []
        })) as DbQuote[];
        return enriched;
      }

      console.warn('Aviso al consultar cotizaciones en Supabase:', error.message);
      return localQuotes;
    }

    const dbQuotes = (data || []).map((q: any) => ({
      ...q,
      customer: q.customers || q.customer,
      items: q.sale_items || q.items || []
    })) as DbQuote[];

    // Si la base de datos tiene cotizaciones, devolverlas (unificando cualquier cotización local no persistida)
    if (dbQuotes.length > 0) {
      const dbIds = new Set(dbQuotes.map(q => q.id));
      const missingLocal = localQuotes.filter(lq => !dbIds.has(lq.id));
      return [...dbQuotes, ...missingLocal];
    }

    return localQuotes;
  } catch (err) {
    console.warn('Aviso de red consultando cotizaciones en Supabase:', err);
    return localQuotes;
  }
}

export async function createQuoteInSupabase(input: {
  customerId?: string;
  validityDays: number;
  notes: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>;
  exchangeRate: number;
  rateSource?: string;
  isFutureRate?: boolean;
  rateValueDate?: string;
}): Promise<{ success: boolean; quoteId?: string; docNumber?: string; error?: string }> {
  try {
    let organizationId = await getActiveOrgId();
    if (!organizationId) {
      organizationId = '00000000-0000-0000-0000-000000000001';
    }

    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity * it.unit_price_usd), 0);
    const totalVes = Math.round(subtotal * input.exchangeRate * 100) / 100;

    // Obtener siguiente correlativo de cotizaciones de la tabla 'sales'
    const { data: latestQuotes } = await supabase
      .from('sales')
      .select('doc_number')
      .eq('doc_type', 'COTIZACION')
      .order('created_at', { ascending: false })
      .limit(1);

    const nextNum = latestQuotes && latestQuotes[0] ? (parseInt(latestQuotes[0].doc_number, 10) || 0) + 1 : 1;
    const docNumber = String(nextNum).padStart(4, '0');
    const expiresAt = new Date(Date.now() + (Math.max(1, input.validityDays || 7)) * 86400000).toISOString();

    // Inserción en la tabla core 'sales' (únicamente columnas que existen en sales)
    const salePayload: Record<string, any> = {
      organization_id: organizationId,
      customer_id: input.customerId || null,
      doc_type: 'COTIZACION',
      doc_number: docNumber,
      status: 'COMPLETADA',
      payment_type: 'CONTADO',
      exchange_rate: input.exchangeRate,
      subtotal_usd: subtotal,
      discount_usd: 0,
      tax_usd: 0,
      igtf_usd: 0,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: input.notes ? input.notes.trim() : null,
      quote_status: 'Creada',
      expires_at: expiresAt
    };

    let insertSaleRes = await supabase
      .from('sales')
      .insert([salePayload])
      .select('id, doc_number, created_at')
      .single();

    // Si falló por las columnas opcionales quote_status o expires_at, reintentar sin ellas
    if (
      insertSaleRes.error &&
      (insertSaleRes.error.message.includes('quote_status') ||
       insertSaleRes.error.message.includes('expires_at') ||
       (insertSaleRes.error as any).code === '42703')
    ) {
      delete salePayload.quote_status;
      delete salePayload.expires_at;
      insertSaleRes = await supabase
        .from('sales')
        .insert([salePayload])
        .select('id, doc_number, created_at')
        .single();
    }

    if (insertSaleRes.error || !insertSaleRes.data) {
      console.warn('Aviso guardando cotización en Supabase:', insertSaleRes.error?.message);
      // Fallback seguro a almacenamiento local para garantizar persistencia y no perder datos
      const localId = `local_quote_${Date.now()}`;
      if (typeof window !== 'undefined') {
        const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
        localQuotes.unshift({
          id: localId,
          organization_id: organizationId,
          customer_id: input.customerId,
          doc_number: docNumber,
          status: 'COMPLETADA',
          payment_type: 'CONTADO',
          exchange_rate: input.exchangeRate,
          subtotal_usd: subtotal,
          total_usd: subtotal,
          total_ves: totalVes,
          notes: input.notes,
          quote_status: 'Creada',
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          items: input.items,
          sale_items: input.items.map(it => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unit_price_usd: it.unit_price_usd,
            total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
            total_ves: Math.round(it.quantity * it.unit_price_usd * input.exchangeRate * 100) / 100
          }))
        });
        localStorage.setItem('frenyer_local_quotes', JSON.stringify(localQuotes));
      }
      return { success: true, quoteId: localId, docNumber };
    }

    const quoteId = insertSaleRes.data.id;

    // Inserción de ítems en la tabla core 'sale_items'
    if (input.items && input.items.length > 0) {
      const itemsToInsert = input.items.map(it => ({
        sale_id: quoteId,
        sku: it.sku,
        name: it.name,
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit_price_usd: Number(it.unit_price_usd) || 0,
        total_usd: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0) * 100) / 100,
        total_ves: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price_usd) || 0) * input.exchangeRate * 100) / 100
      }));

      await supabase.from('sale_items').insert(itemsToInsert);
    }

    // Guardar espejo en local
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      localQuotes.unshift({
        id: quoteId,
        organization_id: organizationId,
        customer_id: input.customerId,
        doc_number: docNumber,
        status: 'COMPLETADA',
        payment_type: 'CONTADO',
        exchange_rate: input.exchangeRate,
        subtotal_usd: subtotal,
        total_usd: subtotal,
        total_ves: totalVes,
        notes: input.notes,
        quote_status: 'Creada',
        expires_at: expiresAt,
        created_at: insertSaleRes.data.created_at || new Date().toISOString(),
        items: input.items,
        sale_items: input.items
      });
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(localQuotes.slice(0, 50)));
    }

    return { success: true, quoteId, docNumber };
  } catch (err: any) {
    console.error('Error creando cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function convertQuoteToInvoiceInSupabase(
  quoteId: string,
  paymentType: 'CONTADO' | 'CREDITO' = 'CONTADO'
): Promise<{
  success: boolean;
  invoiceId?: string;
  invoiceDocNumber?: string;
  totalUsd?: number;
  removedItems?: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }>;
  error?: string;
}> {
  try {
    const organizationId = await getActiveOrgId() || '00000000-0000-0000-0000-000000000001';

    // 1. Intentar RPC si existe
    try {
      const { data, error } = await supabase.rpc('convert_quote_to_invoice', {
        p_quote_id: quoteId,
        p_payment_type: paymentType
      });
      if (!error && data) {
        const result = data as any;
        return {
          success: true,
          invoiceId: result?.invoice_id,
          invoiceDocNumber: result?.invoice_doc_number,
          totalUsd: result?.total_usd,
          removedItems: result?.removed_items || []
        };
      }
    } catch {
      // Continuar a conversión directa
    }

    // 2. Conversión directa en las tablas sales y sale_items
    const { data: quote, error: qErr } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', quoteId)
      .single();

    if (qErr || !quote) {
      return { success: false, error: 'No se encontró la cotización a convertir.' };
    }

    // Obtener siguiente correlativo de FACTURA
    const { data: latestInvoices } = await supabase
      .from('sales')
      .select('doc_number')
      .eq('doc_type', 'FACTURA')
      .order('created_at', { ascending: false })
      .limit(1);

    const nextInv = latestInvoices && latestInvoices[0] ? (parseInt(latestInvoices[0].doc_number, 10) || 0) + 1 : 1;
    const invDocNumber = String(nextInv).padStart(4, '0');

    // Insertar la FACTURA en sales
    const invoicePayload = {
      organization_id: quote.organization_id || organizationId,
      customer_id: quote.customer_id,
      doc_type: 'FACTURA',
      doc_number: invDocNumber,
      status: 'COMPLETADA',
      payment_type: paymentType,
      exchange_rate: quote.exchange_rate,
      subtotal_usd: quote.subtotal_usd,
      discount_usd: quote.discount_usd || 0,
      tax_usd: quote.tax_usd || 0,
      igtf_usd: quote.igtf_usd || 0,
      total_usd: quote.total_usd,
      total_ves: quote.total_ves,
      notes: `Factura generada desde Cotización COT-${quote.doc_number}.${quote.notes ? ' ' + quote.notes : ''}`,
      created_at: new Date().toISOString()
    };

    const { data: newInvoice, error: invErr } = await supabase
      .from('sales')
      .insert([invoicePayload])
      .select('id, doc_number')
      .single();

    if (invErr || !newInvoice) {
      return { success: false, error: invErr?.message || 'Error al crear la factura desde la cotización.' };
    }

    // Insertar ítems en sale_items
    const rawItems = quote.sale_items || [];
    if (rawItems.length > 0) {
      const itemsPayload = rawItems.map((it: any) => ({
        sale_id: newInvoice.id,
        sku: it.sku,
        name: it.name,
        quantity: it.quantity,
        unit_price_usd: it.unit_price_usd,
        total_usd: it.total_usd,
        total_ves: it.total_ves
      }));
      await supabase.from('sale_items').insert(itemsPayload);
    }

    // Marcar la cotización como 'Facturada' y registrar la factura generada
    await supabase
      .from('sales')
      .update({
        quote_status: 'Facturada',
        converted_to_sale_id: newInvoice.id
      })
      .eq('id', quoteId);

    // Si es crédito, registrar cuenta por cobrar
    if (paymentType === 'CREDITO') {
      await supabase.from('accounts_receivable').insert([{
        organization_id: quote.organization_id || organizationId,
        customer_id: quote.customer_id,
        sale_id: newInvoice.id,
        doc_number: invDocNumber,
        original_amount_usd: quote.total_usd,
        balance_usd: quote.total_usd,
        status: 'PENDIENTE',
        due_date: new Date(Date.now() + 15 * 86400000).toISOString()
      }]);
    }

    return {
      success: true,
      invoiceId: newInvoice.id,
      invoiceDocNumber: invDocNumber,
      totalUsd: quote.total_usd,
      removedItems: []
    };
  } catch (err: any) {
    console.error('Error convirtiendo cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

export async function deleteQuoteFromSupabase(quoteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Eliminar ítems de la cotización
    await supabase.from('sale_items').delete().eq('sale_id', quoteId);

    // 2. Eliminar la cotización en sales
    const { error } = await supabase.from('sales').delete().eq('id', quoteId);

    // 3. Limpiar también de almacenamiento local si existe
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const filtered = localQuotes.filter((q: any) => q.id !== quoteId);
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(filtered));
    }

    if (error) {
      console.warn('Aviso eliminando cotización de Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error eliminando cotización:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

export async function updateQuoteInSupabase(
  quoteId: string,
  input: {
    customerId?: string;
    validityDays: number;
    notes?: string;
    items: Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>;
    exchangeRate: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity * it.unit_price_usd), 0);
    const totalVes = Math.round(subtotal * input.exchangeRate * 100) / 100;

    // Actualizar cabecera de la cotización en sales (sin columnas inexistentes como updated_at)
    const updateData: Record<string, any> = {
      customer_id: input.customerId || null,
      exchange_rate: input.exchangeRate,
      subtotal_usd: subtotal,
      total_usd: subtotal,
      total_ves: totalVes,
      notes: input.notes || null
    };

    if (input.validityDays) {
      updateData.expires_at = new Date(Date.now() + input.validityDays * 86400000).toISOString();
    }

    const { error: saleErr } = await supabase
      .from('sales')
      .update(updateData)
      .eq('id', quoteId);

    if (saleErr) {
      console.warn('Aviso actualizando cotización en Supabase:', saleErr.message);
    }

    // Reemplazar ítems en sale_items
    await supabase.from('sale_items').delete().eq('sale_id', quoteId);

    const itemsToInsert = input.items.map(it => ({
      sale_id: quoteId,
      sku: it.sku,
      name: it.name,
      quantity: it.quantity,
      unit_price_usd: it.unit_price_usd,
      total_usd: Math.round(it.quantity * it.unit_price_usd * 100) / 100,
      total_ves: Math.round(it.quantity * it.unit_price_usd * input.exchangeRate * 100) / 100
    }));

    if (itemsToInsert.length > 0) {
      await supabase.from('sale_items').insert(itemsToInsert);
    }

    // Actualizar en localStorage si existe
    if (typeof window !== 'undefined') {
      const localQuotes = JSON.parse(localStorage.getItem('frenyer_local_quotes') || '[]');
      const updated = localQuotes.map((q: any) => {
        if (q.id === quoteId) {
          return {
            ...q,
            customer_id: input.customerId,
            subtotal_usd: subtotal,
            total_usd: subtotal,
            total_ves: totalVes,
            notes: input.notes,
            items: input.items,
            sale_items: itemsToInsert
          };
        }
        return q;
      });
      localStorage.setItem('frenyer_local_quotes', JSON.stringify(updated));
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error actualizando cotización:', err);
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

export async function rejectQuoteInSupabase(quoteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const organizationId = await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para rechazar la cotización.' };
    }

    const { error } = await supabase.rpc('reject_quote', { p_quote_id: quoteId });

    if (error) {
      if (error.message?.includes('reject_quote') || (error as any).code === '42883') {
        // Fallback directo a actualización de registro
        let upd = await supabase.from('sales').update({ quote_status: 'Rechazada' }).eq('id', quoteId);
        if (upd.error && (upd.error.message.includes('quote_status') || (upd.error as any).code === '42703')) {
          upd = await supabase.from('sales').update({ status: 'CANCELADA' }).eq('id', quoteId);
        }
        return { success: !upd.error, error: upd.error?.message };
      }
      console.warn('Aviso rechazando cotización:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error rechazando cotización en Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
  }
}

// ---------------------------------------------------------------------------
// 5. GESTIÓN DIRECTA DE CUENTAS BANCARIAS Y MOVIMIENTOS
// ---------------------------------------------------------------------------

export async function fetchBankAccountsFromSupabase(): Promise<{ success: boolean; data: any[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('bank_name', { ascending: true });

    if (error) {
      return { success: false, data: [], error: error.message };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, data: [], error: err?.message };
  }
}

export async function createBankAccountInSupabase(account: {
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  balance: number;
  status?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert([{
        bank_name: account.bank_name,
        account_number: account.account_number,
        account_type: account.account_type,
        currency: account.currency,
        balance: account.balance,
        status: account.status || 'Activo'
      }])
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function updateBankAccountInSupabase(
  id: string,
  updates: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteBankAccountInSupabase(
  id: string,
  isPermanent: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    if (isPermanent) {
      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Soft delete: mover a inactivas
    const { error } = await supabase
      .from('bank_accounts')
      .update({ status: 'Inactivo' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
