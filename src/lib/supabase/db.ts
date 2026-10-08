import { supabase } from './client';
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
  customer?: { name?: string };
  items?: DbQuoteItem[];
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
      throw new Error(`Error cargando proveedores: ${error.message}`);
    }
    return data || [];
  } catch (err) {
    console.error('Network error fetching suppliers from Supabase:', err);
    if (organizationId) {
      throw err;
    }
    return [];
  }
}

export async function createSupplierInSupabase(
  supplier: Omit<DbSupplier, 'id' | 'created_at'> & { id?: string }
): Promise<DbSupplier | null> {
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
  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.error('Error resolving the active organization:', authError.message);
      return null;
    }
    if (!authData.session) {
      return null;
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', authData.session.user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.error('Error resolving the active organization:', error.message);
      return null;
    }
    if (data && data.length > 0 && data[0].organization_id) {
      return data[0].organization_id;
    }
  } catch (err) {
    console.error('Network error resolving the active organization:', err);
  }
  return null;
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
// COTIZACIONES / PRESUPUESTOS
// ---------------------------------------------------------------------------

export async function fetchQuotesFromSupabase(): Promise<DbQuote[]> {
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
        customers (name),
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
      console.error('Error fetching quotes from Supabase:', error.message);
      return [];
    }

    return (data || []) as unknown as DbQuote[];
  } catch (err) {
    console.error('Network error fetching quotes from Supabase:', err);
    return [];
  }
}

export async function createQuoteInSupabase(input: {
  customerId: string;
  validityDays: number;
  notes: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>;
  exchangeRate: number;
  rateSource?: string;
  isFutureRate?: boolean;
  rateValueDate?: string;
}): Promise<{ success: boolean; quoteId?: string; error?: string }> {
  try {
    const organizationId = await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para registrar la cotización.' };
    }

    const payload: Record<string, unknown> = {
      p_customer_id: input.customerId,
      p_validity_days: Math.max(1, Math.floor(input.validityDays) || 7),
      p_notes: input.notes,
      p_items: JSON.stringify(input.items),
      p_exchange_rate: input.exchangeRate
    };
    if (input.rateSource) payload.p_rate_source = input.rateSource;
    if (input.isFutureRate !== undefined) payload.p_is_future_rate = input.isFutureRate;
    if (input.rateValueDate) payload.p_rate_value_date = input.rateValueDate;

    const { data, error } = await supabase.rpc('create_quote', payload);

    if (error) {
      console.error('Error creating quote in Supabase:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, quoteId: data };
  } catch (err: any) {
    console.error('Network error creating quote in Supabase:', err);
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
    const organizationId = await getActiveOrgId();
    if (!organizationId) {
      return { success: false, error: 'No hay una organización activa autorizada para convertir la cotización.' };
    }

    const { data, error } = await supabase.rpc('convert_quote_to_invoice', {
      p_quote_id: quoteId,
      p_payment_type: paymentType
    });

    if (error) {
      console.error('Error converting quote to invoice in Supabase:', error.message);
      return { success: false, error: error.message };
    }

    const result = data as {
      invoice_id?: string;
      invoice_doc_number?: string;
      total_usd?: number;
      removed_items?: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }>;
    };

    return {
      success: true,
      invoiceId: result?.invoice_id,
      invoiceDocNumber: result?.invoice_doc_number,
      totalUsd: result?.total_usd,
      removedItems: result?.removed_items || []
    };
  } catch (err: any) {
    console.error('Network error converting quote to invoice in Supabase:', err);
    return { success: false, error: err?.message || 'Error de conexión con Supabase' };
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
      console.error('Error rejecting quote in Supabase:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Network error rejecting quote in Supabase:', err);
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
